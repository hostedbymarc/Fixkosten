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

// ---------------------------------------------------------------------------
// Visible choice: only the currency. The country stays internal (number format, order of the
// templates) and follows from the currency and the browser language; no schema change.

export type Currency = 'EUR' | 'CHF';
export const CURRENCIES: Currency[] = ['EUR', 'CHF'];
export const CURRENCY_LABEL: Record<Currency, string> = {
  EUR: 'Euro (€)',
  CHF: 'Schweizer Franken (CHF)',
};

export function currencyOf(country: Country): Currency {
  return COUNTRY_FORMAT[country].currency;
}

/** The browser languages (navigator.languages, else navigator.language); empty outside a browser. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/**
 * Internal country for a chosen currency: CHF → CH; EUR → the euro country of the browser language
 * (de-DE → DE, de-AT and everything else → AT), so de-AT gets the AT templates first.
 */
export function countryForCurrency(currency: Currency, languages: readonly string[] | string | undefined): Country {
  if (currency === 'CHF') return 'CH';
  const fromLanguage = countryFromLanguage(languages);
  return fromLanguage === 'CH' ? DEFAULT_COUNTRY : fromLanguage;
}
