// Retired at the owner's request. Trading takes place directly in Binance.
export function handle(_req:Request){
  return Response.json({enabled:false,error:'trading_removed',message:'Compras y ventas disponibles únicamente en Binance.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
Deno.serve(handle);
