import * as Localization from 'expo-localization';
import * as Location from 'expo-location';

export const DOMESTIC_VENDORS: Record<string, string[]> = {
  US: ['grainger', 'mcmaster', 'motion', 'digikey'],
  CA: ['grainger', 'motion'],
};

export function isDomestic(vendorSlug: string, countryCode: string | null): boolean {
  if (!countryCode) return false;
  return (DOMESTIC_VENDORS[countryCode] ?? []).includes(vendorSlug);
}

export function getCountryCode(): string | null {
  return Localization.getLocales()[0]?.regionCode ?? null;
}

let cachedCoords: { lat: number; lng: number } | null | undefined = undefined;

export async function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (cachedCoords !== undefined) return cachedCoords;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      cachedCoords = null;
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    cachedCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    return cachedCoords;
  } catch {
    cachedCoords = null;
    return null;
  }
}
