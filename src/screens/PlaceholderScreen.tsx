export function PlaceholderScreen({ title, text, phase }: { title: string; text: string; phase: number }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 lg:px-8">
      <header className="py-3 lg:py-6">
        <h1 className="flex h-11 items-center text-[20px] font-semibold tracking-tight text-ink lg:text-[24px]">{title}</h1>
      </header>
      <div className="rounded-card border border-dashed border-zinc-300 px-5 py-8 text-center">
        <p className="text-[15px] font-medium text-ink">Kommt in Phase {phase}</p>
        <p className="mt-1 text-[14px] text-ink-mute">{text}</p>
      </div>
    </div>
  );
}
