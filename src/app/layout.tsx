import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Defne Vocabulary",
  description: "Local-first vocabulary practice for focused English learning."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="app-header">
          <Link href="/" className="brand">
            <span className="brand-mark">D</span>
            <span>Defne Vocabulary</span>
          </Link>
          <nav className="top-nav" aria-label="Primary">
            <Link href="/child">Child</Link>
            <Link href="/parent">Parent</Link>
            <Link href="/parent/words">Words</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
