import type { TranscriptEntry, TranscriptPage } from '../server/types.js';
import type { ConversationOperation } from './conversation.js';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const optionalText = (v: unknown) => v === null || (typeof v === 'string' && v.length <= 200);
export function isTranscriptPage(v: unknown): v is TranscriptPage {
  if (!object(v) || typeof v.agentId !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.entries) || v.entries.length > 50
      || typeof v.hasMore !== 'boolean' || !(v.nextBeforeRowid === null || id(v.nextBeforeRowid)) || v.hasMore !== (v.nextBeforeRowid !== null)) return false;
  return v.entries.every((entry, index, entries) => object(entry) && id(entry.rowid)
    && (index === 0 || entry.rowid > entries[index - 1].rowid)
    && (v.nextBeforeRowid === null || entry.rowid >= (v.nextBeforeRowid as number))
    && ['user', 'assistant'].includes(String(entry.role)) && typeof entry.content === 'string' && entry.content.length <= 8000
    && (entry.timestamp === null || (typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp))))
    && typeof entry.contentTruncated === 'boolean' && typeof entry.isStreaming === 'boolean'
    && optionalText(entry.requestId) && optionalText(entry.clientNonce));
}

/** Hide only proven bridge copies. Similar text alone is never enough. */
export function visibleTranscript(agentId: string, entries: TranscriptEntry[], operations: ConversationOperation[]): TranscriptEntry[] {
  const runs = operations.filter(o => o.agentId === agentId).flatMap(o => o.run ? [o.run] : []);
  const requestIds = new Set(runs.filter(r => r.status === 'reply_recorded' && r.requestId).map(r => r.requestId));
  const copiedRows = new Set<number>();
  for (const entry of entries) {
    if (entry.role !== 'user' || entry.contentTruncated) continue;
    const match = runs.some(run => run.afterRowid !== null && entry.rowid > run.afterRowid && entry.clientNonce === run.marker
      && entry.content === `${run.prompt}\n\n[Bridge correlation: ${run.marker}]`);
    if (match) { copiedRows.add(entry.rowid); if (entry.requestId) requestIds.add(entry.requestId); }
  }
  return entries.filter(entry => !copiedRows.has(entry.rowid) && (!entry.requestId || !requestIds.has(entry.requestId)));
}
