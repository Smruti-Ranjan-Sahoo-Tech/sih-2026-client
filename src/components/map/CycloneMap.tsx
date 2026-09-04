"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  type StyleSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Storm, TrackPoint } from "@/lib/types";
import {
  categoryLabel,
  formatCoord,
  formatDateTime,
  formatPressure,
  formatWind,
} from "@/lib/formatters";
import { getCategoryColor, windToCategory } from "@/lib/types";
import LeafletFallbackMap from "./LeafletFallbackMap";
import StormSVGOverlay from "./StormSVGOverlay";
import WindStreamlinesOverlay from "./WindStreamlinesOverlay";

export interface ConeCircle {
  timestamp: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

interface CycloneMapProps {
  storm: Storm | null;
  track: TrackPoint[];
  forecastTrack?: TrackPoint[];
  cone?: ConeCircle[];
  storms?: Storm[];
  onSelectStorm?: (stormId: string) => void;
  className?: string;
  hideOverlays?: boolean;
  basemap?: BasemapKind;
}

export default function CycloneMap({
  storm,
  track,
  forecastTrack = [],
  cone = [],
  storms = [],
  onSelectStorm,
  className,
  hideOverlays = false,
  basemap = "satellite",
}: CycloneMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const stormOverlayMarkerRef = useRef<Marker | null>(null);
  const stormOverlayRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const stormRef = useRef<Storm | null>(storm);
  useEffect(() => {
    stormRef.current = storm;
  }, [storm]);
  const basemapRef = useRef<BasemapKind>(basemap);
  useEffect(() => {
    basemapRef.current = basemap;
  }, [basemap]);
  const onSelectRef = useRef<((id: string) => void) | undefined>(undefined);
  const stormsRef = useRef<Storm[]>(storms);
  useEffect(() => {
    stormsRef.current = storms;
  }, [storms]);
  const coneRef = useRef<ConeCircle[]>(cone);
  useEffect(() => {
    coneRef.current = cone;
  }, [cone]);
  useEffect(() => {
    onSelectRef.current = onSelectStorm;
  }, [onSelectStorm]);
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [showWindStreamlines, setShowWindStreamlines] = useState(true);
  const latestTrackPoint = track[track.length - 1] ?? null;
  const latestForecastPoint = forecastTrack[forecastTrack.length - 1] ?? null;

  useEffect(() => {
    let available = false;
    try {
      const canvas = document.createElement("canvas");
      available = Boolean(canvas.getContext("webgl2"));
    } catch {
      available = false;
    }
    const t = window.setTimeout(() => setWebglSupported(available), 0);
    return () => window.clearTimeout(t);
  }, []);

  const stormSummary = useMemo(() => {
    if (!storm) return null;
    return {
      category: storm.category ?? windToCategory(storm.wind_kt),
      movement: `${storm.movement_direction} at ${Math.round(storm.movement_speed)} kt`,
      updated: formatDateTime(storm.timestamp),
      position: formatCoord(storm.lat, storm.lon),
    };
  }, [storm]);

  function syncStormOverlay(map: MapLibreMap | null, stormOverride?: Storm | null) {
    const s = stormOverride !== undefined ? stormOverride : stormRef.current;
    if (!map || !s) return;
    applyTrackStyle(map, s);
    const size = overlaySizeFor(map, s);
    if (!stormOverlayMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:absolute;top:0;left:0;transform:translate(-50%,-50%);pointer-events:none;z-index:5;";
      const marker = new Marker({ element: el })
        .setLngLat([s.lon, s.lat])
        .addTo(map);
      stormOverlayMarkerRef.current = marker;
      const root = createRoot(el);
      stormOverlayRootRef.current = root;
      root.render(<StormSVGOverlay storm={s} size={size} />);
    } else {
      stormOverlayMarkerRef.current.setLngLat([s.lon, s.lat]);
      stormOverlayRootRef.current?.render(<StormSVGOverlay storm={s} size={size} />);
    }
  }

  function ensureMapLayers(map: MapLibreMap) {
    if (map.getSource("track")) return;

    map.addSource("track", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addSource("forecast", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
    map.addSource("latest", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: "track-line",
      type: "line",
      source: "track",
      paint: {
        "line-color": "#ea580c",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });

    map.addLayer({
      id: "forecast-line",
      type: "line",
      source: "forecast",
      paint: {
        "line-color": "#0284c7",
        "line-width": 3,
        "line-dasharray": [2, 2],
        "line-opacity": 0.9,
      },
    });

    map.addLayer({
      id: "track-points",
      type: "circle",
      source: "track",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "wind_kt"],
          0, 6,
          64, 8,
          120, 11,
        ],
        "circle-color": "#f59e0b",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    map.addLayer({
      id: "latest-point",
      type: "circle",
      source: "latest",
      paint: {
        "circle-radius": 12,
        "circle-color": "#ffffff",
        "circle-opacity": 0.35,
        "circle-stroke-color": "#ea580c",
        "circle-stroke-width": 2.5,
      },
    });

    map.addLayer({
      id: "latest-point-inner",
      type: "circle",
      source: "latest",
      paint: {
        "circle-radius": 5,
        "circle-color": "#ea580c",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    map.addSource("storm-extents", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: "storm-extents",
      type: "fill",
      source: "storm-extents",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.22,
      },
    });

    map.addLayer({
      id: "storm-extent-lines",
      type: "line",
      source: "storm-extents",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1.5,
        "line-dasharray": [1, 1],
        "line-opacity": 0.9,
      },
    });

    map.addSource("cone", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: "cone-fill",
      type: "fill",
      source: "cone",
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": 0.16,
      },
    });

    map.addLayer({
      id: "cone-line",
      type: "line",
      source: "cone",
      paint: {
        "line-color": "#0ea5e9",
        "line-width": 1.5,
        "line-dasharray": [2, 2],
        "line-opacity": 0.8,
      },
    });

    map.addSource("storms", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });

    map.addLayer({
      id: "storms",
      type: "circle",
      source: "storms",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "wind_kt"],
          0,
          9,
          64,
          12,
          120,
          17,
        ],
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    updateMapSources(map, track, forecastTrack, coneRef.current, stormsRef.current);
    syncStormOverlay(map);
  }

