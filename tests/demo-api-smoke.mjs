import assert from 'node:assert/strict';

const root = 'http://127.0.0.1:4000';
const checks = [];
function mark(name) { checks.push(name); console.log('PASS API:', name); }
async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(root + path, options);
  const type = response.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await response.json() : await response.text();
  assert.equal(response.status, expectedStatus, path + ' expected ' + expectedStatus + ' got ' + response.status + ': ' + JSON.stringify(body).slice(0, 500));
  return body;
}
function json(method, data, extra = {}) {
  return { method, headers: { 'content-type': 'application/json', ...(extra.headers ?? {}) }, body: JSON.stringify(data) };
}
try {
  const health = await request('/api/health');
  assert.equal(health.status, 'ok'); mark('health endpoint');

  const meta = await request('/api/cases/meta');
  assert.ok(meta.councils.length >= 5);
  assert.ok(meta.categories.includes('Lift'));
  const councilId = meta.councils[0].id;
  mark('case metadata and councils');

  const first = await request('/api/cases?pageSize=5');
  assert.ok(first.total > 0);
  assert.ok(Array.isArray(first.data)); mark('database-backed case list');

  const summary = await request('/api/cases/summary');
  assert.ok(summary.data.total > 0); mark('feedback summary');

  const receivedAt = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
  const newCase = {
    townCouncilId: councilId, block: '8999', category: 'Lift',
    channel: 'OneService', description: 'Automated isolated smoke test: lift stops unexpectedly',
    status: 'Open', receivedAt
  };
  await request('/api/cases', json('POST', {...newCase, block:'Blk 8999'}), 400);
  mark('invalid block rejected with HTTP 400');

  const created = (await request('/api/cases', json('POST', newCase), 201)).data;
  assert.match(created.caseRef, /^FB-/);
  assert.equal(created.block, '8999');
  mark('create case and response reference');

  const fetched = (await request('/api/cases/' + encodeURIComponent(created.caseRef))).data;
  assert.equal(fetched.id, created.id); mark('retrieve case details');

  const acknowledged = (await request('/api/cases/' + encodeURIComponent(created.caseRef), json('PATCH', {acknowledgedAt: new Date().toISOString()}))).data;
  assert.ok(acknowledged.acknowledgedAt); mark('acknowledge case');

  const closed = (await request('/api/cases/' + encodeURIComponent(created.caseRef), json('PATCH', {status:'Closed'}))).data;
  assert.equal(closed.status, 'Closed');
  assert.ok(closed.closedAt); mark('close case');

  const reopened = (await request('/api/cases/' + encodeURIComponent(created.caseRef), json('PATCH', {status:'Open'}))).data;
  assert.equal(reopened.status, 'Open');
  assert.equal(reopened.closedAt, null); mark('reopen case');

  const search = await request('/api/cases?q=' + encodeURIComponent(created.caseRef));
  assert.ok(search.data.some(x => x.caseRef === created.caseRef)); mark('case search');

  const template = await fetch(root + '/api/cases/import/template');
  assert.equal(template.status, 200);
  assert.ok((await template.arrayBuffer()).byteLength > 4000); mark('download import template');

  const sampleResponse = await fetch(root + '/api/cases/import/sample');
  assert.equal(sampleResponse.status, 200);
  const sample = Buffer.from(await sampleResponse.arrayBuffer());
  assert.ok(sample.length > 4000);
  const preview = await request('/api/cases/import/preview', {method:'POST', headers:{'content-type':'application/octet-stream'}, body:sample});
  assert.equal(preview.counts.total, 25);
  assert.equal(preview.counts.error, 4);
  assert.ok(preview.counts.duplicate >= 1);
  mark('sample workbook preview, duplicates and row validation');

  const councilName = meta.councils[0].name;
  const csv = [
    'Town Council,Block,Category,Channel,Description,Received At',
    [councilName, '8998', 'Pests', 'Email', 'Unique test case', '17/11/2026 12:00'].map(v => '"' + String(v).replaceAll('"','""') + '"').join(','),
    [councilName, 'Blk BAD', 'Lift', 'Email', 'Invalid block', '17/11/2026 13:00'].map(v => '"' + String(v).replaceAll('"','""') + '"').join(',')
  ].join('\r\n');
  const csvPreview = await request('/api/cases/import/preview', {method:'POST', headers:{'content-type':'text/csv'}, body:csv});
  assert.equal(csvPreview.counts.total, 2);
  assert.equal(csvPreview.counts.error, 1);
  assert.equal(csvPreview.counts.ready, 1);
  mark('CSV preview isolates invalid rows');

  const ready = csvPreview.rows.find(row => row.result === 'ready');
  assert.ok(ready?.value);
  const imported = await request('/api/cases/import', json('POST', {rows:[ready.value]}), 201);
  assert.equal(imported.imported, 1);
  mark('confirmed CSV import commits 1 valid case');

  const definitions = await request('/api/kpis/definitions');
  assert.ok(definitions.data.length >= 1);
  mark('KPI definitions');

  await request('/api/kpis/overview');
  mark('KPI overview');

  await request('/api/kpis/definitions', json('POST', {name:'Disallowed read-only role test'}, {headers:{'x-estara-role':'Field Inspector'}}), 403);
  mark('restricted KPI mutation returns 403');

  await request('/api/auth/login', json('POST', {}), 501);
  await request('/api/ai/query', json('POST', {}), 501);
  await request('/api/not-a-real-route', {}, 404);
  mark('unimplemented endpoints return documented status codes');

  console.log('API SMOKE TESTS: ' + checks.length + '/' + checks.length + ' passed.');
} catch (error) {
  console.error('API SMOKE FAILURE after ' + checks.length + ' successful checks:', error);
  process.exitCode = 1;
}
