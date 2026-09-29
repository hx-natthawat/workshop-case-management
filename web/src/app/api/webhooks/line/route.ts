import { after, NextResponse } from 'next/server';
import { handleEvents } from '@/server/bot/handler';
import type { LineEvent } from '@/server/bot/line-types';
import { verifySignature } from '@/server/bot/signature';
import { config } from '@/server/lib/config';
import { defaultTenant } from '@/server/lib/tenant';

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get('x-line-signature'), config.line.channelSecret())) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body).events ?? []) as LineEvent[];
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const tenant = await defaultTenant();
  // Answer 200 immediately, process after the response (SPEC §7, NFR 1 s).
  after(() => handleEvents(tenant, events));
  return NextResponse.json({ ok: true });
}
