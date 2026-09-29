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
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': att.mimeType,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
