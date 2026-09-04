"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCycloneStore } from "@/stores/cycloneStore";
import { useSatelliteStore } from "@/stores/satelliteStore";
import { usePredictionStore } from "@/stores/predictionStore";
import { fetchStorm } from "@/lib/api";
import CycloneMapWrapper from "@/components/map/CycloneMapWrapper";
import ImageGrid from "@/components/satellite/ImageGrid";
import AnalysisResult from "@/components/satellite/AnalysisResult";
import ForecastPanel from "@/components/dashboard/ForecastPanel";
import type { Storm, TrackPoint } from "@/lib/types";
import { windToCategory, getCategoryColor } from "@/lib/types";
import { formatDateTime, formatWind } from "@/lib/formatters";

const CATEGORY_ORDER = [
  "SUPER_CYCLONE",
  "VERY_SEVERE_CYCLONE",
  "SEVERE_CYCLONE",
  "CYCLONE",
  "DEEP_DEPRESSION",
  "DEPRESSION",
  "LOW",
] as const;

function categoryKey(category: string | undefined, wind: number): string {
  const cat =
    category ??
    windToCategory(wind) ??
    windToCategory(0);
  return cat;
}

export default function MonitorPage() {
  const {
    activeStorm,
    track,
    stormList,
    fetchStorms,
    fetchTrack,
    fetchObservations,
    setActiveStorm,
  } = useCycloneStore();
  const {
    images,
    analysis,
    isLoading: satLoading,
    fetchImages,
    fetchAnalysis,
  } = useSatelliteStore();
  const { trend, prediction, fetchTrend, fetchPrediction } = usePredictionStore();
  const [forecastTrack, setForecastTrack] = useState<TrackPoint[]>([]);

  useEffect(() => {
    fetchStorms();
  }, [fetchStorms]);

  useEffect(() => {
    const stormId = new URLSearchParams(window.location.search).get("storm");
    if (!stormId || stormList.length === 0) return;
    const selected = stormList.find((storm) => storm.id === stormId);
    if (selected) setActiveStorm(selected);
  }, [setActiveStorm, stormList]);

  useEffect(() => {
    if (!activeStorm) return;
    fetchTrack(activeStorm.id);
    fetchObservations(activeStorm.id);
    fetchImages(activeStorm.id);
    fetchAnalysis(activeStorm.id);
    fetchTrend(activeStorm.id);
    fetchPrediction(activeStorm.id);

    fetchStorm(activeStorm.id)
      .then((storm) => setForecastTrack(storm.forecast_track ?? []))
      .catch(() => setForecastTrack([]));
  }, [
    activeStorm,
    fetchAnalysis,
    fetchImages,
    fetchObservations,
    fetchPrediction,
    fetchTrack,
    fetchTrend,
  ]);

  const liveStorms = useMemo(
    () => stormList.filter((s) => s.status !== "historical"),
    [stormList],
  );
  const historicalStorms = useMemo(
    () => stormList.filter((s) => s.status === "historical"),
    [stormList],
  );

  const groups = useMemo(() => {
    const byCat = new Map<string, Storm[]>();
    for (const s of stormList) {
      const key = categoryKey(s.category, s.wind_kt ?? s.maxWind ?? 0);
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(s);
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      category: c,
      storms: byCat.get(c)!,
    }));
  }, [stormList]);

  const handleSelectStorm = (id: string) => {
    const storm = stormList.find((s) => s.id === id);
    if (storm) setActiveStorm(storm);
  };

  const maxWind = useMemo(
    () => Math.max(0, ...stormList.map((s) => s.wind_kt ?? s.maxWind ?? 0)),
    [stormList],
  );
  const activeCount = liveStorms.length;
  const stormCount = stormList.length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xl hover:opacity-80">
              🌀
            </Link>
            <Link href="/" className="font-bold text-slate-900 hover:opacity-80">
              StormSense
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/monitor" className="text-sm font-medium text-orange-600">
              Monitor
            </Link>
            <Link
              href="/chat"
              className="text-sm text-slate-500 transition-colors hover:text-slate-900"
            >
              Chat
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-6">
        {/* Header stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Active systems" value={String(activeCount)} icon="🌀" />
          <StatCard
            label="Peak intensity"
            value={formatWind(maxWind)}
            icon="💨"
          />
          <StatCard
            label="BoB / Arabian Sea"
            value={`${stormList.filter((s) => (s.subbasin ?? s.basin ?? "").includes("Bay")).length} BoB · ${stormList.filter((s) => (s.subbasin ?? s.basin ?? "").includes("Arabian")).length} ArS`}
            icon="🌊"
          />
          <StatCard
            label="Selected"
            value={activeStorm?.name ?? "—"}
            icon="📍"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Storm list (by category) */}
          <aside className="order-2 space-y-4 xl:order-1 xl:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                All Cyclones <span className="text-slate-400">({stormCount})</span>
              </h2>
              <div className="mt-3 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                {groups.map(({ category, storms: groupStorms }) => (
                  <div key={category}>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: getCategoryColor(category) }}
                      />
                      <span className="text-[11px] font-medium text-slate-600">
                        {category.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({groupStorms.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {groupStorms.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleSelectStorm(s.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            activeStorm?.id === s.id
                              ? "border-orange-400 bg-orange-50 shadow-sm"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {s.name.replace("Cyclone ", "C. ")}
                            </span>
                            <span
                              className="h-3 w-3 shrink-0 rounded-full border border-white"
                              style={{
                                backgroundColor: getCategoryColor(
                                  s.category ?? windToCategory(s.wind_kt ?? s.maxWind ?? 0),
                                ),
                              }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatWind(s.wind_kt ?? s.maxWind ?? 0)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatDateTime(s.timestamp)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main: map + satellite */}
          <div className="order-1 space-y-6 xl:order-2 xl:col-span-9">
            {/* Live map */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h1 className="text-lg font-bold text-slate-900">
                  Live Cyclone Monitor
                </h1>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  India / North Indian Ocean
                </span>
              </div>
              <CycloneMapWrapper
                storm={activeStorm}
                track={track}
                forecastTrack={forecastTrack}
                storms={stormList}
                onSelectStorm={handleSelectStorm}
              />
            </div>

            {/* Map legend note + satellite row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Satellite Timeline
                  </h2>
                </div>
                <ImageGrid images={images} isLoading={satLoading} />
              </div>
              <div className="space-y-6">
                <ForecastPanel
                  prediction={prediction}
                  trend={trend}
                  isLoading={false}
                />
                <AnalysisResult analysis={analysis} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
