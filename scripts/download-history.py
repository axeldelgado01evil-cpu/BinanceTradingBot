"""Public Binance candles only. Writes no credentials or account data."""
import json, time
from pathlib import Path
import requests

root = Path(__file__).resolve().parents[1] / '.cache' / 'validation'
root.mkdir(parents=True, exist_ok=True)
end = int(time.time() * 1000)
start = end - 3 * 365 * 86400000
result = {}
for symbol in ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']:
    result[symbol] = {}
    for interval, key in [('4h', 'four'), ('1d', 'daily')]:
        path = root / f'{symbol}-{interval}.json'
        if path.exists() and time.time() - path.stat().st_mtime < 21600:
            rows = json.loads(path.read_text(encoding='utf8'))
        else:
            rows, cursor = [], start
            while cursor < end:
                response = requests.get('https://data-api.binance.vision/api/v3/klines',
                    params={'symbol': symbol, 'interval': interval, 'startTime': cursor, 'endTime': end, 'limit': 1000}, timeout=30)
                response.raise_for_status()
                batch = response.json()
                if not batch:
                    break
                rows.extend(batch)
                next_cursor = int(batch[-1][6]) + 1
                if next_cursor <= cursor:
                    raise RuntimeError('Non-advancing candle cursor')
                cursor = next_cursor
            path.write_text(json.dumps(rows), encoding='utf8')
        result[symbol][key] = [dict(time=int(r[0]), end=int(r[6]), open=float(r[1]), high=float(r[2]),
            low=float(r[3]), close=float(r[4]), volume=float(r[7])) for r in rows if int(r[6]) < end]
        print(f'{symbol} {interval}: {len(result[symbol][key])} closed candles')
(root / 'candles.json').write_text(json.dumps(result), encoding='utf8')
