# Bot activo en el servidor gratuito

Migracion completada el 24-10-2026. La primera ejecucion automatica de las
15:30 UTC (17:30 en Espana) devolvio HTTP 200, `status=sent` y
`account_ok=true`. Binance Spot esta conectado en solo lectura y Telegram
acepto el mensaje. El cron `market-bot-every-15-minutes` esta activo con
`*/15 * * * *`; GitHub ya no tiene programacion automatica.

Las cuatro credenciales se importaron cifradas en Vault una sola vez, con
autorizacion del propietario. Se conservo la cartera ficticia de GitHub.
La marca `imported=true` cierra permanentemente ese procedimiento de
importacion; el importador tambien tiene vencimiento y un SHA fijo aprobado.
No se necesitan la computadora encendida ni servicios de pago.

## Referencia del procedimiento de migracion

El bot Python se mantuvo en GitHub mientras se preparaba la migracion.
La consulta privada desde GitHub devolvio HTTP 451; las claves no se pueden
validar desde ese entorno. No se cambian ni se copian claves a este directorio.

Antes de migrar, desplegar `functions/binance-probe/index.ts` como una Edge
Function de Supabase con verificacion JWT activa. Invocarla con POST en la
region especifica elegida para el proyecto (por ejemplo `sa-east-1`), usando
la cabecera `x-region`. La respuesta debe confirmar la region y HTTP 200 en
ambos endpoints de hora. No requiere claves de Binance ni Telegram y no
devuelve datos privados. No acepta destinos arbitrarios ni reenvia solicitudes.

Tras una prueba satisfactoria: migrar el analisis y la simulacion, configurar
los secretos directamente en Supabase, guardar el estado ficticio en una tabla
protegida y programar una ejecucion cada 15 minutos. Verificar un informe real
antes de desactivar la programacion anterior. No habilitar operaciones reales.

El plan Free tiene cuotas y puede pausarse por baja actividad; no ofrece una
garantia de disponibilidad. No se activa ningun plan de pago.

## Configuracion del servidor

Proyecto: `qqdyagzvjshhiiqkzfat`, region `sa-east-1`.
La prueba regional de ambos endpoints devolvio HTTP 200 el 23-10-2026.

`market-bot` conserva el analisis y el estado de la simulacion original. Solo
acepta el JWT de servicio del proyecto y rechaza otra region. La tabla tiene
RLS, y sus cuatro RPC solo se pueden ejecutar como `service_role`. Las claves
se guardan cifradas en Vault; no se publican saldos ni credenciales en GitHub.
Un bloqueo evita ejecuciones simultaneas. Un informe pendiente se reintenta
sin aplicar dos veces las operaciones ficticias. Telegram no ofrece clave
de idempotencia para sendMessage: un fallo entre envio y confirmacion podria
duplicar ese mensaje, pero no las operaciones ficticias.

El traslado de las cuatro credenciales existentes se prepara como un workflow
manual, sin PAT adicional. `import-bot-secrets` valida la firma OIDC de GitHub,
audiencia, repositorio inmutable, actor, archivo de workflow, rama, evento
manual y SHA exacto. Al desplegar se sustituyen `__MIGRATION_SHA__` y
`__IMPORT_DEADLINE__` (ventana corta). No ejecutar antes de la autorizacion
del propietario para copiar las credenciales de GitHub a este proyecto.
La importacion es atomica y se cierra al primer exito. La clave `anon`
del workflow es publica y no permite leer el estado ni las credenciales.

Orden de puesta en marcha: migracion SQL, despliegue, autorizacion del
traslado, workflow manual, prueba del informe con cuenta, desactivar el
schedule anterior de GitHub, ejecutar `schedule.sql`. Comprobar cron y un
envio automatico antes de considerar finalizada la migracion.

Pruebas locales: `node tests/test_edge.mjs` comprueba riesgo, stops,
duplicados de vela, pausas, escape HTML, longitud, autorizacion y region.
