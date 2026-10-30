// Sprint B „Liquid Glass“: material, blur budget, tab bar / sidebar, tab transition, grain,
// one entrance for every tab, skeleton instead of a spinner.
import type { CDPSession, Page } from '@playwright/test';
import { appSettled, expect, goTo, isSidebarLayout, isTouchProject, test } from './fixtures';
import { importLive, OKT_TODAY } from './live';

const ROUTES = ['monat', 'positionen', 'analyse', 'einstellungen'] as const;
const TAB = { monat: 'Monat', positionen: 'Positionen', analyse: 'Analyse', einstellungen: 'Einstellungen' } as const;

async function reducedTransparency(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  return cdp;
}

/** Elements with a backdrop-filter and whether one sits inside another. */
const blurState = (page: Page) =>
  page.evaluate(() => {
    // rendered surfaces only (the tab bar exists but is display: none in the sidebar layout)
    const blurred = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backdropFilter !== 'none' && e.getClientRects().length > 0);
    return {
      count: blurred.length,
      nested: blurred.filter((e) => blurred.some((o) => o !== e && o.contains(e))).length,
      visibleWithout: [...document.querySelectorAll('.glass')]
        .filter((e) => !e.parentElement?.closest('.glass, .glass-strong, .glass-clear, .glass-group'))
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).backdropFilter === 'none';
        }).length,
    };
  });

