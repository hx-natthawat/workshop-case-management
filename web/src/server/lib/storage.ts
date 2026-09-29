/** Local-disk attachment storage behind a small interface (ADR 0004). */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

const ROOT = path.resolve(process.cwd(), 'storage');
const URL_TTL_SEC = 15 * 60;

export async function putObject(data: Buffer, mimeType: string) {
  const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await mkdir(path.dirname(path.join(ROOT, key)), { recursive: true });
  await writeFile(path.join(ROOT, key), data);
  return { key, size: data.length, checksum: createHash('sha256').update(data).digest('hex') };
}

export async function getObject(key: string): Promise<Buffer> {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('invalid key');
  return readFile(full);
}

/** Delete a stored file (PDPA erase / retention, #19). Missing files are ignored. */
export async function deleteObject(key: string): Promise<void> {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('invalid key');
  await rm(full, { force: true });
}

const sig = (id: string, exp: number) => createHmac('sha256', config.appSecret()).update(`${id}.${exp}`).digest('base64url');

export function signedFileUrl(attachmentId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + URL_TTL_SEC;
  return `/api/files/${attachmentId}?exp=${exp}&sig=${sig(attachmentId, exp)}`;
}

export function verifyFileSig(attachmentId: string, exp: string | null, signature: string | null): boolean {
  if (!exp || !signature) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < Date.now()) return false;
  const a = Buffer.from(sig(attachmentId, e));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
