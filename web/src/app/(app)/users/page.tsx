import { PageHeader } from '@/components/ui';
import { listTeams, listUsers } from '@/server/admin/users';
import { requirePageUser } from '@/server/lib/auth';
import { pageBody } from '../_admin/table';
import { UsersClient } from './users-client';

export const metadata = { title: 'ผู้ใช้และสิทธิ์' };

export default async function UsersPage() {
  const me = await requirePageUser(['admin']);
  const [users, teams] = await Promise.all([listUsers(me.tenantId), listTeams(me.tenantId)]);
  return (
    <>
      <PageHeader title="ผู้ใช้และสิทธิ์" subtitle="จัดการบัญชีเจ้าหน้าที่ บทบาท และทีม" />
      <div className={pageBody}>
        <UsersClient
          meId={me.id}
          users={users.map((u) => ({ ...u, lastAssignedAt: u.lastAssignedAt?.toISOString() ?? null, mfaEnabledAt: u.mfaEnabledAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
          teams={teams}
        />
      </div>
    </>
  );
}
