// Run with the preview server on 127.0.0.1:4178. Captures unapproved review mockups.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../../../frontend/package.json', import.meta.url));
const { chromium, firefox, webkit } = require('@playwright/test');
const directory = fileURLToPath(new URL('.', import.meta.url));
const report = {status:'review, not accepted', screens:[], checks:[], contrast:[]};
const browser = await chromium.launch();
const page = await browser.newPage({deviceScaleFactor:1});
const failures = [];
page.on('pageerror', error => failures.push(error.message));
page.on('response', response => {if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);});
for (const view of ['profile','hr']) {
  for (const [width,height] of [[390,844],[1440,900]]) {
    await page.setViewportSize({width,height});
    await page.goto(`http://127.0.0.1:4178/?view=${view}`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${view}: overflow at ${width}`);
    const filename = `${view}-${width}x${height}.png`;
    await page.screenshot({path:directory+filename,animations:'disabled'});
    if (view === 'profile' && width === 390) {
      const box = await page.locator('.sh-recommendation > .sh-button').boundingBox();
      const nav = await page.locator('.sh-bottomnav').boundingBox();
      assert.ok(box.y >= 52 && box.y+box.height < nav.y, 'Primary CTA must be entirely visible');
      report.checks.push({name:'Primary CTA at 390×844',top:box.y,bottom:box.y+box.height,navTop:nav.y});
    }
    report.screens.push({view,width,height,filename});
  }
}
// Check target browser layouts without adding unrelated production tests.
for (const [engineName,engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
  const checkBrowser = engineName === 'chromium' ? browser : await engine.launch();
  const checkPage = await checkBrowser.newPage();
  for (const view of ['profile','hr']) {
    for (const width of [320,390,768,1280,1440]) {
      await checkPage.setViewportSize({width,height:900});
      await checkPage.goto(`http://127.0.0.1:4178/?view=${view}`);
      await checkPage.evaluate(() => document.fonts.ready);
      assert.equal(await checkPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${engineName} ${view}: overflow at ${width}`);
    }
  }
  report.checks.push({name:`${engineName}: no horizontal overflow`,widths:[320,390,768,1280,1440],views:['profile','hr']});
  await checkPage.close();
  if (engineName !== 'chromium') await checkBrowser.close();
}
await page.setViewportSize({width:390,height:844});
await page.goto('http://127.0.0.1:4178/?view=profile');
await page.locator('[data-skill="1"]').focus();
await page.keyboard.press('Enter');
assert.equal(await page.locator('[data-skill="1"]').getAttribute('aria-pressed'),'true');
await page.locator('.sh-recommendation > .sh-button').click();
assert.equal(await page.getByRole('dialog').count(),1);
await page.keyboard.press('Shift+Tab');
assert.equal(await page.locator('[data-review-complete]').evaluate(node => node === document.activeElement),true);
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('dialog').count(),0);
assert.equal(await page.locator('.sh-recommendation > .sh-button').evaluate(node => node === document.activeElement),true);
report.checks.push({name:'Keyboard: skill selection, dialog focus trap, Escape, restored focus',passed:true});
await page.goto('http://127.0.0.1:4178/?view=hr');
await page.getByRole('tab',{name:'Участие',exact:true}).click();
assert.equal(new URL(page.url()).searchParams.get('tab'),'participation');
await page.getByLabel('Поиск в таблице').fill('Разбор');
assert.equal(new URL(page.url()).searchParams.get('q'),'Разбор');
await page.reload();
assert.equal(await page.getByLabel('Поиск в таблице').inputValue(),'Разбор');
report.checks.push({name:'HR tabs and search restored from URL',passed:true});
const tokens = await page.evaluate(() => {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(['bg-app','bg-panel','bg-raised','bg-hover','text-primary','text-secondary','text-muted','positive','negative','warning','border-control','accent','text-on-accent'].map(key => [key,styles.getPropertyValue('--'+key).trim()]));
});
const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value,16)/255).map(value => value <= 0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4);
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
};
const pairs = [];
for (const fg of ['text-primary','text-secondary','text-muted','positive','negative','warning']) {
  for (const bg of ['bg-app','bg-panel','bg-raised']) pairs.push([fg,bg,4.5]);
}
pairs.push(['border-control','bg-panel',3],['border-control','bg-raised',3],['text-on-accent','accent',4.5]);
for (const [fg,bg,min] of pairs) {
  const [a,b] = [luminance(tokens[fg]),luminance(tokens[bg])].sort((a,b) => b-a);
  const ratio = (a+0.05)/(b+0.05);
  report.contrast.push({foreground:fg,background:bg,ratio:Number(ratio.toFixed(2)),minimum:min});
  assert.ok(ratio >= min,`${fg} on ${bg}: ${ratio}`);
}
assert.deepEqual(failures,[]);
report.checks.push({name:'No page errors or failed assets',passed:true});
await writeFile(directory+'validation.json',JSON.stringify(report,null,2)+'\n');
await browser.close();
console.log(JSON.stringify({screens:report.screens.length,checks:report.checks.length,contrastPairs:report.contrast.length,failures}));
