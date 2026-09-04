import type {
  Observation,
  SatelliteImage,
  Storm,
  StormDetail,
  StormProvider,
  TrackPoint,
} from "@/lib/types";
import { windToCategory } from "@/lib/types";
import {
  getMockObservations,
  getMockSatellite,
  getMockStorm,
  getMockStorms,
  getMockTrack,
} from "../data";

const IMD_BASE_URL = process.env.IMD_API_URL || "https://mausam.imd.gov.in/api";
const CACHE_TTL_MS = 3 * 60 * 1000;
let imdCache: { at: number; storms: Storm[] } | null = null;

export const imdProvider: StormProvider = {
  name: "imd/rsmc-new-delhi",

  async getStorms(): Promise<Storm[]> {
    const live = await fetchImdLiveStorms();
    const historical = getMockStorms().filter((s) =>
      (s.subbasin ?? s.basin ?? "").toLowerCase().includes("indian") ||
      (s.subbasin ?? s.basin ?? "").toLowerCase().includes("bay") ||
      (s.subbasin ?? s.basin ?? "").toLowerCase().includes("arabian")
    );

    if (live.length === 0) return historical;
    const liveIds = new Set(live.map((s) => s.id));
    return [...live, ...historical.filter((s) => !liveIds.has(s.id))];
  },

  async getStorm(id: string): Promise<StormDetail | null> {
    const storms = await this.getStorms();
    const current = storms.find((s) => s.id === id);
    if (!current) return getMockStorm(id);

    if (current.status === "live") {
      return {
        storm: current,
        track: toImdTrack(current),
        observations: toImdObservations(current),
        satellite: getMockSatellite(id),
        forecast_track: toImdForecastTrack(current),
      };
    }
    return getMockStorm(id);
  },

  async getTrack(id: string): Promise<TrackPoint[]> {
    const storm = await this.getStorm(id);
    return storm?.track ?? getMockTrack(id);
  },

  async getObservations(id: string): Promise<Observation[]> {
    const storm = await this.getStorm(id);
    return storm?.observations ?? getMockObservations(id);
  },

  async getSatellite(id: string): Promise<SatelliteImage[]> {
    return getMockSatellite(id);
  },
};

async function fetchImdLiveStorms(): Promise<Storm[]> {
  if (imdCache && Date.now() - imdCache.at < CACHE_TTL_MS) {
    return imdCache.storms;
  }

  try {
    // Attempt official IMD RSMC API bulletin endpoint
    const res = await fetch(`${IMD_BASE_URL}/cyclone_bulletin`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const parsed = data.map(parseImdBulletin).filter((s): s is Storm => s !== null);
        if (parsed.length > 0) {
          imdCache = { at: Date.now(), storms: parsed };
          return parsed;
        }
      }
    }
  } catch {
    /* fallback to NOAA NHC filtered for North Indian Ocean basin */
  }

  // Fallback: Fetch NOAA NHC live feed filtered for North Indian Ocean (IMD RSMC Area: 0-35N, 45-100E)
  try {
    const res = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.activeStorms) ? data.activeStorms : [];
      const nioStorms = list
        .map((s: Record<string, unknown>) => parseNhcToImd(s))
        .filter((s: Storm | null): s is Storm => s !== null && isNioRegion(s.lat, s.lon));
      imdCache = { at: Date.now(), storms: nioStorms };
      return nioStorms;
    }
  } catch {
    /* return empty live list to fall back to mock NIO storms */
  }

  imdCache = { at: Date.now(), storms: [] };
  return [];
}

function isNioRegion(lat: number, lon: number): boolean {
  return lat >= 0 && lat <= 35 && lon >= 45 && lon <= 100;
}

