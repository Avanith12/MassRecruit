import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">That page or study doesn&apos;t exist (or isn&apos;t public).</p>
      <Link href="/" className="mt-4 inline-block">Browse studies →</Link>
    </div>
  );
}
