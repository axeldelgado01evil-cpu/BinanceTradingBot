
import os
import requests
from datetime import datetime, timezone

TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]

def enviar_telegram(mensaje):
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"

    respuesta = requests.post(
        url,
        json={
            "chat_id": CHAT_ID,
            "text": mensaje
        },
        timeout=20
    )
    respuesta.raise_for_status()

    if not respuesta.json().get("ok"):
        raise RuntimeError("Telegram rechazo el mensaje")

def precio_binance(simbolo):
    respuesta = requests.get(
        "https://data-api.binance.vision/api/v3/ticker/price",
        params={"symbol": simbolo},
        timeout=20
    )
    respuesta.raise_for_status()
    return float(respuesta.json()["price"])

def main():
    monedas = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

    mensaje = (
        "BINANCE TRADING BOT\n\n"
        "Modo: SIMULACION\n"
        "Capital ficticio: 100 USDT\n\n"
        "Precios actuales:\n"
    )

    for moneda in monedas:
        precio = precio_binance(moneda)
        mensaje += f"{moneda}: {precio:,.4f} USDT\n"

    fecha = datetime.now(timezone.utc)
    mensaje += f"\nConsulta UTC: {fecha:%Y-%m-%d %H:%M}"
    mensaje += "\n\nPrimera prueba completada."

    enviar_telegram(mensaje)
    print("Mensaje enviado correctamente")

if __name__ == "__main__":
    main()
