import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from './Icons';

/** Collapse/expand duration in ms (prefers-reduced-motion: none). */
export const DISCLOSURE_MS = 180;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** The chevron of every expandable row: points right, turns down when open. */
export function DisclosureChevron({ expanded, size = 16 }: { expanded: boolean; size?: number }) {
  return (
    <ChevronRight
      size={size}
      aria-hidden="true"
      className={`shrink-0 text-ink-faint transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
    />
  );
}

interface Props {
  expanded: boolean;
  onToggle: () => void;
  /** content of the header button (the chevron is added in front) */
  header: ReactNode;
  children: ReactNode;
  /** wraps the header button in a heading (accordion pattern) */
  headingLevel?: 2 | 3;
  buttonClassName?: string;
  /** accessible name of the header button when its content is not enough */
  buttonLabel?: string;
  buttonTestId?: string;
  contentTestId?: string;
}

/**
 * One expandable block for the whole app (categories in the month, rows of the distribution):
 * full-width header button with chevron and aria-expanded, content that slides open/closed
 * in ≤ 200 ms. Collapsed content is not rendered (not focusable, not read out).
 */
export function Disclosure({
  expanded,
  onToggle,
  header,
  children,
  headingLevel,
  buttonClassName = '',
  buttonLabel,
  buttonTestId,
  contentTestId,
}: Props) {
  const contentId = useId();
  // mounted: content in the DOM; open: grid row at full height (animated in between)
  const [mounted, setMounted] = useState(expanded);
  const [open, setOpen] = useState(expanded);

  useLayoutEffect(() => {
    if (expanded) setMounted(true);
    else if (reducedMotion()) {
      setOpen(false);
      setMounted(false);
    } else setOpen(false);
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !mounted || open) return;
    if (reducedMotion()) return setOpen(true);
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [expanded, mounted, open]);

  // after the closing transition the content leaves the DOM (fallback if no transitionend comes)
  useEffect(() => {
    if (expanded || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), DISCLOSURE_MS + 40);
    return () => window.clearTimeout(t);
  }, [expanded, mounted]);

  const button = (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={mounted ? contentId : undefined}
      aria-label={buttonLabel}
      onClick={onToggle}
      className={`focus-ring flex min-h-11 w-full items-center gap-2 text-left ${buttonClassName}`}
      data-testid={buttonTestId}
    >
      <DisclosureChevron expanded={expanded} />
      {header}
    </button>
  );
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : null;
  return (
    <>
      {Heading ? <Heading className="m-0">{button}</Heading> : button}
      {mounted && (
        <div
          id={contentId}
          className="grid transition-[grid-template-rows] ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? '1fr' : '0fr', transitionDuration: `${DISCLOSURE_MS}ms` }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && !expanded) setMounted(false);
          }}
          data-testid={contentTestId}
        >
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      )}
    </>
  );
}
