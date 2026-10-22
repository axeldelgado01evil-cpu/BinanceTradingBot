// Deployment check only: fixed public time endpoints, no account credentials.
// Keep Supabase JWT verification enabled for this function.
const ENDPOINTS = {
  market: "https://data-api.binance.vision/api/v3/time",
  account_host: "https://api.binance.com/api/v3/time",
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Use POST" }, { status: 405 });
  }
  const checks = await Promise.all(Object.entries(ENDPOINTS).map(async ([name, url]) => {
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const status = response.status;
      await response.body?.cancel();
      return [name, { status, reachable: status === 200,
        milliseconds: Math.round(performance.now() - started) }];
    } catch {
      return [name, { reachable: false, error: "network_or_timeout" }];
    }
  }));
  return Response.json({
    region: Deno.env.get("SB_REGION") ?? "local",
    checked_at: new Date().toISOString(),
    checks: Object.fromEntries(checks),
  }, { headers: { "Cache-Control": "no-store" } });
});
