import { and, count, eq, isNull } from 'drizzle-orm';
import { Sidebar } from '@/components/sidebar';
import { db, schema } from '@/server/db';
import { requirePageUser } from '@/server/lib/auth';
import { config } from '@/server/lib/config';
import { inboxUnreadCount } from '@/server/queries/cases';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requirePageUser();
  const [team] = user.teamId ? await db.select().from(schema.team).where(eq(schema.team.id, user.teamId)) : [];
  const [notif] = await db.select({ n: count() }).from(schema.notification).where(and(eq(schema.notification.userId, user.id), isNull(schema.notification.readAt)));
  const inbox = await inboxUnreadCount(user);
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, role: user.role }} teamName={team?.name ?? null} counts={{ inbox, notif: notif.n }} simulator={config.simulatorEnabled()} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
