"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { ConeCircle } from "@/components/map/CycloneMap";
import { fetchLiveMonitoring } from "@/lib/api";
import type { LiveMonitoringData, LiveTrackPoint } from "@/lib/live/types";
import type { TrackPoint, Storm } from "@/lib/types";
import { formatCoord } from "@/lib/formatters";
import MobileNav from "@/components/MobileNav";
import LandfallBanner from "@/components/dashboard/LandfallBanner";

const CycloneMapWrapper = dynamic(
  () => import("@/components/map/CycloneMapWrapper"),
  { ssr: false, loading: () => <div className="flex h-full w-full items-center justify-center bg-[#081018] text-sm text-slate-400">Loading map...</div> },
);

const SIDEBAR_ITEMS = [
  { href: "/", label: "Storms", icon: "◌" },
  { href: "/live", label: "Live", icon: "●" },
  { href: "/monitor", label: "Monitor", icon: "◎" },
  { href: "/chat", label: "AI", icon: "◇" },
];

const REFRESH_PRESETS = [60, 120, 300, 600];

function utcLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
  } catch { return "—"; }
}

function toTrackPoints(points: LiveTrackPoint[]): TrackPoint[] {
  return points.map((p) => ({ timestamp: p.timestamp, lat: p.lat, lon: p.lon, wind_kt: p.wind_kt ?? 0, pressure_hpa: p.pressure_hpa ?? 0, movement_direction: "", movement_speed: 0, category: p.category }));
}

function toForecastPoints(points: LiveMonitoringData["forecastTrack"]): TrackPoint[] {
  return points.map((p) => ({ timestamp: p.timestamp, lat: p.lat, lon: p.lon, wind_kt: p.wind_kt ?? 0, pressure_hpa: 0, movement_direction: "", movement_speed: 0, category: p.category, forecast: true }));
}

function toCone(circles: LiveMonitoringData["uncertaintyCone"] | undefined): ConeCircle[] {
  return (circles ?? []).map((c) => ({ timestamp: c.timestamp, lat: c.lat, lon: c.lon, radiusKm: c.radiusKm }));
}

function toStorm(data: LiveMonitoringData | null): Storm | null {
  if (!data?.active) return null;
  const wind = data.windSpeed ?? 0;
  return { id: "live", sid: "live", name: data.cycloneName ?? "Tropical Cyclone", lat: data.currentPosition?.lat ?? 0, lon: data.currentPosition?.lon ?? 0, wind_kt: wind, pressure_hpa: data.pressure ?? 0, movement_direction: data.movementDirection ?? "—", movement_speed: data.movementSpeed ?? 0, timestamp: data.lastCycloneUpdate ?? data.serverTime, basin: data.basin ?? undefined, category: data.intensity ?? undefined, status: "live", source: "NOAA live", maxWind: wind };
}

export default function LivePage() {
  return <Suspense fallback={null}><LiveContent /></Suspense>;
}

