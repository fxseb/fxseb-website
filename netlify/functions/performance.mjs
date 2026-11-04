// Public read-only endpoint used by the website: /api/performance
// Serves the stored snapshot; refreshes it if it is missing or older than 26 h.
import { readPerformance, syncPerformance } from "./_myfxbook.mjs";

const MAX_AGE = 26 * 3600 * 1000;

export default async () => {
  let data = null;
  try { data = await readPerformance(); } catch {}
  const stale = !data || Date.now() - new Date(data.asOf).getTime() > MAX_AGE;
  if (stale) {
    try { data = await syncPerformance(); } catch (e) { console.error(e.message); }
  }
  if (!data) return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=900" },
  });
};

export const config = { path: "/api/performance" };
