/**
 * Inbound media policy (D-015, research r1 Q6): which types we keep and how big.
 * Pure: shared by the webhook, the simulator upload API and the UI.
 */
import type { MediaKind } from '@/server/db/schema';

export type { MediaKind };

/** LINE does not document an inbound size limit (Q6), so we cap what we store. */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_MEDIA_LABEL = '50 MB';

const IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO = ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm', 'video/x-m4v'];
const AUDIO = ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/3gpp'];

/** Documents a reporter may send as a LINE file message, keyed by extension. */
const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
};

export const KIND_LABEL: Record<MediaKind, string> = { image: 'รูป', video: 'วิดีโอ', audio: 'คลิปเสียง', file: 'ไฟล์' };

/** `accept` attribute for the simulator's file picker. */
export const UPLOAD_ACCEPT = ['image/*', 'video/*', 'audio/*', ...Object.keys(FILE_TYPES).map((e) => `.${e}`)].join(',');

const baseMime = (m: string) => m.split(';')[0].trim().toLowerCase();
const extOf = (name?: string | null) => (name?.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? '').toLowerCase();

export type MediaCheck = { ok: true; mimeType: string } | { ok: false; reason: 'type' | 'size' };

/**
 * Decide whether to keep a piece of content and which MIME type to store it under.
 * File messages often arrive as application/octet-stream, so they go by extension.
 */
export function checkMedia(kind: MediaKind, mimeType: string, size: number, fileName?: string | null): MediaCheck {
  if (size > MAX_MEDIA_BYTES) return { ok: false, reason: 'size' };
  const m = baseMime(mimeType);
  if (kind === 'image') return IMAGE.includes(m) ? { ok: true, mimeType: m } : { ok: false, reason: 'type' };
  if (kind === 'video') return VIDEO.includes(m) ? { ok: true, mimeType: m } : { ok: false, reason: 'type' };
  if (kind === 'audio') return AUDIO.includes(m) ? { ok: true, mimeType: m } : { ok: false, reason: 'type' };
  const byExt = FILE_TYPES[extOf(fileName)];
  return byExt ? { ok: true, mimeType: byExt } : { ok: false, reason: 'type' };
}

/** Kind of a simulator upload, from the browser-reported MIME type. */
export function kindOfUpload(mimeType: string): MediaKind {
  const m = baseMime(mimeType);
  if (IMAGE.includes(m)) return 'image';
  if (VIDEO.includes(m)) return 'video';
  if (AUDIO.includes(m)) return 'audio';
  return 'file';
}

/** "1 รูป · 1 วิดีโอ · 1 ไฟล์"; `kinds` missing means every item is an image (MVP round 1 data). */
export function mediaSummary(count: number, kinds?: MediaKind[]): string {
  const list: MediaKind[] = kinds && kinds.length === count ? kinds : Array(count).fill('image');
  const order: MediaKind[] = ['image', 'video', 'audio', 'file'];
  return order
    .map((k) => [k, list.filter((x) => x === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${KIND_LABEL[k]}`)
    .join(' · ');
}

/** "2.4 MB", "830 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export const MEDIA_ERROR_TEXT: Record<'type' | 'size' | 'transcoding' | 'transcoding_failed' | 'fetch' | 'external', string> = {
  type: 'ไม่รองรับไฟล์ชนิดนี้',
  size: `ไฟล์ใหญ่เกิน ${MAX_MEDIA_LABEL}`,
  transcoding: 'LINE ยังเตรียมไฟล์ไม่เสร็จภายใน 30 วินาที',
  transcoding_failed: 'LINE เตรียมไฟล์ไม่สำเร็จ',
  fetch: 'ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ',
  external: 'ไฟล์อยู่กับผู้ให้บริการภายนอก ระบบดาวน์โหลดไม่ได้',
};
export type MediaFailure = keyof typeof MEDIA_ERROR_TEXT;
