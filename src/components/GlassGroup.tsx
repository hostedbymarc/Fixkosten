import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Tiles that sit side by side share ONE blur surface: a layer behind them, masked to the tiles'
 * rounded rectangles (an SVG mask rebuilt when the layout changes). The tiles themselves keep fill,
 * rim and specular but no blur of their own – the screen stays within the blur budget
 * (src/lib/glassBudget.ts) and looks exactly as if every tile blurred.
 */
export function GlassGroup({ className = '', children }: { className?: string; children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = group.current;
    const blur = layer.current;
    if (!el || !blur) return;
    const update = () => {
      const box = { width: el.offsetWidth, height: el.offsetHeight };
      const tiles = [...el.querySelectorAll<HTMLElement>('.glass')];
      const rects = tiles
        .map((t) => {
          if (!t.offsetWidth) return '';
          // layout position (offset chain up to the group): a tile still rising in its entrance does not move the mask
          let x = 0;
          let y = 0;
          for (let n: HTMLElement | null = t; n && n !== el; n = n.offsetParent as HTMLElement | null) {
            x += n.offsetLeft;
            y += n.offsetTop;
          }
          const rx = parseFloat(getComputedStyle(t).borderTopLeftRadius) || 0;
          return `<rect x="${x}" y="${y}" width="${t.offsetWidth}" height="${t.offsetHeight}" rx="${rx}"/>`;
        })
        .join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}">${rects}</svg>`;
      const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      blur.style.setProperty('-webkit-mask-image', url);
      blur.style.maskImage = url;
      blur.style.setProperty('-webkit-mask-size', `${box.width}px ${box.height}px`);
      blur.style.maskSize = `${box.width}px ${box.height}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const t of el.querySelectorAll('.glass')) observer.observe(t);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={group} className={`glass-group relative isolate ${className}`}>
      <div ref={layer} className="glass-group-blur" aria-hidden="true" data-testid="glass-group-blur" />
      {children}
    </div>
  );
}
