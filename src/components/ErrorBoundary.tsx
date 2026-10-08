import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows a readable message instead of a white screen, e.g. if the database cannot be opened. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div role="alert" className="glass w-full max-w-md p-6">
          <h1 className="text-[19px] font-semibold text-ink">Daten konnten nicht geladen werden</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            Deine Daten wurden nicht verändert. Bitte die App neu laden.
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-zinc-100 p-3 text-[12px] text-ink-mute">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="focus-ring mt-4 h-11 w-full rounded-2xl bg-accent text-[15px] font-semibold text-white"
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }
}
