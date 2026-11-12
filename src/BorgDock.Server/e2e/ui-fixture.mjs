import { createServer } from 'node:http';
import { readdirSync } from 'node:fs';

// BorgDock's fixture modules (e2e/fixtures/*.mjs): each exports `handle({ path, method, query, body, writes })`
// and returns a result (JSON, or `{ contentType, rawBody }` for a file), or undefined when the route isn't its own. They run before the Dispatch routes below.
// `{ httpStatus, error }` answers with that status and `{ error }`.
const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixtures = await Promise.all(readdirSync(fixtureDir).filter(f => f.endsWith('.mjs')).sort().map(f => import(new URL(f, fixtureDir))));

// Controlled data for web and iOS screenshot reviews. All writes stay in memory.
const now = Date.now();
const at = hours => new Date(now - hours * 3600000).toISOString();
const workflow = ['New', 'Development In Progress', 'Code Review', 'Ready For QA', 'Done'];
const item = (id, title, type='PBI', state='Development In Progress', dueDate=null) => ({id,title,type,typeName:type,state,stateCategory:'InProgress',workflow,sprint:'5.2.8',dueDate:dueDate ? `${dueDate}T00:00:00Z` : null,priority:2,tags:[],assignedTo:'Koen van der Borght',assignedToMe:true,url:`https://dev.azure.com/acme/Shop/_workitems/edit/${id}`});
const thread = (id, worktree, title, status='your-turn', hours=1, lastAgentMessage=null) => ({id:`sample-${id}`,title,worktree,branch:`feat/${id}`,status,createdAt:at(48),lastActivityAt:at(hours),model:'gpt-6.1-sol',questionRequestId:null,questions:[],lastAgentMessage,link:`https://example.invalid/thread/${id}`,appLink:`t3code://threads/sample/${id}`});
const pr = (number, state='open') => ({number,state,url:`https://github.com/example/sample/pull/${number}`,branch:null,title:'Sample pull request',isDraft:false,checks:null});
const overviewItem = (workItem,bay,threads=[],pullRequest=null,suggestion=null) => ({item:workItem,bay,threads,pullRequest,suggestion,waitingFor:null,queuedAt:null});
const suggestion = (id,to,reason) => ({id:`suggestion-${id}`,to,reason});
const items = [
  overviewItem(item(56908,'Gift cards: sell and redeem them in the web shop and the app','PBI','Development In Progress','2026-09-23'),'waiting',[thread(56908,'M5','Gift cards','your-turn',1,'Gift cards now sell and redeem in the web shop and the app. I tested both on staging.\n\nWhat is left is the payment provider\'s sign-off and the terms page, which need your accounts.\n\n### What I did\n- **Checkout takes gift cards.** Partial redemption keeps the remainder on the card.\n- **End-to-end tests pass** for card, iDEAL and gift card payments.\n- **PR 4614 is open** for your review.')],pr(4614),suggestion(56908,'Code Review','PR 4614 is open. ADO still says Development In Progress.')),
  overviewItem(item(59735,'Search: product suggestions take up to 2 s on a cold cache and miss the 300 ms budget','QI','Needs Human'),'waiting',[],pr(4580,'merged'),suggestion(59735,'Ready For QA','PR 4580 is merged. ADO still says Needs Human.')),
  overviewItem(item(59403,'Orders placed from the app lose their delivery note.','Bug','Code Review','2026-09-28'),'waiting',[thread(59403,'M8','Keep delivery notes on app orders','your-turn',24,'Delivery notes now survive order creation from the app. Work item is in Code Review.\n\nVerification summary: 21 integration tests and 35 unit tests passed. Full CI, staging deployment and E2E checks are green.\n\nAuto-merge is off until a reviewer approves.')],pr(4590,'merged'),suggestion(59403,'Ready For QA','PR 4590 is merged. ADO still says Code Review.')),
  overviewItem(item(58568,'Checkout redesign: one page for address, delivery and payment','PBI','Code Review','2026-09-25'),'waiting',[thread(58568,'Mac · Checkout','Checkout redesign','failed',.98,'You have hit your session limit. Resets at 12:10pm.')],pr(4062)),
  overviewItem(item(59463,'Renew the shop.example.com TLS certificate before 2026-11-10','Task','To Do'),'waiting',[thread(59463,'M2','Renew the TLS certificate','your-turn',144,'Review the certificate renewal update in the linked thread.')]),
  overviewItem(item(59658,'Sign-out fails for customers with an expired session','QI','New'),'drift',[thread(59658,'M3','Fix sign-out with an expired session','running',2)],pr(4600),suggestion(59658,'Code Review','PR 4600 is open. ADO still says New.')),
  overviewItem(item(59660,'Add integration checks for stock sync','PBI','New'),'drift',[],pr(4601,'merged'),suggestion(59660,'Ready For QA','PR 4601 is merged. ADO still says New.')),
  ...Array.from({length:13},(_,i)=>overviewItem(item(60100+i,['Add order history to the app','Improve delivery status emails','Export the monthly sales report'][i%3],'Task','To Do'),'idle')),
  overviewItem(item(60200,'Review the updated returns flow','PBI','Ready For QA'),'handed'),
];
const questionThread=thread(60000,'M0','Choose a validation approach','question',.25);
questionThread.questionRequestId='sample-request';
questionThread.questions=[{id:'validation',question:'Which validation approach should I use?',options:[{label:'Run the staging replay',value:'staging'},{label:'Use the local test database',value:'local'}],recommended:0,allowCustomAnswer:true,multiSelect:false}];
const questionItem=overviewItem(item(60000,'Choose the stock sync validation approach'),'waiting',[questionThread]);
const overview = {generatedAt:at(0),items,unlinkedThreads:[{...thread(60300,'M1','An unlinked investigation','your-turn',2),guessItemId:56908}],worktrees:Array.from({length:10},(_,i)=>({name:`M${i}`,state:[7,9].includes(i)?'free':'mine',itemId:({2:59463,5:56908,8:59403})[i]??null,running:![2,5,7,8,9].includes(i),needsYou:[2,5,8].includes(i)})),sources:{ado:{ok:true,at:at(0),error:null},t3:{ok:true,at:at(0),error:null}}};
// The agent on acme/shop #412's branch (10-github.mjs): Focus and the PR page show it running.
const config={apiVersion:1,user:{name:'Koen van der Borght',email:'koen@example.com'},models:[{id:'codex/gpt-6.1-sol',label:'GPT-6.1 Sol',provider:'Codex',recent:true,efforts:[{id:'high',label:'High'}],defaultEffort:'high'}],defaultModel:'codex/gpt-6.1-sol',agents:[],defaultAgent:'codex',worktrees:overview.worktrees.map(w=>w.name),promptTemplate:'Pick up AB#{id}: {title}',vapidPublicKey:null};
const writes=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let body={};
  if(req.method!=='GET') {let raw='';for await(const c of req)raw+=c;body=raw?JSON.parse(raw):{};}
  let result;
  for (const fixture of fixtures) {
    result = await fixture.handle({ path: url.pathname, method: req.method, query: url.searchParams, body, writes });
    if (result !== undefined) break;
  }
  if (result?.httpStatus) {res.writeHead(result.httpStatus,{'Content-Type':'application/json'});res.end(JSON.stringify({error:result.error}));return;}
  if (result !== undefined) {}
  else if(url.pathname==='/api/events') {res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': sample preview\n\n');return;}
  else if(url.pathname==='/api/auth/status')result={authenticated:true,setupRequired:false,session:null};
  else if(['/api/overview','/api/refresh'].includes(url.pathname))result=overview;
  else if(url.pathname==='/api/config')result=config;
  else if(url.pathname==='/api/browse/queries')result=[{id:'sprint',name:'Current sprint, whole team',group:'Team'}];
  else if(url.pathname==='/api/browse')result={items:items.map(o=>o.item),truncated:false};
  else if(url.pathname==='/api/preferences/notifications')result={waiting:true,finished:true,drift:true};
  else if(['/api/auth/sessions','/api/auth/passkeys','/api/audit'].includes(url.pathname))result=[];
  else if(url.pathname==='/preview/mvw') {
    const environment = (id, label, ok=true) => ({ environmentId:id,label,ok,at:at(0),error:ok ? null : 'Host unavailable' });
    overview.sources.environments=[environment('mac','Mac'),environment('vera','Vera'),environment('windows','Windows')];
    overview.worktrees.forEach(w => Object.assign(w,{id:`mac:${w.name}`,environmentId:'mac',environmentLabel:'Mac',available:true,models:config.models,defaultModel:config.defaultModel}));
    overview.worktrees.push(...Array.from({length:6},(_,i)=>({id:`vera:V${i}`,name:`V${i}`,environmentId:'vera',environmentLabel:'Vera',available:true,state:i===0?'mine':'free',itemId:i===0?59058:null,running:i===0,needsYou:false,models:config.models,defaultModel:config.defaultModel})),...Array.from({length:6},(_,i)=>({id:`windows:W${i}`,name:`W${i}`,environmentId:'windows',environmentLabel:'Windows',available:true,state:i===3?'mine':'free',itemId:i===3?53748:null,running:i===3,needsYou:false,models:[{...config.models[0],id:'codex_work/gpt-6.1-sol',label:'GPT-6.1 Sol · Work'}],defaultModel:'codex_work/gpt-6.1-sol'})));
    overview.items.push(overviewItem(item(53748,'Show delivery slots on the order page'),'working',[{...thread(53748,'W3','AB#53748 Delivery slots','running',0),environmentId:'windows',environmentLabel:'Windows',available:true}]));
    result={ok:true};
  }
  else if(['/preview/windows-offline','/preview/windows-online'].includes(url.pathname)) {
    const available = url.pathname.endsWith('online');
    overview.sources.environments.find(e=>e.environmentId==='windows').ok=available;
    overview.sources.t3.ok=available;
    overview.worktrees.filter(w=>w.environmentId==='windows').forEach(w=>w.available=available);
    overview.items.flatMap(o=>o.threads).filter(t=>t.environmentId==='windows').forEach(t=>t.available=available);
    result={ok:true};
  }
  else if(url.pathname==='/preview/writes')result=writes;
  else if(url.pathname==='/preview/question') {overview.items=[questionItem,...items];result={ok:true};}
  else if(url.pathname==='/preview/reset') {overview.items=items;result={ok:true};}
  else if(url.pathname==='/preview/empty') {overview.items=[];overview.unlinkedThreads=[];result={ok:true};}
  else if(/^\/api\/items\/\d+\/start$/.test(url.pathname)) {const id=url.pathname.split('/')[3];result={prompts:{pickup:`Pick up AB#${id}`,qa:`Use ado-update-for-qa for AB#${id}`,done:`Close AB#${id} as Done without QA`},branch:null,qaWorktree:'M7'};}
  else if(/^\/api\/items\/\d+$/.test(url.pathname)) {const o=overview.items.find(o=>o.item.id===Number(url.pathname.split('/')[3]));result=o?{item:o.item,description:'Sample work item description for visual verification.',acceptanceCriteria:'Verify the expected behaviour on staging.',reproSteps:'',qaNotes:'',comments:[]}:null;}
  else if(req.method!=='GET') {writes.push({path:url.pathname,body});result=url.pathname.endsWith('/state')?{state:body.to}:url.pathname==='/api/threads'?{threadId:'sample-started',link:'https://example.invalid',appLink:'t3code://threads/sample/sample',adoState:null,warning:null}:{ok:true};}
  else {res.writeHead(404);res.end('Not found');return;}
  if(result?.rawBody){res.writeHead(200,{'Content-Type':result.contentType,'Cache-Control':'no-store'});res.end(result.rawBody);return;}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
});
server.listen(Number(process.env.PORT ?? 8796),'0.0.0.0',()=>console.log(`Sample API listening on ${process.env.PORT ?? 8796}. No external requests.`));
