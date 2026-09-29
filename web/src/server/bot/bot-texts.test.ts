import { describe, expect, it } from 'vitest';
import { BOT_TEXTS, botText, invalidateBotTexts, unknownVars } from './bot-texts';

describe('bot texts (G6)', () => {
  it('fills placeholders in the default copy', () => {
    invalidateBotTexts();
    expect(botText('handoff_ack', { caseNo: 'CS-2609-00001' })).toContain('เลขเคส CS-2609-00001');
    expect(botText('welcome', { name: ' คุณสมชาย', oa: 'ศูนย์แจ้งปัญหา' })).toBe('สวัสดีครับ คุณสมชาย ยินดีต้อนรับสู่ศูนย์แจ้งปัญหา');
  });
  it('rejects placeholders a text does not provide', () => {
    expect(unknownVars('idle', 'สวัสดี {name}')).toEqual(['name']);
    expect(unknownVars('pending_request', 'เคส {caseNo}')).toEqual([]);
  });
  it('keeps the bot polite: every default ends a sentence with ครับ', () => {
    for (const t of Object.values(BOT_TEXTS)) expect(t.body).toMatch(/ครับ/);
  });
});
