// Templates of the onboarding (empty database only). Rhythm and category are preset, the amount is
// ALWAYS left empty: the user enters it – Erbse never makes up a number.

import type { Country } from './country';
import type { Frequency } from './types';

export type TemplateCategory = 'wohnen' | 'mobilitaet' | 'versicherungen' | 'gebuehren';

/** Categories the onboarding creates for the chosen templates (all Fixkosten, kind 'expense'). */
export const TEMPLATE_CATEGORIES: Record<TemplateCategory, string> = {
  wohnen: 'Wohnen & Leben',
  mobilitaet: 'Mobilität',
  versicherungen: 'Versicherungen',
  gebuehren: 'Gebühren & Abgaben',
};

export interface Template {
  id: string;
  name: string;
  frequency: Exclude<Frequency, 'once'>;
  category: TemplateCategory;
}

const COMMON: Template[] = [
  { id: 'kfz-versicherung', name: 'Kfz-Versicherung', frequency: 'annual', category: 'versicherungen' },
  { id: 'haushaltsversicherung', name: 'Haushaltsversicherung', frequency: 'annual', category: 'versicherungen' },
  { id: 'strom-jahresabrechnung', name: 'Strom-Jahresabrechnung', frequency: 'annual', category: 'wohnen' },
  { id: 'kontofuehrung', name: 'Kontoführung', frequency: 'quarterly', category: 'gebuehren' },
];

const BY_COUNTRY: Record<Country, Template[]> = {
  AT: [
    { id: 'orf-beitrag', name: 'ORF-Beitrag', frequency: 'quarterly', category: 'gebuehren' },
    { id: 'oeffi-jahreskarte', name: 'Öffi-Jahreskarte', frequency: 'annual', category: 'mobilitaet' },
  ],
  DE: [
    { id: 'rundfunkbeitrag', name: 'Rundfunkbeitrag', frequency: 'quarterly', category: 'gebuehren' },
    { id: 'kfz-steuer', name: 'Kfz-Steuer', frequency: 'annual', category: 'mobilitaet' },
  ],
  CH: [
    { id: 'serafe-abgabe', name: 'Serafe-Abgabe', frequency: 'annual', category: 'gebuehren' },
    { id: 'krankenkassen-franchise', name: 'Krankenkassen-Franchise', frequency: 'annual', category: 'versicherungen' },
  ],
};

/** The templates of a country first, then the ones every country has. */
export function templatesFor(country: Country): Template[] {
  return [...BY_COUNTRY[country], ...COMMON];
}
