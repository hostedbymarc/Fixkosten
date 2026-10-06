import { formatDate } from './format';

declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;

/** 'Version 86853e8 · 06.10.2026' (local builds: 'Version dev · …'). */
export function versionLabel(): string {
  return `Version ${__APP_COMMIT__} · ${formatDate(__APP_BUILD_DATE__)}`;
}
