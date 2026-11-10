#!/usr/bin/env python3
"""
Rebuild the history baked into snow_tracker.html. Run once a year (or whenever you like):

    python3 scripts/build_snow_history.py

What it does
  1. New snow, 1 Nov - end Feb, every winter since 1991/92, at three elevations in Tignes
     (Base 2,100 m / Mid 2,750 m / Top 3,400 m): ECMWF ERA5 reanalysis via the free Open-Meteo
     archive API (CC BY 4.0, https://open-meteo.com).
  2. Snow depth: real daily observations from the Tignes Le Lac station (TIGNES_SAPC, 2,084 m)
     in Meteo-France's open climatology (Licence Ouverte / Etalab, via data.gouv.fr). Available
     from 2015/16.
  3. Fits a small snow budget (new snow, melt, settling) to the station depth so the page can
     project snow depth forward from each forecast-ensemble member, and records how well that
     projection did on the winters it was fitted on.
  4. Writes it all, as one `const SNOW_DATA = {...}`, between the SNOW_DATA markers in snow_tracker.html.

Needs `curl` and a network connection (curl, not urllib, so the system certificate store is used).
Every season is stored as 121 daily values: index 0 = 1 Nov, index 119 = 28 Feb, index 120 = 29 Feb
(null in non-leap winters).
"""
import csv, datetime, gzip, io, json, math, re, subprocess, sys, time, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'snow_tracker.html'
LAT, LON = 45.47, 6.91
BANDS = [('base', 2100), ('mid', 2750), ('top', 3400)]
FIRST_SEASON = 1991
STATION = 'TIGNES_SAPC'
DATASET = '6569b51ae64326786e4e8e1a'          # Meteo-France "Donnees climatologiques de base - quotidiennes"
SEASON_LEN = 121


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


def day_index(season, d):
    return (d - datetime.date(season, 11, 1)).days


def era5_season(season):
    end = datetime.date(season + 1, 3, 1) - datetime.timedelta(days=1)
    q = urllib.parse.urlencode({
        'latitude': ','.join([str(LAT)] * 3), 'longitude': ','.join([str(LON)] * 3),
        'elevation': ','.join(str(e) for _, e in BANDS),
        'start_date': f'{season}-11-01', 'end_date': end.isoformat(),
        'daily': 'snowfall_sum,temperature_2m_mean', 'models': 'era5', 'timezone': 'Europe/Paris'})
    return json.loads(curl('https://archive-api.open-meteo.com/v1/archive?' + q))


def pad(values, nd=1):
    out = [None if v is None else round(v, nd) for v in values]
    return (out + [None] * SEASON_LEN)[:SEASON_LEN]


def station_depth():
    """{ 'YYYY-MM-DD': depth_cm } from every Savoie 'autres-parametres' file after 1950."""
    meta = json.loads(curl(f'https://www.data.gouv.fr/api/1/datasets/{DATASET}/'))
    urls = [r['url'] for r in meta['resources']
            if re.search(r'QUOT_departement_73_periode_(?!avant)\d{4}-\d{4}_autres-parametres', r['title'])]
    depth = {}
    for u in urls:
        print('  station file', u.rsplit('/', 1)[-1], file=sys.stderr)
        raw = gzip.decompress(curl(u, binary=True)).decode('utf-8')
        for row in csv.DictReader(io.StringIO(raw), delimiter=';'):
            if row['NOM_USUEL'] == STATION and row['NEIGETOT06'].strip():
                d = row['AAAAMMJJ']
                depth[f'{d[:4]}-{d[4:6]}-{d[6:]}'] = float(row['NEIGETOT06'])
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


