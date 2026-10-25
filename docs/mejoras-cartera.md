# Cartera y alertas · versión portfolio-2

Todo el acceso a Binance es de lectura. No hay órdenes, retiros, transferencias ni cambios de permisos. El panel y los mensajes usan America/Montevideo.

## Telegram

| Comando | Función |
| --- | --- |
| `/cartera` | Últimos saldos Spot; se leen cada 15 minutos. |
| `/rendimiento` | Costo medio ponderado, resultado vendido/sin vender y cobertura por activo. |
| `/riesgo` | Concentración, caída con cantidades iguales, correlación diaria, mínimos y comisiones actuales. |
| `/evaluacion` | Desarrollo, validación y período final reservado; seguimiento nuevo de señales. |
| `/estado` | Hora del último informe, fuentes y disponibilidad. |
| `/seguir ADA`, `/dejar ADA` | Hasta 8 monedas de pares Spot USDT activos. BTC, ETH y SOL siempre se analizan. |
| `/alertas` | Umbrales actuales y ejemplos para modificarlos. |
| `/contrato ethereum 0x…` | Banderas públicas GoPlus; también bsc, base y solana. |
| `/panel` | Enlace de consulta que vence a los 15 minutos, cuando su acceso esté activado. |
| `/olvidar` | Borra el contexto breve de conversación. |

Umbrales iniciales: movimiento 3 % en aproximadamente 15 minutos, spread 0,5 %, concentración 60 %, caída 10 %. Repetición de cada alerta por activo/tipo como máximo cada 60 minutos. Precios revisados cada 2 minutos; resumen diario a las 09:00 de Uruguay. Las cuotas, redes y cron pueden demorar avisos. No son stops ni garantías de pérdidas máximas.

## Costos y cobertura

El historial se incorpora por páginas de 500 operaciones y se deduplica por par/id. Se priorizan BTC/ETH/SOL y pares de activos/seguimiento con rotación limitada. Se incluyen comisiones pagadas en base o USDT. Otras comisiones se estiman, si hay datos, con la vela histórica de un minuto del activo de la comisión. Se identifican como estimaciones.

Sin historia completa, conversión de comisión o cantidades conciliadas se muestra costo/resultado desconocido, sin completar con cero. Los movimientos de cripto impiden asumir un costo completo. Depósitos, retiros y movimientos Funding/Spot de los últimos 30 días se muestran aparte; no se confunden con ganancias. Las consultas pueden limitarse a 100 movimientos por tipo y se informa si están incompletas. No se calcula una rentabilidad global ajustada por todos los flujos: no se conocen todos los productos, pares cerrados, depósitos antiguos o movimientos externos. No incluye Earn ni Futures y no es un informe fiscal.

La curva muestra valor estimado, no rendimiento porcentual de inversión. El máximo para la caída se reinicia cuando cambian las cantidades o la cobertura de precios. Correlaciones usan hasta 30 retornos diarios de las tres monedas principales, con al menos 20 muestras alineadas.

## Evaluación

`scripts/download-history.py` obtiene velas públicas cerradas de Binance de tres años. `scripts/validate-strategy.mjs` aplica reglas técnicas fijas, entrada al siguiente open, costos por lado y prioridad del stop cuando stop/objetivo se tocan en la misma vela. División cronológica 60/20/20. No se reconstruyen los filtros históricos externos CMC/CoinGecko ni las memecoins. OHLC de 4 horas no reproduce ejecuciones intrabar reales.

El período final produjo **−5,03 %**, frente a **+7,72 %** de comprar y mantener las mismas asignaciones; 37 operaciones cerradas. La estrategia **no demostró una ventaja**. No se ajustaron parámetros para ocultar ese resultado. Hay sensibilidad a mayores costos y a calentamiento de 200 velas. `docs/validation-report.json` conserva resultados y supuestos; no son resultados de la cuenta real.

El seguimiento nuevo registra como máximo una señal por activo/día y observa su variación bruta 24 horas después (ventana de 30 minutos); una observación faltante se etiqueta. No son operaciones ni probabilidades de ganar. Al inicio no hay muestra suficiente.

## Privacidad y operación

Tablas con RLS y sin acceso anon/authenticated. RPC exclusivamente service_role. Las claves quedan en el servidor. La IA recibe solo el recorte de mercado público y preguntas públicas: no se mandan saldos, costos, historial ni claves. Memoria: últimas dos preguntas/respuestas públicas, 250 caracteres cada parte, vigencia 30 minutos; solicitudes de cartera quedan fuera.

Panel estático privado de Sites con sesión aleatoria de 256 bits, hash SHA-256 almacenado durante 15 minutos, token en fragmento eliminado de la barra al cargar. Token solo en memoria del navegador; no localStorage ni claves de servicio en cliente. El endpoint consulta datos y nunca escribe órdenes. CORS limita al origen del panel; la autorización depende del token, no de CORS. No compartir enlaces de sesión.

GoPlus revisa emisión/congelamiento/restricciones/tasas/tenedores/LP según disponibilidad. Unknown no significa seguro. Los mayores tenedores pueden incluir pools; bloqueo de LP es información del proveedor, no garantía. Contratos por ID canónico o dirección exacta; no búsquedas ambiguas por símbolo. Radar DEX es una muestra pequeña, no todo el mercado.

Alertas en cola persistente: se marcan entregadas después de Telegram; un error conserva el aviso para reintento. Una interrupción entre envío y confirmación puede repetir un aviso. Un control independiente de GitHub consulta solo salud (timestamp/booleanos) y avisa fallas con espera de tres horas entre avisos. Runners estándar en este repositorio público; no plan de pago. GitHub puede demorar/desactivar cron por inactividad: revisar /estado.

Verificación local: tests de contabilidad, costos, sesgo de futuro, riesgo, cobertura, contratos desconocidos, comandos, privacidad, sesiones, CORS, autenticación y región. Empaquetar con `node scripts/bundle.mjs`; la salida `.cache/deploy/market-bot.js` se despliega con gateway JWT activado. `portfolio-panel` usa verificación propia de sesión y requiere gateway JWT desactivado solo en esa función. Activar esa nueva vía de acceso únicamente con la confirmación del propietario.
