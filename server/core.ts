import { Creations } from './creation.js';
import { readTranscript } from './transcript.js';
import { z } from 'zod';
import { Store } from './store.js';
import { BridgeError } from './errors.js';
import type { RemoteGateway } from './remote.js';
import type { Agent, BridgeApi, MessageRun } from './types.js';
import type { History } from './history.js';

const sendSchema = z.object({ messageId: z.uuid(), agentId: z.uuid(), prompt: z.string().trim().min(1).max(8000) }).strict();
export class Bridge implements BridgeApi {
  private creationStore: Creations;
  constructor(private store: Store, private remote: RemoteGateway, private history: History) { this.creationStore = new Creations(store, remote); }
  creations() { return this.creationStore.list(); }
  transcript(agentId: string, beforeRowid?: number) { return readTranscript(this.remote, agentId, beforeRowid); }
  createAgent(input: Parameters<BridgeApi['createAgent']>[0]) { return this.creationStore.create(input); }
  verifyCreation(id: string) { return this.creationStore.verify(id); }
  async agents() {
    const result = await this.remote.run(['discover']);
    const event = result.events.find(e => e.action === 'discover');
    if (result.exitCode !== 0 || !event || !Array.isArray(event.agents)) throw new BridgeError('gateway_unavailable', 'Cannot discover Grok Bot agents over NetBird.', 502);
    const agents = z.array(z.object({ agentId: z.uuid(), name: z.string() })).parse(event.agents);
    return { agents, health: event.health as Record<string, unknown> };
  }
  messages() { return this.store.list(); }
  async send(raw: { messageId: string; agentId: string; prompt: string }): Promise<MessageRun> {
    const input = sendSchema.parse(raw);
    const previous = this.store.get(input.messageId);
    if (previous) {
      if (previous.agentId !== input.agentId || previous.prompt !== input.prompt) throw new BridgeError('message_id_conflict', 'This message ID already refers to other content.', 409);
      return previous; // Never repeat a POST for a durable client message ID.
    }
    const { agents } = await this.agents();
    const agent = agents.find((a: Agent) => a.agentId === input.agentId);
    if (!agent) throw new BridgeError('agent_not_found', 'Select a currently discovered Grok Bot agent.', 404);
    const now = new Date().toISOString();
    const initial: MessageRun = { id: input.messageId, agentId: agent.agentId, agentName: agent.name, prompt: input.prompt, marker: `GB_${input.messageId.replaceAll('-', '_')}`, afterRowid: null, status: 'prepared', reply: null, requestId: null, error: null, createdAt: now, updatedAt: now };
    const claimed = this.store.create(initial);
    if (!claimed.created) return claimed.run;
    let postIntentPersisted = false;
    try {
      const prepared = await this.remote.run(['prepare', '--agent-name', agent.name, '--marker', initial.marker]);
      const prep = prepared.events.find(e => e.action === 'prepare');
      if (prepared.exitCode !== 0 || prep?.agentId !== agent.agentId || prep?.name !== agent.name || prep?.existingMarkerRows !== 0 || !Number.isInteger(prep.afterRowid)) throw new BridgeError('prepare_failed', 'Could not safely prepare this named agent. Nothing was sent.', 502);
      // /health.isBusy aggregates all agents and background shell work; it
      // cannot establish that this named target rejects a new prompt. Let the
      // gateway admit the addressed request, preserving our durable nonce and
      // one-unresolved-operation-per-agent guard in Store.create.
      const intent = this.store.update(initial.id, { afterRowid: prep.afterRowid, status: 'sending' });
      if (intent.status !== 'sending') return intent;
      postIntentPersisted = true;
      const prompt = `${input.prompt}\n\n[Bridge correlation: ${initial.marker}]`;
      const result = await this.remote.run(['send', '--agent-id', agent.agentId, '--expected-name', agent.name, '--marker', initial.marker, '--after-rowid', String(prep.afterRowid), '--prompt', prompt]);
      const accepted = result.events.find(e => e.phase === 'post_result');
      if (result.exitCode === 0 && accepted?.accepted === true && accepted?.httpStatus === 200) return this.store.update(initial.id, { status: 'accepted' });
      return this.store.update(initial.id, { status: 'delivery_uncertain', error: 'Gateway delivery is uncertain. Check the same message; do not resend.' });
    } catch (error) {
      return this.store.update(initial.id, { status: postIntentPersisted ? 'delivery_uncertain' : 'failed', error: error instanceof BridgeError ? error.message : 'Operation failed; no automatic resend will occur.' });
    }
  }
  async verify(messageId: string): Promise<MessageRun> {
    z.uuid().parse(messageId);
    const run = this.store.get(messageId);
    if (!run) throw new BridgeError('not_found', 'Message not found.', 404);
    if (run.afterRowid === null || run.status === 'failed') return run;
    try {
      const result = await this.remote.run(['verify', '--agent-id', run.agentId, '--marker', run.marker, '--after-rowid', String(run.afterRowid)]);
      const proof = result.events.find(e => e.action === 'verify');
      if (result.exitCode !== 0 || !proof || proof.agentId !== run.agentId || proof.marker !== run.marker || proof.afterRowid !== run.afterRowid) throw new BridgeError('verification_failed', 'Reply verification failed. Do not resend.', 502);
      if (proof.status === 'reply_recorded' && proof.prompt?.rowid > run.afterRowid && proof.prompt?.requestId && proof.prompt?.clientNonce === run.marker && proof.prompt?.content === `${run.prompt}\n\n[Bridge correlation: ${run.marker}]`) {
        const replies = proof.replies?.filter((r: any) => r.rowid > proof.prompt.rowid && r.requestId === proof.prompt.requestId && typeof r.content === 'string' && !r.contentTruncated && r.isStreaming !== true);
        if (replies?.length) return this.store.update(messageId, { status: 'reply_recorded', reply: replies.map((r: any) => r.content).join('\n\n'), requestId: proof.prompt.requestId, error: null });
      }
      // No row is not proof of non-delivery. The original ID remains reserved.
      return this.store.update(messageId, { status: 'reply_pending', error: proof.status === 'ambiguous_multiple_prompts' ? 'Ambiguous transcript evidence; manual review required.' : null });
    } catch { return this.store.update(messageId, { error: 'Read-only verification unavailable. Keep this message ID and check again; do not resend.' }); }
  }
  search(input: Parameters<BridgeApi['search']>[0]) { return this.history.search(input); }
  historyStatus() { return this.history.status(); }
  readHistory(id: string) { return this.history.read(id); }
}
