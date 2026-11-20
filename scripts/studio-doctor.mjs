import { existsSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

let failed = false;
function report(label, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + ' — ' + detail);
  if (!ok) failed = true;
}

function origin(value) {
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

const studio = origin(process.env.STUDIO_ORIGIN);
const supabase = origin(process.env.SUPABASE_URL?.replace(/\/$/, ''));
const hosted = process.argv.includes('--hosted');
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const validStudio = studio && (hosted
  ? studio.protocol === 'https:' && !loopback.has(studio.hostname)
  : studio.protocol === 'https:' || (studio.protocol === 'http:' && loopback.has(studio.hostname)));
report('Studio origin', !!validStudio, hosted ? 'Expected a hosted HTTPS origin.' : 'Expected HTTPS or a local HTTP origin.');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const validKey = !!publishableKey && !publishableKey.startsWith('sb_secret_')
  && publishableKey !== process.env.SUPABASE_SERVICE_ROLE_KEY;
report('Supabase configuration', !!supabase && supabase.protocol === 'https:' && validKey,
  'Expected an HTTPS project origin and a publishable key.');

if (supabase?.protocol === 'https:' && validKey) {
  try {
    const response = await fetch(new URL('/auth/v1/settings', supabase), {
      headers: { apikey: publishableKey },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    report('Supabase Auth reachability', response.ok, 'HTTP ' + response.status + '. Staff sign-in is checked separately.');
  } catch (error) {
    report('Supabase Auth reachability', false, error.name === 'TimeoutError' ? 'Connection timed out.' : 'Connection failed.');
  }
}

if (validStudio && loopback.has(studio.hostname)) {
  try {
    const response = await fetch(new URL('/studio/login', studio), {
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    await response.body?.cancel();
    report('Local Studio login page', response.ok, 'HTTP ' + response.status + '.');
  } catch {
    report('Local Studio login page', false, 'The configured server did not return the login page.');
  }
}

if (failed) process.exitCode = 1;
