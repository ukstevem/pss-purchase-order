// Liveness probe (bead pss-purchase-order-6el). Estate convention:
// C:\Dev\PSS\PSS-Admin\docs\health-endpoints.md
//
// Answers "is this process serving?" and nothing else — no Supabase, no
// allocation, no layout (route handlers skip AuthGate, so this needs no
// auth). The compose healthcheck used to wget the dashboard instead, which
// ran a whole-table fetch 2,880 times a day for nobody (bead i7w).
//
// Served at /purchase-order/api/health — next.config.ts sets basePath, and
// trailingSlash means the canonical URL carries the slash.
//
// force-dynamic is load-bearing: without it Next may prerender the response
// at build time, and a static 200 would stay green after the process wedged.
//
// Readiness is a separate question. If this app ever grows a dependency
// whose absence makes it useless, that belongs in /api/ready — Docker
// restarts on a failed healthcheck, and restart-looping on a blipped
// dependency turns a degradation into an outage.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", uptime: process.uptime() });
}
