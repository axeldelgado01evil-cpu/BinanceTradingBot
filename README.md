# Binance Trading Bot

Bot de **analisis y simulacion**. Consulta datos publicos de Binance, revisa BTC,
ETH, SOL, altcoins liquidas y una lista corta de memecoins, y envia un informe
por Telegram en cada ejecucion de GitHub Actions. **No compra, vende, transfiere
ni retira activos reales.**

## Informe y frecuencia

El workflow solicita una ejecucion a los minutos 7, 22, 37 y 52 de cada hora
(UTC), aproximadamente cada 15 minutos. GitHub Actions puede demorar u omitir
ejecuciones programadas; no es un servicio de tiempo real. Cada informe muestra:

- cambios de BTC/ETH/SOL en la ultima vela cerrada de 15 minutos y en 24 horas;
- tendencia basada en velas cerradas de 4 horas y diarias, RSI, MACD, volumen,
  soportes y resistencias;
- contexto global de CoinGecko; indice Miedo/Codicia diario
  de Alternative.me; un titular de mercado reciente de CriptoNoticias;
- un radar de altcoins liquidas y memecoins, distinguiendo candidatos que
  cumplen filtros de las monedas que solo merecen observacion;
- cartera ficticia, operaciones simuladas, y, si se configura, un resumen
  **de solo lectura** de los saldos Spot reales.

El radar de memecoins no comprueba distribucion de tenedores, contratos ni
riesgo de manipulacion. Los titulares no prueban la causa de un movimiento.
Si un proveedor opcional falla, su seccion se omite; si faltan datos de
BTC/ETH/SOL, la ejecucion falla para no mandar un analisis incompleto.

## Simulacion

Comienza con 100 USDT ficticios. Asignaciones maximas objetivo: BTC 40,
ETH 25, SOL 15 y reserva 20. Una entrada ficticia usa como maximo la mitad de
la asignacion del activo, calcula un stop con soporte y volatilidad, busca un
objetivo inicial 2:1 y limita la perdida estimada a 1 USDT antes de
deslizamiento. Se asume 0,1% de comision en cada lado. A 95 USDT se suspenden
las nuevas entradas y a 85 se detiene la simulacion; no se reanuda sola.
Los stops se revisan cada vez que el bot se ejecuta, por lo que **no garantizan**
un precio ni un limite real de perdidas.

El estado se guarda en `state/paper.json` mediante el `GITHUB_TOKEN` del
workflow. El repositorio es publico: ese archivo contiene solo operaciones
**ficticias**, nunca claves o saldos reales.

## Conexion de Telegram y Binance

Secretos necesarios en *Settings → Secrets and variables → Actions*:

- `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` para los mensajes.
- Opcionales: `BINANCE_API_KEY` y `BINANCE_API_SECRET` para consultar el
  saldo Spot de tu cuenta.

La clave de Binance debe permitir **solamente lectura**. No habilites Spot &
Margin Trading, Futures, transferencias ni retiros. No pegues claves en el
codigo, en un commit ni en un chat. El bot hace unicamente una solicitud
`GET /api/v3/account` firmada, mas consultas publicas de datos de mercado.
Si Binance bloquea las solicitudes de GitHub por region o por IP, el informe
publico continuara, pero la seccion de cuenta indicara el error. El saldo
estimado no es una ganancia/perdida: para eso haria falta el historial de
compras y comisiones de la cuenta.

## Pruebas locales

```powershell
python -m pip install requests
python -m unittest discover -s tests -v
```

No ejecutes `main.py` localmente sin un bot de Telegram de prueba: su
funcion principal envia un mensaje.
