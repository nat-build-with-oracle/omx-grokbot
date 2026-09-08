/** Live selected-bot history reads plus isolated stale-response fixtures. Never sends or creates. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = 'http://127.0.0.1:4328';
const target = process.env.BRIDGE_TEST_AGENT ?? 'test';
const dir = resolve('.impeccable/review'); await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { checkedAt: new Date().toISOString(), target, live: {}, fixtures: {}, liveAgentCreationVerified: false };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); let writes = 0; const errors = [];
  page.on('pageerror', () => errors.push('Browser error'));
  page.on('request', req => { if (req.method() === 'POST' && /\/api\/(agents|messages)(\/|$)/.test(new URL(req.url()).pathname)) writes++; });
  await page.goto(base);
  await page.getByLabel('Owner secret', { exact: true }).fill(JSON.parse(await readFile('data/access.json', 'utf8')).ownerSecret);
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  const bot = page.locator('.sidebar .bot-item').filter({ has: page.getByText(target, { exact: true }) });
  await bot.waitFor({ timeout: 45000 });
  const firstResponse = page.waitForResponse(r => /\/api\/agents\/[^/]+\/transcript$/.test(new URL(r.url()).pathname));
  await bot.click(); const response = await firstResponse;
  assert(response.status() === 200, 'Live history endpoint must succeed'); const first = await response.json();
  await page.locator('.transcript-entry').first().waitFor();
  const displayed = await page.locator('.transcript-entry').evaluateAll(elements => elements.map(el => ({ rowid: Number(el.dataset.rowid), content: el.querySelector('.message-text').textContent })));
  assert(displayed.length > 0 && displayed.every(e => first.entries.some(source => source.rowid === e.rowid && source.content === e.content)), 'Rendered text must match live source rows');
  proof.live = { historyHttpStatus: response.status(), agentId: first.agentId, renderedMessages: displayed.length, hasEarlierPage: first.hasMore, sourceTextMatches: true };
  for (const [name, viewport] of [['chat-history-desktop.png', { width: 1440, height: 960 }], ['chat-history-mobile.png', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'History must not overflow horizontally');
    await page.screenshot({ path: resolve(dir, name), fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  if (first.hasMore) {
    const olderResponse = page.waitForResponse(r => r.url().includes('/transcript?before='));
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click();
    assert((await olderResponse).status() === 200, 'Earlier live page must succeed');
    await page.waitForFunction(n => document.querySelectorAll('.transcript-entry').length > n, displayed.length);
    const rowids = await page.locator('.transcript-entry').evaluateAll(elements => elements.map(el => Number(el.dataset.rowid)));
    assert(new Set(rowids).size === rowids.length && rowids.every((id, i) => i === 0 || id > rowids[i - 1]), 'Pages must remain unique and chronological');
    proof.live.paginationVerified = true; proof.live.messagesAfterEarlierPage = rowids.length;
  }
  assert(writes === 0, 'No live bot write is allowed'); assert(errors.length === 0, 'No browser errors');
  proof.live.botWriteRequests = writes; proof.live.browserErrors = errors.length;
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click(); await context.close();

  const fixtureContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const fixture = await fixtureContext.newPage();
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  let release, began; const held = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { began = resolve; });
  let fail = false, fixtureWrites = 0;
  await fixture.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') fixtureWrites++;
    let data;
    if (path === '/api/session') data = { authenticated: true, csrfToken: 'fixture-only' };
    else if (path === '/api/agents') data = { agents: [{ agentId: a, name: 'First history fixture' }, { agentId: b, name: 'Second history fixture' }], health: { ok: true } };
    else if (path.endsWith('/transcript')) {
      const id = path.split('/')[3];
      if (id === a) { began(); await held; }
      if (fail) return route.fulfill({ status: 503, json: { error: { code: 'fixture_failure', message: 'Synthetic read failure' } } });
      data = { agentId: id, name: 'History fixture', hasMore: false, nextBeforeRowid: null, entries: [{ rowid: 1, role: 'assistant', content: id === a ? 'Stale first-bot text fixture' : 'Current second-bot text fixture', timestamp: null, requestId: null, clientNonce: null, contentTruncated: false, isStreaming: false }] };
    } else if (path === '/api/connections') data = { grokHost: 'fixture', historyHost: 'fixture', mcpUrl: base + '/mcp', auth: 'fixture', publicDeploymentVerified: false };
    else if (path === '/api/history/status') data = { documents: 0, chunks: 0, embeddedChunks: 0, model: 'fixture', projects: [] };
    else if (path === '/api/messages' || path === '/api/agent-creations') data = [];
    else return route.fulfill({ status: 404, json: {} });
    try { await route.fulfill({ status: 200, json: data }); } catch { /* A deselected agent's browser request was aborted. */ }
  });
  await fixture.goto(base);
  await fixture.getByRole('button', { name: /First history fixture/ }).first().click(); await started;
  await fixture.getByRole('button', { name: /Second history fixture/ }).first().click();
  await fixture.getByText('Current second-bot text fixture', { exact: true }).waitFor(); release();
  await fixture.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert(await fixture.getByText('Stale first-bot text fixture', { exact: true }).count() === 0, 'A late response must not leak across selected bots');
  proof.fixtures.staleBotResponseSuppressed = true;
  fail = true; await fixture.getByRole('button', { name: 'Refresh history', exact: true }).click();
  await fixture.getByRole('button', { name: 'Retry history', exact: true }).waitFor();
  assert(await fixture.getByText('Current second-bot text fixture', { exact: true }).isVisible(), 'Read failure preserves loaded history');
  proof.fixtures.loadedHistoryPreservedOnFailure = true; proof.fixtures.botWriteRequests = fixtureWrites;
  assert(fixtureWrites === 0, 'History controls must only read');
  await fixtureContext.close();
  await writeFile('docs/evidence/bridge/chat-history-smoke.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally { await browser.close(); }
