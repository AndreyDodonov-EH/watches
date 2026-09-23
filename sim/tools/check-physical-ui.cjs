/* Run against a Vite server: PHYSICAL_LAB_URL=http://localhost:5190/physical.html node tools/check-physical-ui.cjs */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const model = readFileSync(resolve(__dirname, '../src/physical/model.ts'), 'utf8');
const digest = model.match(/sha256:[a-f0-9]{64}/)[0];
const schema = JSON.parse(readFileSync(resolve(__dirname, '../../spec/physical-schema.json')));
const params = Object.fromEntries(schema.fields.map(f => [f.key, f.default]));
const url = process.env.PHYSICAL_LAB_URL || 'http://localhost:5190/physical.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  async function scene(mode = 'ok', delay = 5) {
    const page = await browser.newPage({ timezoneId: 'Europe/Berlin' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(({ digest, params, mode, delay }) => {
      let controller;
      window.__commands = [];
      const encoder = new TextEncoder();
      const port = {
        readable: new ReadableStream({ start(c) { controller = c; } }),
        writable: new WritableStream({ write(bytes) {
          const line = new TextDecoder().decode(bytes).trim();
          window.__commands.push(line);
          let reply = 'ok';
          if (line === 'V') reply = JSON.stringify({ physical: 1, schema: mode === 'incompatible' ? 'old' : digest, renderer: 'legacy' });
          if (line === 'P?') reply = JSON.stringify(params);
          if (line === 'f') reply = 'fps 34.7  render 22.97 ms  push-wait 0.02 ms  cores h 21.0 / m 20.0 ms  (mode l, renderer physical, transp 0.50)  frame-p95 31 ms';
          if (line === 'Pcommit' && mode === 'commit-fail') reply = 'error commit';
          if (line.startsWith('T ')) reply = 'time 11:22:00';
          if (line.startsWith('d')) reply = 'demo speed x' + line.slice(1);
          setTimeout(() => controller.enqueue(encoder.encode(reply + '\n')), delay);
        } }),
        open: async () => {},
        close: async () => {},
      };
      Object.defineProperty(navigator, 'serial', { value: { requestPort: async () => port } });
    }, { digest, params, mode, delay });
    await page.goto(url);
    assert.equal(await page.locator('#push').isDisabled(), true);
    await page.locator('#connect').click();
    await page.waitForFunction(() => !document.querySelector('#connect').disabled);
    return { page, errors };
  }
  try {
    {
      const { page, errors } = await scene();
      await page.locator('#read-device-fps').click();
      await page.waitForFunction(() => !document.querySelector('#read-device-fps').disabled);
      assert.match(await page.locator('#device-fps').textContent(), /^34\.7 fps · read /);
      assert.equal((await page.evaluate(() => window.__commands)).at(-1), 'f');
      await page.locator('#connect').click();
      assert.equal(await page.locator('#read-device-fps').isDisabled(), true);
      assert.equal(await page.locator('#device-fps').textContent(), 'connect to read');
      assert.deepEqual(errors, []);
      await page.close();
      console.log('device FPS readout and disconnect reset: ok');
    }
    {
      const { page, errors } = await scene('commit-fail');
      await page.locator('#push').click();
      await page.waitForFunction(() => !document.querySelector('#push').disabled);
      const commands = await page.evaluate(() => window.__commands);
      assert(commands.includes('Pcommit'));
      assert.equal(commands.at(-1), 'Pcancel');
      assert.equal(commands.includes('R physical'), false);
      assert.deepEqual(errors, []);
      await page.close();
      console.log('failed commit cancels without selecting renderer: ok');
    }
    {
      const { page, errors } = await scene('incompatible');
      assert.equal(await page.locator('#push').isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => window.__commands), ['V']);
      assert.match(await page.locator('#status').textContent(), /incompatible/);
      assert.deepEqual(errors, []);
      await page.close();
      console.log('incompatible capability blocks writes: ok');
    }
    {
      const { page, errors } = await scene('ok', 30);
      await page.locator('#hour').fill('11');
      await page.locator('#minute').fill('22');
      await page.locator('#push').click();
      for (const id of ['connect', 'link', 'pull', 'push', 'legacy', 'send-time']) {
        assert.equal(await page.locator('#' + id).isDisabled(), true, id);
      }
      // A later UI edit must not change the clock captured by the in-flight push.
      await page.locator('#speed').fill('120');
      await page.waitForFunction(() => !document.querySelector('#push').disabled);
      let commands = await page.evaluate(() => window.__commands);
      assert.equal(commands.filter(c => c === 'Pbegin').length, 1);
      assert.equal(commands.at(-2), 'd0');
      const selected = commands.at(-1).match(/^T (\d+) (-?\d+)$/);
      assert(selected);
      const local = new Date((Number(selected[1]) + Number(selected[2]) * 60) * 1000);
      assert.equal(local.getUTCHours(), 11);
      assert.equal(local.getUTCMinutes(), 22);
      await page.locator('#send-time').click();
      await page.waitForFunction(() => !document.querySelector('#send-time').disabled);
      commands = await page.evaluate(() => window.__commands);
      assert.equal(commands.at(-2), 'd120');
      await page.locator('#hour').fill('12');
      assert.equal(await page.locator('input[name=time][value=set]').isChecked(), true);
      await page.locator('#hour').fill('');
      await page.locator('#speed').fill('');
      await page.locator('#speed').fill('-1');
      await page.locator('#speed').fill('9999');
      assert.equal(await page.locator('input[name=time][value=set]').isChecked(), true);
      assert.doesNotMatch(await page.locator('#clock').textContent(), /Invalid/);
      const count = commands.length;
      await page.locator('#send-time').click();
      await page.waitForFunction(() => !document.querySelector('#send-time').disabled);
      assert.equal((await page.evaluate(() => window.__commands)).length, count);
      assert.deepEqual(errors, []);
      await page.close();
      console.log('operation lock, clock snapshot, selected/demo commands, invalid input: ok');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
