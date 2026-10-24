# Binance Trading Bot

Bot de **analisis y simulacion**. Cruza datos publicos de varias fuentes, revisa BTC,
ETH, SOL, altcoins liquidas y una lista corta de memecoins, y envia un informe
por Telegram desde un servidor gratuito de Supabase. **No compra, vende, transfiere
ni retira activos reales.**

## Informe y frecuencia

Supabase ejecuta el bot a los minutos 00, 15, 30 y 45 de cada hora. La funcion
se fija en Sao Paulo (`sa-east-1`), donde se verifico la consulta de cuenta.
El envio llega despues del procesamiento. El plan Free tiene cuotas y no
garantiza disponibilidad; no se activa ningun plan de pago. GitHub Actions
queda solo como alternativa manual y ya no tiene horario automatico.
Los horarios de los mensajes se muestran en **Uruguay** (`America/Montevideo`),
segun la ubicacion indicada por el propietario. El cron conserva su frecuencia
de 15 minutos; la region de alojamiento sigue siendo Sao Paulo.

Cada informe muestra:

- cambios de BTC/ETH/SOL en la ultima vela cerrada de 15 minutos y en 24 horas;
- tendencia basada en velas cerradas de 4 horas y diarias, RSI, MACD, volumen,
  soportes y resistencias;
- contexto global de CoinGecko; indice Miedo/Codicia diario
  de Alternative.me; un titular de mercado reciente de CriptoNoticias;
- contraste de precios de Binance con CoinMarketCap (BTC/ETH/SOL) y CoinGecko
  (activos conocidos), comprobando identidad, antiguedad y conversion USD/USDT;
- volumen agregado de DEX de DefiLlama y una muestra de hasta ocho perfiles
  recientes de DEX Screener, con hasta dos resultados para observacion;
- un radar de altcoins liquidas y memecoins, distinguiendo candidatos que
  cumplen filtros de las monedas que solo merecen observacion;
- si se configura, un resumen
  **de solo lectura** de los saldos Spot reales: cantidades, valores estimados
  y concentracion de la mayor posicion. Muestra las cinco posiciones mayores.

Cuando dos lecturas Spot completas contienen las mismas cantidades, muestra
el cambio de valor desde la lectura anterior. Si cambian las cantidades, avisa
de posibles depositos, retiros u operaciones y no presenta esa variacion como
rendimiento. No equivale a la ganancia desde la compra; no reconstruye operaciones
que se compensen entre lecturas. El historial de lecturas permanece en la base
privada de Supabase, separado del archivo publico de simulacion.

CoinMarketCap y CoinGecko se consultan con sus interfaces publicas sin clave;
no se conecta la cuenta de Binance al portafolio de CoinMarketCap ni se le
envian saldos privados. Las entradas ficticias nuevas exigen al menos una
fuente externa reciente (hasta 15 minutos), diferencia de precio no mayor
al 2% con ninguna fuente disponible, y USDT dentro del 1% del dolar. Este
contraste valida coherencia del precio, no predice rentabilidad. Las monedas
sin identificador conocido quedan solo en observacion.

DefiLlama y DEX Screener se actualizan como maximo una vez por hora y el
mensaje indica la antiguedad de la consulta. El radar DEX requiere al menos
1 millon USD de liquidez y volumen diario, siete dias de antiguedad del pool,
capitalizacion positiva y una relacion FDV/liquidez no superior a 50. Es una
muestra de perfiles, no un rastreo completo del mercado ni una auditoria;
no produce compras ficticias ni reales. Volumen DEX no equivale a entrada
neta de capital. Los limites publicos de los proveedores pueden interrumpir
algunas secciones; el mensaje muestra su disponibilidad.

El radar de memecoins no comprueba distribucion de tenedores, contratos ni
riesgo de manipulacion. Los titulares no prueban la causa de un movimiento.
Si un proveedor opcional falla, su seccion se omite; si faltan datos de
BTC/ETH/SOL, la ejecucion falla para no mandar un analisis incompleto.

La funcion acepta `{"action":"diagnostics"}` con la misma autenticacion de
servicio para verificar fuentes publicas, horario y longitud del informe. Ese
diagnostico no consulta la cuenta, no envia Telegram ni modifica la simulacion.

## Simulacion

Por preferencia del propietario, la cartera ficticia y sus eventos no aparecen
en Telegram. La simulacion interna se conserva separada de los saldos reales;
ocultarla del mensaje no activa operaciones con dinero real.

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

## IA opcional con Groq Free

La integracion opcional usa `qwen/qwen3.8-27b` a traves de Groq, no la API de
pago de OpenAI ni la suscripcion de ChatGPT. Requiere una cuenta Groq Free,
una credencial privada `GROQ_API_KEY` en los secretos de la funcion, y
`GROQ_ENABLED=true` despues de la autorizacion del propietario. No activa
facturacion ni modifica permisos de Binance.

El resumen de mercado y las preguntas usan solo una instantanea publica de
BTC/ETH/SOL, hasta dos altcoins y dos memecoins de la muestra, sus indicadores
y disponibilidad de fuentes. No se incluye el
resumen privado de la cuenta en las peticiones al modelo. Las preguntas que
el propietario escribe si se envian a Groq; no debe escribir informacion
privada. Las consultas de saldo/cartera se responden localmente en el servidor.
No se mantienen conversaciones anteriores ni se proporcionan herramientas al modelo.

Limites internos: hasta 96 explicaciones programadas y 24 preguntas por dia
UTC, entradas cortas y hasta 320 tokens de salida por consulta. Los limites
reales del proveedor pueden variar y son compartidos por la cuenta; no se
garantiza que toda consulta tenga respuesta de IA. Ante limite, error o datos
de mas de 30 minutos, el informe normal continua sin generar una explicacion.

Telegram se consulta cada minuto con el mismo acceso de servicio, sin abrir
un webhook publico. Solo se responde al chat privado del propietario, se
ignoran mensajes anteriores a la activacion o de mas de 10 minutos, y se
procesan hasta dos respuestas por consulta. `/help` muestra ayuda y `/cartera`
el ultimo resumen Spot (no consulta instantanea). La respuesta puede tardar
cerca de un minuto. El desplazamiento se guarda tras cada lote; un fallo
entre enviar y guardar puede duplicar una respuesta, nunca una operacion.

Aplicar `supabase/migrations/202610240002_assistant.sql` y, una vez activada
la credencial, `supabase/assistant-schedule.sql`. La IA explica datos; no
predice beneficios, ejecuta operaciones ni acepta autorizaciones de trading.

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