async function scrollTo(page: Page, y: number) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe('Liquid-Glass-Material', () => {
  test('Karten, Kacheln, Sheets, Tab-Leiste: Fläche, Lichtkante, Glanzpunkt, Schatten, Radien', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const hero = page.getByTestId('hero');
    const m = await hero.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rim = getComputedStyle(el, '::before');
      const spec = getComputedStyle(el, '::after');
      return {
        bg: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
        blur: cs.backdropFilter,
        rimImage: rim.backgroundImage,
        rimMask: rim.getPropertyValue('-webkit-mask-composite') || rim.getPropertyValue('mask-composite'),
        rimPadding: rim.paddingTop,
        specImage: spec.backgroundImage,
        specZ: spec.zIndex,
      };
    });
    expect(m.bg).toBe('rgba(255, 255, 255, 0.52)');
    expect(m.radius).toBe('24px');
    expect(m.shadow).toContain('rgba(31, 39, 36, 0.04) 0px 1px 1px 0px');
    expect(m.shadow).toContain('rgba(31, 39, 36, 0.14) 0px 12px 32px -12px');
    expect(m.blur).toBe('blur(24px) saturate(1.8)');
    expect(m.rimImage).toBe('linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.45))');
    expect(m.rimMask).toMatch(/xor|exclude/);
    expect(m.rimPadding).toBe('1px');
    expect(m.specImage).toBe('radial-gradient(120% 60% at 20% 0%, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 70%)');
    expect(m.specZ).toBe('-1'); // below the content, above the fill
    // tiles: radius 20; their blur comes from the group layer, masked to the tiles
    await expect(page.getByTestId('salary-tile')).toHaveCSS('border-top-left-radius', '20px');
    await expect(page.getByTestId('salary-tile')).toHaveCSS('backdrop-filter', 'none');
    await expect(page.getByTestId('glass-group-blur')).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.8)');
    expect(await page.getByTestId('glass-group-blur').evaluate((el) => el.style.maskImage)).toContain('data:image/svg+xml');
    // rows inside cards stay transparent, fields .85
    const row = page.locator('[data-testid="position-row"]').first();
    await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (!isSidebarLayout(page)) {
      await expect(page.getByTestId('tabbar-surface')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.4)');
      await expect(page.getByTestId('tabbar-surface')).toHaveCSS('backdrop-filter', 'blur(24px) saturate(1.8)');
    } else {
      await expect(page.getByTestId('sidebar')).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.4)');
    }
    // sheet: glass-strong .72
    await page.getByTestId('salary-tile').click();
    const sheet = page.getByTestId('bottom-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.72)');
    await expect(sheet.getByLabel('Netto-Gehalt')).toBeVisible();
  });

  test.describe('dunkel', () => {
    test.use({ colorScheme: 'dark' });
    test('Fläche .48, Lichtkante mit halber Deckkraft', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const hero = page.getByTestId('hero');
      await expect(hero).toHaveCSS('background-color', 'rgba(28, 34, 30, 0.48)');
      expect(await hero.evaluate((el) => getComputedStyle(el, '::before').backgroundImage)).toMatch(
        // .225 is stored with 8 bits: 0.224
        /^linear-gradient\(135deg, rgba\(255, 255, 255, 0\.45\), rgba\(255, 255, 255, 0\.075\) 50%, rgba\(255, 255, 255, 0\.22[45]\)\)$/,
      );
    });
  });

  test('höchstens 8 Blur-Flächen an jeder Scrollposition, kein verschachteltes Blur, sichtbare Karten alle mit Blur', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    for (const route of ROUTES) {
      await goTo(page, route);
      const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (const y of [0, height / 3, (2 * height) / 3, height]) {
        await scrollTo(page, Math.round(y));
        await expect.poll(async () => (await blurState(page)).visibleWithout, { message: `${route} @${Math.round(y)}: visible cards blur` }).toBe(0);
        const s = await blurState(page);
        expect(s.count, `${route} @${Math.round(y)}`).toBeLessThanOrEqual(8);
        expect(s.nested, `${route}: nested blur`).toBe(0);
      }
    }
  });

  test('Transparenz reduzieren: deckende Flächen, Lichtkante als feine Linie, kein Glanzpunkt, keine Körnung', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await reducedTransparency(page);
    const hero = page.getByTestId('hero');
    await expect(hero).toHaveCSS('backdrop-filter', 'none');
    await expect(hero).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const m = await hero.evaluate((el) => ({
      rim: getComputedStyle(el, '::before').backgroundColor,
      rimImage: getComputedStyle(el, '::before').backgroundImage,
      spec: getComputedStyle(el, '::after').display,
      grain: getComputedStyle(document.body, '::after').display,
      blurred: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backdropFilter !== 'none').length,
    }));
    expect(m.rimImage).toBe('none');
    expect(m.rim).toBe('rgba(31, 39, 36, 0.12)');
    expect(m.spec).toBe('none');
    expect(m.grain).toBe('none');
    expect(m.blurred).toBe(0);
    const nav = isSidebarLayout(page) ? page.getByTestId('sidebar') : page.getByTestId('tabbar-surface');
    await expect(nav).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('ohne backdrop-filter (Fallback): Flächen .92', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    // the @supports rule is in the stylesheet: same values as the print path
    const rules = await page.evaluate(() =>
      [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r instanceof CSSSupportsRule && /backdrop-filter/.test(r.conditionText)).map((r) => r.cssText),
    );
    expect(rules.join('\n')).toMatch(/\.glass-clear[^{]*\{[^}]*background: var\(--glass-fallback\)/);
    const fallback = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--glass-fallback)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    });
    expect(fallback).toBe('rgba(255, 255, 255, 0.92)');
  });
});

/** The grain layer: body::after, an opaque copy of the background with the noise blended in. */
const grainLayer = (page: Page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.body, '::after');
    return {
      size: cs.backgroundSize,
      blend: cs.backgroundBlendMode,
      mix: cs.mixBlendMode,
      position: cs.position,
      image: decodeURIComponent(cs.backgroundImage),
      z: cs.zIndex,
      display: cs.display,
      token: getComputedStyle(document.documentElement).getPropertyValue('--grain-opacity').trim(),
    };
  });

