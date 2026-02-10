import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="heroCard">
      <p className="eyebrow">Not Found</p>
      <h1 className="heroTitle">This project does not exist.</h1>
      <p className="heroSubtitle">Pick a project from the dashboard.</p>
      <Link href="/" className="buttonLink">
        Return to Dashboard
      </Link>
    </section>
  );
}
