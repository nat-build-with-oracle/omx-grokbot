import test from 'node:test';
import assert from 'node:assert/strict';
import { sshArguments } from '../server/remote.js';

test('default SSH transport preserves strict host checking and noninteractive authentication', () => {
  assert.deepEqual(sshArguments('box@grokbot1', 'python3 -'), [
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12',
    'box@grokbot1', 'python3 -',
  ]);
});

test('explicit SSH identity remains one argument and excludes unrelated agent identities', () => {
  const identity = '/private/keys/key with spaces;not-a-command';
  assert.deepEqual(sshArguments('box@grokbot1.oracle.netbird', 'python3 -', identity), [
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12',
    '-i', identity, '-o', 'IdentitiesOnly=yes', 'box@grokbot1.oracle.netbird', 'python3 -',
  ]);
});

test('authorized commu.oracle target remains one SSH argument with strict checking', () => {
  assert.deepEqual(sshArguments('box@grokbot1.commu.oracle', 'python3 -'), [
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12',
    'box@grokbot1.commu.oracle', 'python3 -',
  ]);
});