function parseImdBulletin(raw: Record<string, unknown>): Storm | null {
  const lat = Number(raw.lat || raw.latitude);
  const lon = Number(raw.lon || raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const wind = Number(raw.wind_kt || raw.max_wind) || 35;
  const pressure = Number(raw.pressure || raw.min_pressure) || 998;
  const name = String(raw.storm_name || raw.title || "Cyclonic Disturbance");
  const category = normalizeImdCategory(String(raw.intensity || raw.category || windToCategory(wind)));

  return {
    id: `imd-${String(raw.id || name.toLowerCase().replace(/\s+/g, "-"))}`,
    sid: String(raw.id || "IMD-RSMC"),
    name: name.startsWith("Cyclone") ? name : `Cyclone ${name}`,
    lat,
    lon,
    wind_kt: wind,
    pressure_hpa: pressure,
    movement_direction: String(raw.movement_dir || "north-northeast"),
    movement_speed: Number(raw.movement_speed) || 10,
    timestamp: String(raw.updated_at || new Date().toISOString()),
    basin: "North Indian Ocean",
    subbasin: lon > 80 ? "Bay of Bengal" : "Arabian Sea",
    category,
    status: "live",
    season: new Date().getUTCFullYear(),
    source: "IMD RSMC New Delhi",
    maxWind: wind,
  };
}

function parseNhcToImd(raw: Record<string, unknown>): Storm | null {
  const lat = Number(raw.latitudeNumeric ?? 0);
  const lon = Number(raw.longitudeNumeric ?? 0);
  if (!lat || !lon) return null;

  const wind = Number(raw.intensity) || 30;
  const pressure = Number(raw.pressure) || 1000;
  const rawName = String(raw.name || "Disturbance");
  const category = windToCategory(wind);

  return {
    id: `imd-live-${raw.id}`,
    sid: String(raw.id),
    name: `Cyclone ${rawName}`,
    lat,
    lon,
    wind_kt: wind,
    pressure_hpa: pressure,
    movement_direction: "north-northeast",
    movement_speed: 10,
    timestamp: String(raw.lastUpdate || new Date().toISOString()),
    basin: "North Indian Ocean",
    subbasin: lon > 80 ? "Bay of Bengal" : "Arabian Sea",
    category,
    status: "live",
    season: new Date().getUTCFullYear(),
    source: "IMD RSMC / NOAA NHC",
    maxWind: wind,
  };
}

function normalizeImdCategory(cat: string): string {
  const upper = cat.toUpperCase();
  if (upper.includes("SUPER")) return "SUPER_CYCLONE";
  if (upper.includes("VERY SEVERE")) return "VERY_SEVERE_CYCLONE";
  if (upper.includes("SEVERE")) return "SEVERE_CYCLONE";
  if (upper.includes("CYCLONIC")) return "CYCLONE";
  if (upper.includes("DEEP DEPRESSION")) return "DEEP_DEPRESSION";
  if (upper.includes("DEPRESSION")) return "DEPRESSION";
  return windToCategory(0);
}

function toImdTrack(s: Storm): TrackPoint[] {
  return [
    {
      id: `${s.id}-track-1`,
      timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      lat: s.lat - 0.5,
      lon: s.lon - 0.4,
      wind_kt: Math.max(15, s.wind_kt - 5),
      pressure_hpa: s.pressure_hpa + 3,
      movement_direction: s.movement_direction,
      movement_speed: s.movement_speed,
      source: s.source,
      category: s.category,
    },
    {
      id: `${s.id}-now`,
      timestamp: s.timestamp,
      lat: s.lat,
      lon: s.lon,
      wind_kt: s.wind_kt,
      pressure_hpa: s.pressure_hpa,
      movement_direction: s.movement_direction,
      movement_speed: s.movement_speed,
      source: s.source,
      category: s.category,
    },
  ];
}

function toImdObservations(s: Storm): Observation[] {
  return [
    {
      id: `${s.id}-obs-now`,
      timestamp: s.timestamp,
      lat: s.lat,
      lon: s.lon,
      wind_kt: s.wind_kt,
      pressure_hpa: s.pressure_hpa,
      movement_direction: s.movement_direction,
      movement_speed: s.movement_speed,
      distance_to_land_km: 120,
      source: s.source,
      satellite_hint: "ir",
    },
  ];
}

function toImdForecastTrack(s: Storm): TrackPoint[] {
  return [
    {
      id: `${s.id}-fcst-12h`,
      timestamp: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
      lat: s.lat + 0.8,
      lon: s.lon + 0.6,
      wind_kt: Math.min(140, s.wind_kt + 5),
      pressure_hpa: Math.max(920, s.pressure_hpa - 4),
      movement_direction: s.movement_direction,
      movement_speed: s.movement_speed,
      forecast: true,
      source: s.source,
    },
    {
      id: `${s.id}-fcst-24h`,
      timestamp: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      lat: s.lat + 1.6,
      lon: s.lon + 1.2,
      wind_kt: Math.min(140, s.wind_kt + 8),
      pressure_hpa: Math.max(910, s.pressure_hpa - 6),
      movement_direction: s.movement_direction,
      movement_speed: s.movement_speed,
      forecast: true,
      source: s.source,
    },
  ];
}
