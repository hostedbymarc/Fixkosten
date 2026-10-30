import type { ComponentType } from 'react';
import { CalendarIcon, ChartIcon, ListIcon, SettingsIcon } from '../components/Icons';

export type Route = 'monat' | 'positionen' | 'analyse' | 'einstellungen';

/** The four tabs, left to right (tab bar) and top to bottom (sidebar). */
export const NAV: { route: Route; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { route: 'monat', label: 'Monat', icon: CalendarIcon },
  { route: 'positionen', label: 'Positionen', icon: ListIcon },
  { route: 'analyse', label: 'Analyse', icon: ChartIcon },
  { route: 'einstellungen', label: 'Einstellungen', icon: SettingsIcon },
];

export function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return NAV.some((n) => n.route === hash) ? (hash as Route) : 'monat';
}

export const routeIndex = (r: Route) => NAV.findIndex((n) => n.route === r);
