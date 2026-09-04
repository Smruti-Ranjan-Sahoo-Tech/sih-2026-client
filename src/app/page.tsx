"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CycloneMapWrapper from "@/components/map/CycloneMapWrapper";
import type { BasemapKind } from "@/components/map/CycloneMap";
import { fetchStorm } from "@/lib/api";
import { categoryLabel, formatCoord, formatDateTime, formatPressure, formatWind, trendArrow, windToKmh } from "@/lib/formatters";
import { getCategoryColor, type Storm, type TrackPoint, type Observation, windToCategory } from "@/lib/types";
import { useCycloneStore } from "@/stores/cycloneStore";
import { usePredictionStore } from "@/stores/predictionStore";
import MobileNav from "@/components/MobileNav";
import LandfallBanner from "@/components/dashboard/LandfallBanner";

const SIDEBAR_ITEMS = [
  { href: "/monitor", label: "Monitor", icon: "◎" },
  { href: "/live", label: "Live", icon: "●" },
  { href: "/chat", label: "AI", icon: "◇" },
  { href: "/", label: "Storms", icon: "◌" },
];

function toTrackPoints(track: TrackPoint[], observations: Observation[]): TrackPoint[] {
  if (track.length > 0) return track;
  return observations.map((o) => ({
    timestamp: o.timestamp, lat: o.lat, lon: o.lon, wind_kt: o.wind_kt,
    pressure_hpa: o.pressure_hpa, movement_direction: o.movement_direction,
    movement_speed: o.movement_speed, source: o.source,
    category: o.nature ?? o.satellite_hint,
  }));
}

