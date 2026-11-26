import type { AiRetention } from '@/types/ai';
export const AI_RETENTION_KEY = 'octablaster_ai_retention';
export function retentionFromData(data: Record<string, any>): AiRetention {
  const value = data[AI_RETENTION_KEY];
  return value && Number.isInteger(value.idleDays) && value.idleDays >= 1
    && Number.isInteger(value.maxDays) && value.maxDays >= value.idleDays && value.maxDays <= 365
    ? value : { idleDays: 30, maxDays: 90 };
}
export function expiredLocalRecord(record: { usedAt?: number; createdAt?: number; updatedAt: number }, policy: AiRetention, now: number) {
  return now - (record.usedAt || record.updatedAt) > policy.idleDays * 86_400_000
    || now - (record.createdAt || record.updatedAt) > policy.maxDays * 86_400_000;
}
