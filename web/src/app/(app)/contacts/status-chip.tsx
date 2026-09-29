import { Chip } from '@/components/ui';
import type { Tone } from '@/server/lib/enums';

const CONTACT_STATUS: Record<'active' | 'unfollowed' | 'blocked', { label: string; tone: Tone }> = {
  active: { label: 'ใช้งาน', tone: 'success' },
  unfollowed: { label: 'เลิกติดตาม OA', tone: 'neutral' },
  blocked: { label: 'ถูกบล็อก', tone: 'critical' },
};

export const ContactStatusChip = ({ status }: { status: keyof typeof CONTACT_STATUS }) => (
  <Chip tone={CONTACT_STATUS[status].tone}>{CONTACT_STATUS[status].label}</Chip>
);
