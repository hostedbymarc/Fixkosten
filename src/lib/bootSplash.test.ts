import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootCss, bootThemes, renderBootHtml, STARTUP_DEVICES, startupImages } from './bootSplash';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('Start-Bildschirm aus den Tokens (kein Weiß, keine eigenen Farben)', () => {
  const { light, dark } = bootThemes(tokens);

  it('Grundfarbe = --nebel-base hell und dunkel; Logo = --c-mark (brand-500 / brand-300)', () => {
    expect(light.base).toBe('#f4f5f1');
    expect(dark.base).toBe('#121612');
    expect(light.mark).toEqual([90, 122, 46]); // brand-500
    expect(dark.mark).toEqual([167, 192, 124]); // brand-300
    expect(light.meshAlpha).toBe(1);
    expect(dark.meshAlpha).toBeLessThan(1);
  });

  it('jede Farbe im Inline-CSS stammt aus den Tokens', () => {
    const allowed = new Set(
      [light, dark].flatMap((t) => [channels(t.base), t.mark, ...Object.values(t.mesh)]).map((c) => c.join(' ')),
    );
    const css = bootCss(tokens);
    const used = [...css.matchAll(/rgb\((\d+) (\d+) (\d+)/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    const hex = [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => channels(m[0]).join(' '));
    expect(used.length).toBeGreaterThan(20);
    for (const c of [...used, ...hex]) expect(allowed.has(c), c).toBe(true);
  });

  it('html und body haben sofort die Grundfarbe; hell und dunkel per prefers-color-scheme und data-theme', () => {
    const css = bootCss(tokens);
    expect(css).toContain('html,body{margin:0;background-color:var(--boot-base)}');
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme='light'])");
    expect(css).toContain(":root[data-theme='dark']");
  });

  it('index.html: alle Platzhalter gefüllt, theme-color je Theme', () => {
    const out = renderBootHtml(html, tokens);
    expect(out).not.toMatch(/%BOOT_|<!-- boot:/);
    expect(out).toContain('<meta name="theme-color" content="#f4f5f1" media="(prefers-color-scheme: light)" />');
    expect(out).toContain('<meta name="theme-color" content="#121612" media="(prefers-color-scheme: dark)" />');
    expect(out).toContain('<style id="boot-css">');
    // the start screen needs no script: the logo is markup
    expect(html).toMatch(/<div id="splash"[\s\S]*<svg class="splash-mark"[\s\S]*<circle[\s\S]*<circle[\s\S]*<circle/);
  });
});

describe('iOS-Startbilder', () => {
  const images = startupImages();

  it('alle iPhones hoch, alle iPads hoch und quer, hell und dunkel; dunkel zuerst mit Bedingung, hell danach ohne', () => {
    const phones = STARTUP_DEVICES.filter((d) => !d.ipad).length;
    const pads = STARTUP_DEVICES.filter((d) => d.ipad).length;
    expect(images).toHaveLength(2 * (phones + 2 * pads));
    expect(new Set(images.map((i) => i.href)).size).toBe(images.length);
    const firstLight = images.findIndex((i) => i.scheme === 'light');
    expect(images.slice(0, firstLight).every((i) => i.media.endsWith('and (prefers-color-scheme: dark)'))).toBe(true);
    expect(images.slice(firstLight).every((i) => !i.media.includes('prefers-color-scheme'))).toBe(true);
    for (const d of STARTUP_DEVICES.filter((x) => x.ipad)) {
      expect(images.filter((i) => i.device === d).map((i) => i.orientation).sort()).toEqual(['landscape', 'landscape', 'portrait', 'portrait']);
    }
  });

  it('jedes Startbild liegt in public/startup in Gerätepixeln (Skript nach Änderungen ausführen)', () => {
    for (const img of images) {
      const file = new URL(`../../public${img.href}`, import.meta.url);
      expect(existsSync(file), `${img.href} fehlt: node scripts/make-startup-images.mjs`).toBe(true);
      const png = readFileSync(file);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], img.href).toEqual([img.width * img.device.dpr, img.height * img.device.dpr]);
    }
  });
});
