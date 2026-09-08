import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { Creations } from '../server/creation.js';

test('creation reserves ID before concurrent requests, verifies profile, and rejects changed input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'creation-')); const store = new Store(dir);
  const operationId = randomUUID(), agentId = randomUUID(); let posts = 0;
  const creations = new Creations(store, { async run(argv) {
    if (argv[0] === 'create-agent') {
      posts++; await new Promise(resolve => setTimeout(resolve, 10));
      return { exitCode: 0, events: [{ action: 'create-agent', operationId, agentId, httpStatus: 200 }] };
    }
    return { exitCode: 0, events: [{ action: 'verify-agent', agentId, name: 'Bridge test', verified: true }] };
  } });
  try {
    const input = { operationId, name: 'Bridge test' };
    await Promise.all([creations.create(input), creations.create(input)]);
    assert.equal(posts, 1); assert.equal(creations.get(operationId).status, 'verified');
    await assert.rejects(creations.create({ ...input, name: 'Different' }));
    assert.equal((await creations.verify(operationId)).agentId, agentId);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('lost creation response remains uncertain across restart and never resends', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'creation-')); let store = new Store(dir);
  let calls = 0; const remote = { async run(): Promise<never> { calls++; throw new Error('timeout'); } };
  const input = { operationId: randomUUID(), name: 'New bot' };
  try {
    assert.equal((await new Creations(store, remote).create(input)).status, 'creation_uncertain');
    store.close(); store = new Store(dir);
    const creations = new Creations(store, remote);
    assert.equal((await creations.create(input)).status, 'creation_uncertain');
    await creations.verify(input.operationId); assert.equal(calls, 1);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('mismatched profile is not creation proof', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'creation-')); const store = new Store(dir);
  const operationId = randomUUID(), agentId = randomUUID();
  const creations = new Creations(store, { async run(argv) {
    return { exitCode: 0, events: argv[0] === 'create-agent'
      ? [{ action: 'create-agent', operationId, agentId, httpStatus: 200 }]
      : [{ action: 'verify-agent', agentId, name: 'Other', verified: true }] };
  } });
  try { assert.equal((await creations.create({ operationId, name: 'New' })).status, 'created_unverified'); }
  finally { store.close(); rmSync(dir, { recursive: true }); }
});
