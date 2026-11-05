// Shared logic: pulls verified statistics from the official Myfxbook API
// and stores a compact snapshot in Netlify Blobs. Credentials come ONLY from
// Netlify environment variables (MYFXBOOK_EMAIL, MYFXBOOK_PASSWORD).
import { getStore } from "@netlify/blobs";

const API = "https://www.myfxbook.com/api";
const KEY = "performance";

async function call(path, params) {
  const url = `${API}/${path}?` + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { "User-Agent": "fxseb-website/1.0" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`${path}: ${data.message || "API error"}`);
  return data;
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
// Myfxbook dates look like "MM/DD/YYYY" or "MM/DD/YYYY HH:MM"
const parseDate = (s) => {
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
};
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));


const PROFILE = process.env.MYFXBOOK_PROFILE || "WdmGlobal";
const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const market = (n) => (/bitcoin|btc/i.test(n) ? "BTCUSD" : /gold|xau/i.test(n) ? "XAUUSD" : /nas|us100/i.test(n) ? "US100" : "MULTI-ASSET");
const HIDDEN = (process.env.MYFXBOOK_HIDE || "").split(",").map((x) => x.trim()).filter(Boolean);

async function seriesFor(session, acc) {
  const start = parseDate(acc.firstTradeDate) || parseDate(acc.creationDate) || "2026-01-01";
  const end = iso(new Date(Date.now() + 86400000));
  const dg = await call("get-daily-gain.json", { session, id: String(acc.id), start, end });
  const points = (dg.dailyGain || []).flat()
    .map((p) => ({ d: parseDate(p.date), v: num(p.value) }))
    .filter((p) => p.d && p.v !== null)
    .sort((a, b) => a.d.localeCompare(b.d));
  const monthly = {};
  let prevEnd = 0, lastMonth = null, lastVal = 0;
  for (const p of points) {
    const m = p.d.slice(0, 7);
    if (lastMonth && m !== lastMonth) { monthly[lastMonth] = ((1 + lastVal / 100) / (1 + prevEnd / 100) - 1) * 100; prevEnd = lastVal; }
    lastMonth = m; lastVal = p.v;
  }
  if (lastMonth) monthly[lastMonth] = ((1 + lastVal / 100) / (1 + prevEnd / 100) - 1) * 100;
  const year = String(new Date().getUTCFullYear());
  const ytd = Object.entries(monthly).filter(([m]) => m.startsWith(year)).reduce((a, [, r]) => a * (1 + r / 100), 1);
  return { start, points, monthly, lastMonth, ytd: (ytd - 1) * 100 };
}

export async function syncPerformance() {
  const email = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  const accountId = String(process.env.MYFXBOOK_ACCOUNT_ID || "12096727");
  if (!email || !password) throw new Error("Missing MYFXBOOK_EMAIL / MYFXBOOK_PASSWORD");

  const { session } = await call("login.json", { email, password });
  try {
    const { accounts = [] } = await call("get-my-accounts.json", { session });
    const acc = accounts.find((a) => String(a.id) === accountId);
    if (!acc) throw new Error(`Account ${accountId} not found`);

    const start = parseDate(acc.firstTradeDate) || parseDate(acc.creationDate) || "2026-01-01";
    const end = iso(new Date(Date.now() + 86400000));

    // Daily cumulative gain (%) -> equity curve
    const dg = await call("get-daily-gain.json", { session, id: accountId, start, end });
    const points = (dg.dailyGain || [])
      .flat()
      .map((p) => ({ d: parseDate(p.date), v: num(p.value) }))
      .filter((p) => p.d && p.v !== null)
      .sort((a, b) => a.d.localeCompare(b.d));

    // Monthly returns chained from the cumulative curve
    const monthly = {};
    let prevEnd = 0;
    let lastMonth = null;
    let lastVal = 0;
    for (const p of points) {
      const m = p.d.slice(0, 7);
      if (lastMonth && m !== lastMonth) {
        monthly[lastMonth] = ((1 + lastVal / 100) / (1 + prevEnd / 100) - 1) * 100;
        prevEnd = lastVal;
      }
      lastMonth = m;
      lastVal = p.v;
    }
    if (lastMonth) monthly[lastMonth] = ((1 + lastVal / 100) / (1 + prevEnd / 100) - 1) * 100;

    // Note: the Myfxbook API history endpoint only returns a limited number of
    // recent trades, so trade count and win rate are not derived from it.
    // The website keeps its static values for those two figures.
    const trades = null, winRate = null, profitFactor = num(acc.profitFactor);

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const ytd = Object.entries(monthly)
      .filter(([m]) => m.startsWith(year))
      .reduce((acc2, [, r]) => acc2 * (1 + r / 100), 1);

    const snapshot = {
      asOf: now.toISOString(),
      accountId,
      url: process.env.MYFXBOOK_URL || null,
      gain: num(acc.gain),
      absGain: num(acc.absGain),
      monthlyAvg: num(acc.monthly),
      drawdown: num(acc.drawdown),
      profitFactor,
      winRate,
      trades,
      liveSince: points.length ? points[0].d : start,
      monthGain: lastMonth ? monthly[lastMonth] : null,
      ytd: (ytd - 1) * 100,
      monthly,
      growth: points.map((p) => [p.d, Math.round(p.v * 100) / 100]),
    };

    // All strategies of the profile (one live account each)
    const strategies = [];
    for (const a of accounts) {
      if (HIDDEN.includes(String(a.id))) continue;
      try {
        const sr = String(a.id) === accountId
          ? { points, monthly, lastMonth, ytd: (ytd - 1) * 100, start }
          : await seriesFor(session, a);
        const step = Math.max(1, Math.ceil(sr.points.length / 60));
        const spark = sr.points.filter((_, i) => i % step === 0 || i === sr.points.length - 1).map((p) => Math.round(p.v * 100) / 100);
        strategies.push({
          id: String(a.id),
          name: String(a.name || "").replace(/^WDM\s+/i, ""),
          market: market(a.name),
          url: `https://www.myfxbook.com/members/${PROFILE}/${slug(a.name)}/${a.id}`,
          gain: num(a.gain),
          drawdown: num(a.drawdown),
          monthGain: sr.lastMonth ? sr.monthly[sr.lastMonth] : null,
          ytd: sr.ytd,
          liveSince: sr.points.length ? sr.points[0].d : sr.start,
          spark,
        });
      } catch (e) {
        console.warn("strategy", a.id, e.message);
      }
    }
    strategies.sort((x, y) => (x.id === accountId ? -1 : y.id === accountId ? 1 : x.liveSince.localeCompare(y.liveSince)));
    snapshot.strategies = strategies;

    await getStore("fxseb").setJSON(KEY, snapshot);
    return snapshot;
  } finally {
    try { await call("logout.json", { session }); } catch {}
  }
}

export async function readPerformance() {
  return getStore("fxseb").get(KEY, { type: "json" });
}