  useEffect(() => {
    if (webglSupported !== true) return;
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: buildStyle(basemapRef.current),
        center: latestTrackPoint ? [latestTrackPoint.lon, latestTrackPoint.lat] : [80, 15],
        zoom: latestTrackPoint ? 4.8 : 3.7,
        attributionControl: false,
        cooperativeGestures: true,
      });

    map.on("load", () => {
      ensureMapLayers(map);

      map.on("click", "storms", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["storms"],
        });
        const id = features[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current?.(id);
      });

      map.on("mouseenter", "storms", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "storms", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    } catch {
      /* MapLibre reports rendering errors via the 'error' event below */
      return;
    }

    return () => {
      if (!mapRef.current) return;
      try {
        mapRef.current.remove();
      } catch {
        /* map already torn down */
      }
      mapRef.current = null;
    };
  }, [webglSupported]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      const source = map.getSource("basemap") as { setTiles?: (tiles: string[]) => void } | undefined;
      const spec = BASEMAP_STYLES[basemap] ?? BASEMAP_STYLES.satellite;

      if (source && typeof source.setTiles === "function") {
        source.setTiles(spec.tiles);
        map.triggerRepaint();
        return;
      }

      map.setStyle(buildStyle(basemap));
      map.once("style.load", () => {
        ensureMapLayers(map);
        updateMapSources(map, track, forecastTrack, cone, storms);
        syncStormOverlay(map);
      });
    } catch {
      /* ignore basemap-switch errors */
    }
  }, [basemap, cone, forecastTrack, storms, track]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const resize = () => map.resize();
    resize();

    const observer = new ResizeObserver(() => resize());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [webglSupported]);

  useEffect(() => {
    syncStormOverlay(mapRef.current);
  }, [storm, latestTrackPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => syncStormOverlay(map);
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [webglSupported]);

  useEffect(() => {
    return () => {
      stormOverlayRootRef.current?.render(null);
      stormOverlayMarkerRef.current?.remove();
      stormOverlayMarkerRef.current = null;
      stormOverlayRootRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) {
      return;
    }

    updateMapSources(mapRef.current, track, forecastTrack, cone, storms);
  }, [cone, forecastTrack, storms, track]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded() || !track.length) {
      return;
    }

    const bounds = track.reduce(
      (acc: LngLatBounds, point) => acc.extend([point.lon, point.lat]),
      new LngLatBounds(
        [track[0].lon, track[0].lat],
        [track[0].lon, track[0].lat],
      ),
    );

    mapRef.current.fitBounds(bounds, {
      padding: { top: 32, right: 0, bottom: 24, left: 0 },
      duration: 650,
      maxZoom: 5.8,
    });
  }, [track]);

  useEffect(() => {
    if (!mapRef.current || !storm || !storm.lat || !storm.lon) {
      return;
    }

    try {
      mapRef.current.flyTo({
        center: [storm.lon, storm.lat],
        zoom: 6,
        duration: 1100,
        essential: true,
      });
    } catch {
      /* ignore if map style is still loading */
    }
  }, [storm?.id, storm?.lat, storm?.lon]);

  if (!storm) {
    return (
      <div
        className={`relative h-[68vh] w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 ${
          className ?? ""
        }`}
      >
        <div className="relative flex h-full items-center justify-center text-sm text-slate-500">
          No storm selected
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative h-[68vh] w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-100 shadow-xl shadow-sky-100 ${
        className ?? ""
      }`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {webglSupported === false && (
        <LeafletFallbackMap
          track={track}
          forecastTrack={forecastTrack}
          cone={cone}
          storms={storms}
          onSelectStorm={onSelectStorm}
          basemap={basemap}
        />
      )}

      {webglSupported === null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-slate-500">
          Initializing map…
        </div>
      )}

      {!hideOverlays && (
        <>
          {storms.length > 0 && (
            <div className="absolute right-4 top-4 z-10 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-xl">
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Cyclone Intensity
              </div>
              <div className="mt-2 space-y-1.5">
                {CATEGORY_LEGEND.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-white shadow"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-slate-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="absolute left-4 top-4 z-10 max-w-md rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-sky-600">
                  Live Cyclone View
                </div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{storm.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {categoryLabel(storm.category ?? windToCategory(storm.wind_kt))} ·{" "}
                  {storm.basin ?? "North Indian Ocean"}
                </p>
              </div>
              <div
                className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  borderColor: `${getCategoryColor(
                    storm.category ?? windToCategory(storm.wind_kt),
                  )}55`,
                  color: getCategoryColor(storm.category ?? windToCategory(storm.wind_kt)),
                  backgroundColor: `${getCategoryColor(
                    storm.category ?? windToCategory(storm.wind_kt),
                  )}14`,
                }}
              >
                {storm.category ?? windToCategory(storm.wind_kt)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Position" value={stormSummary?.position ?? "-"} />
              <Stat label="Wind" value={formatWind(storm.wind_kt)} />
              <Stat label="Pressure" value={formatPressure(storm.pressure_hpa)} />
              <Stat label="Movement" value={stormSummary?.movement ?? "-"} />
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
              Updated {stormSummary?.updated ?? "-"}
            </div>
          </div>

          <div className="absolute bottom-4 left-4 z-10 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
              Track points
            </div>
            <div className="mt-1 text-sm text-slate-900">{track.length} historical</div>
            <div className="text-xs text-slate-500">
              {forecastTrack.length > 0 ? `${forecastTrack.length} forecast` : "No forecast track"}
            </div>
          </div>

          {latestTrackPoint && (
            <div className="absolute bottom-4 right-4 z-10 max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-lg backdrop-blur-xl">
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                Current fix
              </div>
              <div className="mt-1 font-medium text-slate-900">
                {formatDateTime(latestTrackPoint.timestamp)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                <span>Wind {formatWind(latestTrackPoint.wind_kt)}</span>
                <span>Pressure {formatPressure(latestTrackPoint.pressure_hpa)}</span>
                <span>Coord {formatCoord(latestTrackPoint.lat, latestTrackPoint.lon)}</span>
                <span>Dir {latestTrackPoint.movement_direction}</span>
              </div>
              {latestForecastPoint && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-800">
                  Forecast to {formatDateTime(latestForecastPoint.timestamp)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Windy.com Style Map Layer Switcher & Wind Streamlines Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-2xl border border-white/20 bg-slate-900/80 p-1.5 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setShowWindStreamlines((v) => !v)}
          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold transition-all ${
            showWindStreamlines
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
              : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
          title="Toggle animated wind particle streamlines overlay"
        >
          <span>💨</span>
          <span>Streamlines {showWindStreamlines ? "ON" : "OFF"}</span>
        </button>
        <div className="h-4 w-px bg-white/20" />
        {(Object.keys(BASEMAP_STYLES) as BasemapKind[]).map((kind) => {
          const active = (basemapRef.current ?? "satellite") === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                basemapRef.current = kind;
                if (mapRef.current) {
                  const spec = BASEMAP_STYLES[kind];
                  const src = mapRef.current.getSource("basemap") as unknown as { setTiles?: (t: string[]) => void };
                  if (src && src.setTiles) {
                    src.setTiles(spec.tiles);
                  }
                }
              }}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition-all ${
                active
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {BASEMAP_STYLES[kind].label}
            </button>
          );
        })}
      </div>

      {/* Wind Streamlines Canvas Overlay */}
      <WindStreamlinesOverlay
        map={mapRef.current}
        storm={storm}
        enabled={showWindStreamlines}
      />

      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/70 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center text-xl text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          ＋
        </button>
        <div className="h-px bg-white/10" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center text-xl text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          －
        </button>
      </div>
    </div>
  );
}

const CATEGORY_LEGEND: { label: string; color: string }[] = [
  { label: "LOW", color: "#4B9CD3" },
  { label: "Depression", color: "#5DADE2" },
  { label: "Deep Depression", color: "#F4D03F" },
  { label: "Cyclonic Storm", color: "#FFA500" },
  { label: "Severe Cyclonic", color: "#FF8C00" },
  { label: "Very Severe", color: "#FF4500" },
  { label: "SuCS / Super", color: "#DC143C" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-900">{value}</div>
    </div>
  );
}

function updateMapSources(
  map: MapLibreMap,
  track: TrackPoint[],
  forecastTrack: TrackPoint[],
  cone: ConeCircle[] = [],
  storms: Storm[] = [],
) {
  const trackSource = map.getSource("track") as GeoJSONSource | undefined;
  const forecastSource = map.getSource("forecast") as GeoJSONSource | undefined;
  const latestSource = map.getSource("latest") as GeoJSONSource | undefined;
  const stormsSource = map.getSource("storms") as GeoJSONSource | undefined;
  const extentsSource = map.getSource("storm-extents") as GeoJSONSource | undefined;
  const coneSource = map.getSource("cone") as GeoJSONSource | undefined;

  trackSource?.setData(toLineFeatureCollection(track));
  forecastSource?.setData(toLineFeatureCollection(forecastTrack));
  latestSource?.setData(toPointFeatureCollection(track[track.length - 1] ?? null));
  stormsSource?.setData(toStormsFeatureCollection(storms));
  extentsSource?.setData(toExtentFeatureCollection(storms));
  coneSource?.setData(toConeFeatureCollection(cone));
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function toLineFeatureCollection(points: TrackPoint[]): GeoJSON.FeatureCollection {
  if (!points.length) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: points.map((point) => [point.lon, point.lat]),
        },
        properties: {},
      },
      ...points.map((point) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lon, point.lat],
        },
        properties: {
          timestamp: point.timestamp,
          wind_kt: point.wind_kt,
          pressure_hpa: point.pressure_hpa,
        },
      })),
    ],
  };
}

function toPointFeatureCollection(point: TrackPoint | null): GeoJSON.FeatureCollection {
  if (!point) return emptyFeatureCollection();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [point.lon, point.lat],
        },
        properties: {
          timestamp: point.timestamp,
          wind_kt: point.wind_kt,
          pressure_hpa: point.pressure_hpa,
        },
      },
    ],
  };
}

function toStormsFeatureCollection(storms: Storm[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: storms.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lon, s.lat],
      },
      properties: {
        id: s.id,
        name: s.name,
        wind_kt: s.wind_kt ?? s.maxWind ?? 0,
        color: getCategoryColor(s.category ?? windToCategory(s.wind_kt ?? s.maxWind ?? 0)),
      },
    })),
  };
}

function toExtentFeatureCollection(storms: Storm[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: storms.map((s) => ({
      type: "Feature" as const,
      geometry: circlePolygon(s.lon, s.lat, stormExtentKm(s)),
      properties: {
        color: getCategoryColor(s.category ?? windToCategory(s.wind_kt ?? s.maxWind ?? 0)),
      },
    })),
  };
}

function toConeFeatureCollection(cone: ConeCircle[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cone.map((c) => ({
      type: "Feature" as const,
      geometry: circlePolygon(c.lon, c.lat, c.radiusKm),
      properties: {
        timestamp: c.timestamp,
      },
    })),
  };
}

function applyTrackStyle(map: MapLibreMap, storm: Storm | null) {
  const layer = map.getLayer("track-line");
  if (!layer) return;
  const historical = storm?.status === "historical";
  const width = historical ? 3 : 4;
  const dash = historical ? [6, 6] : [1, 0];
  try {
    map.setPaintProperty("track-line", "line-width", width);
    map.setPaintProperty("track-line", "line-dasharray", dash);
  } catch {
    /* ignore style update errors */
  }
}

function stormExtentKm(storm: Storm): number {
  const cat = (storm.category ?? windToCategory(storm.wind_kt ?? storm.maxWind ?? 0)).toUpperCase();
  const extentKm: Record<string, number> = {
    LOW: 90,
    DEPRESSION: 170,
    DEEP_DEPRESSION: 240,
    TD: 120,
    TS: 240,
    CYCLONE: 320,
    CYCLONIC_STORM: 320,
    SEVERE_CYCLONE: 420,
    SEVERE_CYCLONIC_STORM: 420,
    VERY_SEVERE_CYCLONE: 540,
    CAT1: 320,
    CAT2: 420,
    CAT3: 540,
    CAT4: 650,
    CAT5: 760,
    SUPER_CYCLONE: 680,
  };
  return extentKm[cat] ?? 260;
}

/**
 * Convert a storm's geographic extent (km diameter) into overlay pixel size at
 * the map's current zoom level (Web Mercator). Keeps the drawn storm matched to
 * its real footprint on the ground, and scales with live wind data.
 */
function overlaySizeFor(map: MapLibreMap, storm: Storm): number {
  const radiusKm = stormExtentKm(storm) / 2;
  const metersPerPixel = (156543.03392 * Math.cos((storm.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
  const diameterPx = (radiusKm * 2 * 1000) / metersPerPixel;
  return Math.min(Math.max(diameterPx, 90), 700);
}

function circlePolygon(
  lon: number,
  lat: number,
  radiusKm: number,
  segments = 48,
): GeoJSON.Polygon {
  const kmPerDegLat = 111.32;
  const latRad = (lat * Math.PI) / 180;
  const kmPerDegLon = 111.32 * Math.max(Math.cos(latRad), 0.01);
  const dLat = radiusKm / kmPerDegLat;
  const dLon = radiusKm / kmPerDegLon;
  const coords: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    coords.push([lon + Math.cos(angle) * dLon, lat + Math.sin(angle) * dLat]);
  }
  coords.push(coords[0]);
  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

export type BasemapKind = "satellite" | "streets" | "light" | "dark";

export const BASEMAP_STYLES: Record<BasemapKind, { label: string; tiles: string[] }> = {
  // High-res, always-on global satellite imagery (free, no API key).
  satellite: {
    label: "🛰 Satellite",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
  },
  dark: {
    label: "🌙 Dark Vector",
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    ],
  },
  streets: {
    label: "🗺 Streets",
    tiles: [
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
  },
  // Light, low-contrast basemap optimised to fit dense data overlays
  light: {
    label: "☀️ Light",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    ],
  },
};

function buildStyle(kind: BasemapKind = "satellite"): StyleSpecification {
  const spec = BASEMAP_STYLES[kind] ?? BASEMAP_STYLES.satellite;
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: spec.tiles,
        tileSize: 256,
        attribution: "NASA GIBS / MODIS &copy; Esri &copy; OpenStreetMap &copy; CARTO &copy; OpenStreetMap contributors",
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}
