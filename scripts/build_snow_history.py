#!/usr/bin/env python3
"""
Rebuild the history baked into snow_tracker.html. Run once a year (or whenever you like):

    python3 scripts/build_snow_history.py            # rebuild every resort into snow_tracker.html
    python3 scripts/build_snow_history.py grossarl   # rebuild just one

For each resort in RESORTS (Tignes, Grossarl/Dorfgastein) it:
  1. Fetches new snow, 1 Nov - end Feb, every winter since 1991/92 at three elevations (Base / Mid / Top):
     ECMWF ERA5 reanalysis via the free Open-Meteo archive API (CC BY 4.0, https://open-meteo.com).
  2. Fetches observed daily snow depth from the resort's reference weather station:
       - Tignes:   Meteo-France open climatology, station TIGNES_SAPC (Licence Ouverte, data.gouv.fr)
       - Grossarl: GeoSphere Austria klima-v2-1d, Obertauern (CC BY 4.0). There is no snow-depth station in
                   Grossarl/Dorfgastein itself, so this is a labelled regional reference ~31 km away.
  3. Fits a small snow budget (new snow, melt, settling) to that station's depth, using ERA5 weather at the
     station's own location, so the page can project snow depth forward from each forecast-ensemble member.
     The fit's error on the winters it was fitted on is stored alongside.
  4. Writes it all, as one `const SNOW_ALL = {...}`, between the SNOW_DATA markers in snow_tracker.html.

Needs `curl` and a network connection (curl, not urllib, so the system certificate store is used).
Every season is stored as 121 daily values: index 0 = 1 Nov, index 119 = 28 Feb, index 120 = 29 Feb
(null in non-leap winters).
"""
import csv, datetime, gzip, io, json, re, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'snow_tracker.html'
FIRST_SEASON = 1991
SEASON_LEN = 121
MF_DATASET = '6569b51ae64326786e4e8e1a'       # Meteo-France "Donnees climatologiques de base - quotidiennes"

RESORTS = [
    {
        'id': 'tignes', 'name': 'Tignes', 'short': 'Tignes', 'country': 'France',
        'lat': 45.47, 'lon': 6.91,
        'bands': [('base', 2100), ('mid', 2750), ('top', 3400)],
        'station': {'source': 'meteofrance', 'id': 'TIGNES_SAPC', 'name': 'Tignes Le Lac', 'elev': 2084,
                    'lat': 45.467, 'lon': 6.907167, 'where': 'in the village', 'km': 0},
    },
    {
        'id': 'grossarl', 'name': 'Grossarl / Dorfgastein', 'short': 'Grossarl', 'country': 'Austria',
        'lat': 47.25, 'lon': 13.15,
        'bands': [('base', 900), ('mid', 1500), ('top', 2030)],
        'station': {'source': 'geosphere', 'id': 15610, 'param': 'sh_manu', 'name': 'Obertauern', 'elev': 1772,
                    'lat': 47.24889, 'lon': 13.55972, 'where': 'a regional reference ~31 km east', 'km': 31},
    },
]


def curl(url, binary=False):
    last = None
    for attempt in range(5):
        try:
            r = subprocess.run(['curl', '-sS', '--fail', '--max-time', '120', url], capture_output=True, check=True)
            return r.stdout if binary else r.stdout.decode('utf-8')
        except Exception as e:
            last = e
            time.sleep(2 + 3 * attempt)
    raise last


def last_complete_season(today):
    y = today.year - 1
    return y if today >= datetime.date(y + 1, 3, 1) else y - 1


def era5_season(resort, season):
    """One call per winter: the three elevation bands, then the station's own location."""
    st = resort['station']
    end = datetime.date(season + 1, 3, 1) - datetime.timedelta(days=1)
    q = urllib.parse.urlencode({
        'latitude': ','.join([str(resort['lat'])] * 3 + [str(st['lat'])]),
        'longitude': ','.join([str(resort['lon'])] * 3 + [str(st['lon'])]),
        'elevation': ','.join([str(e) for _, e in resort['bands']] + [str(st['elev'])]),
        'start_date': f'{season}-11-01', 'end_date': end.isoformat(),
        'daily': 'snowfall_sum,temperature_2m_mean', 'models': 'era5', 'timezone': 'Europe/Paris'})
    return json.loads(curl('https://archive-api.open-meteo.com/v1/archive?' + q))


