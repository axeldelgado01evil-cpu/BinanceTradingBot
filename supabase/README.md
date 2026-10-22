# Prueba de alojamiento para la conexion de cuenta

El bot Python sigue funcionando en GitHub mientras se prepara la migracion.
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
