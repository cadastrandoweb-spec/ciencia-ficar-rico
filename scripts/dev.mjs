import { spawn } from 'node:child_process';

const procs = [];

function run(name, command) {
  const p = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  p.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  procs.push({ name, p });
}

run('api', 'node --watch server/index.js');
run('web', 'vite');

function shutdown() {
  for (const { p } of procs) {
    try {
      p.kill();
    } catch {
      // ignore
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
