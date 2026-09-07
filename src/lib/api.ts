import type {
  Observation,
  SatelliteAnalysis,
  SatelliteImage,
  Storm,
  StormDetail,
  TrackPoint,
} from "./types";
import { windToCategory } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/*
 * Member 1 integration — StormSense FastAPI backend (Pydantic) response shapes.
 * These mirror backend/app/schemas/storm.py and satellite.py.
 */
interface BackendObservation {
  storm_id: string;
  storm_name: string;
  timestamp: string;
  lat?: number | null;
  lon?: number | null;
  wind_kts?: number | null;
  pressure_hpa?: number | null;
  image_url?: string | null;
  satellites?: string[];
  stage?: string | null;
}

interface BackendTrackPoint {
  timestamp: string;
  lat: number;
  lon: number;
  wind_kts?: number | null;
  pressure_hpa?: number | null;
  stage?: string | null;
}

interface BackendStormDetail {
  storm_id: string;
  storm_name: string;
  active?: boolean;
  start_time: string;
  latest_time: string;
  max_wind_kts: number;
  min_pressure_hpa: number;
  observation_count?: number;
  latest_observation?: BackendObservation | null;
}

interface BackendStormTrack {
  storm_id: string;
  storm_name: string;
  track: BackendTrackPoint[];
}

interface BackendSatelliteObservation {
  storm_id: string;
  timestamp: string;
  satellite: string;
  image_url: string;
  channel?: string;
  resolution_km?: number | null;
}

interface BackendSatelliteTimeline {
  storm_id: string;
  total_images: number;
  observations: BackendSatelliteObservation[];
}

function has(o: unknown, key: string): boolean {
  return typeof o === "object" && o !== null && key in o;
}

function isBackendStorm(raw: unknown): raw is BackendStormDetail {
  return has(raw, "storm_id") && !has(raw, "wind_kt");
}

function isBackendTrackPoint(raw: unknown): raw is BackendTrackPoint {
  return has(raw, "wind_kts") || (has(raw, "lat") && has(raw, "lon") && !has(raw, "wind_kt"));
}

function isBackendObservation(raw: unknown): raw is BackendObservation {
  return isBackendStorm(raw) && !has(raw, "movement_direction");
}

function isBackendSatellite(raw: unknown): raw is BackendSatelliteObservation {
  return has(raw, "image_url");
}

function toStorm(raw: BackendStormDetail | Storm): Storm {
  if (!isBackendStorm(raw)) return raw as Storm;
  const b = raw as BackendStormDetail;
  const o = b.latest_observation;
  const wind = o?.wind_kts ?? b.max_wind_kts ?? 0;
  return {
    id: b.storm_id,
    name: b.storm_name,
    lat: o?.lat ?? 0,
    lon: o?.lon ?? 0,
    wind_kt: wind,
    pressure_hpa: o?.pressure_hpa ?? b.min_pressure_hpa ?? 0,
    movement_direction: "",
    movement_speed: 0,
    timestamp: b.latest_time,
    category: windToCategory(wind),
    status: b.active === false ? "historic" : "live",
    basin: "North Indian Ocean",
    startTime: b.start_time,
    endTime: b.latest_time,
    maxWind: b.max_wind_kts,
    source: "backend",
  };
}

function toTrackPoint(raw: BackendTrackPoint | TrackPoint, stormId?: string): TrackPoint {
  if (!isBackendTrackPoint(raw)) return raw as TrackPoint;
  const p = raw as BackendTrackPoint;
  return {
    storm_id: stormId,
    timestamp: p.timestamp,
    lat: p.lat,
    lon: p.lon,
    wind_kt: p.wind_kts ?? 0,
    pressure_hpa: p.pressure_hpa ?? 0,
    movement_direction: "",
    movement_speed: 0,
    category: windToCategory(p.wind_kts ?? 0),
    nature: p.stage ?? undefined,
    source: "backend",
  };
}

function toTrackList(raw: unknown, stormId: string): TrackPoint[] {
  if (Array.isArray(raw)) return raw.map((p) => toTrackPoint(p as TrackPoint, stormId));
  if (has(raw, "track") && Array.isArray((raw as BackendStormTrack).track)) {
    return (raw as BackendStormTrack).track.map((p) => toTrackPoint(p, stormId));
  }
  return [];
}

function toObservation(raw: BackendObservation | Observation): Observation {
  if (!isBackendObservation(raw)) return raw as Observation;
  const o = raw as BackendObservation;
  return {
    storm_id: o.storm_id,
    timestamp: o.timestamp,
    lat: o.lat ?? 0,
    lon: o.lon ?? 0,
    wind_kt: o.wind_kts ?? 0,
    pressure_hpa: o.pressure_hpa ?? 0,
    movement_direction: "",
    movement_speed: 0,
    distance_to_land_km: 0,
    satellite_hint: o.satellites?.join(", ") ?? undefined,
    nature: o.stage ?? undefined,
    source: "backend",
  };
}

