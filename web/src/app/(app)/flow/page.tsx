import { getFormDetail, listCategories, listForms, listTeams } from '@/server/admin/forms';
import { requirePageUser } from '@/server/lib/auth';
import { config } from '@/server/lib/config';
import { FlowBuilder } from './flow-builder';

export const metadata = { title: 'Bot Flow' };

export default async function FlowPage() {
  const user = await requirePageUser(['admin']);
  const [categories, forms, teams] = await Promise.all([
    listCategories(user.tenantId), listForms(user.tenantId), listTeams(user.tenantId),
  ]);
  const first = categories.flatMap((p) => p.children).find((c) => c.formId);
  const initialForm = first?.formId ? await getFormDetail(user.tenantId, first.formId) : null;
  return (
    <FlowBuilder
      initialCategories={JSON.parse(JSON.stringify(categories))}
      initialForms={forms}
      teams={teams}
      initialSelectedId={first?.id ?? categories[0]?.id ?? null}
      initialForm={initialForm ? JSON.parse(JSON.stringify(initialForm)) : null}
      simulatorEnabled={config.simulatorEnabled()}
    />
  );
}
