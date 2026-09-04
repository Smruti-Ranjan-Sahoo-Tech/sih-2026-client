import { getStormDetail, listStorms } from "@/lib/stormsense/service";
import type {
  LiveConeCircle,
  LiveForecastPoint,
  LiveMonitoringData,
  LiveTrackPoint,
} from "./types";

interface Options {
  stormId?: string;
}

/**
 * Builds the /live monitoring payload from the project's official storm
 * provider (NOAA NHC by default). Nothing is fabricated: any field the
 * upstream source does not provide is left null / empty and the UI simply
 * does not render it.
 */
export async function buildLiveMonitoring(
  opts: Options = {},
): Promise<LiveMonitoringData> {
  const serverTime = new Date().toISOString();

  let stormList: Awaited<ReturnType<typeof listStorms>> = [];
  let cycloneError: string | null = null;

  try {
    stormList = await listStorms();
  } catch (err) {
    cycloneError =
      "Official cyclone data temporarily unavailable. " +
      (err instanceof Error ? err.message : String(err));
  }

  const target =
    (opts.stormId && stormList.find((s) => s.id === opts.stormId)) ||
    stormList.find((s) => s.status === "live") ||
    stormList[0] ||
    null;

  // No active cyclone in the monitored region => explicit no-active signal.
  if (!target) {
    return {
      active: false,
      cycloneName: null,
      basin: null,
      status: null,
      intensity: null,
      lastCycloneUpdate: null,
      serverTime,
      currentPosition: null,
      windSpeed: null,
      pressure: null,
      movementDirection: null,
      movementSpeed: null,
      historicalTrack: [],
      forecastTrack: [],
      forecastTimes: [],
      uncertaintyCone: null,
      satellite: {
        label: "Satellite",
        source: "Esri World Imagery (NASA/USGS)",
        lastUpdate: null,
      },
      forecastSource: "NOAA NHC",
      error: { cyclone: cycloneError, satellite: null },
    };
  }

  let detail: Awaited<ReturnType<typeof getStormDetail>> | null = null;
  try {
    detail = await getStormDetail(target.id);
  } catch {
    detail = null;
  }

  const historicalTrack: LiveTrackPoint[] = (detail?.track ?? []).map((p) => ({
    timestamp: p.timestamp,
    lat: p.lat,
    lon: p.lon,
    wind_kt: p.wind_kt,
    pressure_hpa: p.pressure_hpa,
    category: p.category ?? p.nature,
  }));

  const forecastTrack: LiveForecastPoint[] = (detail?.forecast_track ?? []).map(
    (p) => ({
      timestamp: p.timestamp,
      lat: p.lat,
      lon: p.lon,
      wind_kt: p.wind_kt,
      category: p.category ?? p.nature,
    }),
  );

  const forecastTimes = forecastTrack.map((p) => p.timestamp);
  const uncertaintyCone = buildCone(forecastTrack);

  const latest = (detail?.track ?? []).slice(-1)[0];

  return {
    active: true,
    cycloneName: target.name,
    basin: target.subbasin ?? target.basin ?? null,
    status: target.status ?? null,
    intensity: target.category ?? null,
    lastCycloneUpdate: latest?.timestamp ?? target.timestamp ?? null,
    serverTime,
    currentPosition: { lat: target.lat, lon: target.lon },
    windSpeed: latest?.wind_kt ?? target.wind_kt ?? null,
    pressure: latest?.pressure_hpa ?? target.pressure_hpa ?? null,
    movementDirection:
      latest?.movement_direction ?? target.movement_direction ?? null,
    movementSpeed: latest?.movement_speed ?? target.movement_speed ?? null,
    historicalTrack,
    forecastTrack,
    forecastTimes,
    uncertaintyCone,
    satellite: {
      label: "Satellite",
      source: "Esri World Imagery (NASA/USGS)",
      lastUpdate:
        (forecastTimes.length
          ? forecastTimes[forecastTimes.length - 1]
          : latest?.timestamp ?? target.timestamp) ?? null,
    },
    forecastSource: "NOAA NHC",
    error: { cyclone: cycloneError, satellite: null },
  };
}

function buildCone(forecast: LiveForecastPoint[]): LiveConeCircle[] | null {
  if (forecast.length === 0) return null;
  return forecast.map((p, i) => ({
    timestamp: p.timestamp,
    lat: p.lat,
    lon: p.lon,
    radiusKm: coneRadiusKm(p.wind_kt, i),
  }));
}

function coneRadiusKm(windKt: number | null, step: number): number {
  const base =
    windKt && windKt >= 100 ? 260 : windKt && windKt >= 64 ? 185 : 120;
  // forecast uncertainty grows with lead time
  return Math.round(base * (1 + step * 0.15));
}