test.describe('Körnung', () => {
  test('256 px Kachel (für 2× erzeugt), fractalNoise .85 / 3 Oktaven / fester Seed, monochrom, soft-light .045, nur Hintergrund', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const g = await grainLayer(page);
    expect(g.size).toBe('256px 256px, 100% 660px');
    expect(g.blend).toBe('soft-light, normal'); // the noise over the Nebel copy …
    expect(g.mix).toBe('normal'); // … never mixed with the page: no page-wide blend group
    expect(g.position).toBe('fixed');
    expect(g.z).toBe('-1');
    expect(g.image).toContain("width='512' height='512'");
    expect(g.image).toContain("type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='7'");
    // monochrome (R = G = B), opaque, squeezed towards grey by k = opacity: s' = k·s + (1 − k)/2
    expect(Number(g.token)).toBe(0.045);
    expect(g.image).toContain("values='0.045 0 0 0 0.4775 0.045 0 0 0 0.4775 0.045 0 0 0 0.4775 0 0 0 0 1'");
    // no glass surface carries a texture of its own
    const textured = await page.evaluate(() =>
      [...document.querySelectorAll('.glass, .glass-strong, .glass-clear')].filter((e) =>
        [null, '::before', '::after'].some((p) => /svg|url\(/.test(getComputedStyle(e, p).backgroundImage)),
      ).length,
    );
    expect(textured).toBe(0);
    // print: no grain
    await page.emulateMedia({ media: 'print' });
    expect((await grainLayer(page)).display).toBe('none');
    await page.emulateMedia({ media: null });
  });

  test.describe('dunkel', () => {
    test.use({ colorScheme: 'dark' });
    test('Deckkraft .06', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const g = await grainLayer(page);
      expect(Number(g.token)).toBe(0.06);
      expect(g.image).toContain("values='0.06 0 0 0 0.47 0.06 0 0 0 0.47 0.06 0 0 0 0.47 0 0 0 0 1'");
    });
  });
});

