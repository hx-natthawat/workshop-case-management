import { and, desc, eq } from 'drizzle-orm';
import { PageHeader } from '@/components/ui';
import { db, schema } from '@/server/db';
import { requirePageUser } from '@/server/lib/auth';
import { NotificationList } from './notification-list';

export default async function NotificationsPage() {
  const user = await requirePageUser();
  // Viewing the page does not mark anything read; clicking an item does.
  const rows = await db.select().from(schema.notification)
    .where(and(eq(schema.notification.tenantId, user.tenantId), eq(schema.notification.userId, user.id)))
    .orderBy(desc(schema.notification.createdAt))
    .limit(200);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <>
      <PageHeader title="การแจ้งเตือน" subtitle={unread ? `ยังไม่ได้อ่าน ${unread} รายการ` : 'อ่านครบทุกรายการแล้ว'} />
      <div className="px-8 py-6">
        <NotificationList
          unread={unread}
          items={rows.map((r) => ({ id: r.id, type: r.type, caseId: r.caseId, text: r.text, read: !!r.readAt, createdAt: r.createdAt.toISOString() }))}
        />
      </div>
    </>
  );
}
