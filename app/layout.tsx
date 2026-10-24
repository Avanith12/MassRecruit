import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser, homeFor } from "@/lib/session";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "MassRecruit — Research studies across Massachusetts",
  description: "Discover research studies, compare compensation, and sign up — for students across Massachusetts universities.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-brand-800 no-underline hover:no-underline">
              Mass<span className="text-brand-600">Recruit</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/">Browse studies</Link>
              {user ? (
                <>
                  <Link href={homeFor(user.role)}>Dashboard</Link>
                  <span className="hidden text-slate-500 sm:inline" data-testid="whoami">
                    {user.username} · {user.role.toLowerCase()}
                  </span>
                  <form action={logoutAction}>
                    <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-white no-underline hover:bg-brand-700 hover:no-underline">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          MassRecruit · Hackachusetts 2026 · Demo data is synthetic.
        </footer>
      </body>
    </html>
  );
}