function trendLabel(value?: string | null): string {
  if (!value) return "Steady";
  if (value === "rapid_intensification") return "Strengthening";
  if (value === "increasing") return "Strengthening";
  if (value === "decreasing") return "Weakening";
  return value.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function utcNowLabel(): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "UTC",
  }).format(new Date())} UTC`;
}

function timelineLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "2-digit", hour: "2-digit",
    minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(new Date(iso));
}

function getStormCategory(storm: Storm | null): string {
  if (!storm) return "LOW";
  return storm.category ?? windToCategory(storm.wind_kt ?? storm.maxWind ?? 0);
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [activeLayer, setActiveLayer] = useState<BasemapKind>("satellite");
  const [liveMode, setLiveMode] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [forecastTrack, setForecastTrack] = useState<TrackPoint[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mapCardOpen, setMapCardOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const [stormTab, setStormTab] = useState<"live" | "historical">("live");

  useEffect(() => { setMounted(true); }, []);

  const { activeStorm, stormList, track, observations, isLoading, error, setActiveStorm, fetchStorms, fetchTrack, fetchObservations } = useCycloneStore();
  const { trend, prediction, fetchTrend, fetchPrediction } = usePredictionStore();

  const liveStorms = useMemo(
    () => stormList.filter((s) => s.status !== "historical"),
    [stormList],
  );
  const historicalStorms = useMemo(
    () => stormList.filter((s) => s.status === "historical"),
    [stormList],
  );

  const handleFocusStorm = (s: Storm) => {
    setActiveStorm(s);
    const el = document.getElementById("cyclone-map-container");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => { fetchStorms(); }, [fetchStorms]);

  useEffect(() => {
    const stormId = searchParams.get("storm");
    if (!stormId) return;
    const selected = stormList.find((s) => s.id === stormId);
    if (selected && selected.id !== activeStorm?.id) setActiveStorm(selected);
  }, [activeStorm?.id, searchParams, setActiveStorm, stormList]);

  useEffect(() => {
    if (!activeStorm) return;
    fetchTrack(activeStorm.id);
    fetchObservations(activeStorm.id);
    fetchTrend(activeStorm.id);
    fetchPrediction(activeStorm.id);
    fetchStorm(activeStorm.id).then((d) => setForecastTrack(d.forecast_track ?? [])).catch(() => setForecastTrack([]));
  }, [activeStorm, fetchObservations, fetchPrediction, fetchTrack, fetchTrend]);

  const timeline = useMemo(() => toTrackPoints(track, observations), [observations, track]);
  const latestPoint = timeline[timeline.length - 1] ?? null;
  const category = getStormCategory(activeStorm);
  const categoryColor = getCategoryColor(category);
  const stormWind = latestPoint?.wind_kt ?? activeStorm?.wind_kt ?? activeStorm?.maxWind ?? 0;
  const stormPressure = latestPoint?.pressure_hpa ?? activeStorm?.pressure_hpa ?? 0;
  const stormHeading = activeStorm?.movement_direction ?? latestPoint?.movement_direction ?? "—";
  const stormHeadingSpeed = activeStorm?.movement_speed ?? latestPoint?.movement_speed ?? 0;
  const trendStatus = trendLabel(trend?.windTrend);
  const predictionStatus = prediction ? `${prediction.currentStage} → ${prediction.predictedNextStage}` : "Model warming up";
  const timelineSlices = timeline.slice(-9);

  const topMetrics = [
    { label: "Storm", value: activeStorm?.name ?? "Waiting for feed", color: "#6366f1" },
    { label: "Category", value: categoryLabel(category), color: "#f43f5e" },
    { label: "MSW", value: `${formatWind(stormWind)} (${windToKmh(stormWind)} km/h)`, color: "#06b6d4" },
    { label: "Heading", value: `${stormHeading} (${Math.round(stormHeadingSpeed)} kt)`, color: "#10b981" },
    { label: "Trend", value: `${trendArrow(trend?.windTrend ?? "steady")} ${trendStatus}`, color: trend?.windTrend === "decreasing" ? "#06b6d4" : "#f59e0b" },
  ];

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: "linear-gradient(135deg, #eef0f8 0%, #f0f2f7 50%, #edf0f8 100%)" }}>
      {/* Funky background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />
        <div className="absolute -top-20 right-0 h-80 w-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }} />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #10b981, transparent)" }} />
      </div>

      <div className="relative flex min-h-screen flex-col gap-3 px-2 py-2 pb-28 lg:pb-2">
        {/* Header */}
        <header className="rounded-2xl border px-3 py-2.5 shadow-lg sm:px-4 sm:py-3" style={{ background: "#ffffff", borderColor: "#e4e8f0", boxShadow: "0 4px 20px rgba(99,102,241,0.1)" }}>
          {/* Top row: brand + mobile toggle */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-lg shadow-lg" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                ◉
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#6366f1" }}>
                  StormSense AI
                </div>
                <div className="truncate text-xs sm:text-sm" style={{ color: "#5a6380" }}>
                  North Indian Ocean cyclone operations
                </div>
              </div>
            </div>

            {/* Desktop: controls */}
            <div className="hidden shrink-0 flex-wrap items-center gap-2 text-xs lg:flex">
              <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 cursor-pointer" style={{ background: "#f4f6fb", borderColor: "#e4e8f0" }}>
                <span className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>Storm</span>
                <select
                  value={activeStorm?.id ?? ""}
                  onChange={(e) => { const n = stormList.find((s) => s.id === e.target.value); if (n) handleFocusStorm(n); }}
                  className="max-w-[160px] cursor-pointer bg-transparent text-xs font-semibold outline-none"
                  style={{ color: "#1a2035" }}
                >
                  {liveStorms.length > 0 && (
                    <optgroup label="🔴 Live Cyclones">
                      {liveStorms.map((s) => (
                        <option key={s.id} value={s.id}>
                          🔴 {s.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {historicalStorms.length > 0 && (
                    <optgroup label="📁 Historical Archive">
                      {historicalStorms.map((s) => (
                        <option key={s.id} value={s.id}>
                          📁 {s.name} ({s.season ?? "Archive"})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setLiveMode((v) => !v)}
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all"
                style={liveMode ? { background: "#ecfdf5", borderColor: "#6ee7b7", color: "#059669" } : { background: "#f4f6fb", borderColor: "#e4e8f0", color: "#8b95b0" }}
                title="Toggle live map footage"
              >
                <span className="h-2 w-2 rounded-full pulse-live" style={{ background: liveMode ? "#10b981" : "#c4c9dc" }} />
                <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Live {liveMode ? "ON" : "OFF"}</span>
              </button>

              <div className="rounded-full border px-3 py-1.5 text-[10px] font-medium" style={{ background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}>
                {mounted ? utcNowLabel() : "—"}
              </div>
              <div className="rounded-full border px-3 py-1.5 text-[10px] font-medium max-w-[200px] truncate" style={{ background: "#fef9f0", borderColor: "#fed7aa", color: "#92400e" }}>
                {predictionStatus}
              </div>
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

          {/* Desktop: metrics */}
          <div className="hidden gap-2 pt-3 sm:grid sm:grid-cols-3 xl:grid-cols-5 lg:grid">
            {topMetrics.map((m) => (
              <div key={m.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0", borderLeft: `3px solid ${m.color}` }}>
                <div className="text-[10px] font-medium uppercase tracking-[0.25em]" style={{ color: "#8b95b0" }}>{m.label}</div>
                <div className="mt-1 truncate text-sm font-semibold" style={{ color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Mobile: dropdown panel */}
          {mobileOpen && (
            <div className="mt-2.5 space-y-3 pt-2.5 lg:hidden" style={{ borderTop: "1px solid #e4e8f0" }}>
              <div className="grid grid-cols-2 gap-2">
                {topMetrics.map((m) => (
                  <div key={m.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0", borderLeft: `3px solid ${m.color}` }}>
                    <div className="text-[10px] font-medium uppercase tracking-[0.25em]" style={{ color: "#8b95b0" }}>{m.label}</div>
                    <div className="mt-1 truncate text-sm font-semibold" style={{ color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 cursor-pointer" style={{ background: "#f4f6fb", borderColor: "#e4e8f0" }}>
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>Storm</span>
                  <select
                    value={activeStorm?.id ?? ""}
                    onChange={(e) => { const n = stormList.find((s) => s.id === e.target.value); if (n) setActiveStorm(n); }}
                    className="max-w-[140px] cursor-pointer bg-transparent text-xs outline-none"
                    style={{ color: "#1a2035" }}
                  >
                    <option value="" disabled>{stormList.length} active</option>
                    {stormList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setLiveMode((v) => !v)}
                  className="flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all"
                  style={liveMode ? { background: "#ecfdf5", borderColor: "#6ee7b7", color: "#059669" } : { background: "#f4f6fb", borderColor: "#e4e8f0", color: "#8b95b0" }}
                >
                  <span className="h-2 w-2 rounded-full pulse-live" style={{ background: liveMode ? "#10b981" : "#c4c9dc" }} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Live {liveMode ? "ON" : "OFF"}</span>
                </button>
                <div className="rounded-full border px-3 py-1.5 text-[10px] font-medium" style={{ background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}>
                  {mounted ? utcNowLabel() : "—"}
                </div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-[10px] font-medium" style={{ background: "#fef9f0", borderColor: "#fed7aa", color: "#92400e" }}>
                {predictionStatus}
              </div>
            </div>
          )}
        </header>

        {/* Coastal Landfall Warning Banner */}
        <LandfallBanner storm={activeStorm} onFocusStorm={(s) => setActiveStorm(s)} />

        {/* Body */}
        <div className="grid flex-1 gap-3 lg:grid-cols-[72px_minmax(0,1fr)_276px]">

          {/* Sidebar */}
          <aside className="hidden flex-col items-center gap-4 rounded-2xl border py-4 shadow-sm lg:flex" style={{ background: "#ffffff", borderColor: "#e4e8f0" }}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-base shadow" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>◉</div>
            <div className="h-px w-8" style={{ background: "#e4e8f0" }} />
            {SIDEBAR_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex h-11 w-11 items-center justify-center rounded-xl border text-sm transition-all hover:scale-105"
                style={{ background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}
                title={item.label}
              >
                <span className="transition group-hover:scale-110">{item.icon}</span>
              </Link>
            ))}
            <div className="mt-auto flex flex-col items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color: "#10b981" }}>
              <div className="h-2 w-2 rounded-full pulse-live" style={{ background: "#10b981" }} />
              live
            </div>
          </aside>

          {/* Map */}
          <section id="cyclone-map-container" className="relative min-h-[calc(100vh-180px)] overflow-hidden rounded-2xl border shadow-lg" style={{ borderColor: "#e4e8f0", background: "#081018" }}>
            <div className="absolute inset-0">
              {activeStorm ? (
                <CycloneMapWrapper
                  className="h-full min-h-[calc(100vh-180px)] rounded-none border-0 bg-transparent shadow-none"
                  storm={activeStorm} track={timeline} forecastTrack={forecastTrack}
                  storms={stormList} hideOverlays basemap={activeLayer}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl border px-6 py-5 text-center backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" }}>
                    <div className="text-sm text-white/70">Loading cyclone feed...</div>
                    <div className="mt-2 text-xs text-white/40">Building the storm console</div>
                  </div>
                </div>
              )}
            </div>

            {/* Overlay gradient */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(2,6,23,0.05) 0%, rgba(2,6,23,0.25) 100%)" }} />

            {/* Storm info card (collapsible) */}
            <div className="absolute left-2 top-2 z-20 sm:left-4 sm:top-4">
              {!mapCardOpen ? (
                <button
                  type="button"
                  onClick={() => setMapCardOpen(true)}
                  className="flex items-center gap-2 rounded-full border px-3 py-2 backdrop-blur-xl transition hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.92)", borderColor: "#e4e8f0", boxShadow: "0 4px 16px rgba(99,102,241,0.18)" }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: categoryColor }} />
                  <span className="max-w-[180px] truncate text-sm font-bold" style={{ color: "#1a2035" }}>{activeStorm?.name ?? "Storm feed"}</span>
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${categoryColor}14`, borderColor: `${categoryColor}44`, color: categoryColor }}>
                    {category}
                  </span>
                  <span className="text-xs text-slate-400">▾</span>
                </button>
              ) : (
                <div className="max-w-xs rounded-2xl border p-4 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.94)", borderColor: "#e4e8f0", boxShadow: "0 8px 32px rgba(99,102,241,0.15)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.35em]" style={{ color: "#6366f1" }}>Live Cyclone View</div>
                    <button type="button" onClick={() => setMapCardOpen(false)} aria-label="Collapse" className="flex h-6 w-6 items-center justify-center rounded-full border text-sm bg-white" style={{ borderColor: "#e4e8f0", color: "#5a6380" }}>✕</button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <h1 className="text-xl font-bold" style={{ color: "#1a2035" }}>{activeStorm?.name ?? "Storm feed"}</h1>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `${categoryColor}18`, borderColor: `${categoryColor}44`, color: categoryColor }}>
                      {category}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "#5a6380" }}>
                    {activeStorm ? `${activeStorm.subbasin ?? activeStorm.basin ?? "North Indian Ocean"} · ${formatCoord(activeStorm.lat, activeStorm.lon)} · ${formatDateTime(activeStorm.timestamp)}` : "Waiting for the first storm record."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat label="Wind" value={formatWind(stormWind)} />
                    <MiniStat label="Pressure" value={formatPressure(stormPressure)} />
                    <MiniStat label="Motion" value={stormHeading} />
                    <MiniStat label="Fix" value={latestPoint ? formatCoord(latestPoint.lat, latestPoint.lon) : "—"} />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom timeline bar (collapsible) */}
            <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-4 sm:bottom-3">
              {!timelineOpen ? (
                <button
                  type="button"
                  onClick={() => setTimelineOpen(true)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-xl transition hover:opacity-90"
                  style={{ background: "rgba(255,255,255,0.92)", borderColor: "#e4e8f0", boxShadow: "0 8px 32px rgba(99,102,241,0.15)" }}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: "#6366f1" }}>
                    <span>{isPlaying ? "❚❚" : "▶"}</span>
                    {isPlaying ? "Pause" : "Play"}
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium" style={{ color: "#5a6380" }}>
                    {latestPoint ? formatDateTime(latestPoint.timestamp) : (mounted ? utcNowLabel() : "—")}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ background: "#fff1f2", borderColor: "#fecdd3", color: "#f43f5e" }}>NOW</span>
                    <span className="text-xs font-semibold" style={{ color: "#059669" }}>{formatWind(stormWind)}</span>
                    <span className="text-xs text-slate-400">▴</span>
                  </span>
                </button>
              ) : (
                <div className="rounded-2xl border px-4 py-3 backdrop-blur-xl" style={{ background: "rgba(255,255,255,0.94)", borderColor: "#e4e8f0", boxShadow: "0 8px 32px rgba(99,102,241,0.15)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setIsPlaying((v) => !v)}
                        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                        <span>{isPlaying ? "❚❚" : "▶"}</span>
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <button type="button" onClick={() => setActiveLayer("satellite")}
                        className="rounded-full border px-4 py-2 text-sm font-medium transition hover:opacity-80"
                        style={{ background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}>
                        1x
                      </button>
                      <div className="rounded-full border px-4 py-2 text-sm" style={{ background: "#f4f6fb", borderColor: "#e4e8f0", color: "#5a6380" }}>
                        {latestPoint ? formatDateTime(latestPoint.timestamp) : (mounted ? utcNowLabel() : "—")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ background: "#fff1f2", borderColor: "#fecdd3", color: "#f43f5e" }}>NOW (06Z)</span>
                      <span className="rounded-full border px-4 py-2 text-sm" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#059669" }}>
                        {formatWind(stormWind)} ({windToKmh(stormWind)} km/h)
                      </span>
                      <button type="button" onClick={() => setTimelineOpen(false)} aria-label="Collapse" className="flex h-8 w-8 items-center justify-center rounded-full border bg-white text-sm" style={{ borderColor: "#e4e8f0", color: "#5a6380" }}>✕</button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 rounded-full" style={{ background: "#e4e8f0" }}>
                    <div className="h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6, #f59e0b)", width: `${Math.max(18, timelineSlices.length ? (timelineSlices.length / 9) * 100 : 18)}%` }} />
                  </div>

                  {/* Timeline dots */}
                  <div className="mt-3 flex items-center justify-between gap-3 overflow-x-auto pb-1">
                    {timelineSlices.map((point, index) => {
                      const selected = index === timelineSlices.length - 1;
                      const color = getCategoryColor(point.category ?? windToCategory(point.wind_kt));
                      return (
                        <div key={`${point.timestamp}-${index}`} className="flex min-w-[64px] flex-col items-center gap-1.5 text-[11px]" style={{ color: "#8b95b0" }}>
                          <span className={`h-3 w-3 rounded-full border-2 border-white shadow-sm ${selected ? "ring-4 ring-indigo-300/40" : ""}`} style={{ background: color }} />
                          <span>{timelineLabel(point.timestamp)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right panel */}
          <aside className="hidden flex-col gap-3 lg:flex">
            {/* Storm systems list with live vs historical separation */}
            <div className="flex max-h-[52vh] flex-col rounded-2xl border p-3 shadow-sm bg-white" style={{ borderColor: "#e4e8f0" }}>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#8b95b0" }}>Storm Tracker</div>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 border border-indigo-100">
                  {stormList.length} Total
                </span>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-2">
                <button
                  type="button"
                  onClick={() => setStormTab("live")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                    stormTab === "live"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-live" />
                  Live ({liveStorms.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStormTab("historical")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                    stormTab === "historical"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📁 Archive ({historicalStorms.length})
                </button>
              </div>

              {/* Storm list content */}
              <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "38vh" }}>
                {stormTab === "live" ? (
                  liveStorms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4 text-center">
                      <div className="text-xl mb-1">🌤</div>
                      <div className="text-xs font-bold text-emerald-900">No Active Live Cyclones</div>
                      <div className="mt-1 text-[11px] text-emerald-700">
                        IMD & NASA GIBS feeds are nominal.
                      </div>
                      <button
                        type="button"
                        onClick={() => setStormTab("historical")}
                        className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        Explore Historical Archive →
                      </button>
                    </div>
                  ) : (
                    liveStorms.map((s) => {
                      const sel = activeStorm?.id === s.id;
                      const scat = s.category ?? windToCategory(s.wind_kt ?? s.maxWind ?? 0);
                      const scur = getCategoryColor(scat);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleFocusStorm(s)}
                          className={`group w-full rounded-xl border p-2.5 text-left transition-all ${
                            sel
                              ? "border-emerald-500 bg-emerald-50/40 shadow-md shadow-emerald-500/10"
                              : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 pulse-live" />
                              {s.name}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm"
                              style={{ backgroundColor: scur }}
                            >
                              {scat.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-xs text-slate-600">
                            <span>💨 {Math.round(s.wind_kt ?? s.maxWind ?? 0)} kt ({windToKmh(s.wind_kt ?? s.maxWind ?? 0)} km/h)</span>
                            <span className="font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                              Focus 📍
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )
                ) : (
                  historicalStorms.map((s) => {
                    const sel = activeStorm?.id === s.id;
                    const scat = s.category ?? windToCategory(s.wind_kt ?? s.maxWind ?? 0);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleFocusStorm(s)}
                        className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                          sel
                            ? "border-indigo-400 bg-indigo-50/40 shadow-sm"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {s.name}
                          </span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-700">
                            {s.season ?? "Archive"}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>{scat.replace(/_/g, " ")} · {Math.round(s.wind_kt ?? s.maxWind ?? 0)} kt</span>
                          <span className="text-indigo-600">View Track 📍</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Situation */}
            <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#ffffff", borderColor: "#e4e8f0" }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#8b95b0" }}>Situation</div>
              <div className="mt-3 space-y-2">
                {[
                  { label: "Latest fix", val: latestPoint ? formatCoord(latestPoint.lat, latestPoint.lon) : "No coordinates yet" },
                  { label: "Forecast", val: forecastTrack.length > 0 ? `${forecastTrack.length} points ready` : "Pending" },
                  { label: "Signal", val: prediction?.probabilities ? `${Object.keys(prediction.probabilities).length} paths` : "Initializing" },
                ].map((r) => (
                  <div key={r.label} className="rounded-xl border px-3 py-2" style={{ background: "#f8f9ff", borderColor: "#e4e8f0" }}>
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>{r.label}</div>
                    <div className="mt-1 text-sm font-medium" style={{ color: "#1a2035" }}>{r.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feed */}
            <div className="rounded-2xl border p-4 shadow-sm text-sm" style={{ background: "#ffffff", borderColor: "#e4e8f0", color: "#5a6380" }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#8b95b0" }}>Feed</div>
              <div className="mt-3 space-y-1.5">
                <div>{activeStorm?.status ?? "Operational storm tracking"}</div>
                <div>{prediction?.timeframe ?? "Next update incoming"}</div>
                <div style={{ color: error ? "#f43f5e" : "#5a6380" }}>{error ?? "No errors reported"}</div>
                <div className="font-medium" style={{ color: "#6366f1" }}>{isLoading ? "Refreshing…" : `${stormList.length} active systems`}</div>
              </div>
            </div>
          </aside>
        </div>

        <MobileNav items={SIDEBAR_ITEMS} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ background: "#f4f6fb", borderColor: "#e4e8f0" }}>
      <div className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: "#8b95b0" }}>{label}</div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: "#1a2035" }}>{value}</div>
    </div>
  );
}
