import json
from datetime import datetime, timedelta, UTC
from pathlib import Path
from urllib.request import urlopen
import ssl

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'data' / 'processed' / 'live_grid_data.js'


def get_json(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urlopen(url, timeout=30, context=ctx) as r:
        return json.loads(r.read().decode('utf-8'))


def fmt_ci(dt):
    return dt.strftime('%Y-%m-%dT%H:%MZ')


def main():
    now = datetime.now(UTC)
    start = now - timedelta(hours=24)
    from_param = fmt_ci(start)

    current = get_json('https://api.carbonintensity.org.uk/intensity')
    hist = get_json(f'https://api.carbonintensity.org.uk/intensity/{from_param}/pt24h')
    generation = get_json('https://api.carbonintensity.org.uk/generation')

    cur = (current.get('data') or [{}])[0]
    payload = {
        'updated_at': datetime.now(UTC).isoformat(),
        'current': {
            'from': cur.get('from'),
            'to': cur.get('to'),
            'actual': (cur.get('intensity') or {}).get('actual'),
            'forecast': (cur.get('intensity') or {}).get('forecast'),
            'index': (cur.get('intensity') or {}).get('index'),
        },
        'history': [
            {
                'from': d.get('from'),
                'to': d.get('to'),
                'actual': (d.get('intensity') or {}).get('actual'),
                'forecast': (d.get('intensity') or {}).get('forecast'),
            }
            for d in (hist.get('data') or [])
        ],
        'generationmix': (generation.get('data') or {}).get('generationmix') or []
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('window.__LIVE_GRID_DATA__ = ' + json.dumps(payload) + ';', encoding='utf-8')
    print(f'Wrote {OUT}')


if __name__ == '__main__':
    main()
