/* eslint-env node */
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { redactSecrets } from './core.mjs';

const [label, cwd, command, encodedArgs] = process.argv.slice(2);

if (!label || !cwd || !command || !encodedArgs) {
  console.error(
    'Usage: node log-runner.mjs <label> <cwd> <command> <base64-json-args>',
  );
  process.exit(2);
}

let args;
try {
  args = JSON.parse(Buffer.from(encodedArgs, 'base64url').toString('utf8'));
} catch {
  console.error('Invalid encoded command arguments.');
  process.exit(2);
}

function write(stream, line) {
  stream.write(
    `[${new Date().toISOString()}] [${label}] ${redactSecrets(
      line,
      process.env,
    )}\n`,
  );
}

write(process.stdout, `starting ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  cwd,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const [stream, output] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  readline
    .createInterface({ input: stream })
    .on('line', (line) => write(output, line));
}

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  write(process.stdout, `forwarding ${signal}`);
  child.kill(signal);
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

child.on('error', (error) => {
  write(process.stderr, `spawn failed: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  write(
    code === 0 ? process.stdout : process.stderr,
    signal ? `exited from ${signal}` : `exited with code ${code ?? 'unknown'}`,
  );
  process.exit(code ?? (signal ? 1 : 0));
});
