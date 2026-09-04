"use client";

import { useState } from "react";
import Link from "next/link";
import type { Storm } from "@/lib/types";
import { categoryLabel, getNearestCoastInfo, windToKmh } from "@/lib/formatters";

interface LandfallBannerProps {
  storm?: Storm | null;
  onFocusStorm?: (storm: Storm) => void;
}

export default function LandfallBanner({ storm, onFocusStorm }: LandfallBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!storm || dismissed) return null;

  const coast = getNearestCoastInfo(storm.lat, storm.lon);
  const isImminent = coast.distanceKm < 250 || storm.wind_kt >= 64;
  const isWarning = coast.distanceKm < 500;

  if (!isWarning && !isImminent) return null;

  const severityColor = isImminent
    ? "from-red-600 via-rose-600 to-amber-600 text-white shadow-red-500/20"
    : "from-amber-500 via-orange-500 to-amber-600 text-white shadow-amber-500/20";

  return (
    <div className="relative z-40 mx-auto max-w-7xl px-4 pt-3 pb-1">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${severityColor} p-4 shadow-xl backdrop-blur-md`}>
        {/* Pulsing background effect */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl font-bold backdrop-blur-sm">
              ⚠️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-white/25 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wider text-white">
                  {isImminent ? "CRITICAL LANDFALL WARNING" : "COASTAL ADVISORY"}
                </span>
                <span className="text-xs font-medium text-white/80">
                  {categoryLabel(storm.category ?? "")}
                </span>
              </div>
              <h3 className="mt-1 text-base font-bold tracking-tight text-white">
                {storm.name} is {coast.distanceKm} km off {coast.name}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-white/90">
                Max Sustained Winds: <strong className="underline">{storm.wind_kt} kt</strong> ({windToKmh(storm.wind_kt)} km/h) · Moving {storm.movement_direction || "northward"} at {storm.movement_speed} km/h.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <Link
              href={`/live?storm=${encodeURIComponent(storm.id)}`}
              onClick={() => {
                if (onFocusStorm) onFocusStorm(storm);
              }}
              className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-md transition-all hover:bg-slate-100 hover:scale-105 active:scale-95"
            >
              Track Live Map 📍
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/30"
              title="Dismiss warning"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
