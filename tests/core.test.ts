import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { Bridge } from '../server/core.js';
import type { History } from '../server/history.js';
import type { RemoteGateway, RemoteResult } from '../server/remote.js';

const aid = 'cfecd8d4-bbe9-43e0-ba9c-606b3bd460d3';
class FakeRemote implements RemoteGateway {
  posts = 0;
  uncertain = false;
  malformedProof = false;
  sentPrompt = '';
  async run(argv: string[]): Promise<RemoteResult> {
    const action = argv[0];
    const val = (key: string) => argv[argv.indexOf(key) + 1];
    let event: any;
    if (action === 'discover') event = { action, agents: [{ agentId: aid, name: 'OMX Proxy' }], health: { ok: true } };
    else if (action === 'prepare') event = { action, agentId: aid, name: 'OMX Proxy', afterRowid: 8, existingMarkerRows: 0, health: { isBusy: false } };
    else if (action === 'send') {
      this.posts++; this.sentPrompt = val('--prompt');
      if (this.uncertain) throw new Error('network lost after POST');
      event = { action, phase: 'post_result', httpStatus: 200, accepted: true };
    } else {
      event = { action, agentId: aid, marker: val('--marker'), afterRowid: 8, status: 'reply_recorded', prompt: { rowid: 9, requestId: 'request-1', clientNonce: val('--marker'), content: this.malformedProof ? 'wrong content' : this.sentPrompt }, replies: [{ rowid: 11, requestId: 'request-1', content: 'Verified reply', contentTruncated: false, isStreaming: false }] };
    }
    return { exitCode: 0, events: [event] };
  }
}
function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'grokbot-core-'));
  const store = new Store(path); const remote = new FakeRemote();
  const bridge = new Bridge(store, remote, {} as History);
  return { store, remote, bridge, path, close: () => { store.close(); rmSync(path, { recursive: true, force: true }); } };
}
test('durable client ID suppresses concurrent duplicate POST and rejects changed content', async () => {
  const f = fixture(); try {
    const input = { messageId: randomUUID(), agentId: aid, prompt: 'One greeting' };
    await Promise.all([f.bridge.send(input), f.bridge.send(input)]);
    assert.equal(f.remote.posts, 1);
    assert.equal((await f.bridge.send(input)).status, 'accepted');
    await assert.rejects(f.bridge.send({ ...input, prompt: 'Different' }), /other content/);
    assert.equal(f.remote.posts, 1);
  } finally { f.close(); }
});
test('uncertain acknowledgement preserves original ID and verification does not resend', async () => {
  const f = fixture(); try {
    f.remote.uncertain = true;
    const input = { messageId: randomUUID(), agentId: aid, prompt: 'Check connectivity' };
    assert.equal((await f.bridge.send(input)).status, 'delivery_uncertain');
    assert.equal((await f.bridge.send(input)).status, 'delivery_uncertain');
    await assert.rejects(f.bridge.send({ ...input, messageId: randomUUID() }), /pending message/);
    const result = await f.bridge.verify(input.messageId);
    assert.equal(result.status, 'reply_recorded'); assert.equal(result.reply, 'Verified reply');
    assert.equal(f.remote.posts, 1);
  } finally { f.close(); }
});
test('verification rejects marker-bearing proof with mismatched prompt content', async () => {
  const f = fixture(); try {
    const input = { messageId: randomUUID(), agentId: aid, prompt: 'One greeting' };
    await f.bridge.send(input); f.remote.malformedProof = true;
    assert.equal((await f.bridge.verify(input.messageId)).status, 'reply_pending');
    assert.equal(f.store.get(input.messageId)?.reply, null);
  } finally { f.close(); }
});
test('opening a CLI store does not reconcile an active sender; explicit recovery does', async () => {
  const f = fixture(); try {
    const id = randomUUID();
    f.store.create({ id, agentId: aid, agentName: 'OMX Proxy', prompt: 'x', marker: `GB_${id}`, afterRowid: 8, status: 'sending', reply: null, requestId: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const reader = new Store(f.path);
    assert.equal(reader.get(id)?.status, 'sending');
    reader.recoverInterrupted(); assert.equal(reader.get(id)?.status, 'delivery_uncertain');
    reader.close();
  } finally { f.close(); }
});
test('late acceptance or pending verification cannot downgrade a recorded reply', async () => {
  const f = fixture(); try {
    const input = { messageId: randomUUID(), agentId: aid, prompt: 'One greeting' };
    await f.bridge.send(input); await f.bridge.verify(input.messageId);
    for (const status of ['accepted', 'delivery_uncertain', 'reply_pending'] as const) {
      const run = f.store.update(input.messageId, { status, error: 'late event' });
      assert.equal(run.status, 'reply_recorded'); assert.equal(run.reply, 'Verified reply'); assert.equal(run.error, null);
    }
  } finally { f.close(); }
});
