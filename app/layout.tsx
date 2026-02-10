import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "Theatre Budget App",
  description: "Siena-branded production budget and purchase tracking"
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