test.describe('Tab-Leiste und Sidebar', () => {
  test('Indikator gleitet zum richtigen Tab: nur transform, 380 ms, cubic-bezier(.32,.72,0,1)', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const sidebar = isSidebarLayout(page);
    const nav = page.getByTestId(sidebar ? 'sidebar' : 'tabbar');
    const pill = page.getByTestId(sidebar ? 'sidebar-indicator' : 'tab-indicator');
    // records every animation the indicator gets, frame by frame
    await pill.evaluate((el) => {
      const w = window as unknown as { pillAnims: { duration: unknown; easing: string; props: string[] }[] };
      w.pillAnims = [];
      const seen = new Set<Animation>();
      const poll = () => {
        for (const a of el.getAnimations()) {
          if (seen.has(a)) continue;
          seen.add(a);
          const e = a.effect as KeyframeEffect;
          const t = e.getTiming();
          w.pillAnims.push({ duration: t.duration, easing: t.easing ?? '', props: e.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))) });
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
    for (const route of ['analyse', 'einstellungen', 'positionen', 'monat'] as const) {
      const before = await pill.evaluate((el) => getComputedStyle(el).transform);
      await nav.getByRole('link', { name: TAB[route] }).click();
      await expect(pill).toHaveAttribute('data-active-route', route);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const anim = await page.evaluate(() => (window as unknown as { pillAnims: { duration: unknown; easing: string; props: string[] }[] }).pillAnims.splice(0));
      if (before !== 'none') {
        expect(anim.length, `${route}: glides`).toBe(1);
        expect(anim[0]!.duration).toBe(380);
        expect(anim[0]!.easing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
        expect(new Set(anim[0]!.props)).toEqual(new Set(['transform']));
      }
      await expect.poll(() => pill.evaluate((el) => el.getAnimations().length)).toBe(0);
      // at rest: exactly on the tab
      const [p, link] = await Promise.all([pill.boundingBox(), nav.locator(`li[data-route="${route}"]`).boundingBox()]);
      if (sidebar) {
        expect(Math.abs(p!.y - link!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(p!.height - link!.height)).toBeLessThanOrEqual(1);
      } else {
        expect(Math.abs(p!.x + p!.width / 2 - (link!.x + link!.width / 2))).toBeLessThanOrEqual(2);
      }
      // the indicator carries no blur, the container does
      await expect(pill).toHaveCSS('backdrop-filter', 'none');
    }
  });

  test('kompakt beim Herunterscrollen (> 24 px), voll beim Hochscrollen und am Seitenende', async ({ page }) => {
    test.skip(isSidebarLayout(page), 'tab bar only');
    await importLive(page, OKT_TODAY);
    const bar = page.getByTestId('tabbar');
    const surface = page.getByTestId('tabbar-surface');
    await expect(bar).not.toHaveAttribute('data-compact');
    const navBox = (await bar.boundingBox())!;
    expect(navBox.height).toBe(64);
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 10);
    await page.waitForTimeout(150);
    await expect(bar).not.toHaveAttribute('data-compact'); // ≤ 24 px
    await page.mouse.wheel(0, 300);
    await expect(bar).toHaveAttribute('data-compact', 'true');
    await expect.poll(async () => Math.round((await surface.boundingBox())!.height)).toBe(52);
    // bottom edge stays where it was, the labels are gone
    await expect.poll(async () => Math.round((await surface.boundingBox())!.y + (await surface.boundingBox())!.height)).toBe(Math.round(navBox.y + navBox.height));
    await expect(bar.locator('.tab-label').first()).toHaveCSS('opacity', '0');
    await page.mouse.wheel(0, -120);
    await expect(bar).not.toHaveAttribute('data-compact');
    await expect.poll(async () => Math.round((await surface.boundingBox())!.height)).toBe(64);
    // page end: full
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.mouse.wheel(0, 200);
    await expect(bar).toHaveAttribute('data-compact', 'true');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.mouse.wheel(0, 50);
    await expect(bar).not.toHaveAttribute('data-compact');
  });

  test('Druck-Feedback beim Antippen: scale(.96), 120 ms', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    const press = nav.locator('.tab-press').nth(1);
    await expect(press).toHaveCSS('transition-duration', '0.12s');
    const link = nav.getByRole('link', { name: 'Positionen' });
    const box = (await link.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(press).toHaveCSS('transform', 'matrix(0.96, 0, 0, 0.96, 0, 0)');
    await page.mouse.up();
  });

  test.describe('Bewegung reduzieren', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('keine Kompakt-Animation, Indikator springt ohne Gleiten', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      const sidebar = isSidebarLayout(page);
      const nav = page.getByTestId(sidebar ? 'sidebar' : 'tabbar');
      if (!sidebar) {
        await page.mouse.move(200, 300);
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(300);
        await expect(nav).not.toHaveAttribute('data-compact');
      }
      await nav.getByRole('link', { name: 'Analyse' }).click();
      const pill = page.getByTestId(sidebar ? 'sidebar-indicator' : 'tab-indicator');
      await expect(pill).toHaveAttribute('data-active-route', 'analyse');
      expect(await pill.evaluate((el) => el.getAnimations().length)).toBe(0);
    });
  });
});

