/** Users & Roles, teams (SPEC §5 Users & Roles, analysis D3). Admin only. Never returns password hashes. */
import bcrypt from 'bcryptjs';
import { and, asc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { audit } from '@/server/lib/audit';
import { HttpError, type SessionUser } from '@/server/lib/auth';
import { assertUuid } from './ids';

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: 'agent' | 'supervisor' | 'admin';
  teamId: string | null;
  isActive: boolean;
  lastAssignedAt: Date | null;
  createdAt: Date;
}

export interface TeamRow {
  id: string;
  name: string;
  autoAssign: boolean;
  memberCount: number;
}

const publicCols = {
  id: schema.user.id,
  name: schema.user.name,
  email: schema.user.email,
  role: schema.user.role,
  teamId: schema.user.teamId,
  isActive: schema.user.isActive,
  lastAssignedAt: schema.user.lastAssignedAt,
  createdAt: schema.user.createdAt,
};

export async function listUsers(tenantId: string): Promise<StaffRow[]> {
  return db.select(publicCols).from(schema.user).where(eq(schema.user.tenantId, tenantId)).orderBy(asc(schema.user.name));
}

export async function listTeams(tenantId: string): Promise<TeamRow[]> {
  const teams = await db.select().from(schema.team).where(eq(schema.team.tenantId, tenantId)).orderBy(asc(schema.team.createdAt));
  const users = await db.select({ teamId: schema.user.teamId }).from(schema.user).where(eq(schema.user.tenantId, tenantId));
  return teams.map((t) => ({ id: t.id, name: t.name, autoAssign: t.autoAssign, memberCount: users.filter((u) => u.teamId === t.id).length }));
}

const role = z.enum(['agent', 'supervisor', 'admin']);
const password = z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(128);

export const createUserInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role,
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  password,
});

export const updateUserInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: role.optional(),
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});

async function assertTeam(tenantId: string, teamId: string | null | undefined) {
  if (!teamId) return;
  const [t] = await db.select({ id: schema.team.id }).from(schema.team).where(and(eq(schema.team.id, teamId), eq(schema.team.tenantId, tenantId)));
  if (!t) throw new HttpError(400, 'ไม่พบทีม');
}

async function assertEmailFree(tenantId: string, email: string, exceptId?: string) {
  const [dup] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.tenantId, tenantId), eq(schema.user.email, email), exceptId ? ne(schema.user.id, exceptId) : undefined));
  if (dup) throw new HttpError(409, 'อีเมลนี้มีผู้ใช้อยู่แล้ว');
}

export async function createUser(actor: SessionUser, input: z.infer<typeof createUserInput>, ip: string | null): Promise<StaffRow> {
  await assertEmailFree(actor.tenantId, input.email);
  await assertTeam(actor.tenantId, input.teamId);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const [row] = await db
    .insert(schema.user)
    .values({ tenantId: actor.tenantId, name: input.name, email: input.email, role: input.role, teamId: input.teamId ?? null, isActive: input.isActive ?? true, passwordHash })
    .returning(publicCols);
  await audit({
    tenantId: actor.tenantId, actorId: actor.id, action: 'user.created', entity: 'user', entityId: row.id, ip,
    diff: { name: row.name, email: row.email, role: row.role, teamId: row.teamId, isActive: row.isActive },
  });
  return row;
}

export async function updateUser(actor: SessionUser, id: string, input: z.infer<typeof updateUserInput>, ip: string | null): Promise<StaffRow> {
  assertUuid(id, 'ไม่พบผู้ใช้');
  const [cur] = await db.select().from(schema.user).where(and(eq(schema.user.id, id), eq(schema.user.tenantId, actor.tenantId)));
  if (!cur) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (id === actor.id) {
    if (input.isActive === false) throw new HttpError(400, 'ไม่สามารถปิดการใช้งานบัญชีของตนเองได้');
    if (input.role && input.role !== 'admin') throw new HttpError(400, 'ไม่สามารถลดสิทธิ์บัญชีของตนเองได้');
  }
  if (input.email && input.email !== cur.email) await assertEmailFree(actor.tenantId, input.email, id);
  if (input.teamId !== undefined) await assertTeam(actor.tenantId, input.teamId);

  const patch: Partial<typeof schema.user.$inferInsert> = {};
  const diff: Record<string, { from: unknown; to: unknown } | string> = {};
  for (const k of ['name', 'email', 'role', 'teamId', 'isActive'] as const) {
    const v = input[k];
    if (v !== undefined && v !== cur[k]) {
      (patch as Record<string, unknown>)[k] = v;
      diff[k] = { from: cur[k], to: v };
    }
  }
  if (input.password) {
    patch.passwordHash = await bcrypt.hash(input.password, 10);
    diff.password = 'reset';
  }
  if (!Object.keys(patch).length) {
    const [same] = await db.select(publicCols).from(schema.user).where(eq(schema.user.id, id));
    return same;
  }
  const [row] = await db.update(schema.user).set(patch).where(and(eq(schema.user.id, id), eq(schema.user.tenantId, actor.tenantId))).returning(publicCols);
  const action = input.isActive === false && cur.isActive ? 'user.deactivated' : input.isActive === true && !cur.isActive ? 'user.activated' : 'user.updated';
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action, entity: 'user', entityId: id, diff, ip });
  return row;
}

export const createTeamInput = z.object({ name: z.string().trim().min(1).max(80), autoAssign: z.boolean().optional() });
export const updateTeamInput = z.object({ name: z.string().trim().min(1).max(80).optional(), autoAssign: z.boolean().optional() });

export async function createTeam(actor: SessionUser, input: z.infer<typeof createTeamInput>, ip: string | null) {
  const [t] = await db.insert(schema.team).values({ tenantId: actor.tenantId, name: input.name, autoAssign: input.autoAssign ?? true }).returning();
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action: 'team.created', entity: 'team', entityId: t.id, diff: { name: t.name, autoAssign: t.autoAssign }, ip });
  return t;
}

export async function updateTeam(actor: SessionUser, id: string, input: z.infer<typeof updateTeamInput>, ip: string | null) {
  assertUuid(id, 'ไม่พบทีม');
  const [cur] = await db.select().from(schema.team).where(and(eq(schema.team.id, id), eq(schema.team.tenantId, actor.tenantId)));
  if (!cur) throw new HttpError(404, 'ไม่พบทีม');
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const patch: Partial<typeof schema.team.$inferInsert> = {};
  if (input.name !== undefined && input.name !== cur.name) { patch.name = input.name; diff.name = { from: cur.name, to: input.name }; }
  if (input.autoAssign !== undefined && input.autoAssign !== cur.autoAssign) { patch.autoAssign = input.autoAssign; diff.autoAssign = { from: cur.autoAssign, to: input.autoAssign }; }
  if (!Object.keys(patch).length) return cur;
  const [t] = await db.update(schema.team).set(patch).where(and(eq(schema.team.id, id), eq(schema.team.tenantId, actor.tenantId))).returning();
  await audit({ tenantId: actor.tenantId, actorId: actor.id, action: 'team.updated', entity: 'team', entityId: id, diff, ip });
  return t;
}
