import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { ScrollRestore } from "@/components/scroll-restore";

export const metadata: Metadata = {
  metadataBase: new URL("https://theatrebudgetapp.mlounello.com"),
  title: "Theatre Budget App",
  description: "Siena-branded production budget and purchase tracking",
  applicationName: "Theatre Budget App",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/tktba-icon.png", type: "image/png", sizes: "512x513" }
    ],
    shortcut: ["/favicon.png"],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  },
  openGraph: {
    type: "website",
    title: "Theatre Budget App",
    description: "Siena-branded production budget and purchase tracking",
    images: [{ url: "/tktba-square.png", width: 1000, height: 1000, alt: "Theatre Budget App" }]
  },
  twitter: {
    card: "summary",
    title: "Theatre Budget App",
    description: "Siena-branded production budget and purchase tracking",
    images: ["/tktba-square.png"]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <ScrollRestore />
        </Suspense>
        <TopNav />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