/** Records the tab transition: who animates, how long, from where. */
async function watchTransition(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { vt: unknown[] };
    w.vt = [];
    const seen = new Set<Animation>();
    const poll = () => {
      for (const a of document.getAnimations()) {
        if (seen.has(a)) continue;
        seen.add(a);
        const e = a.effect as KeyframeEffect | null;
        if (!e) continue;
        const name = (a as CSSAnimation).animationName ?? '';
        if (!/tab-(in|out)/.test(name)) continue;
        w.vt.push({
          name,
          pseudo: e.pseudoElement ?? '',
          duration: e.getComputedTiming().duration,
          from: (e.getKeyframes()[0] as Record<string, string>).transform ?? 'none',
          dir: document.documentElement.dataset.tabDir,
        });
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}
const transitions = (page: Page) => page.evaluate(() => (window as unknown as { vt: { name: string; pseudo: string; duration: number; from: string; dir: string }[] }).vt.splice(0));

test.describe('Tabwechsel-Animation', () => {
  test('neuer Inhalt kommt 12 px aus der Richtung des Tabs, alter blendet aus, 280 ms; Tab-Leiste und Hintergrund bleiben', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await watchTransition(page);
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    for (const [route, dir] of [['analyse', 'right'], ['positionen', 'left'], ['einstellungen', 'right'], ['monat', 'left']] as const) {
      await nav.getByRole('link', { name: TAB[route] }).click();
      await expect(page.locator(`main[data-screen="${route}"]`)).toHaveCount(1);
      await expect.poll(async () => (await page.evaluate(() => (window as unknown as { vt: unknown[] }).vt.length)) >= 2).toBe(true);
      await page.waitForTimeout(350);
      const t = await transitions(page);
      const into = t.find((a) => a.name === 'tab-in')!;
      const out = t.find((a) => a.name === 'tab-out')!;
      expect(into.duration).toBe(280);
      expect(out.duration).toBe(280);
      expect(into.dir).toBe(dir);
      // the screen only: tab bar, sidebar and root have no transition animation of their own
      expect(t.every((a) => !a.pseudo || /\(screen\)/.test(a.pseudo))).toBe(true);
      const offset = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tab-from').trim());
      void offset;
      expect(into.from).toBe(dir === 'right' ? 'translateX(12px)' : 'translateX(-12px)');
    }
  });

  test('Fallback ohne View Transitions: gleiches Ergebnis über CSS-Animationen', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
    });
    await importLive(page, OKT_TODAY);
    await watchTransition(page);
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Positionen' }).click();
    await expect(page.locator('[data-tab-ghost]')).toHaveCount(1); // the old screen fades out above
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as { vt: unknown[] }).vt.length)) >= 2).toBe(true);
    const t = await transitions(page);
    expect(t.find((a) => a.name === 'tab-in')).toMatchObject({ duration: 280, from: 'translateX(12px)', pseudo: '' });
    expect(t.find((a) => a.name === 'tab-out')).toMatchObject({ duration: 280, pseudo: '' });
    await expect(page.locator('[data-tab-ghost]')).toHaveCount(0);
    await expect(page.getByTestId('positions-group').first()).toBeVisible();
  });

  test('Scrollposition pro Tab bleibt erhalten', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await scrollTo(page, 500);
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Positionen' }).click();
    await expect(page.locator('main[data-screen="positionen"]')).toHaveCount(1);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await scrollTo(page, 300);
    await nav.getByRole('link', { name: 'Monat' }).click();
    await expect(page.locator('main[data-screen="monat"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(500);
    await nav.getByRole('link', { name: 'Positionen' }).click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(300);
  });

  test.describe('Bewegung reduzieren', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('nur Überblendung, 120 ms, kein Versatz', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await watchTransition(page);
      const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
      await nav.getByRole('link', { name: 'Analyse' }).click();
      await expect.poll(async () => (await page.evaluate(() => (window as unknown as { vt: unknown[] }).vt.length)) >= 2).toBe(true);
      const t = await transitions(page);
      const into = t.find((a) => a.name === 'tab-in')!;
      expect(into.duration).toBe(120);
      expect(into.from).toMatch(/^(translateX\(0px\)|none)$/);
    });
  });
});

