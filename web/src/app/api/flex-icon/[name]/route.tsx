import { ImageResponse } from 'next/og';
import { ICONS } from '@/server/line/icons';

/** PNG icons for LINE Flex category cards (LINE needs PNG/JPEG over HTTPS). */


export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const paths = ICONS[name] ?? ICONS['circle-help'];
  const c = new URL(req.url).searchParams.get('c') ?? '0B6B5D';
  const color = /^[0-9a-fA-F]{6}$/.test(c) ? `#${c}` : '#0B6B5D';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          {paths.map((d) => <path key={d} d={d} />)}
        </svg>
      </div>
    ),
    { width: 96, height: 96, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
