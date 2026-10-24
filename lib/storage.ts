// Consent PDF storage. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
// otherwise writes to ./uploads/consent and serves via /api/files/consent/[name]
// (fine for local dev; serverless hosts need Blob since their disk isn't persistent).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const LOCAL_NAME_RE = /^[a-f0-9-]{36}\.pdf$/;

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), "uploads", "consent");
}

/** Returns an error message, or null if `bytes` looks like an acceptable PDF. */
export function validatePdf(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "The consent PDF is empty.";
  if (bytes.length > MAX_PDF_BYTES) return "The consent PDF must be 5 MB or smaller.";
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head !== "%PDF-") return "The consent file must be a PDF.";
  return null;
}

/** Local disk storage only works on a persistent server (not Vercel's read-only serverless FS). */
export function canStoreFiles(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN || !process.env.VERCEL;
}

export async function saveConsentPdf(bytes: Uint8Array): Promise<string> {
  const name = `${randomUUID()}.pdf`;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`consent/${name}`, Buffer.from(bytes), { access: "public", contentType: "application/pdf", token });
    return blob.url;
  }
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(join(uploadDir(), name), bytes);
  return `/api/files/consent/${name}`;
}

export async function readLocalConsentPdf(name: string): Promise<Buffer | null> {
  if (!LOCAL_NAME_RE.test(name)) return null; // blocks path traversal
  try {
    return await readFile(join(uploadDir(), name));
  } catch {
    return null;
  }
}