def pad(values, nd=1):
    out = [None if v is None else round(v, nd) for v in values]
    return (out + [None] * SEASON_LEN)[:SEASON_LEN]


def depth_meteofrance(st):
    """{ 'YYYY-MM-DD': depth_cm } from every Savoie 'autres-parametres' file after 1950."""
    meta = json.loads(curl(f'https://www.data.gouv.fr/api/1/datasets/{MF_DATASET}/'))
    urls = [r['url'] for r in meta['resources']
            if re.search(r'QUOT_departement_73_periode_(?!avant)\d{4}-\d{4}_autres-parametres', r['title'])]
    depth = {}
    for u in urls:
        print('  station file', u.rsplit('/', 1)[-1], file=sys.stderr)
        raw = gzip.decompress(curl(u, binary=True)).decode('utf-8')
        for row in csv.DictReader(io.StringIO(raw), delimiter=';'):
            if row['NOM_USUEL'] == st['id'] and row['NEIGETOT06'].strip():
                d = row['AAAAMMJJ']
                depth[f'{d[:4]}-{d[4:6]}-{d[6:]}'] = float(row['NEIGETOT06'])
    return depth


def depth_geosphere(st):
    """GeoSphere Austria daily climate (CC BY 4.0); the station's readings are 06 UTC, -1 means no snow."""
    url = ('https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v2-1d?parameters=' + st['param'] +
           f"&station_ids={st['id']}&start=1991-10-01&end={datetime.date.today().isoformat()}&output_format=csv")
    depth = {}
    for row in csv.DictReader(curl(url).splitlines()):
        v = row.get(st['param'])
        if v not in ('', None):
            depth[row['time'][:10]] = max(0.0, float(v))
    return depth


def lstsq(X, y):
    n = len(X[0])
    A = [[sum(r[i] * r[j] for r in X) for j in range(n)] for i in range(n)]
    b = [sum(r[i] * yy for r, yy in zip(X, y)) for i in range(n)]
    for i in range(n):
        piv = A[i][i]
        for j in range(i, n):
            A[i][j] /= piv
        b[i] /= piv
        for k in range(n):
            if k != i:
                f = A[k][i]
                for j in range(i, n):
                    A[k][j] -= f * A[i][j]
                b[k] -= f * b[i]
    return b


def fit_depth_model(depth, snow, temp):
    """depth change per day = a*snow + b*warmth + c*depth + k  (when there is snow on the ground or snowing)."""
    rows = []
    for k in sorted(depth):
        p = (datetime.date.fromisoformat(k) - datetime.timedelta(days=1)).isoformat()
        if p in depth and p in snow and p in temp:
            rows.append((depth[k] - depth[p], snow[p], temp[p], depth[p]))
    X, y = [], []
    for dd, s, t, dp in rows:
        if dp <= 0 and s <= 0:
            continue
        X.append([s, max(t, 0.0) * (dp > 0), dp * (dp > 0), 1.0 * (dp > 0 or s > 0)])
        y.append(dd)
    a, b, c, k = lstsq(X, y)

    def step(d, s, t):
        return max(0.0, d + a * s + b * max(t, 0.0) * (d > 0) + c * d * (d > 0) + k * (d > 0 or s > 0))

    err = {7: [], 15: []}
    for sd in sorted(depth):
        if not re.match(r'\d{4}-(12-(01|15)|01-(05|20)|02-05)$', sd):
            continue
        for n in err:
            d, day, ok = depth[sd], datetime.date.fromisoformat(sd), True
            for _ in range(n):
                key = day.isoformat()
                if key not in snow or key not in temp:
                    ok = False
                    break
                d = step(d, snow[key], temp[key])
                day += datetime.timedelta(days=1)
            if ok and day.isoformat() in depth:
                err[n].append(d - depth[day.isoformat()])
    mae = {n: (sum(abs(e) for e in v) / len(v) if v else None) for n, v in err.items()}
    return {'a': round(a, 4), 'b': round(b, 4), 'c': round(c, 4), 'k': round(k, 4),
            'mae7': round(mae[7], 1) if mae[7] is not None else None,
            'mae15': round(mae[15], 1) if mae[15] is not None else None, 'n_fit': len(X)}


