import { NextResponse } from 'next/server';
import { audit } from '@/server/lib/audit';
import { HttpError, requireApiUser } from '@/server/lib/auth';
import { clientIp, handle } from '@/server/lib/http';
import { REPORT_TYPES, parseRange, reportTable, toCsv, type ReportType } from '@/server/queries/reports';

/** GET /api/reports/:type?from=yyyy-mm-dd&to=yyyy-mm-dd&format=csv — supervisor/admin only, every export is audit-logged (SPEC §8). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ type: string }> }) => {
  const user = await requireApiUser(['supervisor', 'admin']);
  const { type } = await ctx.params;
  if (!(REPORT_TYPES as readonly string[]).includes(type)) throw new HttpError(404, 'ไม่พบรายงานนี้');
  const url = new URL(req.url);
  const range = parseRange(url.searchParams.get('from'), url.searchParams.get('to'));
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const table = await reportTable(type as ReportType, user.tenantId, range);

  await audit({
    tenantId: user.tenantId, actorId: user.id, action: 'report.exported', entity: 'report', entityId: type,
    diff: { type, from: range.from, to: range.to, rows: table.rows.length, format, personalData: type === 'cases' }, ip: clientIp(req),
  });

  if (format === 'json') return NextResponse.json({ type, ...range, ...table });
  const filename = `report-${type}-${range.from}_${range.to}.csv`;
  return new Response(toCsv(table), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
