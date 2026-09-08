import { z } from 'zod';
import { BridgeError } from './errors.js';
import type { RemoteGateway } from './remote.js';
import type { TranscriptPage } from './types.js';

const rowid = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const pageSchema = z.object({
  agentId: z.uuid(), name: z.string(),
  entries: z.array(z.object({
    rowid, role: z.enum(['user', 'assistant']), content: z.string().max(8000),
    timestamp: z.iso.datetime({ offset: true }).nullable(), contentTruncated: z.boolean(), isStreaming: z.boolean(),
    requestId: z.string().max(200).nullable(), clientNonce: z.string().max(200).nullable(),
  })).max(50),
  hasMore: z.boolean(), nextBeforeRowid: rowid.nullable(),
});

export async function readTranscript(remote: RemoteGateway, agentId: string, beforeRowid?: number): Promise<TranscriptPage> {
  z.uuid().parse(agentId);
  if (beforeRowid !== undefined) rowid.parse(beforeRowid);
  const args = ['history', '--agent-id', agentId, '--limit', '50'];
  if (beforeRowid !== undefined) args.push('--before-rowid', String(beforeRowid));
  const result = await remote.run(args);
  const parsed = pageSchema.safeParse(result.events.find(e => e.action === 'history'));
  if (result.exitCode !== 0 || !parsed.success) throw new BridgeError('transcript_unavailable', 'Grok Bot history could not be read. Check SSH access and try again.', 502);
  const page = parsed.data;
  if (page.agentId !== agentId || page.hasMore !== (page.nextBeforeRowid !== null)
      || (beforeRowid !== undefined && page.nextBeforeRowid !== null && page.nextBeforeRowid >= beforeRowid)
      || page.entries.some((e, i) => (beforeRowid !== undefined && e.rowid >= beforeRowid)
        || (i > 0 && e.rowid <= page.entries[i - 1].rowid)
        || (page.nextBeforeRowid !== null && e.rowid < page.nextBeforeRowid))) {
    throw new BridgeError('invalid_transcript', 'History did not match the selected bot or page. No message was sent.', 502);
  }
  return page;
}
