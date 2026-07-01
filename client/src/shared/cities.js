export const ROYAL_CITIES = [
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
];

export const MARKET_CITIES = [...ROYAL_CITIES, "Black Market", "Brecilien"];

export const CITY_COLORS = {
  "Fort Sterling": "#ffffff",
  Caerleon: "#ef4444",
  Thetford: "#a855f7",
  Lymhurst: "#22c55e",
  Bridgewatch: "#eab308",
  Martlock: "#3b82f6",
  "Black Market": "#64748b",
  Brecilien: "#14b8a6",
};

export function getCityColor(city, fallback = "#94a3b8") {
  if (!city) return fallback;
  return CITY_COLORS[city] || fallback;
}
