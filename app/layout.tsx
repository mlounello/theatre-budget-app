import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { TopNav } from "@/components/top-nav";
import { ScrollRestore } from "@/components/scroll-restore";

export const metadata: Metadata = {
  title: "Theatre Budget App",
  description: "Siena-branded production budget and purchase tracking"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ScrollRestore />
        <TopNav />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
