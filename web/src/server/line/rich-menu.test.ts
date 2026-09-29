import { describe, expect, it } from 'vitest';
import { RICH_MENU_SIZE, buildRichMenu, richMenuProblems } from './rich-menu';

describe('rich menu (research r1 Q9 limits)', () => {
  const menu = buildRichMenu();
  it('is valid for LINE: size, aspect ratio, chat bar text, area count', () => {
    expect(richMenuProblems(menu)).toEqual([]);
    expect(RICH_MENU_SIZE.width / RICH_MENU_SIZE.height).toBeGreaterThanOrEqual(1.45);
  });
  it('has the 4 SPEC §3 buttons as postbacks the bot understands, covering the whole image', () => {
    expect(menu.areas.map((a) => a.action.data)).toEqual(['menu:start', 'menu:track', 'menu:my_cases', 'menu:handoff']);
    const area = menu.areas.reduce((n, a) => n + a.bounds.width * a.bounds.height, 0);
    expect(area).toBe(RICH_MENU_SIZE.width * RICH_MENU_SIZE.height);
  });
  it('catches rule violations', () => {
    expect(richMenuProblems({ ...menu, chatBarText: 'ข้อความยาวเกินสิบสี่ตัวอักษร' })).toContain('chatBarText ยาวเกิน 14 ตัวอักษร');
    expect(richMenuProblems({ ...menu, size: { width: 2500, height: 2000 } }).join()).toMatch(/อัตราส่วน/);
    const outside = { ...menu, areas: [{ ...menu.areas[0], bounds: { x: 2000, y: 0, width: 1000, height: 100 } }] };
    expect(richMenuProblems(outside).join()).toMatch(/นอกขอบเขต/);
  });
});
