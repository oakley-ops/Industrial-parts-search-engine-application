import { haversineDistance, nearestBranches } from './geo';
import { Branch } from '../types';

const chicago: Branch = {
  vendor: 'grainger', name: 'Grainger Chicago', city: 'Chicago', state: 'IL',
  lat: 41.8781, lng: -87.6298, url: 'https://www.grainger.com/store-locator?zip=60601',
};
const la: Branch = {
  vendor: 'grainger', name: 'Grainger LA', city: 'Los Angeles', state: 'CA',
  lat: 34.0522, lng: -118.2437, url: 'https://www.grainger.com/store-locator?zip=90012',
};
const nyc: Branch = {
  vendor: 'motion', name: 'Motion NYC', city: 'New York', state: 'NY',
  lat: 40.7128, lng: -74.0060, url: 'https://www.motionindustries.com/location-finder?zip=10001',
};

describe('haversineDistance', () => {
  it('returns ~2451 miles between NYC and LA', () => {
    const d = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance(41.8781, -87.6298, 41.8781, -87.6298)).toBe(0);
  });
});

describe('nearestBranches', () => {
  const coords = { lat: 41.8500, lng: -87.6500 }; // near Chicago

  it('returns branches within radius, sorted nearest-first', () => {
    const result = nearestBranches(coords, [chicago, la, nyc], 100, 5);
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Chicago');
    expect(result[0].distance).toBeGreaterThan(0);
    expect(result[0].distance).toBeLessThan(5);
  });

  it('respects the limit', () => {
    const result = nearestBranches(coords, [chicago, la, nyc], 5000, 1);
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Chicago');
  });

  it('returns empty array when no branches within radius', () => {
    const result = nearestBranches(coords, [la, nyc], 50, 5);
    expect(result).toHaveLength(0);
  });

  it('sorts by distance ascending', () => {
    const result = nearestBranches(coords, [nyc, chicago, la], 5000, 3);
    expect(result[0].city).toBe('Chicago');
    expect(result[1].city).toBe('New York');
    expect(result[2].city).toBe('Los Angeles');
  });
});
