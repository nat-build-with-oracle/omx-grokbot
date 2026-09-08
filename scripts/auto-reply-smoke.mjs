/** Automatic verification only. Fixture by default; --live observes the current saved handoff operation. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = 'http://127.0.0.1:4328';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { checkedAt: new Date().toISOString(), fixture: {}, live: null };
try {
 const c = await browser.newContext(); const p = await c.newPage();
 const aid='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222';
 let checks=0,writes=0,began; const started=new Promise(resolve=>began=resolve);
 let run={id,agentId:aid,agentName:'Auto reply fixture',prompt:'Synthetic pending message',marker:'fixture_marker',afterRowid:1,status:'accepted',reply:null,requestId:null,error:null,createdAt:'2026-09-08T00:00:00Z',updatedAt:'2026-09-08T00:00:00Z'};
 await p.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data;
  if(path==='/api/session')data={authenticated:true,csrfToken:'fixture-only'};
  else if(path==='/api/agents')data={agents:[{agentId:aid,name:run.agentName}],health:{ok:true}};
  else if(path==='/api/messages'&&route.request().method()==='GET')data=[run];
  else if(path===`/api/messages/${id}/verify`){checks++;began();await new Promise(r=>setTimeout(r,6000));run={...run,status:'reply_recorded',reply:'Automatic fixture reply',requestId:'fixture-request'};data=run;}
  else if(route.request().method()!=='GET'){writes++;return route.fulfill({status:500,json:{}});}
  else if(path.endsWith('/transcript'))data={agentId:aid,name:run.agentName,entries:[],hasMore:false,nextBeforeRowid:null};
  else if(path==='/api/agent-creations')data=[];
  else if(path==='/api/history/status')data={documents:0,chunks:0,embeddedChunks:0,projects:[],model:'fixture'};
  else if(path==='/api/connections')data={grokHost:'fixture',historyHost:'fixture',mcpUrl:base+'/mcp',auth:'fixture',publicDeploymentVerified:false};
  else return route.fulfill({status:404,json:{}});
  await route.fulfill({status:200,json:data});
 });
 await p.goto(base);await p.getByRole('button',{name:/Auto reply fixture/}).first().click();
 await started;await p.waitForTimeout(3500);
 const manual=p.getByRole('button',{name:'Check reply',exact:true});
 if(await manual.count()&&await manual.isEnabled())await manual.click();
 await p.getByText('Automatic fixture reply',{exact:true}).waitFor({timeout:15000});
 await p.waitForTimeout(4500);assert(checks===1,'Automatic/manual overlap or completed operation must not recheck');assert(writes===0,'No send or create is allowed');
 proof.fixture={automaticReplyRendered:true,verificationRequests:checks,botWrites:writes,stopsAfterReply:true};await c.close();
 if(process.argv.includes('--live')){
  const state=JSON.parse(await readFile('data/context-transfer.json','utf8'));const messageId=state.messages.at(-1).messageId;
  const live=await browser.newContext({viewport:{width:1440,height:960}});const page=await live.newPage();let checks=0,writes=0;
  page.on('request',r=>{const path=new URL(r.url()).pathname;if(path===`/api/messages/${messageId}/verify`)checks++;if(r.method()==='POST'&&['/api/messages','/api/agents'].includes(path))writes++;});
  await page.goto(base);await page.getByLabel('Owner secret',{exact:true}).fill(JSON.parse(await readFile('data/access.json','utf8')).ownerSecret);
  await page.getByRole('button',{name:'Open workspace',exact:true}).click();
  await page.getByRole('button',{name:new RegExp(state.creationResult.name)}).first().click({timeout:45000});
  await page.waitForFunction(id=>[...document.querySelectorAll('.conversation-entry')].some(e=>e.querySelector('.message-details code')?.textContent===id&&e.querySelector('.message-receipt.positive')),messageId,{timeout:180000});
  assert(writes===0,'Live watcher must not send or create');
  await page.screenshot({path:'.impeccable/review/live-handoff.png',fullPage:true});
  proof.live={messageId,replyRendered:true,automaticVerificationRequests:checks,botWrites:writes};
  await page.getByRole('button',{name:'Sign out',exact:true}).first().click();await live.close();
 }
 await writeFile('docs/evidence/bridge/auto-reply-smoke.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));
}finally{await browser.close();}
