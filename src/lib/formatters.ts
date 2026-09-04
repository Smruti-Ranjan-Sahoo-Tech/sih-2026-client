export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatWind(knots: number): string {
  return `${Math.round(knots)} kt`;
}

export function formatPressure(hpa: number): string {
  return `${Math.round(hpa)} hPa`;
}

export function formatCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}${latDir}, ${Math.abs(lon).toFixed(1)}${lonDir}`;
}

export function windToKmh(knots: number): number {
  return Math.round(knots * 1.852);
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    LOW: "Low Pressure",
    DEPRESSION: "Depression",
    DEEP_DEPRESSION: "Deep Depression",
    CYCLONE: "Cyclonic Storm",
    SEVERE_CYCLONE: "Severe Cyclonic Storm",
    VERY_SEVERE_CYCLONE: "Very Severe Cyclonic Storm",
    SUPER_CYCLONE: "Super Cyclonic Storm",
  };
  return labels[cat] ?? cat;
}

export function trendArrow(trend: string): string {
  if (trend === "increasing" || trend === "strengthening") return "↑";
  if (trend === "decreasing" || trend === "weakening") return "↓";
  if (trend === "rapid_intensification") return "↑↑";
  return "→";
}

export function trendColor(trend: string): string {
  if (trend === "increasing" || trend === "strengthening" || trend === "rapid_intensification")
    return "text-red-600";
  if (trend === "decreasing" || trend === "weakening") return "text-blue-600";
  return "text-slate-500";
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const COASTAL_REF_POINTS: { name: string; lat: number; lon: number }[] = [
  { name: "Odisha Coast (Paradip)", lat: 20.31, lon: 86.61 },
  { name: "West Bengal Coast (Digha)", lat: 21.62, lon: 87.51 },
  { name: "Andhra Coast (Visakhapatnam)", lat: 17.68, lon: 83.21 },
  { name: "Tamil Nadu Coast (Chennai)", lat: 13.08, lon: 80.27 },
  { name: "Gujarat Coast (Veraval)", lat: 20.9, lon: 70.36 },
  { name: "Maharashtra Coast (Mumbai)", lat: 18.96, lon: 72.82 },
  { name: "Kerala Coast (Kochi)", lat: 9.93, lon: 76.26 },
  { name: "Bangladesh Coast (Chittagong)", lat: 22.35, lon: 91.82 },
  { name: "Pakistan Coast (Karachi)", lat: 24.86, lon: 67.0 },
];

export function getNearestCoastInfo(lat: number, lon: number): { name: string; distanceKm: number } {
  let minDistance = Infinity;
  let nearestName = "Nearest Coast";

  for (const coast of COASTAL_REF_POINTS) {
    const dist = haversineKm(lat, lon, coast.lat, coast.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestName = coast.name;
    }
  }

  return { name: nearestName, distanceKm: minDistance };
}

