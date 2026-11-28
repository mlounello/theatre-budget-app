export default function Loading() {
  return (
    <section className="heroCard" role="status" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Loading</p>
      <p className="heroSubtitle">Loading your budget data…</p>
    </section>
  );
}
