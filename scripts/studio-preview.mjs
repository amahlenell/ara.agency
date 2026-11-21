import { spawn } from 'node:child_process';

// Opt in for this process only. The ordinary dev/start commands retain staff sign-in.
const application = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '4173',
], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, NODE_ENV: 'development', STUDIO_LOCAL_PREVIEW: 'true', STUDIO_ORIGIN: 'http://127.0.0.1:4173' },
});
application.on('error', error => { console.error('Studio preview could not start:', error.message); process.exitCode = 1; });
application.on('exit', code => { process.exitCode = code ?? 1; });
