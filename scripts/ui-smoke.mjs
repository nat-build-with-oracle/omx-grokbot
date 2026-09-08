/** Browser evidence, not proof of live agent creation.
 * npm run build; start the bridge; then:
 * PLAYWRIGHT_MODULE=<installed playwright/index.mjs> node scripts/ui-smoke.mjs
 * Uses isolated Chrome contexts. No real bot creation or prompt send occurs.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BRIDGE_TEST_URL ?? 'http://127.0.0.1:4328';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('UI smoke must target loopback.');
const evidenceDir = resolve('.impeccable/review');
await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { checkedAt: new Date().toISOString(), base, live: {}, fixtures: {}, screenshots: [], liveAgentCreationVerified: false };
async function capture(page, file, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => { document.querySelector('.scroll-page:not([hidden])')?.scrollTo(0, 0); document.querySelector('.welcome')?.scrollTo(0, 0); window.scrollTo(0, 0); });
  await page.screenshot({ path: resolve(evidenceDir, file), fullPage: true, animations: 'disabled' });
  const layout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  assert(layout.scrollWidth <= layout.width && layout.bodyWidth <= layout.width, `${file}: horizontal overflow`);
  proof.screenshots.push({ file, ...viewport });
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const liveErrors = [];
  page.on('pageerror', error => liveErrors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Open workspace', exact: true }).waitFor();
  assert((await page.title()).includes('ARRA Oracle GrokBot Bridge'));
  await capture(page, 'desktop-login.png', { width: 1440, height: 960 });
  await capture(page, 'mobile-login.png', { width: 390, height: 844 });
  await page.setViewportSize({ width: 1440, height: 960 });
  const secret = JSON.parse(await readFile(resolve('data/access.json'), 'utf8')).ownerSecret;
  await page.getByLabel('Owner secret', { exact: true }).fill(secret);
  const start = Date.now();
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  await page.getByText('Owner workspace', { exact: true }).first().waitFor();
  proof.live.loginMs = Date.now() - start;
  assert(proof.live.loginMs < 5000, 'Sign in must not wait for remote SSH');
  await page.getByRole('button', { name: 'New bot', exact: true }).first().click();
  await page.getByLabel('Bot name').fill('Bridge Studio');
  await page.getByLabel('Description').fill('A place to work through projects and pick up useful ideas from history.');
  await page.waitForFunction(() => !document.querySelector('.header-end')?.textContent?.includes('Connecting'), undefined, { timeout: 45000 });
  proof.live.remoteStatus = await page.locator('.header-end').innerText();
  proof.live.creationDisabledWhenOffline = await page.getByRole('button', { name: 'Create bot', exact: true }).isDisabled();
  if (proof.live.remoteStatus.includes('unavailable')) assert(proof.live.creationDisabledWhenOffline);
  await capture(page, 'desktop.png', { width: 1440, height: 960 });
  await capture(page, 'mobile.png', { width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace navigation', exact: true }).waitFor();
  proof.live.mobileNavigationAccessibleName = true;
  await capture(page, 'mobile-navigation.png', { width: 390, height: 844 });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Escape closes navigation');
  assert(await page.getByRole('button', { name: 'Open navigation', exact: true }).evaluate(el => el === document.activeElement), 'Focus returns to navigation trigger');
  proof.live.mobileNavigationFocusReturn = true;
  proof.live.mobileNavigation = true;
  await capture(page, 'user-855.png', { width: 855, height: 476 });
  const noSidebarOverlap = await page.locator('.sidebar').evaluate(sidebar => {
    const section = sidebar.querySelector('.sidebar-section').getBoundingClientRect();
    const footer = sidebar.querySelector('.sidebar-footer').getBoundingClientRect();
    return section.bottom <= footer.top;
  });
  assert(noSidebarOverlap, 'Short viewport navigation must not overlap footer');
  proof.live.shortViewportNavigation = true;
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('link', { name: 'Connections', exact: true }).first().click();
  await capture(page, 'desktop-connections.png', { width: 1440, height: 960 });
  await capture(page, 'mobile-connections.png', { width: 390, height: 844 });
  await page.goto(base + '/history');
  await page.getByRole('heading', { name: 'Pick up where you left off.' }).waitFor();
  proof.live.sessionRestoredOnReload = true;
  await capture(page, 'desktop-history.png', { width: 1440, height: 960 });
  await capture(page, 'mobile-history.png', { width: 390, height: 844 });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
  await page.getByRole('button', { name: 'Open workspace', exact: true }).waitFor();
  proof.live.logout = true;
  proof.live.errors = liveErrors;
  assert.deepEqual(liveErrors, []);
  await context.close();

  // Fixture-only browser pass: exercises writes without SSH or live data changes.
  const fixtureContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const fixture = await fixtureContext.newPage();
  const agents = [{ agentId: '27f0af1c-2b33-41f2-8e21-3c8269eb7651', name: 'Studio · UI fixture' }, { agentId: '6e10af1c-2b33-41f2-8e21-3c8269eb7652', name: 'Notes · UI fixture' }];
  const messages = [], creations = []; let createPosts = 0, sendPosts = 0, verifyPosts = 0;
  let createMode = 'verified';
  await fixture.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const body = request.postDataJSON();
    let data;
    if (path === '/api/session') data = { authenticated: true, csrfToken: 'ui-fixture-not-a-real-secret' };
    else if (path === '/api/agents' && request.method() === 'GET') data = { agents, health: { ok: true } };
    else if (/^\/api\/agents\/[^/]+\/transcript$/.test(path)) data = { agentId: path.split('/')[3], name: 'UI fixture', entries: [], hasMore: false, nextBeforeRowid: null };
    else if (path === '/api/agents') {
      createPosts++; data = { ...body, agentId: createMode === 'verified' ? 'ac20af1c-2b33-41f2-8e21-3c8269eb7653' : null, status: createMode };
      creations.unshift(data); if (data.agentId) agents.push({ agentId: data.agentId, name: data.name });
    }
    else if (path === '/api/agent-creations') data = creations;
    else if (path.startsWith('/api/agent-creations/')) data = creations[0];
    else if (path === '/api/connections') data = { grokHost: 'box@fixture.invalid', historyHost: 'history fixture', mcpUrl: base + '/mcp', auth: 'Fixture only', publicDeploymentVerified: false };
    else if (path === '/api/history/status') data = { documents: 3, chunks: 9, embeddedChunks: 9, projects: ['UI fixture'], model: 'fixture' };
    else if (path === '/api/history/search') data = [{ id: 'fixture-hit', text: 'Synthetic history excerpt for UI testing. This is not imported user history.', project: 'UI fixture', source: 'fixture.md', lineStart: 1, lineEnd: 3, score: .8, mode: 'vector' }];
    else if (path === '/api/messages' && request.method() === 'GET') data = messages;
    else if (path === '/api/messages') {
      sendPosts++;
      data = { id: body.messageId, agentId: body.agentId, agentName: agents[0].name, prompt: body.prompt, marker: 'UI_FIXTURE_123456', afterRowid: 1, status: 'delivery_uncertain', reply: null, requestId: null, error: 'Synthetic lost acknowledgement. Verify before any resend.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      messages.push(data);
    } else if (path.endsWith('/verify')) {
      verifyPosts++;
      data = { ...messages[0], status: 'reply_recorded', reply: 'Synthetic reply for UI testing only. The draft is cleared only once this recorded reply is received.', error: null };
      messages[0] = data;
    } else return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'UI fixture has no such route.' } } });
    return route.fulfill({ status: 200, json: data });
  });
  await fixture.goto(base);
  await fixture.getByRole('button', { name: /Studio · UI fixture/ }).first().click();
  const draft = fixture.getByLabel('Message Studio · UI fixture', { exact: true });
  await draft.fill('Draft-preservation fixture');
  await fixture.getByRole('button', { name: /Notes · UI fixture/ }).first().click();
  await fixture.getByRole('button', { name: /Studio · UI fixture/ }).first().click();
  assert.equal(await draft.inputValue(), 'Draft-preservation fixture');
  await fixture.getByRole('button', { name: 'Send message', exact: true }).dblclick();
  await fixture.getByText('Delivery not confirmed', { exact: true }).waitFor();
  assert.equal(await draft.inputValue(), 'Draft-preservation fixture');
  assert.equal(sendPosts, 1); assert(await fixture.getByRole('button', { name: 'Send message', exact: true }).isDisabled());
  await fixture.getByRole('button', { name: 'Check reply', exact: true }).click();
  await fixture.getByText('Reply verified', { exact: true }).waitFor();
  assert.equal(await draft.inputValue(), ''); assert.equal(verifyPosts, 1); assert.equal(sendPosts, 1);
  await capture(fixture, 'fixture-chat-desktop.png', { width: 1440, height: 960 });
  await capture(fixture, 'fixture-chat-mobile.png', { width: 390, height: 844 });
  await fixture.setViewportSize({ width: 1440, height: 960 });
  await fixture.getByRole('button', { name: 'New bot', exact: true }).first().click();
  await fixture.getByLabel('Bot name').fill('Created · UI fixture');
  await fixture.getByRole('button', { name: 'Create bot', exact: true }).dblclick();
  await fixture.getByText('Bot profile verified', { exact: true }).waitFor();
  assert.equal(createPosts, 1);
  await fixture.reload();
  await fixture.getByRole('button', { name: 'New bot', exact: true }).first().click();
  createMode = 'creation_uncertain';
  await fixture.getByLabel('Bot name').fill('Uncertain · UI fixture');
  await fixture.getByRole('button', { name: 'Create bot', exact: true }).click();
  await fixture.getByText('Creation not confirmed', { exact: true }).waitFor();
  await fixture.reload();
  await fixture.getByText('Creation not confirmed', { exact: true }).waitFor();
  assert(await fixture.getByLabel('Bot name').isDisabled());
  await fixture.getByRole('button', { name: 'Check creation status', exact: true }).click();
  assert.equal(createPosts, 2);
  await capture(fixture, 'fixture-creation-recovery.png', { width: 1440, height: 960 });
  await fixture.getByRole('link', { name: 'History', exact: true }).first().click();
  await fixture.getByLabel('Search history', { exact: true }).fill('fixture');
  await fixture.getByRole('button', { name: 'Search', exact: true }).click();
  await fixture.getByText('1 matching excerpt', { exact: true }).waitFor();
  await capture(fixture, 'fixture-history.png', { width: 1440, height: 960 });
  proof.fixtures = { draftPreservedOnBotSwitch: true, uncertainSendRetainsDraft: true, duplicateSendSuppressed: sendPosts === 1, verifyDoesNotSend: true, verifiedReplyClearsDraft: true, duplicateCreationSuppressed: true, uncertainCreationRestoredAfterReload: true, creationCheckDoesNotCreate: createPosts === 2, searchResults: true };
  await fixtureContext.close();
  await writeFile(resolve('docs/evidence/bridge/ui-smoke.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally { await browser.close(); }
