import Link from "next/link";
import { searchStudies } from "@/lib/services";
import { PHASES, PHASE_LABELS } from "@/lib/rules";
import { Badge, statusTone } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 100);
  const phase = one(sp.phase);
  const status = one(sp.status);
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const error = one(sp.error);
  const { studies, total, pageCount } = await searchStudies({ q, phase, status, page });

  const pageHref = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (phase) u.set("phase", phase);
    if (status) u.set("status", status);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <section className="rounded-xl bg-gradient-to-br from-brand-700 to-brand-600 px-6 py-10 text-white">
        <h1 className="text-3xl font-bold">Find research studies across Massachusetts</h1>
        <p className="mt-2 max-w-2xl text-brand-50">
          Compare compensation, see exactly how your data is used, and sign up in minutes — no account needed to browse.
        </p>
      </section>

      <form role="search" method="get" action="/" className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="q">Search studies</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, condition, or city"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="sr-only" htmlFor="phase">Phase</label>
        <select id="phase" name="phase" defaultValue={phase} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All phases</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>{PHASE_LABELS[p]}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={status} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Any status</option>
          <option value="RECRUITING">Recruiting</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Search
        </button>
      </form>

      <p className="text-sm text-slate-600" aria-live="polite" data-testid="result-count">
        {total} {total === 1 ? "study" : "studies"} found
      </p>

      {studies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No studies match your search. Try a different keyword or clear the filters.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {studies.map((s) => (
            <li key={s.id}>
              <Link
                href={`/studies/${s.id}`}
                data-testid="study-card"
                className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 text-slate-900 no-underline shadow-sm transition hover:border-brand-600 hover:no-underline hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(s.status)}>{s.status === "RECRUITING" ? "Recruiting" : "Closed"}</Badge>
                  <Badge>{PHASE_LABELS[s.phase] ?? s.phase}</Badge>
                </div>
                <h2 className="mt-3 font-semibold leading-snug">{s.name}</h2>
                <dl className="mt-auto pt-4 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Compensation</dt>
                    <dd className="font-medium text-green-800">{s.compensationDetails}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">City</dt>
                    <dd className="font-medium">{s.city}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-4 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Previous</Link> : <span className="text-slate-400">← Previous</span>}
          <span>
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          {page < pageCount ? <Link href={pageHref(page + 1)}>Next →</Link> : <span className="text-slate-400">Next →</span>}
        </nav>
      )}
    </div>
  );
}
