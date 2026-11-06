"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold">This page failed to render</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "An unexpected preview error occurred."}</p>
      <button type="button" onClick={reset} className="mt-4 h-10 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">
        Try again
      </button>
    </div>
  );
}
