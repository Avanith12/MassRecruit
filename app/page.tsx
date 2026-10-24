import Link from "next/link";
import { db } from "@/lib/db";
import { publicStudyWhere } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function Landing({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const [recruiting, schools] = await Promise.all([
    db.study.count({ where: { ...publicStudyWhere, status: "RECRUITING" } }),
    db.school.count(),
  ]);

  return (
    <section className="landing mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center text-center">
      {denied === "1" && (
        <p role="alert" className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          You don&apos;t have access to that page.
        </p>
      )}
      {/* Decorative logo mark */}
      <svg aria-hidden="true" viewBox="0 0 64 64" className="landing-icon h-20 w-20 text-brand-600">
        <rect width="64" height="64" rx="16" fill="currentColor" />
        <path d="M18 44V22l14 13 14-13v22" fill="none" stroke="var(--icon-fg, #fff)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl">MassRecruit</h1>
      <p className="landing-tagline mt-4 text-2xl font-semibold text-brand-600 sm:text-3xl">
        Your campus. Real research. Real rewards.
      </p>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
        One place to discover research studies across Massachusetts universities. See exactly what you&apos;ll earn
        and how your data is used, sign the consent form online, and book a time slot in minutes.
      </p>

      <p className="mt-6 text-sm text-slate-500" data-testid="landing-stats">
        {recruiting} studies recruiting now · {schools} universities
      </p>

      <Link
        href="/studies"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-4 text-lg font-semibold text-white no-underline shadow-md transition hover:bg-brand-700 hover:no-underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-600/40"
      >
        Continue <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
