import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, schema } from '@/server/db';
import { getObject, verifyFileSig } from '@/server/lib/storage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serve an attachment behind a short-lived HMAC-signed URL (ADR 0004). */
export async function GET(req: Request, ctx: RouteContext<'/api/files/[id]'>) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (!UUID_RE.test(id) || !verifyFileSig(id, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
    return NextResponse.json({ error: 'ลิงก์ไฟล์หมดอายุหรือไม่ถูกต้อง' }, { status: 403 });
  }
  const [att] = await db.select().from(schema.attachment).where(eq(schema.attachment.id, id));
  if (!att) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  let data: Buffer;
  try {
    data = await getObject(att.storageKey);
  } catch {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
  }
  const inline = /^(image|video|audio)\//.test(att.mimeType);
  const name = att.fileName ?? `file-${att.id.slice(0, 8)}`;
  const headers: Record<string, string> = {
    'Content-Type': att.mimeType,
    'Cache-Control': 'private, max-age=600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Accept-Ranges': 'bytes',
    // Documents are always downloaded, never rendered by the browser (D-015).
    ...(inline ? {} : { 'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}` }),
  };
  // Byte ranges let <video>/<audio> seek (Safari needs them to play at all).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const size = data.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    const part = data.subarray(start, end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(part.length) },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, 'Content-Length': String(data.length) } });
}
