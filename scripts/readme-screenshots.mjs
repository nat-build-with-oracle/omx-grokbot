/** Render the real app with synthetic API fixtures. Never reads owner credentials or contacts a remote bot. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.env.BRIDGE_SCREENSHOT_URL ?? 'http://127.0.0.1:4328';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'docs/screenshots';
await mkdir(dir, { recursive: true });
const aid = '11111111-1111-4111-8111-111111111111';
const agents = [{ agentId: aid, name: 'Projects Manager' }, { agentId: '22222222-2222-4222-8222-222222222222', name: 'Research Notes' }];
const run = { id: '33333333-3333-4333-8333-333333333333', agentId: aid, agentName: agents[0].name, prompt: 'What should we focus on next for the bridge?', marker: 'DEMO_ONLY', afterRowid: 1, status: 'reply_recorded', reply: 'Start with one clear task. Keep the conversation and its evidence together.\n\nThe bridge can discover bots, verify replies, and search source-linked project history. Public deployment is a separate step.\n\nWhat would you like to work on first?', requestId: 'demo-request', error: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:01Z' };
try {
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
 let authenticated = false;
 const page = await context.newPage();
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data;
  if (path === '/api/session') data = authenticated ? { authenticated: true, csrfToken: 'demo-only' } : { authenticated: false };
  else if (path === '/api/agents') data = { agents, health: { ok: true } };
  else if (path === '/api/messages') data = [run];
  else if (path === '/api/agent-creations') data = [];
  else if (path.endsWith('/transcript')) data = { agentId: aid, name: agents[0].name, entries: [], hasMore: false, nextBeforeRowid: null };
  else if (path === '/api/history/status') data = { documents: 24, chunks: 136, embeddedChunks: 136, model: 'demo-local-model', projects: ['Bridge design', 'MCP integration'] };
  else if (path === '/api/history/search') data = [{ id: 'demo-source', text: 'Keep the local bridge and remote gateway separate. Every submitted message has a durable identifier, and replies are checked against the remote transcript before being shown as verified.', project: 'Bridge design', source: 'demo/bridge-notes.md', lineStart: 12, lineEnd: 18, score: 0.91, mode: 'vector' }];
  else if (path === '/api/connections') data = { grokHost: 'box@demo.oracle.netbird', historyHost: 'demo-history', mcpUrl: base + '/mcp', auth: 'Owner-approved access', publicDeploymentVerified: false };
  else throw new Error('Unexpected API request: ' + path);
  await route.fulfill({ status: 200, json: data });
 });
 const capture = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
 };
 await page.goto(base);
 await page.getByLabel('Owner secret', { exact: true }).waitFor();
 await capture('sign-in');
 authenticated = true;
 await page.reload();
 await page.getByRole('button', { name: /Projects Manager/ }).first().click();
 await page.getByText(run.reply, { exact: true }).waitFor();
 await capture('conversations');
 await page.getByRole('button', { name: 'New bot', exact: true }).first().click();
 await page.getByLabel('Bot name').fill('Ideas Notebook');
 await page.getByLabel('Description').fill('A space to explore ideas, keep useful notes, and plan the next small step.');
 await capture('new-bot');
 await page.getByRole('link', { name: 'History', exact: true }).first().click();
 await page.getByLabel('Search history', { exact: true }).fill('How do we verify a reply?');
 await page.getByRole('button', { name: 'Search', exact: true }).click();
 await page.getByText('1 matching excerpt', { exact: true }).waitFor();
 await capture('history');
 await page.getByRole('link', { name: 'Connections', exact: true }).first().click();
 await page.getByRole('heading', { name: 'Know what’s connected.' }).waitFor();
 await capture('connections');
 assert(await page.getByText('box@demo.oracle.netbird', { exact: true }).count());
 console.log('Captured 5 main pages with synthetic data; all API requests intercepted.');
 await context.close();
} finally { await browser.close(); }
