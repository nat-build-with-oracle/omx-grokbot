import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BridgeError } from './errors.js';

export interface RemoteResult { exitCode: number | null; events: Record<string, any>[] }
export interface RemoteGateway { run(argv: string[]): Promise<RemoteResult> }
export function sshArguments(host: string, command: string, identityFile?: string): string[] {
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=12'];
  if (identityFile) args.push('-i', identityFile, '-o', 'IdentitiesOnly=yes');
  return [...args, host, command];
}
export class SshGateway implements RemoteGateway {
  constructor(private host: string, private identityFile?: string) {}
  run(argv: string[]): Promise<RemoteResult> {
    const source = readFileSync(fileURLToPath(new URL('../scripts/grokbot-gateway.py', import.meta.url)));
    // Only fixed program code enters the SSH command. All variable prompt/ID
    // data travels on stdin, never through a shell or process argument list.
    const code = `import json,sys; r=json.load(sys.stdin); sys.argv=['grokbot-gateway']+r['argv']; exec(bytes.fromhex('${source.toString('hex')}'),{'__name__':'__main__'})`;
    const command = `python3 -c '${code.replaceAll("'", "'\\''")}'`;
    return new Promise((resolve, reject) => {
      const child = spawn('ssh', sshArguments(this.host, command, this.identityFile), { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = ''; let failed = false;
      const fail = (code: string) => { if (!failed) { failed = true; child.kill('SIGTERM'); reject(new BridgeError(code, 'SSH operation did not finish reliably. Verify before any resend.', 502)); } };
      const timer = setTimeout(() => fail('ssh_timeout'), 35_000);
      child.stdout.on('data', (data: Buffer) => { out += data.toString(); if (Buffer.byteLength(out) > 1_048_576) fail('ssh_output_limit'); });
      // Do not retain or return raw stderr, remote command lines or credentials.
      child.stderr.resume();
      child.on('error', () => fail('ssh_unavailable'));
      child.stdin.on('error', () => fail('ssh_input_error'));
      child.on('close', exitCode => {
        clearTimeout(timer);
        if (failed) return;
        try {
          const events = out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
          if (!events.length) return reject(new BridgeError('ssh_failed', 'SSH returned no verified gateway result.', 502));
          resolve({ exitCode, events });
        } catch { reject(new BridgeError('invalid_remote_result', 'SSH result could not be verified.', 502)); }
      });
      child.stdin.end(JSON.stringify({ argv }));
    });
  }
}
