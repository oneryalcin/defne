import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import { logoutAction } from "./actions";
import "./globals.css";
import "./design-system.css";

export const metadata: Metadata = {
  title: "Defne Vocabulary",
  description: "Local-first vocabulary practice for focused English learning."
};

type NavItem = {
  href: string;
  label: string;
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);

  const navItems: NavItem[] = session
    ? session.role === "child"
      ? [
        { href: "/child", label: "Child" },
        { href: "/child/words", label: "Vocabulary" },
        { href: "/child/spelling/words", label: "Spellings" }
        ]
      : [
        { href: "/parent", label: "Parent" },
        { href: "/parent/words", label: "Vocabulary" },
        { href: "/parent/spelling", label: "Spelling" }
        ]
    : [
      { href: "/child", label: "Child" },
      { href: "/parent", label: "Parent" },
      { href: "/parent/words", label: "Vocabulary" },
      { href: "/parent/spelling", label: "Spelling" }
      ];

  return (
    <html lang="en-GB">
      <body>
        <header className="app-header">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">D</span>
            <span>Defne <em className="brand__editorial">vocabulary</em></span>
          </Link>
          <nav className="top-nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
            {session ? <span className="role-chip">{session.role}</span> : null}
            {session ? (
              <form action={logoutAction}>
                <button className="button-secondary" type="submit">
                  Switch user
                </button>
              </form>
            ) : null}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
