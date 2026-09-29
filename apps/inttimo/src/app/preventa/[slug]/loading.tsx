export default function PresaleLoading() {
  return (
    <main aria-busy="true" className="container-page grid gap-10 pt-10 pb-16 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24">
      <p className="sr-only" role="status">Cargando la preventa…</p>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-3 w-40 bg-sand" />
        <div className="h-24 w-4/5 bg-sand" />
        <div className="h-6 w-3/5 bg-sand" />
        <div className="h-4 w-2/3 bg-sand" />
      </div>
      <div aria-hidden="true" className="h-80 bg-ink/90 motion-safe:animate-pulse" />
    </main>
  );
}
