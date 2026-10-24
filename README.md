# Binance Trading Bot

Bot de **analisis y simulacion**. Consulta datos publicos de Binance, revisa BTC,
ETH, SOL, altcoins liquidas y una lista corta de memecoins, y envia un informe
por Telegram desde un servidor gratuito de Supabase. **No compra, vende, transfiere
ni retira activos reales.**

## Informe y frecuencia

Supabase ejecuta el bot a los minutos 00, 15, 30 y 45 de cada hora. La funcion
se fija en Sao Paulo (`sa-east-1`), donde se verifico la consulta de cuenta.
El envio llega despues del procesamiento. El plan Free tiene cuotas y no
garantiza disponibilidad; no se activa ningun plan de pago. GitHub Actions
queda solo como alternativa manual y ya no tiene horario automatico.
Cada informe muestra:

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

El estado activo se guarda en una tabla con RLS y funciones restringidas de
Supabase. Se conservo la cartera previa al trasladar el bot. El archivo publico
`state/paper.json` conserva el estado anterior de GitHub y solo contiene
operaciones **ficticias**, nunca claves o saldos reales.

## Conexion de Telegram y Binance

Las cuatro credenciales del bot estan cifradas en Supabase Vault. Se importaron
una sola vez desde los secretos existentes de GitHub con autorizacion del
propietario y verificacion OIDC del workflow. No se muestran en los registros.
El bot necesita:

- `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` para los mensajes.
- Opcionales: `BINANCE_API_KEY` y `BINANCE_API_SECRET` para consultar el
  saldo Spot de tu cuenta.

La clave de Binance debe permitir **solamente lectura**. No habilites Spot &
Margin Trading, Futures, transferencias ni retiros. No pegues claves en el
codigo, en un commit ni en un chat. El bot hace unicamente una solicitud
`GET /api/v3/account` firmada, mas consultas publicas de datos de mercado.
GitHub devolvio HTTP 451 al consultar la cuenta y por eso se traslado el
horario a Supabase. Si falla la cuenta, el informe publico continuara, pero
la seccion de cuenta indicara el error. El saldo
estimado no es una ganancia/perdida: para eso haria falta el historial de
compras y comisiones de la cuenta.

## Pruebas locales

```powershell
python -m pip install requests
python -m unittest discover -s tests -v
node tests/test_edge.mjs
```

No ejecutes `main.py` localmente sin un bot de Telegram de prueba: su
funcion principal envia un mensaje.

Despliegue y programacion: ver `supabase/README.md` y `supabase/schedule.sql`.