function toSatelliteImage(raw: BackendSatelliteObservation | SatelliteImage): SatelliteImage {
  if (!isBackendSatellite(raw)) return raw as SatelliteImage;
  const s = raw as BackendSatelliteObservation;
  return {
    storm_id: s.storm_id,
    source: s.satellite,
    timestamp: s.timestamp,
    image: s.image_url,
    url: s.image_url,
    channel: s.channel ?? "IR",
    product: s.satellite,
    resolution: s.resolution_km != null ? `${s.resolution_km} km` : undefined,
  };
}

async function assembleStormDetail(summary: BackendStormDetail): Promise<StormDetail> {
  const [track, observations, satellite] = await Promise.all([
    fetchStormTrack(summary.storm_id),
    fetchStormObservations(summary.storm_id),
    fetchSatelliteImages(summary.storm_id),
  ]);
  return { storm: toStorm(summary), track, observations, satellite };
}

/*
 * Cascade fetch: try the configured FastAPI backend first, then transparently
 * fall back to the same-origin Next.js API routes (built-in historical/mock
 * dataset) — mirroring the backend's MockProvider fail-safe behavior.
 */
async function fetchCascade<T>(
  path: string,
  normalize: (raw: unknown) => T | Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const urls: string[] = [];
  const prefixed = API_BASE ? `${API_BASE}${path}` : path;
  if (!urls.includes(prefixed)) urls.push(prefixed);
  if (!urls.includes(path)) urls.push(path);

  let lastErr: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
      return await normalize(await res.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchCascade<T>(path, (raw) => raw as T, signal);
}

export async function fetchStorms(signal?: AbortSignal): Promise<Storm[]> {
  return fetchCascade<Storm[]>(
    "/api/storms",
    (raw) => (Array.isArray(raw) ? raw.map((s) => toStorm(s as Storm)) : []),
    signal,
  );
}

export async function fetchStorm(stormId: string): Promise<StormDetail> {
  const id = encodeURIComponent(stormId);
  return fetchCascade<StormDetail>(`/api/storms/${id}`, async (raw) => {
    if (isBackendStorm(raw)) return assembleStormDetail(raw as BackendStormDetail);
    return raw as StormDetail;
  });
}

export async function fetchStormTrack(stormId: string): Promise<TrackPoint[]> {
  const id = encodeURIComponent(stormId);
  return fetchCascade<TrackPoint[]>(`/api/storms/${id}/track`, (raw) =>
    toTrackList(raw, stormId),
  );
}

export async function fetchStormObservations(stormId: string): Promise<Observation[]> {
  const id = encodeURIComponent(stormId);
  return fetchCascade<Observation[]>(
    `/api/storms/${id}/observations`,
    (raw) => (Array.isArray(raw) ? raw.map((o) => toObservation(o as Observation)) : []),
  );
}

export async function fetchSatelliteImages(stormId: string): Promise<SatelliteImage[]> {
  const id = encodeURIComponent(stormId);
  return fetchCascade<SatelliteImage[]>(`/api/storms/${id}/satellite`, (raw) => {
    if (Array.isArray(raw)) return raw.map((s) => toSatelliteImage(s as SatelliteImage));
    if (has(raw, "observations") && Array.isArray((raw as BackendSatelliteTimeline).observations)) {
      return (raw as BackendSatelliteTimeline).observations.map((s) => toSatelliteImage(s));
    }
    return [];
  });
}

export async function fetchSatelliteAnalysis(stormId: string): Promise<SatelliteAnalysis> {
  const id = encodeURIComponent(stormId);
  return fetchCascade<SatelliteAnalysis>(
    `/api/satellite/${id}/analysis`,
    (raw) => raw as SatelliteAnalysis,
  );
}

export async function fetchLiveMonitoring(opts?: {
  stormId?: string;
  signal?: AbortSignal;
}) {
  const qs = opts?.stormId ? `?storm=${encodeURIComponent(opts.stormId)}` : "";
  const signal = opts?.signal;
  return fetchCascade<import("./live/types").LiveMonitoringData>(
    `/api/live${qs}`,
    (raw) => raw as import("./live/types").LiveMonitoringData,
    signal,
  );
}

export function streamChat(
  query: string,
  onToken: (token: string) => void,
  onToolStart: (name: string, input: Record<string, unknown>) => void,
  onToolEnd: (name: string, output: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
) {
  const ctrl = new AbortController();

  fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`Chat error ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "token") onToken(data.content);
            else if (data.type === "tool_start") onToolStart(data.name, data.input);
            else if (data.type === "tool_end") onToolEnd(data.name, data.output);
            else if (data.type === "DONE") onDone();
          } catch {}
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err);
    });

  return () => ctrl.abort();
}