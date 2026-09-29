import type { Priority, QuestionType, QuestionValidation } from '@/server/db/schema';

export interface Cat {
  id: string;
  parentId: string | null;
  name: string;
  hint: string | null;
  formId: string | null;
  defaultPriority: Priority;
  defaultTeamId: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface CatNode extends Cat { children: Cat[] }

export interface FormSummary { id: string; name: string; publishedVersion: number | null; draftVersion: number | null }
export interface Team { id: string; name: string }

export interface Q {
  key: string;
  type: QuestionType;
  label: string;
  shortLabel?: string | null;
  required: boolean;
  options: string[] | null;
  validation: QuestionValidation | null;
  showIf: { key: string; equals: string } | null;
  priorityRules: Record<string, Priority> | null;
}
/** Editor copy: `uid` is a client-only React key. */
export type EditQ = Q & { uid: string };

export interface FormDetailJson {
  id: string;
  name: string;
  maxVersion: number;
  published: { version: number; publishedAt: string | null; questions: Q[] } | null;
  draft: { version: number; createdAt: string; questions: Q[] } | null;
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  short_text: 'ข้อความสั้น',
  long_text: 'ข้อความยาว',
  single_choice: 'ตัวเลือกเดียว',
  datetime: 'วันที่/เวลา',
  location: 'ตำแหน่ง',
  attachment: 'รูปภาพ/ไฟล์',
  number: 'ตัวเลข',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
};

export const QR_OPTION_MAX = 11; // mirrors src/server/bot/dialog.ts
export const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