def fit_depth_model(depth, snow_base, temp_base):
    """depth change per day = a*snow + b*warmth + c*depth + k  (when there is snow on the ground or snowing)."""
    rows = []
    for k in sorted(depth):
        p = (datetime.date.fromisoformat(k) - datetime.timedelta(days=1)).isoformat()
        if p in depth and p in snow_base and p in temp_base:
            rows.append((depth[k] - depth[p], snow_base[p], temp_base[p], depth[p]))
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
                if key not in snow_base or key not in temp_base:
                    ok = False
                    break
                d = step(d, snow_base[key], temp_base[key])
                day += datetime.timedelta(days=1)
            if ok and day.isoformat() in depth:
                err[n].append(d - depth[day.isoformat()])
    mae = {n: (sum(abs(e) for e in v) / len(v) if v else None) for n, v in err.items()}
    return {'a': round(a, 4), 'b': round(b, 4), 'c': round(c, 4), 'k': round(k, 4),
            'mae7': round(mae[7], 1), 'mae15': round(mae[15], 1), 'n_fit': len(X)}


def main():
    today = datetime.date.today()
    last = last_complete_season(today)
    seasons = list(range(FIRST_SEASON, last + 1))
    print(f'ERA5 new snow, {seasons[0]}/{str(seasons[0] + 1)[2:]} - {last}/{str(last + 1)[2:]}', file=sys.stderr)
    snow = {b: [] for b, _ in BANDS}
    snow_base, temp_base = {}, {}
    for s in seasons:
        blocks = era5_season(s)
        for (b, _), blk in zip(BANDS, blocks):
            snow[b].append(pad(blk['daily']['snowfall_sum']))
        t = blocks[0]['daily']['time']
        for d, sf, tm in zip(t, blocks[0]['daily']['snowfall_sum'], blocks[0]['daily']['temperature_2m_mean']):
            snow_base[d] = sf or 0.0
            temp_base[d] = tm
        time.sleep(0.4)
    print('Station snow depth', file=sys.stderr)
    depth = station_depth()
    depth_seasons = sorted({s for s in seasons if any(f'{s}-11-{d:02d}' in depth or f'{s + 1}-01-{d:02d}' in depth for d in range(1, 29))})
    depth_by_season = []
    for s in depth_seasons:
        arr = [None] * SEASON_LEN
        for i in range(SEASON_LEN):
            k = (datetime.date(s, 11, 1) + datetime.timedelta(days=i)).isoformat()
            if i == 120 and k[5:] != '02-29':
                continue
            if k in depth:
                arr[i] = round(depth[k])
        depth_by_season.append(arr)
    # a winter in progress (not yet in the history): keep what the station has said so far as an offline fallback
    live = None
    if today >= datetime.date(last + 1, 10, 1) and depth:
        cur = last + 1
        arr = [None] * SEASON_LEN
        for i in range(SEASON_LEN):
            k = (datetime.date(cur, 11, 1) + datetime.timedelta(days=i)).isoformat()
            if k in depth:
                arr[i] = round(depth[k])
        pre = max((k for k in depth if f'{cur}-10-01' <= k < f'{cur}-11-01'), default=None)
        live = {'season': cur, 'values': arr, 'preSeasonDepth': round(depth[pre]) if pre else None, 'asOf': max(depth)}
    model = fit_depth_model({k: v for k, v in depth.items() if k in snow_base}, snow_base, temp_base)
    print('depth model', model, file=sys.stderr)

    data = {
        'generated': today.isoformat(), 'lat': LAT, 'lon': LON,
        'bands': {b: e for b, e in BANDS},
        'snowSeasons': seasons, 'snow': snow,
        'depthSeasons': depth_seasons, 'depth': depth_by_season,
        'depthLive': live, 'depthModel': model,
        'station': {'name': 'Tignes Le Lac', 'id': STATION, 'elev': 2084},
    }
    text = 'const SNOW_DATA = ' + json.dumps(data, separators=(',', ':')) + ';'
    html = HTML.read_text(encoding='utf-8')
    new, n = re.subn(r'/\*SNOW_DATA_START\*/.*?/\*SNOW_DATA_END\*/',
                     lambda m: '/*SNOW_DATA_START*/\n' + text + '\n/*SNOW_DATA_END*/', html, flags=re.S)
    if n != 1:
        sys.exit('SNOW_DATA markers not found in snow_tracker.html')
    HTML.write_text(new, encoding='utf-8')
    print(f'wrote {len(text) / 1024:.0f} KB of data into {HTML.name}', file=sys.stderr)


if __name__ == '__main__':
    main()
