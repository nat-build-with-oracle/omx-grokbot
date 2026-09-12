import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../server/config.js';

const approvedGrokHosts = [
  'box@grokbot1',
  'box@grokbot1.oracle.netbird',
  'box@grokbot1.commu.oracle',
] as const;

function withConfigEnvironment(grokHost: string | undefined, run: () => void): void {
  const dataDir = mkdtempSync(join(tmpdir(), 'grokbot-config-test-'));
  const previous = {
    BRIDGE_DATA_DIR: process.env.BRIDGE_DATA_DIR,
    BRIDGE_OWNER_SECRET: process.env.BRIDGE_OWNER_SECRET,
    BRIDGE_API_TOKEN: process.env.BRIDGE_API_TOKEN,
    GROKBOT_SSH_HOST: process.env.GROKBOT_SSH_HOST,
  };
  try {
    writeFileSync(join(dataDir, 'access.json'), JSON.stringify({
      ownerSecret: 'test-owner-secret-0000000000000000',
      apiToken: 'test-api-token-000000000000000000',
    }));
    process.env.BRIDGE_DATA_DIR = dataDir;
    delete process.env.BRIDGE_OWNER_SECRET;
    delete process.env.BRIDGE_API_TOKEN;
    if (grokHost === undefined) delete process.env.GROKBOT_SSH_HOST;
    else process.env.GROKBOT_SSH_HOST = grokHost;
    run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
}

test('Grok SSH configuration preserves the default target', () => {
  withConfigEnvironment(undefined, () => {
    assert.equal(loadConfig().grokHost, 'box@grokbot1');
  });
});

for (const host of approvedGrokHosts) {
  test(`Grok SSH configuration accepts approved target ${host}`, () => {
    withConfigEnvironment(host, () => {
      assert.equal(loadConfig().grokHost, host);
    });
  });
}

for (const host of [
  'box@unapproved.example',
  'root@grokbot1.commu.oracle',
  'box@grokbot1.commu.oracle; touch /tmp/injected',
]) {
  test(`Grok SSH configuration rejects unapproved target ${host}`, () => {
    withConfigEnvironment(host, () => {
      assert.throws(() => loadConfig(), /approved Grok Bot SSH target/);
    });
  });
}
