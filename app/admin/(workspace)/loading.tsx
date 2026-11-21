export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-4 w-80 max-w-full rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-card" />
    </div>
  );
}
