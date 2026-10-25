"""Independent health check. Logs no credentials or financial payloads."""
import json
import os
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

HEALTH = "https://qqdyagzvjshhiiqkzfat.supabase.co/functions/v1/portfolio-panel/health"

def run():
    state_path = Path(".watchdog/state.json")
    try:
        state = json.loads(state_path.read_text())
    except (OSError, ValueError):
        state = {}
    healthy = False
    try:
        with urlopen(Request(HEALTH, headers={"User-Agent": "CriptoAlertas-Watchdog"}), timeout=20) as response:
            healthy = json.load(response).get("healthy") is True
    except HTTPError as error:
        if error.code in (401, 404):
            print('Health endpoint awaiting activation; no failure notification sent')
            return
    except Exception:
        pass
    now = int(time.time())
    state_path.parent.mkdir(exist_ok=True)
    if not healthy and now - state.get("notified", 0) >= 10800:
        token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
        if not token or not chat:
            raise RuntimeError("Missing notification configuration")
        body = json.dumps({"chat_id": chat, "text": "⚠ Control externo: el bot no confirma un informe reciente o el servidor no responde. Los datos pueden estar desactualizados. No dependas de sus alertas para operar. /estado cuando se restablezca."}).encode()
        try:
            with urlopen(Request("https://api.telegram.org/bot" + token + "/sendMessage", data=body, headers={"Content-Type": "application/json"}), timeout=20) as response:
                if json.load(response).get("ok") is not True:
                    raise RuntimeError("Notification rejected")
        except Exception:
            raise RuntimeError("Could not deliver health notification") from None
        state["notified"] = now
    state["healthy"] = healthy
    state_path.write_text(json.dumps(state))
    print("Health check:", "recent report confirmed" if healthy else "unavailable/stale; notification throttled to 3 hours")

if __name__ == "__main__":
    run()
