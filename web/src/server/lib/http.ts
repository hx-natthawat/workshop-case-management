import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './auth';

/** Wrap a route handler: map HttpError/ZodError to JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response | unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const r = await fn(...args);
      return r instanceof Response ? r : NextResponse.json(r ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง', issues: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในระบบ' }, { status: 500 });
    }
  };
}

export function clientIp(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}
