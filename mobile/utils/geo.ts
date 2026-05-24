import { Branch, NearbyBranch } from '../types';

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestBranches(
  coords: { lat: number; lng: number },
  branches: Branch[],
  radiusMiles: number,
  limit: number,
): NearbyBranch[] {
  return branches
    .map(b => ({ ...b, distance: haversineDistance(coords.lat, coords.lng, b.lat, b.lng) }))
    .filter(b => b.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