function LiveContent() {
  const searchParams = useSearchParams();
  const stormIdParam = searchParams.get("storm") ?? undefined;

  const [data, setData] = useState<LiveMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshMs, setRefreshMs] = useState(120 * 1000);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveCardOpen, setLiveCardOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const payload = await fetchLiveMonitoring({ stormId: stormIdParam, signal });
      if (!signal?.aborted) { setData(payload); setFetchError(null); setLastRefresh(new Date()); }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!signal?.aborted) setFetchError("Official cyclone data temporarily unavailable. Retrying automatically…");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [stormIdParam]);

  useEffect(() => {
    let ctrl: AbortController | null = null;
    const run = () => { ctrl?.abort(); ctrl = new AbortController(); void load(ctrl.signal); };
    run();
    const interval = setInterval(run, refreshMs);
    return () => { clearInterval(interval); ctrl?.abort(); };
  }, [load, refreshMs]);

  const storm = useMemo(() => toStorm(data), [data]);

  const handleFocusLiveStorm = () => {
    const el = document.getElementById("live-map-container");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: "linear-gradient(135deg,#eef0f8 0%,#f0f2f7 50%,#edf0f8 100%)" }}>
      {/* Funky bg blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle,#6366f1,transparent)" }} />
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle,#10b981,transparent)" }} />
      </div>

      <div className="relative flex min-h-screen flex-col gap-3 px-2 py-2 pb-28 lg:pb-2">
        {/* Header */}
        <header className="rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3" style={{ background: "#ffffff", borderColor: "#e4e8f0", boxShadow: "0 4px 20px rgba(99,102,241,0.1)" }}>
          {/* Top row: brand + mobile toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-lg shadow-lg" style={{ background: "linear-gradient(135deg,#6366f1,#10b981)" }}>
                ◉
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-white pulse-live" style={{ background: "#10b981" }} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "#6366f1" }}>Live Cyclone Monitoring</div>
                <div className="truncate text-xs sm:text-sm" style={{ color: "#5a6380" }}>Near-Real-Time · Indian Ocean · NASA GIBS</div>
              </div>
            </div>

            {/* Desktop: NRT + refresh pills */}
            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <span className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ background: "#ecfdf5", borderColor: "#6ee7b7", color: "#059669" }}>
                <span className="h-2 w-2 rounded-full pulse-live" style={{ background: "#10b981" }} />
                <span className="uppercase tracking-[0.2em]">NRT Live</span>
              </span>
              <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer" style={{ background: "#f4f6fb", borderColor: "#e4e8f0" }}>
                <span className="font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>Refresh</span>
                <select value={refreshMs / 1000} onChange={(e) => setRefreshMs(Number(e.target.value) * 1000)}
                  className="bg-transparent text-xs outline-none cursor-pointer" style={{ color: "#1a2035" }}>
                  {REFRESH_PRESETS.map((s) => <option key={s} value={s}>{s >= 60 ? `${s / 60}m` : `${s}s`}</option>)}
                </select>
              </label>
            </div>

            {/* Mobile: dropdown toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-lg transition lg:hidden"
              style={{ background: mobileOpen ? "#eef2ff" : "#f4f6fb", borderColor: mobileOpen ? "#c7d2fe" : "#e4e8f0", color: "#6366f1" }}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>

          {/* Desktop: metric cards */}
          <div className="hidden gap-2 pt-3 sm:grid sm:grid-cols-3 xl:grid-cols-5 lg:grid">
            {[
              { label: "System", val: data?.active ? data.cycloneName ?? "—" : "Monitoring", color: data?.active ? "#6366f1" : "#8b95b0" },
              { label: "Status", val: data?.active ? "🔴 Active" : "✅ Clear", color: data?.active ? "#f43f5e" : "#10b981" },
              { label: "Wind", val: data?.windSpeed != null ? `${Math.round(data.windSpeed)} kt` : "—", color: "#06b6d4" },
              { label: "Pressure", val: data?.pressure != null ? `${Math.round(data.pressure)} hPa` : "—", color: "#10b981" },
              { label: "Server Time", val: utcLabel(data?.serverTime), color: "#f59e0b" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0", borderLeft: `3px solid ${m.color}` }}>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>{m.label}</div>
                <div className="mt-1 truncate text-sm font-semibold" style={{ color: m.color }}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Mobile: dropdown panel */}
          {mobileOpen && (
            <div className="mt-2.5 space-y-2.5 pt-2.5 lg:hidden" style={{ borderTop: "1px solid #e4e8f0" }}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "System", val: data?.active ? data.cycloneName ?? "—" : "Monitoring", color: data?.active ? "#6366f1" : "#8b95b0" },
                  { label: "Status", val: data?.active ? "🔴 Active" : "✅ Clear", color: data?.active ? "#f43f5e" : "#10b981" },
                  { label: "Wind", val: data?.windSpeed != null ? `${Math.round(data.windSpeed)} kt` : "—", color: "#06b6d4" },
                  { label: "Pressure", val: data?.pressure != null ? `${Math.round(data.pressure)} hPa` : "—", color: "#10b981" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0", borderLeft: `3px solid ${m.color}` }}>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>{m.label}</div>
                    <div className="mt-1 truncate text-sm font-semibold" style={{ color: m.color }}>{m.val}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: "#f59e0b" }}>Server Time · {utcLabel(data?.serverTime)}</span>
                <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer" style={{ background: "#f4f6fb", borderColor: "#e4e8f0" }}>
                  <span className="font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>Refresh</span>
                  <select value={refreshMs / 1000} onChange={(e) => setRefreshMs(Number(e.target.value) * 1000)}
                    className="bg-transparent text-xs outline-none cursor-pointer" style={{ color: "#1a2035" }}>
                    {REFRESH_PRESETS.map((s) => <option key={s} value={s}>{s >= 60 ? `${s / 60}m` : `${s}s`}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}
        </header>

        {/* Coastal Landfall Warning Banner */}
        <LandfallBanner storm={storm} onFocusStorm={handleFocusLiveStorm} />

        {/* Body */}
        <div className="grid flex-1 gap-3 lg:grid-cols-[72px_minmax(0,1fr)_320px]">
          {/* Sidebar */}
          <aside className="hidden flex-col items-center gap-4 rounded-2xl border py-4 shadow-sm lg:flex" style={{ background: "#ffffff", borderColor: "#e4e8f0" }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>◉</div>
            <div className="h-px w-8" style={{ background: "#e4e8f0" }} />
            {SIDEBAR_ITEMS.map((item) => (
              <Link key={item.href} href={item.href}
                className="flex h-11 w-11 items-center justify-center rounded-xl border text-sm transition-all hover:scale-105"
                style={item.href === "/live" ? { background: "#eef2ff", borderColor: "#c7d2fe", color: "#6366f1" } : { background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}
                title={item.label}>{item.icon}</Link>
            ))}
            <div className="mt-auto flex flex-col items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "#10b981" }}>
              <div className="h-2 w-2 rounded-full pulse-live" style={{ background: "#10b981" }} />
              nrt
            </div>
          </aside>

          {/* Map */}
          <section id="live-map-container" className="relative min-h-[calc(100vh-180px)] overflow-hidden rounded-2xl border shadow-lg" style={{ borderColor: "#e4e8f0", background: "#081018" }}>
            {/* Satellite tile info bar */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-3 rounded-t-2xl px-4 py-2 text-xs" style={{ background: "rgba(6,182,212,0.15)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(6,182,212,0.3)" }}>
              <span className="font-bold uppercase tracking-wider" style={{ color: "#06b6d4" }}>🛰 Satellite / NASA GIBS</span>
              <span style={{ color: "#94a3b8" }}>·</span>
              <span style={{ color: "#94a3b8" }}>Esri Satellite · Auto-refresh {refreshMs / 1000}s</span>
              <span className="ml-auto flex items-center gap-1.5" style={{ color: "#10b981" }}>
                <span className="h-1.5 w-1.5 rounded-full pulse-live" style={{ background: "#10b981" }} />
                Last update: {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
              </span>
            </div>

            <div className="absolute inset-0 pt-8">
              {loading && !data ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl border px-8 py-6 text-center backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }}>
                    <div className="text-2xl mb-3">🛰</div>
                    <div className="text-sm text-white/80 font-medium">Connecting to satellite feed…</div>
                    <div className="mt-2 text-xs text-white/40">Fetching NASA GIBS imagery & official cyclone data</div>
                    <div className="mt-4 h-1 w-40 rounded-full overflow-hidden mx-auto" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <div className="h-full rounded-full animate-pulse" style={{ background: "linear-gradient(90deg,#6366f1,#10b981)", width: "60%" }} />
                    </div>
                  </div>
                </div>
              ) : (
                <CycloneMapWrapper className="h-full min-h-[calc(100vh-180px)] rounded-none border-0 bg-transparent shadow-none" storm={storm} track={toTrackPoints(data?.historicalTrack ?? [])} forecastTrack={toForecastPoints(data?.forecastTrack ?? [])} cone={toCone(data?.uncertaintyCone)} storms={storm ? [storm] : []} hideOverlays basemap="satellite" />
              )}
            </div>

            <div className="pointer-events-none absolute inset-0 pt-8" style={{ background: "linear-gradient(180deg,rgba(2,6,23,0.05) 0%,rgba(2,6,23,0.2) 100%)" }} />

            {/* No cyclone state */}
            {data && !data.active && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pt-8">
                <div className="max-w-sm rounded-2xl border p-6 text-center backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.92)", borderColor: "#e4e8f0" }}>
                  <div className="text-4xl mb-3">🌤</div>
                  <div className="text-lg font-bold" style={{ color: "#1a2035" }}>No active cyclone detected</div>
                  <div className="mt-2 text-sm" style={{ color: "#5a6380" }}>
                    NASA GIBS satellite monitoring is active.<br />Map will update automatically when a system is detected.
                  </div>
                  <div className="mt-4 rounded-xl border px-4 py-2 text-sm font-medium" style={{ background: "#ecfdf5", borderColor: "#6ee7b7", color: "#059669" }}>
                    ✅ Satellite feed nominal
                  </div>
                </div>
              </div>
            )}

            {/* Cyclone info card (collapsible) */}
            {data?.active && storm && (
              <div className="absolute left-2 top-12 z-20 sm:left-3">
                {!liveCardOpen ? (
                  <button
                    type="button"
                    onClick={() => setLiveCardOpen(true)}
                    className="flex items-center gap-2 rounded-full border px-3 py-2 backdrop-blur-xl transition hover:opacity-90"
                    style={{ background: "rgba(255,255,255,0.93)", borderColor: "#e4e8f0", boxShadow: "0 4px 16px rgba(99,102,241,0.18)" }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: "#f43f5e" }} />
                    <span className="max-w-[160px] truncate text-sm font-bold" style={{ color: "#1a2035" }}>{data.cycloneName ?? "Tropical Cyclone"}</span>
                    <span className="text-xs text-slate-400">▾</span>
                  </button>
                ) : (
                  <div className="max-w-xs rounded-2xl border p-4 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.94)", borderColor: "#e4e8f0", boxShadow: "0 8px 32px rgba(99,102,241,0.15)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.35em]" style={{ color: "#6366f1" }}>Current Cyclone</div>
                      <button type="button" onClick={() => setLiveCardOpen(false)} aria-label="Collapse" className="flex h-6 w-6 items-center justify-center rounded-full border bg-white text-sm" style={{ borderColor: "#e4e8f0", color: "#5a6380" }}>✕</button>
                    </div>
                    <h1 className="mt-1 text-xl font-bold" style={{ color: "#1a2035" }}>{data.cycloneName ?? "Tropical Cyclone"}</h1>
                    <p className="mt-1 text-xs" style={{ color: "#5a6380" }}>
                      {data.basin ?? "Indian Ocean"} · {data.intensity ?? "—"} · {data.currentPosition ? formatCoord(data.currentPosition.lat, data.currentPosition.lon) : "—"}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        { label: "Wind", val: data.windSpeed != null ? `${Math.round(data.windSpeed)} kt` : "—", color: "#06b6d4" },
                        { label: "Pressure", val: data.pressure != null ? `${Math.round(data.pressure)} hPa` : "—", color: "#6366f1" },
                        { label: "Motion", val: data.movementDirection ?? "—", color: "#10b981" },
                        { label: "Speed", val: data.movementSpeed != null ? `${Math.round(data.movementSpeed)} kt` : "—", color: "#f59e0b" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                          <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#8b95b0" }}>{s.label}</div>
                          <div className="mt-0.5 text-sm font-bold" style={{ color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t pt-2 text-[10px]" style={{ borderColor: "#e4e8f0", color: "#8b95b0" }}>
                      Last update: {utcLabel(data.lastCycloneUpdate)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div className="absolute right-3 top-12 z-20 hidden rounded-2xl border px-3 py-2.5 text-[11px] backdrop-blur-xl sm:block" style={{ background: "rgba(255,255,255,0.93)", borderColor: "#e4e8f0" }}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "#8b95b0" }}>Legend</div>
              <div className="space-y-1.5" style={{ color: "#5a6380" }}>
                {(data?.historicalTrack?.length ?? 0) > 0 && <div className="flex items-center gap-2"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "#f59e0b" }} /><span>Historical track</span></div>}
                <div className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-full ring-2 ring-white shadow" style={{ background: "#f43f5e" }} /><span>Current position</span></div>
                {(data?.forecastTrack?.length ?? 0) > 0 && <div className="flex items-center gap-2"><span className="inline-block h-0.5 w-4" style={{ background: "repeating-linear-gradient(90deg,#6366f1 0 4px,transparent 4px 8px)" }} /><span>Official forecast</span></div>}
                {(data?.uncertaintyCone?.length ?? 0) > 0 && <div className="flex items-center gap-2"><span className="inline-block h-3 w-4 rounded border border-dashed" style={{ borderColor: "#6366f1", background: "rgba(99,102,241,0.15)" }} /><span>Uncertainty cone</span></div>}
              </div>
            </div>

            {/* Coords */}
            <div className="absolute bottom-3 right-3 z-20 rounded-2xl border px-3 py-2 text-[11px] tabular-nums backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.93)", borderColor: "#e4e8f0", color: "#5a6380" }}>
              {storm ? formatCoord(storm.lat, storm.lon) : "Monitoring active"}
            </div>

            {/* Error */}
            {(fetchError || data?.error.cyclone) && (
              <div className="absolute left-1/2 top-12 z-30 w-[min(92%,420px)] -translate-x-1/2 rounded-2xl border px-4 py-2 text-center text-xs backdrop-blur-xl" style={{ background: "rgba(254,226,226,0.95)", borderColor: "#fca5a5", color: "#dc2626" }}>
                {fetchError ?? data?.error.cyclone}
                {loading && <span className="ml-1 opacity-70"> Retrying…</span>}
              </div>
            )}
          </section>

          {/* Right panel */}
          <aside className="hidden flex-col gap-3 lg:flex">
            {/* Cyclone info */}
            <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#ffffff", borderColor: "#e4e8f0" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full" style={{ background: "linear-gradient(180deg,#6366f1,#8b5cf6)" }} />
                <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#8b95b0" }}>Cyclone Information</div>
              </div>
              {data?.active ? (
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Name", val: data.cycloneName ?? "—" },
                    { label: "Status", val: data.status ?? "—" },
                    { label: "Basin", val: data.basin ?? "—" },
                    { label: "Position", val: data.currentPosition ? formatCoord(data.currentPosition.lat, data.currentPosition.lon) : "—" },
                    { label: "Wind", val: data.windSpeed != null ? `${Math.round(data.windSpeed)} kt` : "—" },
                    { label: "Pressure", val: data.pressure != null ? `${Math.round(data.pressure)} hPa` : "—" },
                    { label: "Intensity", val: data.intensity ?? "—" },
                    { label: "Updated", val: utcLabel(data.lastCycloneUpdate) },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#8b95b0" }}>{r.label}</span>
                      <span className="font-medium text-right" style={{ color: "#1a2035" }}>{r.val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border px-4 py-6 text-center" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                  <div className="text-2xl mb-2">🌤</div>
                  <div className="text-sm" style={{ color: "#5a6380" }}>
                    {data?.active === false ? "No active cyclone. Satellite monitoring active." : "Waiting for official cyclone data…"}
                  </div>
                </div>
              )}
            </div>

            {/* Data Sources */}
            <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#ffffff", borderColor: "#e4e8f0" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full" style={{ background: "linear-gradient(180deg,#06b6d4,#6366f1)" }} />
                <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#8b95b0" }}>Data Sources</div>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { label: "Satellite tiles", val: "NASA GIBS / MODIS / Esri" },
                  { label: "Cyclone data", val: data?.forecastSource ?? "NOAA NHC" },
                  { label: "Map layer", val: "Esri Satellite" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#8b95b0" }}>{r.label}</span>
                    <span className="font-medium" style={{ color: "#6366f1" }}>{r.val}</span>
                  </div>
                ))}
                <div className="rounded-xl border px-3 py-2" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                  <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "#059669" }}>Feed Status</div>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: loading ? "#f59e0b" : "#059669" }}>
                    <span className="h-2 w-2 rounded-full pulse-live" style={{ background: loading ? "#f59e0b" : "#10b981" }} />
                    {loading ? "Updating…" : "Live — Nominal"}
                  </div>
                </div>
                <div className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                  <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "#8b95b0" }}>Last Satellite</div>
                  <div className="text-sm font-medium" style={{ color: "#1a2035" }}>{utcLabel(data?.satellite.lastUpdate)}</div>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", borderColor: "#e4e8f0" }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: "#6366f1" }}>🛰 About This Feed</div>
              <div className="text-xs leading-relaxed" style={{ color: "#5a6380" }}>
                Free satellite imagery served via <strong>NASA GIBS</strong> (Global Imagery Browse Services) MODIS true-colour, or high-resolution <strong>Esri World Imagery</strong>. All tiles are free and need no API key. Official cyclone advisories from <strong>NOAA NHC / RSMC New Delhi</strong>.
              </div>
            </div>
          </aside>
        </div>

        <MobileNav items={SIDEBAR_ITEMS} />
      </div>
    </div>
  );
}