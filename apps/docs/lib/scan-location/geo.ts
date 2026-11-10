// Precise scan location: the pure parts (no server imports), shared by the
// redirect pipeline, the location endpoint, the routing editor and the tests.
//
// Coordinates are rounded to LOCATION_DECIMALS (about 100 m) in the scanner's
// browser before they are sent, and again here before anything is stored or
// compared, so raw high-precision values never reach the database.

/** 3 decimal places: about 111 m of latitude, less of longitude away from the equator. */
export const LOCATION_DECIMALS = 3;
const SCALE = 10 ** LOCATION_DECIMALS;

/** Where browsers post a shared location: same-origin on QRdx and custom domains. */
export const LOCATION_ENDPOINT = "/api/scan-location";

/** Accuracies above this (meters) aren't a location: ignored by the endpoint. */
export const MAX_ACCURACY_M = 100_000;

/** Geofence radius bounds, meters. Below ~100 m the rounding decides the answer. */
export const MIN_GEOFENCE_RADIUS_M = 100;
export const MAX_GEOFENCE_RADIUS_M = 500_000;

/** Mean Earth radius (IUGG), meters. */
const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Rounds to LOCATION_DECIMALS; never returns -0. */
export function roundCoordinate(value: number): number {
  const rounded = Math.round(value * SCALE) / SCALE;
  return rounded === 0 ? 0 : rounded;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isLatitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -90 && value <= 90;

export const isLongitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -180 && value <= 180;

/** A valid point, rounded; null when either coordinate is out of range. */
export function roundedPoint(latitude: unknown, longitude: unknown) {
  if (!(isLatitude(latitude) && isLongitude(longitude))) return null;
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

/** Whole meters, at least 1; null when missing, invalid or above MAX_ACCURACY_M. */
export function normalizeAccuracy(value: unknown): number | null {
  if (!isFiniteNumber(value) || value < 0 || value > MAX_ACCURACY_M) {
    return null;
  }
  return Math.max(1, Math.round(value));
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in meters (haversine). Stable at the poles and for
 * antipodal points: the intermediate value is clamped to [0, 1] so rounding
 * can never produce NaN.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const phi1 = toRadians(a.latitude);
  const phi2 = toRadians(b.latitude);
  const dPhi = phi2 - phi1;
  const dLambda = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(clamped));
}

/** Inside or on the edge of the circle. */
export function withinRadius(
  point: LatLng,
  center: LatLng,
  radiusM: number,
): boolean {
  return distanceMeters(point, center) <= radiusM;
}

const NUMBER = String.raw`[-+]?\d{1,3}(?:[.,]\d+)?`;
const DOT_PAIR = /^([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)$/;
const SPACED_PAIR = new RegExp(`^(${NUMBER})\\s*[;\\s]\\s*(${NUMBER})$`);

const toNumber = (text: string) => Number(text.replace(",", "."));

/**
 * "40.7128, -74.0060" (what map apps copy), "40.7128 -74.0060" or
 * "48,8566; 2,3522" (decimal commas) → a point. Doesn't depend on the
 * browser's locale. Null when it isn't a valid latitude and longitude.
 */
export function parseLatLng(text: string): LatLng | null {
  const value = text
    .trim()
    .replace(/[()[\]°]/g, "")
    .trim();
  const match = DOT_PAIR.exec(value) ?? SPACED_PAIR.exec(value);
  if (!match) return null;
  const latitude = toNumber(match[1] as string);
  const longitude = toNumber(match[2] as string);
  return isLatitude(latitude) && isLongitude(longitude)
    ? { latitude, longitude }
    : null;
}

/** "40.713, -74.006": fixed decimals, never the locale's separators. */
export function formatLatLng(point: LatLng, decimals = 5): string {
  const fixed = (value: number) => Number(value.toFixed(decimals)).toString(10);
  return `${fixed(point.latitude)}, ${fixed(point.longitude)}`;
}

/** "250 m", "1.5 km", "12 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? Number(km.toFixed(1)).toString(10) : Math.round(km).toString(10)} km`;
}

/** A point on OpenStreetMap, for "open in a map" links. */
export function osmUrl(point: LatLng, zoom = 16): string {
  const lat = point.latitude.toString(10);
  const lng = point.longitude.toString(10);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}
