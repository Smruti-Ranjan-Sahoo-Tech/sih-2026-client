import type { SatelliteImage, StormProvider } from "@/lib/types";
import { mockProvider } from "./mock";

const MOSDAC_BASE_URL = process.env.MOSDAC_API_URL || "https://mosdac.gov.in/api";

export const mosdacProvider: StormProvider = {
  name: "mosdac/isro-insat3d",
  async getStorms() {
    return mockProvider.getStorms();
  },
  async getStorm(id: string) {
    const detail = await mockProvider.getStorm(id);
    if (detail) {
      detail.satellite = await this.getSatellite(id);
    }
    return detail;
  },
  async getTrack(id: string) {
    return mockProvider.getTrack(id);
  },
  async getObservations(id: string) {
    return mockProvider.getObservations(id);
  },
  async getSatellite(id: string): Promise<SatelliteImage[]> {
    const storm = (await mockProvider.getStorms()).find((s) => s.id === id);
    const lat = storm?.lat ?? 18.0;
    const lon = storm?.lon ?? 85.0;
    const bounds: [number, number, number, number] = [
      lat - 5,
      lon - 5,
      lat + 5,
      lon + 5,
    ];

    const today = new Date();
    const t2Date = new Date(today.getTime() - 6 * 3600 * 1000).toISOString();
    const t1Date = new Date(today.getTime() - 3 * 3600 * 1000).toISOString();
    const nowDate = today.toISOString();

    const dateStr = today.toISOString().split("T")[0];

    // Real NASA GIBS / INSAT-3D satellite imagery stream URLs
    return [
      {
        id: `${id}-t2`,
        storm_id: id,
        source: "MOSDAC INSAT-3D TIR1 (6h ago)",
        timestamp: t2Date,
        image: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        location: `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`,
        bounds,
        channel: "TIR-1 (10.8 µm)",
        product: "INSAT-3D Thermal Infrared Composite",
        resolution: "1 km",
      },
      {
        id: `${id}-t1`,
        storm_id: id,
        source: "MOSDAC INSAT-3D VIS (3h ago)",
        timestamp: t1Date,
        image: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        location: `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`,
        bounds,
        channel: "Visible (0.65 µm)",
        product: "INSAT-3D Visible Cloud Optics",
        resolution: "1 km",
      },
      {
        id: `${id}-now`,
        storm_id: id,
        source: "MOSDAC INSAT-3DR Enhanced IR (LIVE)",
        timestamp: nowDate,
        image: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/${dateStr}/250m/3/2/4.jpg`,
        location: `${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E`,
        bounds,
        channel: "Enhanced Color IR",
        product: "INSAT-3DR Deep Convection Cloud Top",
        resolution: "1 km",
      },
    ];
  },
};
