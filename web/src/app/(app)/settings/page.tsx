import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Card, Chip, PageHeader } from '@/components/ui';
import { getSettings, lineStatus } from '@/server/admin/settings';
import { requirePageUser } from '@/server/lib/auth';
import { pageBody } from '../_admin/table';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'ตั้งค่า' };

function Flag({ ok, name, label }: { ok: boolean; name: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3 first:border-t-0">
      <div>
        <div className="font-mono text-[12.5px]">{name}</div>
        <div className="text-[12px] text-muted">{label}</div>
      </div>
      {ok
        ? <Chip tone="success"><CheckCircle2 size={13} className="mr-1" aria-hidden />ตั้งค่าแล้ว</Chip>
        : <Chip tone="neutral"><CircleDashed size={13} className="mr-1" aria-hidden />ยังไม่ได้ตั้งค่า</Chip>}
    </li>
  );
}

export default async function SettingsPage() {
  const me = await requirePageUser(['admin']);
  const s = await getSettings(me.tenantId);
  const line = lineStatus();
  return (
    <>
      <PageHeader title="ตั้งค่า" subtitle="การเชื่อมต่อ LINE ข้อมูลองค์กร เวลาทำการ ประกาศ PDPA และนโยบาย SLA" />
      <div className={pageBody}>
        <Card title="การเชื่อมต่อ LINE" action={line.simulator ? <Chip tone="warning">LINE Simulator เปิดอยู่</Chip> : <Chip tone="neutral">LINE Simulator ปิดอยู่</Chip>}>
          <div className="grid gap-0 lg:grid-cols-2">
            <ul className="lg:border-r lg:border-divider">
              <Flag ok={line.channelSecret} name="LINE_CHANNEL_SECRET" label="ใช้ตรวจสอบลายเซ็นของ webhook" />
              <Flag ok={line.accessToken} name="LINE_CHANNEL_ACCESS_TOKEN" label="ใช้ส่งข้อความตอบกลับและ push" />
              <Flag ok={line.loginChannelId} name="LINE_LOGIN_CHANNEL_ID" label="ใช้ตรวจสอบ ID token จาก LIFF" />
              <Flag ok={line.liffId} name="NEXT_PUBLIC_LIFF_ID" label="หน้าลงทะเบียนผ่าน LIFF" />
            </ul>
            <div className="space-y-3 border-t border-divider px-5 py-4 lg:border-t-0">
              <div>
                <div className="text-[12px] font-semibold text-text-2">Webhook URL</div>
                <code className="mt-1.5 block break-all rounded-md border border-border bg-field px-3 py-2 font-mono text-[13px]">{line.webhookUrl}</code>
                <p className="mt-1.5 text-[12px] text-muted">นำ URL นี้ไปวางในหน้า Messaging API ของ LINE Developers Console แล้วเปิด “Use webhook”</p>
              </div>
              <p className="text-[12px] text-muted">ค่า credential เก็บในตัวแปรสภาพแวดล้อมของเซิร์ฟเวอร์ ระบบไม่แสดงค่าจริงในหน้านี้ หากต้องการเปลี่ยนให้แก้ไขไฟล์ <span className="font-mono">.env</span> แล้วเริ่มระบบใหม่</p>
            </div>
          </div>
        </Card>
        <SettingsForm initial={s} />
      </div>
    </>
  );
}
