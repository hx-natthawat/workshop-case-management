import { PageHeader } from '@/components/ui';
import { listCanned } from '@/server/admin/canned';
import { requirePageUser } from '@/server/lib/auth';
import { pageBody } from '../_admin/table';
import { TemplatesClient } from './templates-client';
import { BroadcastCard } from './broadcast-card';
import { BotTextsCard } from './bot-texts-card';
import { listBotTexts } from '@/server/bot/bot-texts';
import { broadcastHistory, previewBroadcast } from '@/server/case/broadcast';

export const metadata = { title: 'ข้อความสำเร็จรูป' };

export default async function TemplatesPage() {
  const me = await requirePageUser();
  const items = await listCanned(me.tenantId);
  const canEdit = me.role !== 'agent';
  const texts = canEdit ? await listBotTexts(me.tenantId) : null;
  const broadcast = canEdit ? { preview: await previewBroadcast(me), history: await broadcastHistory(me.tenantId) } : null;
  return (
    <>
      <PageHeader
        title="ข้อความสำเร็จรูป"
        subtitle={canEdit ? 'ข้อความที่เจ้าหน้าที่เลือกใช้ตอบผู้แจ้งได้ทันทีในหน้ารายละเอียดเคส' : 'ข้อความสำหรับตอบผู้แจ้ง (แก้ไขได้เฉพาะ Supervisor และ Admin)'}
      />
      <div className={pageBody}>
        <TemplatesClient canEdit={canEdit} items={items.map((i) => ({ id: i.id, title: i.title, body: i.body }))} />
        {texts && <BotTextsCard items={texts} />}
        {broadcast && (
          <BroadcastCard
            recipients={broadcast.preview.recipients}
            mfaReady={me.mfaEnabled}
            history={broadcast.history.map((h) => ({ ...h, createdAt: h.createdAt.toISOString() }))}
          />
        )}
      </div>
    </>
  );
}
