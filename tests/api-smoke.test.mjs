import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 49187;
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), WEB_ORIGIN: 'http://localhost:5173' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });
after(() => { server.kill(); });

async function ready() {
  const limit = Date.now() + 15000;
  while (Date.now() < limit) {
    if (server.exitCode !== null) throw new Error('API exited unexpectedly: ' + output);
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('API never became ready: ' + output);
}
await ready();

test('health is JSON and reports demo mode', async () => {
  const response = await fetch(base + '/api/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok', app: 'Estara', mode: 'demo' });
});
test('overview has the expected domain collections', async () => {
  const response = await fetch(base + '/api/overview');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.demo, true);
  assert.ok(Array.isArray(body.kpis));
  assert.ok(Array.isArray(body.alerts));
  assert.ok(Array.isArray(body.scores));
  assert.equal(typeof body.summary.openCases, 'number');
});
test('legacy API collections keep consistent JSON envelopes', async () => {
  for (const path of ['/api/demo/kpis', '/api/alerts', '/api/actions', '/api/reports']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.equal(body.demo, true, path);
    assert.ok(Array.isArray(body.data), path);
  }
});
test('unknown API routes return 404 without a stack trace', async () => {
  const response = await fetch(base + '/api/not-a-real-endpoint');
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.message, 'API route not found.');
  assert.equal(body.stack, undefined);
});
test('unimplemented authentication and AI routes explicitly report 501', async () => {
  for (const path of ['/api/auth/login', '/api/ai/chat']) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 501, path);
  }
});
test('oversized JSON requests are rejected with 413', async () => {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(1024 * 1024 + 100) })
  });
  assert.equal(response.status, 413);
});
test('HTTP security headers are enabled and server header is hidden', async () => {
  const response = await fetch(base + '/api/health');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('content-security-policy'));
});
test('CORS is configured for the approved local frontend', async () => {
  const response = await fetch(base + '/api/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const other = await fetch(base + '/api/health', { headers: { Origin: 'https://unapproved.example' } });
  assert.notEqual(other.headers.get('access-control-allow-origin'), 'https://unapproved.example');
});
