/**
 * Loading state: the three peas of the logo, each in a slightly different green,
 * pulse one after another. Screen readers hear „Lädt …“.
 */
export function Loader({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="flex justify-center p-8" role="status" aria-busy="true" data-testid="loader">
      <span className="flex items-center gap-2" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="anim-pea block h-3.5 w-3.5 rounded-full"
            style={{ background: `var(--pea-${n})`, animationDelay: `${(n - 1) * 160}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
