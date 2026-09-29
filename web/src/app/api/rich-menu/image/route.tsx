import { ImageResponse } from 'next/og';
import { ICONS } from '@/server/line/icons';
import { RICH_MENU_BUTTONS, RICH_MENU_SIZE } from '@/server/line/rich-menu';

/**
 * Rich menu image (G5): 2500×1686 PNG, 2×2 tiles as in prototype LineTrack.png.
 * Satori has no Thai glyphs, so IBM Plex Sans Thai is fetched once from Google Fonts and cached.
 */
let font: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer> {
  if (font) return font;
  const text = encodeURIComponent(RICH_MENU_BUTTONS.map((b) => b.label).join(''));
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@600&text=${text}`)).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error('font not available');
  font = await (await fetch(url)).arrayBuffer();
  return font;
}

const ACCENT = '#0B6B5D';
const BORDER = '#E2E0DA';

export async function GET() {
  const { width, height } = RICH_MENU_SIZE;
  const tile = (i: number) => {
    const b = RICH_MENU_BUTTONS[i];
    const primary = i === 0;
    const fg = primary ? '#FFFFFF' : ACCENT;
    return (
      <div key={b.data} style={{
        width: width / 2, height: height / 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40,
        background: primary ? ACCENT : '#FFFFFF', borderRight: i % 2 === 0 ? `4px solid ${BORDER}` : 'none', borderBottom: i < 2 ? `4px solid ${BORDER}` : 'none',
      }}>
        <svg width="190" height="190" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[b.icon].map((d) => <path key={d} d={d} />)}
        </svg>
        <div style={{ fontSize: 110, fontFamily: 'Plex Thai', fontWeight: 600, color: primary ? '#FFFFFF' : '#1A1C1E' }}>{b.label}</div>
      </div>
    );
  };
  return new ImageResponse(
    <div style={{ width, height, display: 'flex', flexWrap: 'wrap', background: '#FFFFFF' }}>{[0, 1, 2, 3].map(tile)}</div>,
    { width, height, fonts: [{ name: 'Plex Thai', data: await loadFont(), weight: 600, style: 'normal' }], headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
