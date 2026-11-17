import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}, timezoneId:'Asia/Singapore', acceptDownloads:true});
page.setDefaultTimeout(15000);
const jsErrors=[];
const checked=[];
page.on('pageerror', e=>{jsErrors.push(e.message);console.error('BROWSER PAGEERROR:',e.message);});
function pass(label){checked.push(label);console.log('PASS UI:',label);}
async function open(route){
  await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('.sidebar').waitFor();
  await page.locator('.page-header h1').first().waitFor({timeout:15000});
  const recovery = page.getByText('Unable to display this page', {exact:true});
  assert.equal(await recovery.count(),0,route+' rendered error boundary');
  await page.waitForTimeout(250);
}
try {
  await open('/');
  assert.match(await page.locator('.page-header h1').first().innerText(),/System overview/);
  pass('home dashboard and navigation');

  await open('/operations/insights');
  await page.getByRole('link',{name:/Open My Profile/}).click();
  await page.getByRole('heading',{name:'Account settings'}).waitFor();
  assert.ok(page.url().includes('/settings?section=profile'));
  pass('previously crashing Operational Insights to Profile navigation');

  const name=page.getByLabel('Display name');
  await name.fill('Demo Presenter');
  await page.getByRole('button',{name:'Save changes'}).click();
  await page.getByText('Profile changes saved to this browser.').waitFor();
  assert.ok((await page.getByRole('link',{name:/Open My Profile/}).getAttribute('aria-label')).includes('Demo Presenter'));
  pass('edit and save profile');

  await page.getByRole('button',{name:/Appearance/}).click();
  await page.getByRole('button',{name:/Dark/}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.getByRole('button',{name:/Light/}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  pass('appearance light/dark controls');

  await page.getByRole('button',{name:/Notifications/}).click();
  await page.getByRole('checkbox').first().click();
  pass('notification settings controls');

  const picker=page.locator('.rp-picker select');
  for(const [role,expected] of [
    ['Administrator','System overview'],['EMS Manager','Performance at a glance'],
    ['Estate Officer','Case follow-up overview'],['Field Inspector','Inspection overview'],
    ['Management Viewer','Management overview']
  ]){
    await picker.selectOption(role);
    await open('/');
    assert.equal(await page.locator('.page-header h1').first().innerText(), expected);
    pass('role preview: '+role);
  }

  await picker.selectOption('Field Inspector');
  await page.goto(base+'/actions',{waitUntil:'domcontentloaded'});
  await page.getByText('Not available for Field Inspector').waitFor();
  pass('restricted role shows helpful access message');
  await picker.selectOption('Administrator');

  const routes=[
    '/','/cases','/operations/insights','/operations/hotspots','/operations/inspections','/operations/map',
    '/analytics','/analytics/trends','/analytics/factors','/analytics/settings','/analytics/scenarios',
    '/alerts','/actions','/risk/rules','/risk/replay','/reports','/assistant','/settings','/dev-tools'
  ];
  for (const route of routes){
    await open(route);
    pass('route renders: '+route);
  }

  await open('/cases');
  await page.locator('.ground-heading-actions button').first().click();
  const dialog=page.getByRole('dialog',{name:'Import feedback cases'});
  await dialog.waitFor();
  const downloadable=page.waitForEvent('download',{timeout:15000});
  await dialog.getByRole('link',{name:/Download template/}).click();
  const download=await downloadable;
  assert.match(download.suggestedFilename(),/xlsx/i);
  pass('Excel template download button');

  const csv='Town Council,Block,Category,Channel,Description,Received At\n' +
    'North District (demo),8997,Lighting,Email,Smoke test valid case,17/11/2026 11:00\n' +
    'North District (demo),Blk 10,Lift,Email,Smoke test bad block,17/11/2026 11:00\n';
  await dialog.locator('input[type=file]').setInputFiles({name:'estara-test.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await dialog.getByText('estara-test.csv').waitFor();
  await dialog.getByRole('button',{name:/Error/}).click();
  await dialog.getByText(/Block.*must be a number/i).waitFor();
  await dialog.getByRole('button',{name:/Ready/}).click();
  pass('import preview and invalid/ready row filters');

  page.once('dialog',d=>d.accept());
  await dialog.getByRole('button',{name:/^Import \d+ cases?$/}).click();
  await page.getByText(/Imported \d+ cases?/i).first().waitFor({timeout:15000});
  pass('selected case imported through UI into temporary database');

  await open('/alerts');
  const actionButton=page.getByRole('button',{name:/Corrective action/i}).first();
  if(await actionButton.count()){
    await actionButton.click();
    await page.getByRole('dialog',{name:'Create corrective action'}).waitFor();
    const action=page.getByRole('dialog',{name:'Create corrective action'});
    await action.locator('input[maxlength="120"]').fill('UI smoke test corrective action');
    await action.locator('input[maxlength="80"]').fill('Test Officer');
    await action.getByRole('button',{name:/Save demo action/}).click();
    // This prototype stores actions in memory. Use SPA navigation, not page.goto(), to preserve state.
    await page.locator('.sp-tabs a[href="/actions"]').click();
    await page.locator('.page-header h1').waitFor();
    await page.getByText('UI smoke test corrective action').waitFor();
    pass('warning linked to created corrective action');
  } else {
    pass('warning page: no corrective action available for current synthetic rules');
  }

  await open('/reports');
  await page.getByRole('tab',{name:/Exports/}).click();
  const exportReady=page.waitForEvent('download',{timeout:15000});
  await page.getByRole('button',{name:'CSV'}).first().click();
  const csvExport=await exportReady;
  assert.match(csvExport.suggestedFilename(),/csv/i);
  pass('management report CSV export');

  await open('/assistant');
  const promptButtons=page.locator('.sp-question-grid button');
  assert.ok(await promptButtons.count()>0);
  await promptButtons.first().click();
  assert.ok(await page.locator('.sp-message').count()>1);
  pass('rules-based assistant generates a response');

  await open('/dev-tools');
  await page.getByText('Reachable',{exact:true}).first().waitFor();
  pass('developer tools API health check');

  assert.deepEqual(jsErrors, [], 'Unexpected page JavaScript errors: '+jsErrors.join(' | '));
  console.log('UI SMOKE TESTS: '+checked.length+'/'+checked.length+' passed.');
} catch(e){
  console.error('UI SMOKE FAILURE after '+checked.length+' successful checks:',e);
  console.error('Last URL:',page.url());
  await page.screenshot({path:'/tmp/estara-ui-failure.png',fullPage:true}).catch(()=>{});
  if(jsErrors.length) console.error('Page JavaScript errors:',jsErrors);
  process.exitCode=1;
} finally {
  await browser.close();
}