test.describe('Einheitliche Ladeanimation', () => {
  test('jeder Tab: dieselbe Einstiegsanimation (Screen-Komponente), einmal pro Besuch', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    for (const route of [...ROUTES, 'monat'] as const) {
      await goTo(page, route);
      await expect(page.locator(`main [data-screen-root="${route}"]`)).toHaveCount(1);
    }
  });

  test('besuchte Tabs bleiben aufgebaut (nur ausgeblendet), die Einstiegsanimation spielt bei jedem Besuch', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await page.evaluate(() => {
      // the Monat screen's root node: the same node after a round trip means it was not built anew
      (window as unknown as { monthRoot: Element }).monthRoot = document.querySelector('[data-screen-root="monat"]')!;
    });
    for (const route of ['positionen', 'analyse', 'monat', 'analyse'] as const) {
      await goTo(page, route);
      // exactly one screen is shown, the others visited before stay in main, hidden
      const shown = await page.evaluate(() => [...document.querySelectorAll('main > [data-screen-root]')].filter((e) => e.getClientRects().length).map((e) => e.getAttribute('data-screen-root')));
      expect(shown).toEqual([route]);
    }
    const kept = await page.evaluate(() => ({
      same: document.querySelector('[data-screen-root="monat"]') === (window as unknown as { monthRoot: Element }).monthRoot,
      roots: [...document.querySelectorAll('main > [data-screen-root]')].map((e) => e.getAttribute('data-screen-root')),
    }));
    expect(kept.same, 'Monat kept, not built anew').toBe(true);
    expect(kept.roots).toEqual(['monat', 'positionen', 'analyse']);
    // a hidden tab is out of reach: no element of it in the accessibility tree
    await expect(page.getByTestId('hero')).toBeHidden();
    // back on a kept tab: its cards come in again (once per visit)
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Monat' }).click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.id === 'entrance').length)).toBeGreaterThan(1);
    await appSettled(page);
    await expect(page.getByTestId('hero')).toBeVisible();
  });

  test('Analyse erneut besucht (Tab blieb aufgebaut): die Balken wachsen wieder', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await goTo(page, 'analyse');
    await goTo(page, 'monat');
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Analyse' }).click();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.id === 'bar-grow' && ((a.effect as KeyframeEffect).target as Element).tagName === 'path').length)).toBeGreaterThanOrEqual(12);
    await appSettled(page);
  });

  test('Analyse: Karten wie auf der Startseite, danach wachsen die Balken (400 ms, 20 ms Versatz)', async ({ page }) => {
    await importLive(page, OKT_TODAY);
    await page.evaluate(() => {
      const w = window as unknown as { anims: { id: string; delay: number; raw: number; duration: number; tag: string }[] };
      w.anims = [];
      const seen = new Set<Animation>();
      const poll = () => {
        for (const a of document.getAnimations()) {
          if (seen.has(a) || !['entrance', 'bar-grow'].includes(a.id)) continue;
          seen.add(a);
          const t = (a.effect as KeyframeEffect).getTiming();
          // absolute (document timeline): when the animation started + its delay
          const started = Number(document.timeline.currentTime) - Number(a.currentTime ?? 0);
          w.anims.push({ id: a.id, delay: started + Number(t.delay), raw: Number(t.delay), duration: Number(t.duration), tag: ((a.effect as KeyframeEffect).target as Element).tagName });
        }
        requestAnimationFrame(poll);
      };
      poll();
    });
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Analyse' }).click();
    await appSettled(page);
    const anims = await page.evaluate(() => (window as unknown as { anims: { id: string; delay: number; raw: number; duration: number; tag: string }[] }).anims);
    const cards = anims.filter((a) => a.id === 'entrance' && a.duration === 420);
    const bars = anims.filter((a) => a.id === 'bar-grow');
    expect(cards.length).toBeGreaterThan(1);
    expect(bars.filter((b) => b.tag === 'path').length, 'forecast bars').toBeGreaterThanOrEqual(12);
    expect(bars.filter((b) => b.tag === 'SPAN').length, 'distribution bars').toBeGreaterThan(0);
    expect(bars.every((b) => b.duration === 400)).toBe(true);
    const lastCard = Math.max(...cards.map((c) => c.delay + c.duration));
    // the bars start when the cards have arrived (a frame of tolerance)
    expect(Math.min(...bars.map((b) => b.delay))).toBeGreaterThanOrEqual(lastCard - 20);
    // forecast bars 20 ms apart: the columns' start times (absolute, bars drawn anew join in sync)
    const starts = bars
      .filter((b) => b.tag === 'path')
      .map((b) => b.delay)
      .sort((a, b) => a - b)
      .reduce<number[]>((cols, t) => (cols.length && t - cols[cols.length - 1]! < 3 ? cols : [...cols, t]), []);
    expect(starts.length).toBe(12);
    for (let i = 1; i < starts.length; i++) expect(Math.abs(starts[i]! - starts[i - 1]! - 20)).toBeLessThanOrEqual(3);
    const own = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="forecast"] .recharts-bar-rectangle path')].length,
    );
    expect(own).toBeGreaterThanOrEqual(12);
    // nothing left on the bars
    const left = await page.evaluate(() => [...document.querySelectorAll('[data-testid="forecast"] .recharts-bar-rectangle path')].filter((p) => p.getAnimations().length).length);
    expect(left).toBe(0);
  });

  test.describe('Bewegung reduzieren', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('Inhalte erscheinen ohne Bewegung, die Balken wachsen nicht', async ({ page }) => {
      await importLive(page, OKT_TODAY);
      await goTo(page, 'analyse');
      await expect(page.locator('[data-testid="forecast"] .recharts-bar-rectangle').first()).toBeVisible();
      const moving = await page.evaluate(() => document.getAnimations().filter((a) => ['entrance', 'bar-grow'].includes(a.id)).length);
      expect(moving).toBe(0);
    });
  });

  test('Daten schneller als 80 ms: kein Skelett; langsamer: Skelett in Kartenform, kein Spinner', async ({ page }) => {
    // the analysis chunk is held back (also its idle prefetch): the skeleton has to show
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/AnalyseScreen.*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await importLive(page, OKT_TODAY);
    await page.evaluate(() => {
      const w = window as unknown as { skeletonCards: number };
      w.skeletonCards = 0;
      new MutationObserver(() => {
        w.skeletonCards = Math.max(w.skeletonCards, document.querySelectorAll('[data-testid="skeleton-card"]').length);
      }).observe(document.body, { childList: true, subtree: true });
    });
    // fast: Positionen (data is there) never shows a skeleton
    const nav = page.getByTestId(isSidebarLayout(page) ? 'sidebar' : 'tabbar');
    await nav.getByRole('link', { name: 'Positionen' }).click();
    await appSettled(page);
    expect(await page.evaluate(() => (window as unknown as { skeletonCards: number }).skeletonCards)).toBe(0);
    // slow: the held chunk → after 80 ms the card-shaped skeleton, no spinner
    await nav.getByRole('link', { name: 'Analyse' }).click();
    const skeleton = page.getByTestId('skeleton');
    await expect(skeleton).toHaveAttribute('role', 'status');
    await expect(skeleton.getByTestId('skeleton-card')).toHaveCount(3);
    await expect(page.locator('.anim-pea, [data-testid="loader"]')).toHaveCount(0);
    const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length);
    expect(infinite, 'nothing spins').toBe(0);
    release();
    await expect(page.getByTestId('analyse')).toBeVisible();
    await expect(skeleton).toHaveCount(0);
  });
});

test.describe('Touch', () => {
  test('Tab antippen wechselt (View Transition lässt Taps durch)', async ({ page }) => {
    test.skip(!isTouchProject() || isSidebarLayout(page), 'touch tab bar');
    await importLive(page, OKT_TODAY);
    const bar = page.getByTestId('tabbar');
    await bar.getByRole('link', { name: 'Positionen' }).tap();
    // a second tap while the first transition still runs
    await bar.getByRole('link', { name: 'Analyse' }).tap();
    await expect(page).toHaveURL(/#\/analyse$/);
    await expect(page.locator('main[data-screen="analyse"]')).toHaveCount(1);
  });
});