def build_resort(resort, today, last):
    seasons = list(range(FIRST_SEASON, last + 1))
    bands = resort['bands']
    st = resort['station']
    print(f"[{resort['id']}] ERA5 new snow {seasons[0]}/{str(seasons[0] + 1)[2:]} - {last}/{str(last + 1)[2:]}", file=sys.stderr)
    snow = {b: [] for b, _ in bands}
    snow_st, temp_st = {}, {}
    for s in seasons:
        blocks = era5_season(resort, s)
        for (b, _), blk in zip(bands, blocks[:3]):
            snow[b].append(pad(blk['daily']['snowfall_sum']))
        stn = blocks[3]['daily']
        for d, sf, tm in zip(stn['time'], stn['snowfall_sum'], stn['temperature_2m_mean']):
            snow_st[d] = sf or 0.0
            temp_st[d] = tm
        time.sleep(0.4)
    print(f"[{resort['id']}] station snow depth ({st['name']})", file=sys.stderr)
    depth = depth_meteofrance(st) if st['source'] == 'meteofrance' else depth_geosphere(st)

    def winter_days(s):
        return [(datetime.date(s, 11, 1) + datetime.timedelta(days=i)).isoformat() for i in range(SEASON_LEN)]

    depth_seasons, depth_by_season = [], []
    for s in seasons:
        days = winter_days(s)
        have = sum(1 for k in days if k in depth)
        if have < 90:                       # skip winters with big holes in the record
            continue
        arr = [None] * SEASON_LEN
        for i, k in enumerate(days):
            if i == 120 and k[5:] != '02-29':
                continue
            if k in depth:
                arr[i] = round(depth[k])
        depth_seasons.append(s)
        depth_by_season.append(arr)
    # a winter in progress (not yet in the history): keep what the station has said so far as an offline fallback
    live = None
    if today >= datetime.date(last + 1, 10, 1) and depth:
        cur = last + 1
        arr = [None] * SEASON_LEN
        for i, k in enumerate(winter_days(cur)):
            if k in depth:
                arr[i] = round(depth[k])
        pre = max((k for k in depth if f'{cur}-10-01' <= k < f'{cur}-11-01'), default=None)
        live = {'season': cur, 'values': arr, 'preSeasonDepth': round(depth[pre]) if pre else None, 'asOf': max(depth)}
    model = fit_depth_model({k: v for k, v in depth.items() if k in snow_st}, snow_st, temp_st)
    print(f"[{resort['id']}] depth model", model, f'({len(depth_seasons)} winters of station depth)', file=sys.stderr)
    return {
        'id': resort['id'], 'name': resort['name'], 'short': resort['short'], 'country': resort['country'],
        'lat': resort['lat'], 'lon': resort['lon'], 'bands': {b: e for b, e in bands},
        'generated': today.isoformat(),
        'snowSeasons': seasons, 'snow': snow,
        'depthSeasons': depth_seasons, 'depth': depth_by_season, 'depthLive': live, 'depthModel': model,
        'station': dict(st),
    }


def main():
    today = datetime.date.today()
    last = last_complete_season(today)
    argv = sys.argv[1:]
    json_out = None
    if '--json-out' in argv:                # write the data to a file instead of into the page (inject later)
        i = argv.index('--json-out')
        json_out = argv[i + 1]
        del argv[i:i + 2]
    only = set(argv)
    data = {r['id']: build_resort(r, today, last) for r in RESORTS if not only or r['id'] in only}
    if json_out:
        Path(json_out).write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
        print(f'wrote {json_out}', file=sys.stderr)
        return
    text = 'const SNOW_ALL = ' + json.dumps(data, separators=(',', ':')) + ';'
    html = HTML.read_text(encoding='utf-8')
    if only:                                # keep resorts we weren't asked to rebuild
        m = re.search(r'const SNOW_ALL = (\{.*?\});\n/\*SNOW_DATA_END\*/', html, flags=re.S)
        if m:
            old = json.loads(m.group(1))
            old.update(data)
            data = old
            text = 'const SNOW_ALL = ' + json.dumps(data, separators=(',', ':')) + ';'
    new, n = re.subn(r'/\*SNOW_DATA_START\*/.*?/\*SNOW_DATA_END\*/',
                     lambda m: '/*SNOW_DATA_START*/\n' + text + '\n/*SNOW_DATA_END*/', html, flags=re.S)
    if n != 1:
        sys.exit('SNOW_DATA markers not found in snow_tracker.html')
    HTML.write_text(new, encoding='utf-8')
    print(f'wrote {len(text) / 1024:.0f} KB of data into {HTML.name}', file=sys.stderr)


if __name__ == '__main__':
    main()
