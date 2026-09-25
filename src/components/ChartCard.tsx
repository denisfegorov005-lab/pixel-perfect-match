import type { ReactNode } from "react";

export function ChartCard({
  title,
  subtitle,
  onReset,
  resetDisabled,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  onReset: () => void;
  resetDisabled?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          Reset Zoom
        </button>
      </header>
      <div className="p-2 sm:p-3">{children}</div>
      {hint ? (
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </section>
  );
}
