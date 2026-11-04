// Country of the user: decides the currency and number format (src/lib/format.ts) and the
// templates of the onboarding (src/lib/templates.ts). Stored in meta (no schema change).

export type Country = 'AT' | 'DE' | 'CH';
export const COUNTRIES: Country[] = ['AT', 'DE', 'CH'];
export const DEFAULT_COUNTRY: Country = 'AT';
export const COUNTRY_KEY = 'country';

export const COUNTRY_LABEL: Record<Country, string> = {
  AT: 'Österreich',
  DE: 'Deutschland',
  CH: 'Schweiz',
};

export const COUNTRY_FORMAT: Record<Country, { locale: string; currency: 'EUR' | 'CHF' }> = {
  AT: { locale: 'de-AT', currency: 'EUR' },
  DE: { locale: 'de-DE', currency: 'EUR' },
  CH: { locale: 'de-CH', currency: 'CHF' },
};

export function toCountry(value: unknown): Country {
  return value === 'AT' || value === 'DE' || value === 'CH' ? value : DEFAULT_COUNTRY;
}

export function isCountry(value: unknown): value is Country {
  return value === 'AT' || value === 'DE' || value === 'CH';
}

/** Preselection from the browser language: de-DE → DE, de-CH / fr-CH / it-CH → CH, everything else AT. */
export function countryFromLanguage(languages: readonly string[] | string | undefined): Country {
  const list = typeof languages === 'string' ? [languages] : (languages ?? []);
  for (const lang of list) {
    const region = lang.split('-')[1]?.toUpperCase();
    if (isCountry(region)) return region;
  }
  return DEFAULT_COUNTRY;
}
