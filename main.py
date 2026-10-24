"""Public Binance analysis, read-only account view, and independent paper portfolio.

No Binance order, transfer, or withdrawal endpoint is present in this program.
"""

import base64
import hashlib
import hmac
import html
import json
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from xml.etree import ElementTree
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests

PUBLIC = "https://data-api.binance.vision"
PRIVATE = "https://api.binance.com"
STATE_FILE = "state/paper.json"
CORE = {"BTCUSDT": 40.0, "ETHUSDT": 25.0, "SOLUSDT": 15.0}
WATCH = ("BNBUSDT", "XRPUSDT", "LINKUSDT", "ADAUSDT")
MEMES = ("DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "FLOKIUSDT")
STABLES = {"USDC", "FDUSD", "TUSD", "USDP", "DAI", "EUR", "TRY", "BRL"}
FEE = 0.001  # Assumed paper fee, not the user's actual Binance fee tier.
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "BinanceTradingBot/2.0"})


def get_json(url, params=None, headers=None):
    response = HTTP.get(url, params=params, headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()


def candles(symbol, interval, count):
    rows = get_json(PUBLIC + "/api/v3/klines",
                    {"symbol": symbol, "interval": interval, "limit": count + 1})
    now_ms = int(time.time() * 1000)
    closed = [r for r in rows if int(r[6]) < now_ms]
    if len(closed) < count - 1:
        raise ValueError("Velas cerradas insuficientes")
    return [{"id": int(r[0]), "high": float(r[2]), "low": float(r[3]),
             "close": float(r[4]), "volume": float(r[7])} for r in closed[-count:]]


def ema(values, period):
    result = [values[0]]
    k = 2 / (period + 1)
    for value in values[1:]:
        result.append(value * k + result[-1] * (1 - k))
    return result


def rsi(values, period=14):
    changes = [b - a for a, b in zip(values, values[1:])]
    gains, losses = [max(x, 0) for x in changes], [max(-x, 0) for x in changes]
    gain, loss = sum(gains[:period]) / period, sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        gain, loss = (gain * (period - 1) + g) / period, (loss * (period - 1) + l) / period
    return 100 - 100 / (1 + gain / loss) if loss else (100.0 if gain else 50.0)


def analyze(symbol):
    four = candles(symbol, "4h", 80)
    days = candles(symbol, "1d", 60)
    quarter = candles(symbol, "15m", 3)
    ticker = get_json(PUBLIC + "/api/v3/ticker/24hr", {"symbol": symbol})
    closes = [c["close"] for c in four]
    daily = [c["close"] for c in days]
    volumes = [c["volume"] for c in four]
    line = [a - b for a, b in zip(ema(closes, 12), ema(closes, 26))]
    histogram = line[-1] - ema(line, 9)[-1]
    true_ranges = [max(b["high"] - b["low"],
                       abs(b["high"] - a["close"]),
                       abs(b["low"] - a["close"])) for a, b in zip(four, four[1:])]
    moving_20 = sum(closes[-20:]) / 20
    moving_50d = sum(daily[-50:]) / 50
    trend = ("alcista" if closes[-1] > moving_20 and daily[-1] > moving_50d
             else "bajista" if closes[-1] < moving_20 and daily[-1] < moving_50d
             else "mixta")
    return {
        "symbol": symbol, "price": float(ticker["lastPrice"]),
        "change": float(ticker["priceChangePercent"]),
        "change_15m": (quarter[-1]["close"] / quarter[-2]["close"] - 1) * 100,
        "volume_24h": float(ticker["quoteVolume"]),
        "rsi": rsi(closes), "histogram": histogram,
        "volume_ratio": volumes[-1] / (sum(volumes[-21:-1]) / 20)
        if sum(volumes[-21:-1]) else 0,
        "atr": sum(true_ranges[-14:]) / 14,
        "support": min(c["low"] for c in four[-20:]),
        "resistance": max(c["high"] for c in four[-20:]),
        "trend": trend, "candle_id": four[-1]["id"],
    }


def candidate(item, meme=False):
    return (item["trend"] == "alcista"
            and 45 <= item["rsi"] <= 65
            and item["histogram"] > 0
            and item["volume_ratio"] >= (1.5 if meme else 1.1)
            and (not meme or (item["volume_24h"] >= 10_000_000
                              and abs(item["change"]) <= 20)))


def discover_watchlist():
    """Scan liquid USDT spot tickers; deeper indicators are fetched for finalists."""
    try:
        tickers = get_json(PUBLIC + "/api/v3/ticker/24hr")
    except requests.RequestException:
        return WATCH
    ranked = []
    excluded = set(CORE) | set(MEMES)
    for ticker in tickers:
        symbol = ticker.get("symbol", "")
        base = symbol[:-4]
        if (not symbol.endswith("USDT") or symbol in excluded
                or base in STABLES or not base.isalpha()
                or base.endswith(("UP", "DOWN", "BULL", "BEAR"))):
            continue
        try:
            volume = float(ticker["quoteVolume"])
            change = float(ticker["priceChangePercent"])
        except (KeyError, TypeError, ValueError):
            continue
        if volume >= 30_000_000 and 2 <= change <= 15:
            ranked.append((volume, symbol))
    ranked.sort(reverse=True)
    return tuple(dict.fromkeys((*WATCH, *(symbol for _, symbol in ranked[:6]))))


def global_context():
    context = {}
    try:
        data = get_json("https://api.coingecko.com/api/v3/global")["data"]
        context["market_change"] = float(data["market_cap_change_percentage_24h_usd"])
        context["btc_dominance"] = float(data["market_cap_percentage"]["btc"])
    except (requests.RequestException, KeyError, TypeError, ValueError):
        pass
    try:
        data = get_json("https://api.alternative.me/fng/", {"limit": 1})["data"][0]
        context["fear_greed"] = int(data["value"])
        context["fear_greed_label"] = data["value_classification"]
    except (requests.RequestException, KeyError, IndexError, TypeError, ValueError):
        pass
    return context


def headlines():
    try:
        response = HTTP.get("https://www.criptonoticias.com/feed/", timeout=15)
        response.raise_for_status()
        root = ElementTree.fromstring(response.content)
        result = []
        for item in root.findall("./channel/item"):
            title = re.sub(r"\s+", " ", item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            market_words = ("precio", "mercado", "demanda", "presión vendedora",
                            "sube", "cae", "caída", "tasas", "inflación",
                            "etf", "volatilidad", "rally")
            if (title and link.startswith("https://www.criptonoticias.com/")
                    and any(word in title.lower() for word in market_words)):
                result.append((title[:100], link))
            if len(result) == 2:
                break
        return result
    except (requests.RequestException, ElementTree.ParseError):
        return []


def blank_state():
    return {"version": 1, "cash": 100.0, "positions": {},
            "trades": [], "last_candle": {}, "status": "active"}


def state_endpoint():
    return ("https://api.github.com/repos/" + os.environ["GITHUB_REPOSITORY"]
            + "/contents/" + STATE_FILE)


def state_headers():
    return {"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
            "Accept": "application/vnd.github+json"}


def load_state():
    if not os.getenv("GITHUB_TOKEN") or not os.getenv("GITHUB_REPOSITORY"):
        return blank_state(), None
    response = HTTP.get(state_endpoint(), headers=state_headers(), timeout=20)
    if response.status_code == 404:
        return blank_state(), None
    response.raise_for_status()
    data = response.json()
    state = json.loads(base64.b64decode(data["content"]).decode("utf-8"))
    if state.get("version") != 1:
        raise ValueError("Version de cartera simulada desconocida")
    return state, data["sha"]


def save_state(state, sha):
    if not os.getenv("GITHUB_TOKEN") or not os.getenv("GITHUB_REPOSITORY"):
        return
    content = base64.b64encode(
        (json.dumps(state, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    ).decode("ascii")
    payload = {"message": "Update simulated portfolio", "content": content, "branch": "main"}
    if sha:
        payload["sha"] = sha
    response = HTTP.put(state_endpoint(), headers=state_headers(), json=payload, timeout=20)
    response.raise_for_status()


def equity(state, prices):
    return state["cash"] + sum(
        position["quantity"] * prices[symbol]
        for symbol, position in state["positions"].items()
    )


def close_paper(state, symbol, price, reason, stamp):
    position = state["positions"].pop(symbol)
    gross = position["quantity"] * price
    fee = gross * FEE
    state["cash"] += gross - fee
    pnl = gross - fee - position["cost"]
    state["trades"].append({"time": stamp, "side": "SELL", "symbol": symbol,
                            "price": price, "quantity": position["quantity"],
                            "fee": fee, "pnl": pnl, "reason": reason})
    return f"🧪 Venta de prueba de {symbol[:-4]}: resultado {pnl:+.2f} USDT ({reason})."


def open_paper(state, symbol, item, stamp):
    price = item["price"]
    stop = max(item["support"] * 0.995, price - 2 * item["atr"])
    if stop >= price or (price - stop) / price > 0.12:
        return None
    budget = min(CORE[symbol] / 2, max(0, state["cash"] - 20),
                 price / (price - stop) * 1.0)
    if budget < 5:
        return None
    quantity = budget / (price * (1 + FEE))
    cost = quantity * price * (1 + FEE)
    state["cash"] -= cost
    target = price + 2 * (price - stop)
    state["positions"][symbol] = {"quantity": quantity, "entry": price,
                                  "cost": cost, "stop": stop, "target": target}
    state["trades"].append({"time": stamp, "side": "BUY", "symbol": symbol,
                            "price": price, "quantity": quantity,
                            "fee": quantity * price * FEE})
    return (f"🧪 Compra de prueba de {symbol[:-4]} por {budget:.2f} USDT. "
            f"Precio {format_price(price)}, salida por pérdida {format_price(stop)}, "
            f"objetivo {format_price(target)}.")


def update_paper(state, analyses, stamp):
    events = []
    prices = {symbol: item["price"] for symbol, item in analyses.items()}
    for symbol, position in list(state["positions"].items()):
        item = analyses[symbol]
        reason = ("stop" if item["price"] <= position["stop"]
                  else "objetivo" if item["price"] >= position["target"]
                  else "tendencia deteriorada" if item["trend"] == "bajista"
                  and item["histogram"] < 0 else None)
        if reason:
            events.append(close_paper(state, symbol, item["price"], reason, stamp))
            state["last_candle"][symbol] = item["candle_id"]
    value = equity(state, prices)
    if value <= 85 and state["status"] != "halted":
        state["status"] = "halted"
        events.append(f"⛔ Prueba detenida: la cartera bajó a {value:.2f} USDT.")
    elif value <= 95 and state["status"] == "active":
        state["status"] = "paused"
        events.append(f"⏸ Nuevas compras de prueba pausadas: cartera {value:.2f} USDT.")
    if state["status"] == "active":
        for symbol in CORE:
            item = analyses[symbol]
            if symbol in state["positions"] or not candidate(item):
                continue
            if state["last_candle"].get(symbol) == item["candle_id"]:
                continue
            state["last_candle"][symbol] = item["candle_id"]
            event = open_paper(state, symbol, item, stamp)
            if event:
                events.append(event)
    state["trades"] = state["trades"][-200:]
    return events


def account_snapshot():
    key, secret = os.getenv("BINANCE_API_KEY"), os.getenv("BINANCE_API_SECRET")
    if not key and not secret:
        return "Cuenta Binance: aun no conectada (analisis publico activo)."
    if not key or not secret:
        return "Cuenta Binance: faltan una o ambas credenciales de solo lectura."
    try:
        server_time = get_json(PRIVATE + "/api/v3/time")["serverTime"]
        query = urlencode({"timestamp": int(server_time), "recvWindow": 5000})
        signature = hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        data = get_json(PRIVATE + "/api/v3/account?" + query + "&signature=" + signature,
                        headers={"X-MBX-APIKEY": key})
    except (requests.RequestException, KeyError, ValueError) as exc:
        status = (exc.response.status_code if isinstance(exc, requests.HTTPError)
                  and exc.response is not None else "conexion")
        return f"Cuenta Binance: consulta fallida ({status}); revisar region, IP y permisos."
    balances = sorted(
        (b["asset"], float(b["free"]) + float(b["locked"]))
        for b in data.get("balances", [])
        if float(b["free"]) + float(b["locked"]) > 0
    )
    if not balances:
        return "Cuenta Binance Spot: sin saldos positivos visibles."
    try:
        tickers = get_json(PUBLIC + "/api/v3/ticker/price")
        price_map = {row["symbol"]: float(row["price"]) for row in tickers}
    except (requests.RequestException, KeyError, TypeError, ValueError):
        price_map = {}
    valued = []
    missing = []
    for asset, amount in balances:
        price = 1.0 if asset == "USDT" else price_map.get(asset + "USDT")
        if price is None:
            missing.append(asset)
        else:
            valued.append((asset, amount, amount * price))
    valued.sort(key=lambda row: row[2], reverse=True)
    known_total = sum(row[2] for row in valued)
    summary = ", ".join(f"{asset} {amount:.8g} (~{value:.2f} USDT)"
                        for asset, amount, value in valued[:8])
    concentration = (f" Mayor posicion: {valued[0][0]} {valued[0][2]/known_total:.0%}."
                     if known_total and valued else "")
    omitted = f" Sin precio USDT: {', '.join(missing[:8])}." if missing else ""
    return (f"Cuenta Binance Spot (solo lectura): valor conocido ~{known_total:.2f} USDT; "
            + summary + "." + concentration + omitted
            + " P/L real requiere historial de compras.")


def format_price(price):
    digits = 8 if price < 0.01 else 5 if price < 1 else 2
    result = f"{price:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return result.rstrip("0").rstrip(",") if digits > 2 else result


def format_percent(value, digits=1):
    return f"{value:+.{digits}f}".replace(".", ",") + " %"


def build_report(analyses, context, news, state, account, now, events):
    breadth = sum(item["change"] > 0 for item in analyses.values())
    market_change = context.get("market_change")
    sample_pct = 100 * breadth / len(analyses)
    if market_change is not None and market_change > 1 and sample_pct >= 60:
        icon, mood = "🟢", "Mayormente alcista"
    elif market_change is not None and market_change < -1 and sample_pct <= 40:
        icon, mood = "🔴", "Mayormente bajista"
    else:
        icon, mood = "🟡", "Mixto; conviene esperar confirmaciones"
    try:
        local_time = now.astimezone(ZoneInfo("America/Montevideo"))
        clock_label = "hora de Uruguay"
    except ZoneInfoNotFoundError:
        local_time = now
        clock_label = "UTC"
    lines = [f"📊 <b>Mercado · {local_time:%H:%M} ({clock_label})</b>",
             f"{icon} {mood}."]
    if market_change is not None:
        lines.append(f"Mercado cripto en 24 h: {format_percent(market_change)} (CoinGecko).")
        lines.append(f"De {len(analyses)} monedas observadas, {breadth} subieron; es solo una muestra.")
    else:
        lines.append(f"De {len(analyses)} monedas observadas, {breadth} subieron en 24 h.")
    if "fear_greed" in context:
        lines.append(f"Ánimo del mercado: {context['fear_greed']}/100, índice diario de Alternative.me.")

    lines.append("\n⏱ <b>Bitcoin, Ethereum y Solana</b>")
    for symbol in CORE:
        item = analyses[symbol]
        if candidate(item):
            decision = "🟢 Posible entrada para estudiar; no es una orden."
        elif item["trend"] == "bajista" or item["rsi"] >= 75:
            decision = "🔴 Riesgo elevado; esperaría."
        else:
            decision = "🟡 Sin señal clara; esperaría."
        lines.append(f"• <b>{symbol[:-4]}</b>: {format_price(item['price'])} USDT "
                     f"| 15 min {format_percent(item['change_15m'], 2)} "
                     f"| 24 h {format_percent(item['change'])}")
        lines.append("  " + decision)

    other = [item for symbol, item in analyses.items() if symbol not in CORE and symbol not in MEMES]
    picks = sorted((item for item in other if candidate(item)),
                   key=lambda item: item["volume_24h"], reverse=True)[:2]
    radar = sorted((item for item in other if item["volume_24h"] >= 30_000_000),
                   key=lambda item: item["change"], reverse=True)[:2]
    lines.append("\n🔎 <b>Otras criptos</b>")
    if picks:
        lines.append("Cumplen filtros para estudiar: " + ", ".join(i["symbol"][:-4] for i in picks) + ".")
    elif radar:
        lines.append("Para observar (todavía sin señal): " + ", ".join(
            f"{i['symbol'][:-4]} {format_percent(i['change'])}" for i in radar) + ".")
    else:
        lines.append("No veo candidatos líquidos con señal clara ahora.")

    meme_items = [analyses[s] for s in MEMES if s in analyses]
    meme_picks = [i for i in meme_items if candidate(i, meme=True)]
    meme_radar = sorted(meme_items, key=lambda i: i["volume_24h"], reverse=True)[:2]
    lines.append("🐸 <b>Memecoins</b>")
    if meme_picks:
        lines.append("Señal experimental para estudiar: " + ", ".join(i["symbol"][:-4] for i in meme_picks[:2]) + ".")
    elif meme_radar:
        lines.append("En observación, sin señal: " + ", ".join(
            f"{i['symbol'][:-4]} {format_percent(i['change'])}" for i in meme_radar) + ".")
    lines.append("Son muy volátiles; el bot no verifica concentración de tenedores ni contratos.")

    bitcoin = analyses["BTCUSDT"]
    support, resistance = bitcoin["support"], bitcoin["resistance"]
    lines.append("\n🧭 <b>Qué vigilar</b>")
    if bitcoin["price"] > resistance:
        lines.append(f"BTC superó {format_price(resistance)} USDT. Si mantiene esa zona con volumen, podría seguir subiendo.")
    else:
        lines.append(f"Si BTC supera {format_price(resistance)} USDT con volumen, podría mejorar.")
    lines.append(f"Si pierde {format_price(support)} USDT, aumenta el riesgo de caída.")

    lines.append("\n🏦 " + html.escape(account))
    if news:
        title, url = news[0]
        lines.append(f'📰 <b>Noticia para leer</b>: <a href="{html.escape(url, quote=True)}">'
                     f'{html.escape(title)}</a> (CriptoNoticias).')
    lines.append("\n<i>Cuenta de solo lectura. No se ejecutan compras ni ventas reales. "
                 "GitHub puede retrasar algún informe.</i>")
    return "\n".join(lines)



def send_telegram(message):
    if len(message) > 4000:
        raise ValueError("Informe demasiado largo para Telegram")
    response = HTTP.post(
        "https://api.telegram.org/bot" + os.environ["TELEGRAM_BOT_TOKEN"] + "/sendMessage",
        json={"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": message,
              "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=25)
    response.raise_for_status()
    if not response.json().get("ok"):
        raise RuntimeError("Telegram rechazo el mensaje")


def main():
    now = datetime.now(timezone.utc)
    analyses = {}
    for symbol in dict.fromkeys((*CORE, *discover_watchlist(), *MEMES)):
        try:
            analyses[symbol] = analyze(symbol)
        except (requests.RequestException, ValueError, KeyError, IndexError) as exc:
            if symbol in CORE:
                raise RuntimeError(f"Faltan datos esenciales para {symbol}") from exc
            print(f"Se omite {symbol}: datos no disponibles")
    state, sha = load_state()
    events = update_paper(state, analyses, now.isoformat())
    account = account_snapshot()
    if account.startswith("Cuenta Binance Spot"):
        print("BINANCE_ACCOUNT_STATUS=OK")
    else:
        print("BINANCE_ACCOUNT_STATUS=ERROR: " + account)
    message = build_report(analyses, global_context(), headlines(), state,
                           account, now, events)
    send_telegram(message)
    save_state(state, sha)
    print(f"Informe enviado: {len(analyses)} activos, {len(events)} eventos ficticios")


if __name__ == "__main__":
    main()
