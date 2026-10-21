/* Concept — chat that turns messages into tasks. */
(() => {
"use strict";
// ---------- tiny helpers ----------
const $ = (s, r=document) => r.querySelector(s);
const h = (tag, attrs={}, ...kids) => { const e=document.createElement(tag); for (const [k,v] of Object.entries(attrs||{})) { if (v==null||v===false) continue; if (k==="class") e.className=v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k==="html") e.innerHTML=v; else e.setAttribute(k, v===true?"":v); } for (const k of kids.flat(Infinity)) { if (k==null||k===false) continue; e.append(k.nodeType?k:document.createTextNode(String(k))); } return e; };
const svg = (d, vb="0 0 24 24") => { const e=document.createElementNS("http://www.w3.org/2000/svg","svg"); e.setAttribute("viewBox",vb); e.setAttribute("class","i"); e.innerHTML=d; return e; };
const IC = {
  pin:'<path d="M9 3.5h6l-1 5.5 3 3v2H7v-2l3-3z"/><path d="M12 14v6.5"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  video:'<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  play:'<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>', pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  thread:'<path d="M4 5h16v10h-9l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/>', upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', send:'<path d="M4 12h14M13 6l6 6-6 6"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  reply:'<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>', edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>', smile:'<circle cx="12" cy="12" r="8"/><path d="M9 14c1.6 1.6 4.4 1.6 6 0"/><path d="M9.5 10h0M14.5 10h0"/>',
  knot:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>',
  back:'<path d="M15 5l-7 7 7 7"/>', search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>', chat:'<path d="M5 6h14v9H11l-5 4v-4H5z"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>', group:'<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.4"/><path d="M3 19c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5"/>'
};
const uidShort = () => Math.random().toString(36).slice(2,10);
const now = () => Date.now();
const fmtTime = t => new Date(t).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const dayKey = t => new Date(t).toDateString();
const fmtDay = t => { const d=new Date(t), td=new Date(); const y=new Date(); y.setDate(td.getDate()-1);
  if (d.toDateString()===td.toDateString()) return "Today"; if (d.toDateString()===y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {weekday:"short", day:"numeric", month:"short"}); };
const fmtShort = t => { const d=new Date(t); return d.toDateString()===new Date().toDateString()? fmtTime(t) : d.toLocaleDateString([], {day:"numeric",month:"short"}); };
const fmtDue = s => s ? new Date(s+"T12:00").toLocaleDateString([], {day:"numeric", month:"short"}) : "";
const isLate = (s, st) => s && st!=="done" && new Date(s+"T23:59") < new Date();
const ls = { get(k,d){ try{ const v=localStorage.getItem("concept:"+k); return v==null?d:JSON.parse(v);}catch{return d;} }, set(k,v){ try{ localStorage.setItem("concept:"+k, JSON.stringify(v)); }catch{} } };
const PALETTE = ["#5B3DF5","#FF4F8B","#10B39A","#FF8A1F","#2F8CFF","#A64DFF","#E5364B","#2DB84D"];
const colorFor = s => { let n=0; for (const c of String(s)) n=(n*31+c.charCodeAt(0))>>>0; return PALETTE[n%PALETTE.length]; };
const DEFAULT_STAGES = [
  {id:"todo", name:"To do", c:"#8E8E93"},
  {id:"doing", name:"Doing", c:"#0A6CFF"},
  {id:"review", name:"Review", c:"#F4A100"},
  {id:"done", name:"Done", c:"#1FA855"}
];
const STATUSES = DEFAULT_STAGES.map(s=>({...s}));
const stName = id => (STATUSES.find(s=>s.id===id)||STATUSES[0]).name;
const EMOJI = ["👍","❤️","😂","🙏","🔥","✅"];

// ---------- state ----------
const S = {
  mode:"loading", me:null, canWrite:true,
  people:{}, team:[], channels:[], tasks:[], msgs:[], msgsFor:null,
  view: ls.get("view","chats"), active: ls.get("active", null), inThread:false,
  openTask:null, draftTask:null, replyTo:null, editing:null, actFor:null, emojiFor:null,
  statuses:[], calls:[], teamDocs:{}, statusReply:null, teams:[], teamId:ls.get("teamId",null), prefs:ls.get("prefs",{}), pins:[], dial:{on:false,q:""}, contacts:[], allContacts:{}, keys:{}, addr:[], addrNames:{}, onConcept:[], selecting:false, sel:[], addingStage:false, listMode:ls.get("listMode","chats"), taskView:ls.get("taskView","stage"),
  q:"", filter:"all", asTask:false, lastRead: ls.get("lastRead", {}), justTied:null
};

// ---------- data layer: real (db) or sample preview ----------
let DB=null, USER=null, unsubMsgs=null;
const store = {
  async set(path, data){ if (DB) return DB.set(path, data); return demo.set(path, data); },
  async update(path, data){ if (DB) return DB.update(path, data); return demo.update(path, data); },
  async del(path){ if (DB) return DB.del(path); return demo.del(path); },
  async get(path){ if (DB) return DB.get(path); return demo.get(path); },
  sub(col, cb){ if (DB) return DB.sub(col, cb); return demo.sub(col, cb); }
};
function onDbErr(e){ if (e && (e.code==="revoked")) { S.canWrite=false; render(); } }
async function guarded(p){ try { return await p; } catch(e){ if (e && e.code==="denied") toast("You don't have access to change that."); else if (e && e.code==="quota_exceeded") toast("Storage is full. Delete some old tasks or messages."); else toast("That didn't save. Check your connection and try again."); throw e; } }

// sample preview data (only when the live store isn't available)
const demo = (() => {
  const data = {}; const subs = {};
  const colOf = p => p.split("/").slice(0,-1).join("/");
  const emit = col => (subs[col]||[]).forEach(cb => cb(Object.entries(data[col]||{}).map(([id,v])=>({id,...v}))));
  return {
    seed(){
      const t0 = now()-1000*60*60*26;
      const P = { me:"Example: You", ava:"Example: Ava", noam:"Example: Noam", lea:"Example: Lea" };
      const PH={me:"+1 2125550100", ava:"+1 2125550111", noam:"+1 2125550122", lea:"+1 2125550133"};
      Object.keys(P).forEach(k => (data.team||(data.team={}))[k]={joinedAt:t0, phone:PH[k]});
      S.people = Object.fromEntries(Object.entries(P).map(([id,name])=>[id,{id,name,color:colorFor(id),avatarUrl:""}]));
      data.channels = {
        launch:{name:"Launch week", kind:"group", members:["me","ava","noam","lea"], at:t0, last:{text:"I'll take the press list", by:"noam", at:t0+1000*60*60*25}},
        "dm-me-ava":{kind:"dm", members:["me","ava"], at:t0, last:{text:"Sent you the deck", by:"ava", at:t0+1000*60*60*3}}
      };
      const M = (id, by, text, mins, extra={}) => [id, {by, text, at:t0+mins*60000, ...extra}];
      data["channels/launch/messages"] = Object.fromEntries([
        M("m1","ava","Morning all. Landing page copy is in, needs a last read before Thursday.",30),
        M("m2","me","Can someone check the pricing table on mobile? It overflows on my phone.",42,{taskId:"t2", reactions:{"👍":["noam"]}}),
        M("m3","noam","On it after lunch",44,{replyTo:"m2"}),
        M("m4","lea","We still need a press list. Thinking 30 names, tech + design outlets.",60*24+10,{taskId:"t3"}),
        M("m5","noam","I'll take the press list",60*25,{reactions:{"🙏":["lea","me"]}})
      ]);
      data["channels/dm-me-ava/messages"] = Object.fromEntries([ M("d1","ava","Sent you the deck",60*23) ]);
      data.tasks = {
        t1:{num:1,title:"Final read of landing page copy",notes:"",status:"review",assignee:"me",due:new Date(now()+864e5*2).toISOString().slice(0,10),priority:"normal",channel:"launch",createdBy:"ava",at:t0},
        t2:{num:2,title:"Fix pricing table overflow on mobile",notes:"Happens under 400px wide.",status:"doing",assignee:"noam",due:new Date(now()-864e5).toISOString().slice(0,10),priority:"high",channel:"launch",fromMsg:"m2",fromText:"Can someone check the pricing table on mobile? It overflows on my phone.",fromBy:"me",createdBy:"me",at:t0+42*60000},
        t3:{num:3,title:"Build press list (30 names)",notes:"Tech + design outlets",status:"todo",assignee:"noam",due:"",priority:"normal",channel:"launch",fromMsg:"m4",fromText:"We still need a press list. Thinking 30 names, tech + design outlets.",fromBy:"lea",createdBy:"lea",at:t0+60*24*60000},
        t4:{num:4,title:"Order launch stickers",notes:"",status:"done",assignee:"lea",due:"",priority:"low",channel:"",createdBy:"lea",at:t0}
      };
      data.meta = {counter:{n:4}};
      data.contacts = {me:{ids:["ava","noam","lea"]}, ava:{ids:["me","noam"]}, noam:{ids:["me"]}, lea:{ids:["noam"]}};
      data.status = {s1:{by:"ava", kind:"text", text:"Launch week 🚀", bg:"#7B4DFF", at:now()-1000*60*90, views:[]}, s2:{by:"noam", kind:"text", text:"Heads down on mobile fixes", bg:"#0E8F9C", at:now()-1000*60*30, views:["me"]}};
      data.teams = {core:{name:"Example team", owner:"me", members:["me","ava","noam","lea"], visibility:"all", at:t0}};
      for (const k in data.tasks) data.tasks[k].team="core";
    },
    get(p){ const c=colOf(p), id=p.split("/").pop(); const v=(data[c]||{})[id]; return v? {...v}: null; },
    set(p,v){ const c=colOf(p), id=p.split("/").pop(); (data[c]||(data[c]={}))[id]=structuredClone(v); emit(c); },
    update(p,v){ const c=colOf(p), id=p.split("/").pop(); data[c]=data[c]||{}; data[c][id]={...(data[c][id]||{}), ...structuredClone(v)}; emit(c); },
    del(p){ const c=colOf(p), id=p.split("/").pop(); if (data[c]) delete data[c][id]; emit(c); },
    sub(col, cb){ (subs[col]||(subs[col]=[])).push(cb); setTimeout(()=>emit(col)); return ()=>{ subs[col]=subs[col].filter(f=>f!==cb); }; }
  };
})();

// ---------- people ----------
async function resolvePeople(ids){
  if (!USER) { for (const id of ids) if (id && !S.people[id] && S.teamDocs[id]) S.people[id]={id, name:S.teamDocs[id].name||"Someone", avatarUrl:S.teamDocs[id].photo||"", color:colorFor(id)}; return; }
  const need = ids.filter(id => id && !S.people[id]);
  if (!need.length) return;
  try { const ps = await USER.profiles(need); for (const id of need) { const p=ps[id]; S.people[id] = {id, name:(p&&p.name)||"Someone", avatarUrl:(p&&p.avatarUrl)||"", color:(p&&p.color)||colorFor(id)}; } } catch {}
}
const nameOf = id => id===S.me ? "You" : ((S.addrNames&&S.addrNames[id]) || (S.people[id]&&S.people[id].name) || "Someone");
const fullName = id => (S.addrNames&&S.addrNames[id]) ? S.addrNames[id] : fullName0(id);
const fullName0 = id => ((S.people[id]&&S.people[id].name)||"Someone") + (id===S.me?" (you)":"");
function avatar(id, cls=""){
  const p = S.people[id]||{}; const nm=(p.name||"?").replace(/^Example:\s*/,"");
  const el = h("span",{class:"av "+cls, style:`background:${p.color||colorFor(id||"x")}`, title:fullName(id)});
  if (p.avatarUrl) el.append(h("img",{src:p.avatarUrl, alt:""})); else el.textContent = nm.trim().slice(0,1).toUpperCase();
  return el;
}
function chanTitle(c){ if (!c) return ""; if (c.kind==="task"){ const t=S.tasks.find(x=>x.id===c.taskId); return t? `CN-${t.num} · ${t.title}` : (c.name||"Task conversation"); } if (c.kind==="dm"){ const o=(c.members||[]).find(m=>m!==S.me)||S.me; return fullName(o).replace(/^Example:\s*/,""); } return c.name||"Untitled"; }
function chanGlyph(c){
  if (c.kind==="dm"){ const o=(c.members||[]).find(m=>m!==S.me)||S.me; return avatar(o,"lg"); }
  if (c.kind==="task"){ const t=S.tasks.find(x=>x.id===c.taskId); const g=h("span",{class:"glyph tglyph", style:`--st:${t? (STATUSES.find(s=>s.id===stOf(t))||STATUSES[0]).c : "var(--muted)"}`}, svg(IC.knot));
    const par=S.channels.find(x=>x.id===(c.parent || (t&&t.channel))); if (!par || par.kind==="task") return g;
    return h("span",{class:"tgwrap", title:"From "+chanTitle(par)}, g, h("span",{class:"tgpar"}, chanGlyph(par))); }
  if (c.icon) return h("span",{class:"glyph eglyph"}, c.icon);
  return h("span",{class:"glyph", style:`background:${colorFor(c.id)}`}, (c.name||"#").trim().slice(0,1).toUpperCase());
}

// ---------- boot ----------
async function boot(){
  applyPrefs(); render();
  if (!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase && !/YOUR_/.test(CFG.supabaseUrl+CFG.supabaseKey))) { startDemo("Example data. Add your Supabase keys in config.js to go live."); return; }
  SB=window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
  const {data}=await SB.auth.getSession();
  if (!data || !data.session) { openLogin(); return; }
  await startLive(data.session.user);
}
function startDemo(msg){ S.mode="demo"; S.me="me"; demo.seed(); if (!S.active) S.active="launch"; showBanner(msg); subscribeAll(); }
function showBanner(t){ const b=$("#banner"); b.hidden=false; b.replaceChildren(h("span",{style:"width:9px;height:9px;background:var(--knot);transform:rotate(45deg);flex:none"}), h("span",{},t)); }

function subscribeAll(){
  loadPins(); loadAddr(); initE2E().then(()=>render());
  store.sub("keys", rows => { S.keys=Object.fromEntries(rows.map(r=>[r.id, r.devices||{}])); if (E2E.ready) S.keys[S.me]={...(S.keys[S.me]||{}), [E2E.dev]:E2E.pub}; });
  store.sub("team", async rows => { S.team=rows.map(r=>r.id); S.teamDocs=Object.fromEntries(rows.map(r=>[r.id,r])); if (S.mode==="live") for (const r of rows) S.people[r.id]={id:r.id, name:r.name||r.phone||"Someone", avatarUrl:r.photo||"", color:colorFor(r.id)}; matchAddr(); await resolvePeople(S.team); render(); });
  store.sub("teams", rows => { S.teams=rows; render(); });
  store.sub("contacts", async rows => { S.allContacts=Object.fromEntries(rows.map(r=>[r.id, r.ids||[]])); S.contacts=S.allContacts[S.me]||[]; await resolvePeople(Object.keys(S.allContacts)); render(); });
  store.sub("status", async rows => { S.statuses=rows; await resolvePeople(rows.map(r=>r.by)); for (const st of rows) if (st.by===S.me && now()-st.at>DAY) store.del("status/"+st.id).catch(()=>{}); if (S.view==="updates") render(); else updateDots(); });
  store.sub("calls", async rows => { S.calls=rows; await resolvePeople(rows.flatMap(r=>r.members||[])); onCalls(); if (S.view==="calls") render(); else updateDots(); });
  store.sub("channels", async rows => {
    S.channels = rows.filter(c => c.kind!=="dm" || (c.members||[]).includes(S.me)).sort((a,b)=>((b.last&&b.last.at)||b.at||0)-((a.last&&a.last.at)||a.at||0));
    await resolvePeople(rows.flatMap(c=>[...(c.members||[]), c.last&&c.last.by]).filter(Boolean));
    if (!S.active || !S.channels.find(c=>c.id===S.active)) S.active = S.channels[0] ? S.channels[0].id : null;
    decryptMany(S.channels.map(c=>c.last&&c.last.enc)).then(ch=>{ if (ch) render(true); });
    openMsgs(); render();
  });
  store.sub("tasks", async rows => { S.tasks=rows.sort((a,b)=>(a.num||0)-(b.num||0)); await resolvePeople(rows.flatMap(t=>[t.assignee,t.createdBy]).filter(Boolean)); render(); });
}
function openMsgs(){
  if (S.msgsFor===S.active) return;
  if (unsubMsgs) unsubMsgs(); S.msgs=[]; S.msgsFor=S.active;
  if (!S.active) return;
  const cid=S.active;
  unsubMsgs = store.sub("channels/"+cid+"/messages", async rows => {
    if (S.msgsFor!==cid) return;
    S.msgs = rows.sort((a,b)=>a.at-b.at);
    await resolvePeople(rows.map(m=>m.by));
    if (!E2E.ready) await initPromise();
    await decryptMany(rows.map(m=>m.enc));
    markRead(); render(true);
  });
}
let _initP=null; function initPromise(){ return Promise.race([new Promise(r=>{ const t=setInterval(()=>{ if (E2E.ready){ clearInterval(t); r(); } },50); setTimeout(()=>{ clearInterval(t); r(); },1500); })]); }
function markRead(){ if (!S.active) return; const c=S.channels.find(x=>x.id===S.active); const t=(c&&c.last&&c.last.at)||now(); S.lastRead[S.active]=t; ls.set("lastRead", S.lastRead); }
const unread = c => c.last && c.last.by!==S.me && c.last.at > (S.lastRead[c.id]||0) && c.id!==S.active;

// ---------- actions ----------
async function sendMessage(text){
  text=text.trim(); if (!text || !S.active) return;
  const chn=S.channels.find(c=>c.id===S.active)||{}; const members=chn.members||[S.me];
  if (S.editing) { const id=S.editing; S.editing=null; if (E2E.ready) { const {env}=await seal(text, members); await guarded(store.update(`channels/${S.active}/messages/${id}`, {enc:env, text:"", edited:true})); } else await guarded(store.update(`channels/${S.active}/messages/${id}`, {text, edited:true})); render(true); return; }
  const extra={}; if (S.replyTo) extra.replyTo=S.replyTo; if (S.statusReply) { extra.statusQuote=S.statusReply; S.statusReply=null; }
  const ments=(S.pendingMentions||[]).filter(mid=>members.includes(mid) && text.includes("@"+nameOf(mid).replace(/^Example:\s*/,"").split(" ")[0])); S.pendingMentions=[]; if (ments.length) extra.mentions=ments;
  S.replyTo=null; const asTask=S.asTask; S.asTask=false;
  const sent=await sendTextTo(S.active, text, extra);
  if (asTask) quickTask([sent]);
  scrollDown=true; render(true);
}
async function nextNum(){
  const c = await store.get("meta/counter").catch(()=>null);
  const n = ((c&&c.n)||0)+1; await store.set("meta/counter",{n}); return n;
}
function startTaskFromMessage(m){ return quickTask([m]); }
function oldStartTaskFromMessage(m){
  const firstLine = (m.kind==="voice" && !m.text)? "Voice note ("+fmtDur(m.voice&&m.voice.dur)+")" : m.text.split("\n")[0];
  S.draftTask = {title: firstLine.length>90? firstLine.slice(0,88)+"…" : firstLine, notes: m.text.length>firstLine.length? m.text: "", status:"todo", assignee:"", due:"", priority:"normal", channel:S.active, fromMsg:m.id, fromText:m.text, fromBy:m.by};
  S.openTask="new"; S.actFor=null; render();
  setTimeout(()=>{ const i=$("#t-title"); if (i){ i.focus(); i.select(); } }, 30);
}
function newBlankTask(){ S.draftTask={subtasks:[], title:"", notes:"", status:STATUSES[0].id, assignee:S.filter!=="all"&&S.filter!=="me"?S.filter:(S.filter==="me"?S.me:""), due:"", priority:"normal", channel:""}; S.openTask="new"; render(); setTimeout(()=>{ const i=$("#t-title"); if(i) i.focus(); },30); }
async function saveTask(){
  const d=S.draftTask; if (!d.title.trim()) { toast("Give the task a title first."); return; }
  if (S.openTask==="new") {
    const id="t"+now().toString(36)+uidShort().slice(0,3);
    const num = await guarded(nextNum());
    const t = {...d, team:(curTeam()||{}).id||"", title:d.title.trim(), num, createdBy:S.me, at:now(), log:[{at:now(), by:S.me, what:"created"}]};
    await guarded(store.set("tasks/"+id, t));
    if (d.fromMsg && d.channel) { S.justTied=d.fromMsg; guarded(store.update(`channels/${d.channel}/messages/${d.fromMsg}`, {taskId:id})).catch(()=>{}); }
    toast(`CN-${num} created`);
  } else {
    const prev = S.tasks.find(t=>t.id===S.openTask)||{};
    const changes=[]; if (prev.status!==d.status) changes.push("moved to "+stName(d.status)); if (prev.assignee!==d.assignee) changes.push(d.assignee? "assigned "+nameOf(d.assignee): "unassigned");
    const log=[...(prev.log||[])]; if (changes.length) log.push({at:now(), by:S.me, what:changes.join(", ")}); else log.push({at:now(), by:S.me, what:"edited"});
    await guarded(store.update("tasks/"+S.openTask, {title:d.title.trim(), notes:d.notes, status:d.status, assignee:d.assignee, due:d.due, priority:d.priority, subtasks:d.subtasks||[], files:d.files||[], log:log.slice(-20)}));
    toast("Saved");
  }
  S.openTask=null; S.draftTask=null; render();
}
async function moveTask(id, status){
  const t=S.tasks.find(x=>x.id===id); if (!t || t.status===status) return;
  const log=[...(t.log||[]), {at:now(), by:S.me, what:"moved to "+stName(status)}].slice(-20);
  await guarded(store.update("tasks/"+id, {status, log}));
  if (status==="done") toast("CN-"+t.num+" marked done");
  if (S.openTask===id && S.draftTask) S.draftTask.status=status;
}
async function deleteTask(id){
  const t=S.tasks.find(x=>x.id===id); S.openTask=null; S.draftTask=null;
  await guarded(store.del("tasks/"+id));
  if (t && t.fromMsg && t.channel) guarded(store.update(`channels/${t.channel}/messages/${t.fromMsg}`, {taskId:null})).catch(()=>{});
  toast("Task deleted"); render();
}
async function toggleReact(m, e){
  const r = {...(m.reactions||{})}; const arr = new Set(r[e]||[]);
  if (arr.has(S.me)) arr.delete(S.me); else { arr.add(S.me); const u=ls.get("emojiUse",{}); u[e]=(u[e]||0)+1; ls.set("emojiUse",u); } r[e]=[...arr]; if (!r[e].length) delete r[e];
  S.emojiFor=null; S.actFor=null; S.emojiMore=false; render(true); await guarded(store.update(`channels/${S.active}/messages/${m.id}`, {reactions:r}));
}
async function deleteMsg(m){ S.actFor=null; await guarded(store.update(`channels/${S.active}/messages/${m.id}`, {text:"", deleted:true, reactions:{}})); }
async function createChannel(name, members, kind="group", icon=""){
  let id;
  if (kind==="dm") { id = "dm-"+[...members].sort().join("-").replace(/[^A-Za-z0-9_\-.~:@+]/g,""); const ex=S.channels.find(c=>c.id===id); if (ex){ selectChannel(id); return; } }
  else id = "g"+now().toString(36)+uidShort().slice(0,3);
  await guarded(store.set("channels/"+id, {name:name||"", kind, members, icon:icon||"", createdBy:S.me, at:now()}));
  S.active=id; S.view="chats"; S.inThread=true; ls.set("active",id); ls.set("view","chats"); openMsgs(); render();
}
function selectChannel(id){ S.selecting=false; S.sel=[]; S.active=id; S.inThread=true; S.view="chats"; S.replyTo=null; S.editing=null; S.actFor=null; ls.set("active",id); ls.set("view","chats"); openMsgs(); markRead(); scrollDown=true; render(); }
function jumpToMessage(cid, mid){ S.openTask=window.innerWidth>860? S.openTask: null; selectChannel(cid); const tryJump=(n)=>{ const el=document.getElementById("msg-"+mid); if (el){ el.scrollIntoView({block:"center"}); el.querySelector(".strip").animate([{outline:"2px solid var(--knot)"},{outline:"2px solid transparent"}],{duration:1600}); } else if (n>0) setTimeout(()=>tryJump(n-1),200); }; setTimeout(()=>tryJump(10),60); }


// ---------- confetti ----------
function confetti(){
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let c=document.getElementById("confetti"); if (!c){ c=document.createElement("canvas"); c.id="confetti"; document.body.append(c); }
  const W=c.width=innerWidth*devicePixelRatio, H=c.height=innerHeight*devicePixelRatio, x=c.getContext("2d");
  const cols=["#FF4F8B","#FFD43B","#6EE7A8","#7CC8FF","#5B3DF5","#FF8A1F"];
  const ps=Array.from({length:140},()=>({x:W/2,y:H*0.55,vx:(Math.random()-.5)*26*devicePixelRatio,vy:(-Math.random()*26-8)*devicePixelRatio,r:Math.random()*Math.PI,vr:(Math.random()-.5)*.4,s:(6+Math.random()*8)*devicePixelRatio,c:cols[Math.random()*cols.length|0],sh:Math.random()<.3}));
  let f=0; (function tick(){ x.clearRect(0,0,W,H); for (const p of ps){ p.vy+=0.9*devicePixelRatio; p.vx*=.985; p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; x.save(); x.translate(p.x,p.y); x.rotate(p.r); x.fillStyle=p.c; if (p.sh){ x.beginPath(); x.arc(0,0,p.s/2,0,7); x.fill(); } else x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2); x.restore(); } if (++f<110) requestAnimationFrame(tick); else x.clearRect(0,0,W,H); })();
}

// ---------- voice notes ----------
const CHUNK = 160000; // base64 chars per stored part
const VOICE_URLS = {}; const PLAYER = new Audio(); PLAYER.preload="auto"; let playing=null;
const fmtDur = s => { s=Math.max(0,Math.round(s||0)); return Math.floor(s/60)+":"+String(s%60).padStart(2,"0"); };
let REC=null;
function pickMime(){ if (!window.MediaRecorder) return null; for (const t of ["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"]) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch {} } return ""; }
async function startRec(cb){
  if (typeof cb!=="function") cb=null;
  if (!S.canWrite || REC || (!cb && !S.active)) return;
  let stream=null;
  try { if (!navigator.mediaDevices || !window.MediaRecorder) throw 0; stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); }
  catch { openVoiceFallback(cb); return; }
  const mime = pickMime(); let mr;
  try { mr = new MediaRecorder(stream, mime? {mimeType:mime, audioBitsPerSecond:32000} : {audioBitsPerSecond:32000}); } catch { mr = new MediaRecorder(stream); }
  const ac = new (window.AudioContext||window.webkitAudioContext)(); const an = ac.createAnalyser(); an.fftSize=256; ac.createMediaStreamSource(stream).connect(an);
  REC = {mr, stream, ac, an, chunks:[], t0:now(), levels:[], cancel:false, cb}; S.recFor = cb? "task" : "chat";
  mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  mr.onstop = async () => {
    const r=REC; REC=null; S.rec=false; r.stream.getTracks().forEach(t=>t.stop()); try{ r.ac.close(); }catch{}
    clearInterval(r.timer); cancelAnimationFrame(r.raf); render(true);
    if (r.cancel) return;
    const dur=(now()-r.t0)/1000; if (dur<0.6) { toast("Hold on a little longer to record"); return; }
    const blob = new Blob(r.chunks, {type:(r.mr.mimeType||mime||"audio/webm").split(";")[0]});
    (r.cb||sendVoice)(blob, dur, peaksFromLevels(r.levels));
  };
  mr.start(250); S.rec=true; if (navigator.vibrate) try{ navigator.vibrate(15); }catch{}
  REC.timer = setInterval(()=>{ const el=$("#recTime"); const sec=(now()-REC.t0)/1000; if (el) el.textContent=fmtDur(sec); if (sec>=180) stopRec(false); }, 250);
  const buf=new Uint8Array(an.frequencyBinCount);
  const loop=()=>{ if (!REC) return; an.getByteTimeDomainData(buf); let m=0; for (const v of buf) m=Math.max(m, Math.abs(v-128)); const lv=Math.min(1,m/64); REC.levels.push(lv);
    const bars=document.querySelectorAll("#recBars i"); if (bars.length){ const tail=REC.levels.slice(-bars.length); bars.forEach((b,i)=>b.style.transform=`scaleY(${Math.max(.12,tail[i]||0)})`); }
    REC.raf=requestAnimationFrame(loop); };
  loop(); render(true);
}
function stopRec(cancel){ if (!REC) return; REC.cancel=!!cancel; try { REC.mr.stop(); } catch { REC=null; S.rec=false; render(true); } }
function peaksFromLevels(lv){ const n=36, out=[]; if (!lv.length) return Array(n).fill(.3); const step=lv.length/n; for (let i=0;i<n;i++){ const sl=lv.slice(Math.floor(i*step), Math.max(Math.floor(i*step)+1, Math.floor((i+1)*step))); out.push(+Math.max(.08, Math.min(1, Math.max(...sl)*1.3)).toFixed(2)); } return out; }
async function peaksFromBlob(blob){
  try { const ac=new (window.AudioContext||window.webkitAudioContext)(); const ab=await ac.decodeAudioData(await blob.arrayBuffer()); const d=ab.getChannelData(0); const n=36, step=Math.floor(d.length/n), out=[]; let mx=0;
    for (let i=0;i<n;i++){ let m=0; for (let j=i*step;j<(i+1)*step;j+=64) m=Math.max(m,Math.abs(d[j])); out.push(m); mx=Math.max(mx,m); } try{ac.close();}catch{} return {peaks:out.map(v=>+Math.max(.08,v/(mx||1)).toFixed(2)), dur:ab.duration}; }
  catch { return {peaks:Array.from({length:36},(_, i)=>+(.3+.5*Math.abs(Math.sin(i*1.7))).toFixed(2)), dur:0}; }
}
function blobToB64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]||""); r.onerror=rej; r.readAsDataURL(blob); }); }
async function sendVoice(blob, dur, peaks, target, vextra={}){
  if (!(target||S.active)) return;
  if (blob.size > 3.5*1024*1024) { toast("That recording is too long. Keep voice notes under about 3 minutes."); return; }
  const cid=target||S.active; const vid="v"+now().toString(36)+uidShort().slice(0,4); const mid="m"+now().toString(36)+uidShort().slice(0,4);
  toast("Sending voice note…");
  try {
    const chv=S.channels.find(c=>c.id===cid)||{}; let venv=null, eiv="", b64;
    if (E2E.ready) { const sealed=await seal("", chv.members||[S.me]); venv=sealed.env; const iv=crypto.getRandomValues(new Uint8Array(12)); eiv=b64e(iv); b64=b64e(await crypto.subtle.encrypt({name:"AES-GCM",iv}, sealed.mk, await blob.arrayBuffer())); }
    else b64=await blobToB64(blob);
    const parts=Math.ceil(b64.length/CHUNK);
    for (let i=0;i<parts;i++) await guarded(store.set(`voice/${vid}/parts/${i}`, {d:b64.slice(i*CHUNK,(i+1)*CHUNK)}));
    VOICE_URLS[vid]=URL.createObjectURL(blob);
    const msg={by:S.me, text:"", at:now(), kind:"voice", voice:{id:vid, parts, mime:blob.type||"audio/webm", dur:Math.round(dur*10)/10, peaks, eiv}, ...vextra}; if (venv) msg.enc=venv;
    if (S.replyTo && !target) { msg.replyTo=S.replyTo; S.replyTo=null; }
    await guarded(store.set(`channels/${cid}/messages/${mid}`, msg));
    guarded(store.update(`channels/${cid}`, {last: venv? {enc:venv, text:"", kind:"voice", by:S.me, at:msg.at} : {text:"🎤 Voice note ("+fmtDur(dur)+")", by:S.me, at:msg.at}})).catch(()=>{});
    if (S.asTask && !target) { S.asTask=false; quickTask([{id:mid, ...msg}]); }
    scrollDown=true; if (!target) toast("Voice note sent"); render(true);
  } catch(e) { if (!e || !e.code) toast("The voice note didn't send. Try again."); }
}
async function voiceUrl(v, env){
  if (VOICE_URLS[v.id]) return VOICE_URLS[v.id];
  let b64="";
  for (let i=0;i<v.parts;i++){ const p=await store.get(`voice/${v.id}/parts/${i}`); if (!p) throw new Error("missing"); b64+=p.d; }
  let u8=b64d(b64);
  if (v.eiv && env) { const mk=await openKey(env); u8=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(v.eiv)}, mk, u8)); }
  return VOICE_URLS[v.id]=URL.createObjectURL(new Blob([u8],{type:v.mime||"audio/webm"}));
}
async function togglePlay(m){
  const v=m.voice;
  if (playing===m.id && !PLAYER.paused) { PLAYER.pause(); syncPlayer(); return; }
  if (playing!==m.id) {
    playing=m.id; syncPlayer(true);
    try { PLAYER.src=await voiceUrl(v, m.enc); } catch { toast("This voice note couldn't be loaded."); playing=null; syncPlayer(); return; }
    PLAYER.playbackRate=S.speed||1;
  }
  try { await PLAYER.play(); } catch { toast("Tap play again to listen."); }
  syncPlayer();
}
function syncPlayer(loading){
  document.querySelectorAll(".voice").forEach(el=>{
    const me = el.dataset.mid===playing; const btn=el.querySelector(".vplay");
    btn.replaceChildren(svg(me && !PLAYER.paused ? IC.pause : IC.play)); btn.classList.toggle("loading", !!(me&&loading));
    const dur = (me && isFinite(PLAYER.duration) && PLAYER.duration) || +el.dataset.dur || 0;
    const frac = me && dur ? PLAYER.currentTime/dur : 0;
    el.querySelectorAll(".vbars i").forEach((b,i,all)=>b.classList.toggle("on", i/all.length < frac));
    el.querySelector(".vdur").textContent = fmtDur(me && PLAYER.currentTime>0 ? PLAYER.currentTime : dur);
    const sp=el.querySelector(".vspeed"); if (sp) sp.textContent=(S.speed||1)+"×";
  });
}
PLAYER.addEventListener("timeupdate", ()=>syncPlayer()); PLAYER.addEventListener("pause", ()=>syncPlayer());
PLAYER.addEventListener("ended", ()=>{ playing=null; syncPlayer(); });
function renderVoice(m){
  const v=m.voice; const el=h("div",{class:"voice", "data-mid":m.id, "data-dur":v.dur||0, onclick:e=>e.stopPropagation()});
  el.append(h("button",{class:"vplay", "aria-label":"Play voice note", onclick:()=>togglePlay(m)}, svg(IC.play)));
  const bars=h("div",{class:"vbars", onclick:e=>{ if (playing!==m.id || !isFinite(PLAYER.duration)) return; const r=e.currentTarget.getBoundingClientRect(); PLAYER.currentTime=PLAYER.duration*Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); }});
  (v.peaks||[]).forEach(p=>bars.append(h("i",{style:`height:${Math.round(10+p*90)}%`})));
  el.append(h("div",{class:"vmid"}, bars, h("div",{class:"vmeta"}, h("span",{class:"vdur"}, fmtDur(v.dur)), h("button",{class:"vspeed", "aria-label":"Playback speed", onclick:()=>{ S.speed = S.speed===1.5?2 : S.speed===2?1 : 1.5; PLAYER.playbackRate=S.speed; syncPlayer(); }}, (S.speed||1)+"×"))));
  return el;
}
function openVoiceFallback(cb){
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const input=h("input",{type:"file", accept:"audio/*", capture:"", hidden:true, onchange:async e=>{ const f=e.target.files&&e.target.files[0]; scrim.remove(); if (!f) return; const {peaks,dur}=await peaksFromBlob(f); (cb||sendVoice)(f, dur, peaks); }});
  scrim.append(h("div",{class:"modal", role:"dialog", "aria-label":"Send a voice note"},
    h("div",{class:"bigmic"}, svg(IC.mic)),
    h("h3",{},"Microphone isn't available here"),
    h("p",{class:"note",style:"margin:0"},"This view doesn't allow live recording. You can send a recording you made instead: on iPhone use Voice Memos and save it to Files, on Android use your recorder app."),
    input,
    h("div",{style:"display:flex;gap:8px;justify-content:flex-end"}, h("button",{class:"ghost", onclick:()=>scrim.remove()},"Cancel"), h("button",{class:"primary", onclick:()=>input.click()}, svg(IC.upload), "Choose recording"))
  ));
  document.body.append(scrim);
}

// ---------- task conversations ----------
async function openTaskChat(t){
  const existing = t.thread && S.channels.find(c=>c.id===t.thread);
  if (existing) { if (window.innerWidth<=860) { S.openTask=null; S.draftTask=null; } selectChannel(existing.id); return; }
  const id="k"+now().toString(36)+uidShort().slice(0,3);
  const src=S.channels.find(c=>c.id===t.channel);
  const members=[...new Set(src? [...(src.members||[]), S.me] : [S.me, t.assignee, t.createdBy].filter(Boolean))];
  await guarded(store.set("channels/"+id, {name:t.title, kind:"task", taskId:t.id, parent:t.channel||"", members, createdBy:S.me, at:now()}));
  await guarded(store.update("tasks/"+t.id, {thread:id}));
  if (window.innerWidth<=860) { S.openTask=null; S.draftTask=null; }
  S.active=id; S.view="chats"; S.inThread=true; ls.set("active",id); ls.set("view","chats"); openMsgs(); render();

}


// ---------- shared overlay helper ----------
function overlay(cls, label){ const o=h("div",{class:"overlay "+cls, role:"dialog", "aria-label":label}); document.body.append(o); return o; }

// ---------- status (Updates) ----------
const STATUS_BG=["#0A6CFF","#7B4DFF","#E5383B","#1FA855","#E08A00","#111114","#D6337A","#0E8F9C"];
const DAY=864e5;
let ASSETS=null;
const liveStatuses = () => S.statuses.filter(x=>now()-x.at<DAY).sort((a,b)=>a.at-b.at);
function statusGroups(){
  const g={}; for (const st of liveStatuses()) if (st.by===S.me || mutual(st.by)) (g[st.by]||(g[st.by]=[])).push(st);
  return g;
}
const seenAll = (list) => list.every(st=>(st.views||[]).includes(S.me));
function statusRing(id, list, size="lg"){
  const n=list.length; const seen=seenAll(list); const wrap=h("span",{class:"ring"+(seen?" seen":"")+(n?"":" none")});
  if (n){ const segs=[]; const gap=n>1?6:0; for (let i=0;i<n;i++){ const a0=i*360/n+gap/2, a1=(i+1)*360/n-gap/2; const s=(list[i].views||[]).includes(S.me)||list[i].by===S.me&&seen; segs.push(`<path d="${arc(30,30,28,a0,a1)}" stroke="${(list[i].views||[]).includes(S.me)||id===S.me? "var(--ringseen)" : "var(--ok)"}"/>`); }
    wrap.append(h("svg",{class:"ringsvg", viewBox:"0 0 60 60", html:segs.join("")})); }
  wrap.append(avatar(id,size)); return wrap;
}
function arc(cx,cy,r,a0,a1){ if (a1-a0>=359.9) return `M${cx} ${cy-r}a${r} ${r} 0 1 1 -0.01 0`; const p=a=>[cx+r*Math.sin(a*Math.PI/180), cy-r*Math.cos(a*Math.PI/180)]; const [x0,y0]=p(a0),[x1,y1]=p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
const assetUrl = st => st.localUrl || (st.asset? blobUrl(st.asset) : "");

function renderUpdates(){
  const w=h("section",{class:"teamwrap updates","aria-label":"Updates"});
  w.append(toprow("Updates"));
  const g=statusGroups(); const mine=g[S.me]||[];
  const others=Object.keys(g).filter(id=>id!==S.me).sort((a,b)=>g[b][g[b].length-1].at-g[a][g[a].length-1].at);
  const recent=others.filter(id=>!seenAll(g[id])), viewed=others.filter(id=>seenAll(g[id]));
  const card=h("div",{class:"ulist"});
  card.append(h("button",{class:"urow", onclick:()=>{ mine.length? openStory(S.me) : openStatusComposer("text"); }},
    h("span",{class:"cav"}, statusRing(S.me, mine), mine.length? "" : h("span",{class:"plusbadge"}, svg(IC.plus))),
    h("span",{class:"ctx"}, h("b",{},"My status"), h("span",{}, mine.length? `${mine.length} update${mine.length===1?"":"s"} · ${fmtAgo(mine[mine.length-1].at)}` : "Add status"))));
  w.append(h("div",{class:"seg-label"},"Status"), card);
  const row=id=>h("button",{class:"urow", onclick:()=>openStory(id)}, h("span",{class:"cav"}, statusRing(id,g[id])), h("span",{class:"ctx"}, h("b",{}, nameOf(id).replace(/^Example:\s*/,"")), h("span",{}, fmtAgo(g[id][g[id].length-1].at))));
  if (recent.length) w.append(h("div",{class:"seg-label"},"Recent updates"), h("div",{class:"ulist"}, recent.map(row)));
  if (viewed.length) w.append(h("div",{class:"seg-label"},"Viewed updates"), h("div",{class:"ulist"}, viewed.map(row)));
  if (S.canWrite) w.append(h("div",{class:"fabstack vfab"},
    h("button",{class:"fab mini", "aria-label":"Write a text status", title:"Text status", onclick:()=>openStatusComposer("text")}, svg(IC.edit)),
    h("button",{class:"fab", "aria-label":"Post a photo or video status", title:"Photo or video", onclick:()=>openStatusComposer("media")}, svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'))));
  return w;
}
function fmtAgo(t){ const m=Math.round((now()-t)/60000); if (m<1) return "Just now"; if (m<60) return m+" min ago"; const hh=Math.round(m/60); if (hh<24) return hh+" hr ago"; return fmtShort(t); }

function openStatusComposer(kind){
  if (kind==="photo") kind="media";
  let bg=STATUS_BG[Math.floor(Math.random()*STATUS_BG.length)], text="", file=null, prev="", cap="", busy=false, isVideo=false, vdur=0, prog=-1;
  const o=overlay("compose-status","New status");
  const close=()=>{ if (prev) URL.revokeObjectURL(prev); o.remove(); };
  const pickInput=h("input",{type:"file", accept:"image/*,video/*", hidden:true, onchange:async e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=""; if (!f) return;
    const vid=(f.type||"").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    if (vid) { const d=await videoMeta(f); if (d>VIDEO_MAX_S+0.5) { toast("Videos can be up to 5 minutes. This one is "+fmtDur(d)+"."); return; } vdur=d; }
    file=f; isVideo=vid; if (prev) URL.revokeObjectURL(prev); prev=URL.createObjectURL(f); kind="media"; draw(); }});
  const draw=()=>{
    o.style.background = kind==="text"? bg : "#000";
    const top=h("div",{class:"sc-top"}, h("button",{class:"sc-ic","aria-label":"Close", onclick:close}, svg(IC.x)), h("span",{class:"grow"}),
      kind==="text"? h("button",{class:"sc-ic","aria-label":"Change color", onclick:()=>{ bg=STATUS_BG[(STATUS_BG.indexOf(bg)+1)%STATUS_BG.length]; draw(); }}, svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17" opacity=".0"/><circle cx="9" cy="9.5" r="1.4" fill="currentColor"/><circle cx="14.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="16" cy="13.5" r="1.4" fill="currentColor"/>')) : "",
      h("button",{class:"sc-ic"+(kind==="text"?" on":""), "aria-label":"Text status", onclick:()=>{ kind="text"; draw(); }}, h("b",{style:"font-size:18px"},"Aa")),
      h("button",{class:"sc-ic"+(kind==="media"?" on":""), "aria-label":"Photo or video status", title:"Photo or video", onclick:()=>{ kind="media"; draw(); if (!file) pickInput.click(); }}, svg(ICF.media)));
    let mid;
    if (kind==="text") { mid=h("div",{class:"sc-mid"}, h("textarea",{id:"sc-text", maxlength:"500", placeholder:"Type a status", oninput:e=>{ text=e.target.value; fit(e.target); }}, text)); }
    else if (prev) mid=h("div",{class:"sc-mid"}, isVideo? h("video",{src:prev, class:"sc-photo", controls:true, playsinline:true}) : h("img",{src:prev, alt:"Selected photo", class:"sc-photo"}), prog>=0? h("div",{class:"sc-prog"}, h("i",{style:`width:${Math.round(prog*100)}%`}), h("span",{}, prog<1? "Preparing video… "+Math.round(prog*100)+"%" : "Uploading…")) : "");
    else mid=h("div",{class:"sc-mid"}, h("button",{class:"sc-pick", onclick:()=>pickInput.click()}, svg(ICF.media), "Choose a photo or video", h("small",{},"Videos up to 5 minutes")));
    const bot=h("div",{class:"sc-bot"},
      kind==="media"&&prev? h("input",{class:"sc-cap", id:"sc-cap", placeholder:"Add a caption…", value:cap, maxlength:"200", oninput:e=>cap=e.target.value}) : h("span",{class:"grow", style:"color:rgba(255,255,255,.8);font-size:13px"}, "Visible to your team for 24 hours"),
      h("button",{class:"sc-send", "aria-label":"Post status", disabled:busy, onclick:post}, svg(IC.send)));
    o.replaceChildren(top, mid, bot, pickInput);
    const ta=$("#sc-text"); if (ta){ fit(ta); ta.focus(); }
  };
  const fit=ta=>{ const n=ta.value.length; ta.style.fontSize=(n<40?34:n<120?26:n<250?20:17)+"px"; ta.style.height="auto"; ta.style.height=ta.scrollHeight+"px"; };
  async function post(){
    if (busy) return;
    const id="s"+now().toString(36)+uidShort().slice(0,4);
    let doc;
    if (kind==="text") { if (!text.trim()) { toast("Type something first."); return; } doc={by:S.me, kind:"text", text:text.trim(), bg, at:now(), views:[]}; }
    else {
      if (!file) { pickInput.click(); return; }
      busy=true; draw(); toast("Posting…");
      if (isVideo) {
        try {
          if (!DB) doc={by:S.me, kind:"video", localUrl:URL.createObjectURL(file), dur:vdur, caption:cap.trim(), at:now(), views:[]};
          else {
            if (!ASSETS) throw {code:"no_assets"};
            let blob=file, type=(file.type||"video/mp4").split(";")[0]; if (type==="video/quicktime") type="video/mp4";
            if (blob.size>UPLOAD_MAX) { prog=0; draw(); blob=await compressVideo(file, p=>{ prog=p; const bar=o.querySelector(".sc-prog i"), tx=o.querySelector(".sc-prog span"); if (bar) bar.style.width=Math.round(p*100)+"%"; if (tx) tx.textContent="Preparing video… "+Math.round(p*100)+"%"; }); type="video/webm"; prog=1; draw(); if (blob.size>UPLOAD_MAX) throw {code:"too_big"}; }
            const r=await ASSETS.upload(blob, {type});
            doc={by:S.me, kind:"video", asset:r.id, dur:vdur, caption:cap.trim(), at:now(), views:[]};
          }
        } catch(e) { busy=false; prog=-1; draw(); toast(e&&e.code==="no_assets"? "Video statuses need upload access. Ask the owner." : e&&e.code==="no_compress"? "This video is too large to upload from this browser. Try a shorter or lower-quality video." : e&&e.code==="too_big"? "Even compressed, this video is too large. Try a shorter one." : "The video didn't upload. Try again or use a shorter video."); return; }
      } else try {
        const small=await shrinkImage(file);
        if (DB) { if (!ASSETS) throw {code:"no_assets"}; const r=await ASSETS.upload(small, {type:small.type||"image/jpeg"}); doc={by:S.me, kind:"photo", asset:r.id, caption:cap.trim(), at:now(), views:[]}; }
        else doc={by:S.me, kind:"photo", localUrl:URL.createObjectURL(small), caption:cap.trim(), at:now(), views:[]};
      } catch(e) { busy=false; draw(); toast(e&&e.code==="no_assets"? "Photo statuses need upload access. Ask the owner, or post a text status." : "The photo didn't upload. Try a smaller photo."); return; }
    }
    try { await guarded(store.set("status/"+id, doc)); prev=""; o.remove(); toast("Status posted"); } catch { busy=false; draw(); }
  }
  draw(); if (kind==="media") pickInput.click();
  o.addEventListener("keydown", e=>{ if (e.key==="Escape") close(); });
}
async function shrinkImage(file){
  try { const url=URL.createObjectURL(file); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
    const max=1600, k=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
    return await new Promise(res=>c.toBlob(b=>res(b||file),"image/jpeg",.85)); } catch { return file; }
}

function openStory(startId){
  const g=statusGroups(); const order=[startId, ...Object.keys(g).filter(id=>id!==startId && id!==S.me && !seenAll(g[id]))].filter(id=>g[id]);
  if (!order.length) return;
  let pi=0, si=0, t0=0, paused=false, elapsed=0, raf=0, vid=null; const DUR=5500;
  const firstUnseen = id => { const l=g[id]; const i=l.findIndex(st=>!(st.views||[]).includes(S.me)); return i<0||id===S.me?0:i; };
  si=firstUnseen(order[0]);
  const o=overlay("story","Status");
  const close=()=>{ cancelAnimationFrame(raf); if (vid) vid.pause(); o.remove(); document.removeEventListener("keydown",keys); render(); };
  const keys=e=>{ if (e.key==="Escape") close(); if (e.key==="ArrowRight") next(); if (e.key==="ArrowLeft") back(); };
  document.addEventListener("keydown",keys);
  const next=()=>{ const l=g[order[pi]]; if (si<l.length-1) si++; else if (pi<order.length-1){ pi++; si=firstUnseen(order[pi]); } else return close(); show(); };
  const back=()=>{ if (si>0) si--; else if (pi>0){ pi--; si=0; } show(); };
  function show(){
    if (vid) { vid.pause(); vid=null; }
    const id=order[pi], l=g[id], st=l[si]; elapsed=0; t0=performance.now(); paused=false;
    if (id!==S.me && !(st.views||[]).includes(S.me) && S.canWrite) { st.views=[...(st.views||[]), S.me]; store.update("status/"+st.id, {views:st.views}).catch(()=>{}); }
    const bars=h("div",{class:"st-bars"}, l.map((_,i)=>h("span",{}, h("i",{style:`width:${i<si?100:0}%`}))));
    const head=h("div",{class:"st-head"}, avatar(id), h("div",{class:"st-who"}, h("b",{}, id===S.me?"My status":nameOf(id).replace(/^Example:\s*/,"")), h("span",{}, fmtAgo(st.at))), h("span",{class:"grow"}),
      id===S.me? h("button",{class:"sc-ic","aria-label":"Delete this status", onclick:async e=>{ e.stopPropagation(); await guarded(store.del("status/"+st.id)).catch(()=>{}); toast("Status deleted"); close(); }}, svg(IC.trash)) : "",
      h("button",{class:"sc-ic","aria-label":"Close", onclick:e=>{ e.stopPropagation(); close(); }}, svg(IC.x)));
    if (st.kind==="video") { vid=h("video",{src:assetUrl(st), playsinline:true, autoplay:true, preload:"auto"}); vid.addEventListener("ended", ()=>next()); vid.play().catch(()=>{ vid.muted=true; vid.play().catch(()=>{}); }); }
    const body = st.kind==="video"? h("div",{class:"st-body photo"}, vid, st.caption? h("div",{class:"st-cap"}, st.caption):"") : st.kind==="photo"? h("div",{class:"st-body photo"}, h("img",{src:assetUrl(st), alt:st.caption||"Photo status"}), st.caption? h("div",{class:"st-cap"}, st.caption):"") : h("div",{class:"st-body text", style:`background:${st.bg||STATUS_BG[0]}`}, h("p",{style:`font-size:${st.text.length<40?36:st.text.length<120?28:21}px`}, st.text));
    const foot = id===S.me? h("div",{class:"st-foot"}, svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'), (st.views||[]).length? `Seen by ${(st.views||[]).map(nameOf).map(n=>n.replace(/^Example:\s*/,"")).join(", ")}` : "No views yet")
      : S.canWrite? h("div",{class:"st-foot"}, h("button",{class:"st-reply", onclick:e=>{ e.stopPropagation(); cancelAnimationFrame(raf); o.remove(); document.removeEventListener("keydown",keys); replyToStatus(id, st); }}, svg(IC.reply), "Reply")) : "";
    o.replaceChildren(bars, head, body, h("button",{class:"st-nav left","aria-label":"Previous", onclick:back}), h("button",{class:"st-nav right","aria-label":"Next", onclick:next}), foot);
    body.addEventListener("pointerdown",()=>{ paused=true; elapsed+=performance.now()-t0; if (vid) vid.pause(); }); body.addEventListener("pointerup",()=>{ paused=false; t0=performance.now(); if (vid) vid.play().catch(()=>{}); });
  }
  function tick(now_){ if (vid) { const cur=o.querySelectorAll(".st-bars i")[si]; if (cur && vid.duration) cur.style.width=(vid.currentTime/vid.duration*100)+"%"; raf=requestAnimationFrame(tick); return; } if (!paused){ const p=Math.min(1,(elapsed+now_-t0)/DUR); const cur=o.querySelectorAll(".st-bars i")[si]; if (cur) cur.style.width=(p*100)+"%"; if (p>=1) next(); } raf=requestAnimationFrame(tick); }
  show(); raf=requestAnimationFrame(tick);
}
async function replyToStatus(id, st){
  const cid="dm-"+[S.me,id].sort().join("-").replace(/[^A-Za-z0-9_\-.~:@+]/g,"");
  if (!S.channels.find(c=>c.id===cid)) await guarded(store.set("channels/"+cid, {name:"", kind:"dm", members:[S.me,id], createdBy:S.me, at:now()}));
  S.statusReply={by:id, text: st.kind==="text"? st.text : (st.caption||(st.kind==="video"?"🎥 Video":"📷 Photo"))};
  selectChannel(cid);
}

// ---------- calls ----------
const RING_MS=45000;
const callUrl = c => `https://meet.jit.si/Concept-${c.room}#config.prejoinConfig.enabled=false&config.startWithVideoMuted=${c.kind!=="video"}&userInfo.displayName=%22${encodeURIComponent(nameOf(S.me)==="You"? ((S.people[S.me]||{}).name||"Concept user") : nameOf(S.me))}%22`;
let ringing=null, ringTimer=null, ringAudio=null;
async function startCall(c, kind){
  if (!S.canWrite) return;
  const members=[...new Set(c.members||[])]; if (members.length<2) { toast("Add someone to this chat before calling."); return; }
  const id="c"+now().toString(36)+uidShort().slice(0,4);
  const call={from:S.me, members, kind, channel:c.id, title:c.kind==="dm"? "" : chanTitle(c), room:uidShort()+uidShort(), at:now(), status:"ringing", joined:[S.me]};
  await guarded(store.set("calls/"+id, call));
  showOutgoing({id, ...call});
  setTimeout(()=>{ const cur=S.calls.find(x=>x.id===id); if (cur && cur.status==="ringing") store.update("calls/"+id, {status:"missed"}).catch(()=>{}); }, RING_MS);
}
function callTitle(call){ if (call.title) return call.title; const o=(call.members||[]).find(m=>m!==S.me)||call.from; return nameOf(o).replace(/^Example:\s*/,""); }
function callPeer(call){ return call.from===S.me? (call.members||[]).find(m=>m!==S.me) : call.from; }
function showOutgoing(call){
  closeCallUI(); const o=overlay("callscreen","Call"); o.id="callui"; o.dataset.call=call.id;
  const peer=callPeer(call); const phone=!call.title && peer && S.teamDocs[peer] && S.teamDocs[peer].phone;
  const draw=()=>{ const cur=S.calls.find(x=>x.id===call.id)||call;
    const st = cur.status==="answered"? "Answered" : cur.status==="declined"? "Declined" : cur.status==="missed"? "No answer" : cur.status==="ended"? "Call ended" : "Ringing…";
    o.replaceChildren(
      h("div",{class:"cs-top"}, h("span",{class:"cs-kind"}, svg(call.kind==="video"? IC.video : IC.phone), call.kind==="video"? "Concept video call":"Concept voice call")),
      h("div",{class:"cs-mid"}, h("div",{class:"cs-av"+(cur.status==="ringing"?" pulse":"")}, call.title? h("span",{class:"glyph", style:`background:${colorFor(call.channel)};width:120px;height:120px;font-size:46px`}, call.title[0].toUpperCase()) : avatar(peer,"xl")), h("b",{class:"cs-name"}, callTitle(call)), h("span",{class:"cs-st"}, st)),
      phone? h("div",{class:"cs-phone"}, "Or call their phone: ", h("a",{href:"tel:"+phone.replace(/[^\d+]/g,""), class:"selectable"}, phone)) : "",
      h("div",{class:"cs-acts"},
        h("div",{class:"cs-btn"}, h("button",{class:"round end", "aria-label":"End call", onclick:()=>{ if (cur.status==="ringing") store.update("calls/"+call.id,{status:"ended"}).catch(()=>{}); closeCallUI(); }}, svg(IC.phone)), h("span",{},"End")),
        h("div",{class:"cs-btn"}, h("a",{class:"round go", href:callUrl(call), target:"_blank", rel:"noopener", "aria-label":"Join the call"}, svg(call.kind==="video"? IC.video: IC.phone)), h("span",{},"Join call"))
      ),
      "");
  };
  o._draw=draw; draw();
}
function showIncoming(call){
  if (document.getElementById("callui")) return;
  const o=overlay("callscreen incoming","Incoming call"); o.id="callui"; o.dataset.call=call.id;
  const caller=call.from;
  o.replaceChildren(
    h("div",{class:"cs-top"}, h("span",{class:"cs-kind"}, svg(call.kind==="video"? IC.video : IC.phone), call.kind==="video"? "Incoming video call":"Incoming voice call")),
    h("div",{class:"cs-mid"}, h("div",{class:"cs-av pulse"}, avatar(caller,"xl")), h("b",{class:"cs-name"}, nameOf(caller).replace(/^Example:\s*/,"")), h("span",{class:"cs-st"}, call.title? "Calling "+call.title : "Concept call")),
    h("div",{class:"cs-acts"},
      h("div",{class:"cs-btn"}, h("button",{class:"round end", "aria-label":"Decline", onclick:()=>{ store.update("calls/"+call.id, {status:"declined"}).catch(()=>{}); closeCallUI(); }}, svg(IC.phone)), h("span",{},"Decline")),
      h("div",{class:"cs-btn"}, h("a",{class:"round go", href:callUrl(call), target:"_blank", rel:"noopener", "aria-label":"Accept", onclick:()=>{ store.update("calls/"+call.id, {status:"answered", joined:[...new Set([...(call.joined||[]), S.me])]}).catch(()=>{}); setTimeout(closeCallUI, 300); }}, svg(call.kind==="video"? IC.video: IC.phone)), h("span",{},"Accept"))
    ));
  startRing();
}
function closeCallUI(){ const o=document.getElementById("callui"); if (o) o.remove(); stopRing(); }
function startRing(){ stopRing(); if (S.prefs.ring!==false) try { const ac=new (window.AudioContext||window.webkitAudioContext)(); ringAudio=ac; const beep=()=>{ if (ringAudio!==ac) return; [0,0.25].forEach(d=>{ const o=ac.createOscillator(), g=ac.createGain(); o.frequency.value=d?660:520; g.gain.setValueAtTime(.0001,ac.currentTime+d); g.gain.exponentialRampToValueAtTime(.18,ac.currentTime+d+.03); g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d+.22); o.connect(g).connect(ac.destination); o.start(ac.currentTime+d); o.stop(ac.currentTime+d+.25); }); }; beep(); ringTimer=setInterval(beep,1800); } catch {} if (S.prefs.vibrate!==false && navigator.vibrate) try{ navigator.vibrate([300,200,300]); }catch{} }
function stopRing(){ clearInterval(ringTimer); ringTimer=null; if (ringAudio) { try{ ringAudio.close(); }catch{} ringAudio=null; } }
function onCalls(){
  const o=document.getElementById("callui");
  if (o) { const cur=S.calls.find(x=>x.id===o.dataset.call); if (o.classList.contains("incoming") && (!cur || cur.status!=="ringing")) closeCallUI(); else if (o._draw) o._draw(); }
  const inc=S.calls.find(c=>c.status==="ringing" && c.from!==S.me && (c.members||[]).includes(S.me) && now()-c.at<RING_MS);
  if (inc && !o) showIncoming(inc);
}

function renderCalls(){
  const w=h("section",{class:"teamwrap calls","aria-label":"Calls"});
  if (S.dial.on) { w.classList.add("dialing"); w.append(h("div",{class:"toprow"}, h("button",{class:"iconbtn", "aria-label":"Back to calls", title:"Back", onclick:()=>{ S.dial.on=false; render(); }}, svg(IC.back)), h("h1",{class:"h1"},"Keypad"), h("span",{class:"grow"}), profBtn())); renderDial(w); return w; }
  w.append(toprow("Calls"));
  const mine=S.calls.filter(c=>(c.members||[]).includes(S.me)).sort((a,b)=>b.at-a.at).slice(0,60);
  const others=S.team.filter(id=>id!==S.me);
  if (S.contacts.length) { w.append(h("div",{class:"seg-label"},"Favourites")); w.append(h("div",{class:"favs"}, S.contacts.slice(0,8).map(id=>h("div",{class:"fav"},
    avatar(id,"lg"), h("span",{class:"fn"}, nameOf(id).replace(/^Example:\s*/,"").split(" ")[0]),
    h("div",{class:"favacts"}, h("button",{"aria-label":"Voice call "+nameOf(id), onclick:()=>callPerson(id,"voice")}, svg(IC.phone)), h("button",{"aria-label":"Video call "+nameOf(id), onclick:()=>callPerson(id,"video")}, svg(IC.video))))))); }
  w.append(h("div",{class:"seg-label"},"Recent"));
  if (!mine.length) w.append(h("p",{class:"note"},"No recent calls"));
  else w.append(h("div",{class:"ulist"}, mine.map(c=>{
    if (c.kind==="phone") return h("div",{class:"urow callrow"}, c.peer? avatar(c.peer,"lg") : h("span",{class:"glyph", style:"background:var(--muted)"}, svg(ICF.cell)),
      h("span",{class:"ctx"}, h("b",{}, c.peer? nameOf(c.peer).replace(/^Example:\s*/,"") : c.number), h("span",{class:"cdir"}, svg('<path d="M7 17L17 7M9 7h8v8"/>'), "Phone · ", c.peer? c.number+" · ":"", fmtShort(c.at))),
      h("a",{class:"iconbtn callback", href:"tel:"+digits(c.number), "aria-label":"Call again", title:"Call again", onclick:()=>logPhoneCall(c.number)}, svg(ICF.cell)));
    const out=c.from===S.me; const missed=!out && (c.status==="missed"||c.status==="ringing"&&now()-c.at>RING_MS);
    const peer=callPeer(c);
    return h("div",{class:"urow callrow"},
      c.title? h("span",{class:"glyph", style:`background:${colorFor(c.channel)};width:48px;height:48px`}, c.title[0].toUpperCase()) : avatar(peer,"lg"),
      h("span",{class:"ctx"}, h("b",{class:missed?"missed":""}, callTitle(c)), h("span",{class:"cdir"}, svg(out? '<path d="M7 17L17 7M9 7h8v8"/>' : '<path d="M17 7L7 17M15 17H7V9"/>'), out? (c.status==="answered"?"Outgoing":"Outgoing · "+(c.status==="declined"?"declined":"not answered")) : missed? "Missed" : c.status==="declined"? "Declined" : "Incoming", " · ", fmtShort(c.at))),
      h("button",{class:"iconbtn callback", "aria-label":"Call again", onclick:()=>{ const ch=S.channels.find(x=>x.id===c.channel); if (ch) startCall(ch, c.kind); else callPerson(peer, c.kind); }}, svg(c.kind==="video"? IC.video : IC.phone)));
  })));
  if (S.canWrite) w.append(h("button",{class:"fab vfab", title:"Keypad", "aria-label":"Open keypad", onclick:()=>{ S.dial={on:true,q:""}; render(); }}, svg(ICF.grid)));
  return w;
}
async function callPerson(id, kind){
  const cid="dm-"+[S.me,id].sort().join("-").replace(/[^A-Za-z0-9_\-.~:@+]/g,"");
  let ch=S.channels.find(c=>c.id===cid);
  if (!ch) { ch={id:cid, name:"", kind:"dm", members:[S.me,id], createdBy:S.me, at:now()}; await guarded(store.set("channels/"+cid, {name:"", kind:"dm", members:[S.me,id], createdBy:S.me, at:now()})); }
  startCall(ch, kind);
}
async function savePhone(v){ v=v.trim(); if (v && !/^[+\d][\d\s().-]{5,}$/.test(v)) { toast("That doesn't look like a phone number."); return; } await guarded(store.update("team/"+S.me, {phone:v})); toast(v? "Phone number saved" : "Phone number removed"); }

// ---------- profile, settings, prefs, pins ----------
const ACCENTS=[["Blue","#0A6CFF"],["Purple","#7B4DFF"],["Green","#12A150"],["Pink","#E0457B"],["Orange","#F07A12"],["Teal","#0E8F9C"],["Graphite","#4A4A52"]];
function applyPrefs(){
  const r=document.documentElement; const p=S.prefs;
  if (p.theme==="light"||p.theme==="dark") r.setAttribute("data-theme", p.theme); else r.removeAttribute("data-theme");
  if (p.accent) { r.style.setProperty("--cobalt", `color-mix(in srgb, ${p.accent} 86%, var(--ink))`); r.style.setProperty("--cobalt-soft", `color-mix(in srgb, ${p.accent} 15%, var(--surface))`); r.style.setProperty("--knot", `color-mix(in srgb, ${p.accent} 86%, var(--ink))`); r.style.setProperty("--knot-soft", `color-mix(in srgb, ${p.accent} 15%, var(--surface))`); }
  else ["--cobalt","--cobalt-soft","--knot","--knot-soft"].forEach(k=>r.style.removeProperty(k));
}
function setPref(k,v){ S.prefs={...S.prefs,[k]:v}; ls.set("prefs",S.prefs); applyPrefs(); render(); }
const profBtn = () => S.me? h("button",{class:"profbtn", title:"Profile and settings", "aria-label":"Profile and settings", onclick:()=>openSettings()}, avatar(S.me)) : "";
function openSettings(){ S.view="settings"; S.openTask=null; S.newFlow=null; ls.set("view","settings"); render(); }
const toprow = (title, ...extras) => h("div",{class:"toprow"}, h("h1",{class:"h1"},title), h("span",{class:"grow"}), ...extras, profBtn());
async function loadPins(){
  if (DB) { store.sub("data/users/"+S.me, rows=>{ const d=rows.find(r=>r.id==="prefs")||{}; S.pins=d.pins||[]; setStages(d.stages); render(); }); }
  else { S.pins = ls.get("pins", ["launch"]); setStages(ls.get("stages", null)); }
}
async function togglePin(cid){
  let pins=[...S.pins];
  if (pins.includes(cid)) pins=pins.filter(x=>x!==cid); else { if (pins.length>=5) { toast("You can pin up to 5 chats."); return; } pins.unshift(cid); }
  S.pins=pins; render(); toast(pins.includes(cid)? "Chat pinned" : "Chat unpinned");
  savePrefsDoc();
}
function rowMenu(c, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }, oncontextmenu:e=>{ e.preventDefault(); scrim.remove(); }});
  const pinned=S.pins.includes(c.id);
  const m=h("div",{class:"popmenu", role:"menu", style:`left:${Math.min(x, innerWidth-220)}px;top:${Math.min(y, innerHeight-140)}px`},
    h("button",{role:"menuitem", onclick:()=>{ scrim.remove(); togglePin(c.id); }}, svg(IC.pin), pinned? "Unpin chat":"Pin chat"),
    h("button",{role:"menuitem", onclick:()=>{ scrim.remove(); S.lastRead[c.id]=now(); ls.set("lastRead",S.lastRead); render(); }}, svg(ICF.check), "Mark as read"));
  scrim.append(m); document.body.append(scrim);
}
function longPress(el, fn){ let t; el.addEventListener("pointerdown", e=>{ if (e.pointerType!=="touch") return; t=setTimeout(()=>{ el.dataset.lp="1"; fn(e.clientX, e.clientY); }, 520); }); ["pointerup","pointerleave","pointercancel","pointermove"].forEach(ev=>el.addEventListener(ev, e=>{ if (ev==="pointermove" && Math.abs(e.movementY)<4) return; clearTimeout(t); })); el.addEventListener("contextmenu", e=>{ e.preventDefault(); fn(e.clientX, e.clientY); }); el.addEventListener("click", e=>{ if (el.dataset.lp) { e.stopImmediatePropagation(); e.preventDefault(); delete el.dataset.lp; } }, true); }

function renderSettings(){
  const w=h("section",{class:"teamwrap settings","aria-label":"Settings"});
  w.append(h("div",{class:"toprow"}, h("h1",{class:"h1"},"Settings"), h("span",{class:"grow"})));
  const me=S.teamDocs[S.me]||{}; const p=S.prefs;
  const group=(label, ...rows)=>[h("div",{class:"seg-label"},label), h("div",{class:"ulist sgroup"}, rows)];
  const row=(icon, title, control, sub)=>h("div",{class:"srow"}, h("span",{class:"sic"}, svg(icon)), h("span",{class:"stx"}, h("b",{},title), sub? h("span",{},sub):""), control||"");
  const toggle=(k, def)=>{ const on = p[k]===undefined? def : !!p[k]; return h("button",{class:"switch"+(on?" on":""), role:"switch", "aria-checked":String(on), "aria-label":k, onclick:()=>setPref(k,!on)}, h("i")); };
  w.append(h("div",{class:"profcard"}, avatar(S.me,"xl"), h("div",{class:"pcx"}, h("b",{}, (me.name||(S.people[S.me]||{}).name||"You").replace(/^Example:\s*/,"")), h("span",{}, me.phone||me.about||""))));
  w.append(...group("Profile",
    S.mode==="live"? row(ICF.personplus, "Name", h("input",{class:"sinp", id:"s-name", maxlength:"40", value:me.name||"", onchange:e=>{ const v=e.target.value.trim(); if (v) guarded(store.update("team/"+S.me,{name:v})).then(()=>toast("Saved")).catch(()=>{}); }})) : "",
    row(ICF.info, "About", h("input",{class:"sinp", id:"s-about", maxlength:"80", placeholder:"Available", value:me.about||"", onchange:e=>S.canWrite&&guarded(store.update("team/"+S.me,{about:e.target.value.trim()})).then(()=>toast("Saved")).catch(()=>{})})),
    row(IC.phone, "Phone number", h("input",{class:"sinp", id:"s-phone", type:"tel", placeholder:"Add number", value:me.phone||"", onchange:e=>S.canWrite&&savePhone(e.target.value)})),
    row(ICF.book, "Phone contacts", h("button",{class:"iconbtn", title:"Import contacts", "aria-label":"Import contacts", onclick:importContacts}, svg(IC.arrow)), S.addr.length? `${S.addr.length} · ${S.onConcept.length} on Concept` : "")));
  w.append(...group("Privacy",
    row(ICF.lock, "End-to-end encryption", h("span",{class:"sval mono", id:"fp"}, E2E.ready? "On" : "Off"))));
  fingerprint().then(f=>{ const el=$("#fp"); if (el && f) el.textContent=f; });
  w.append(...group("Appearance",
    row(ICF.moon, "Theme", h("div",{class:"segmini", role:"group", "aria-label":"Theme"}, [["system","Auto"],["light","Light"],["dark","Dark"]].map(([v,l])=>h("button",{"aria-pressed":String((p.theme||"system")===v), onclick:()=>setPref("theme",v)}, l)))),
    row(ICF.drop, "Accent color", h("div",{class:"swatches"}, ACCENTS.map(([n,c])=>h("button",{class:"sw"+((p.accent||"#0A6CFF")===c?" on":""), style:`--sw:${c}`, title:n, "aria-label":n+" accent", onclick:()=>setPref("accent", c==="#0A6CFF"? "" : c)}))))));
  w.append(...group("Chats",
    row(ICF.image, "Chat wallpaper", h("button",{class:"iconbtn", title:"Change wallpaper", "aria-label":"Change wallpaper", onclick:openWallpaper}, svg(IC.arrow)), wpMode()==="photo"? "Your photo" : wpMode()==="plain"? "Plain" : "Tools"),
    row(IC.send, "Enter key sends", toggle("enterSends", true)),
    row(IC.knot, "Swipe left to make task", h("div",{class:"segmini", role:"group", "aria-label":"Swipe left"}, [["open","Open task"],["silent","Just add"]].map(([v,l])=>h("button",{"aria-pressed":String((p.swipeTask||"open")===v), onclick:()=>setPref("swipeTask",v)}, l)))),
    row(IC.pin, "Pinned chats", h("span",{class:"sval"}, S.pins.length+"/5"))));
  w.append(...group("Calls & notifications",
    row(ICF.bell, "Ringtone", toggle("ring", true)),
    row(ICF.vib, "Vibrate", toggle("vibrate", true))));
  const tm=curTeam();
  w.append(...group("Team",
    row(ICF.all, tm? tm.name : "Team", h("button",{class:"iconbtn", title:"Open team", "aria-label":"Open team", onclick:()=>{ S.view="team"; ls.set("view","team"); render(); }}, svg(IC.arrow))),
    tm && tm.owner===S.me? row(ICF.gear, "Team settings", h("button",{class:"iconbtn", title:"Team settings", "aria-label":"Team settings", onclick:openTeamSettings}, svg(IC.arrow))) : "",
    row(ICF.stage, "Task stages", h("span",{class:"sval"}, STATUSES.length))));
  if (S.mode==="live") w.append(h("div",{class:"ulist sgroup", style:"margin-top:18px"}, h("button",{class:"srow signout", onclick:signOut}, h("span",{class:"stx"}, h("b",{},"Log out")))));
  return w;
}

// ---------- task list view + subtasks ----------
function taskRow(t){
  const done=t.status==="done"; const s=STATUSES.find(x=>x.id===stOf(t)); const subs=t.subtasks||[]; const sd=subs.filter(x=>x.done).length; const late=isLate(t.due,t.status);
  return h("div",{class:"trow"+(done?" done":""), role:"button", tabindex:"0", style:`--c:${s.c}`, onclick:()=>openTask(t.id), onkeydown:e=>{ if (e.key==="Enter") openTask(t.id); }},
    h("button",{class:"tcheck"+(done?" on":""), "aria-label":done?"Mark not done":"Mark done", title:done?"Mark not done":"Mark done", disabled:!S.canWrite, onclick:e=>{ e.stopPropagation(); moveTask(t.id, done?"todo":"done"); }}, done? svg(ICF.check) : ""),
    h("div",{class:"tmain"}, h("div",{class:"ttl"}, t.title),
      h("div",{class:"tmeta"}, h("span",{class:"tid"},"CN-"+t.num), subs.length? h("span",{class:"subchip"}, svg(ICF.list), sd+"/"+subs.length):"", t.priority==="high"? h("span",{class:"flag", title:"High priority"}, svg(ICF.flag)):"", t.due? h("span",{class:"due"+(late?" late":"")}, svg(ICF.cal), fmtDue(t.due)):"", t.thread? h("span",{class:"cchat", title:"Has a conversation"}, svg(IC.chat)):"")),
    h("button",{class:"stpill", style:`--c:${s.c}`, title:"Change stage", "aria-label":"Stage: "+s.name, disabled:!S.canWrite, onclick:e=>{ e.stopPropagation(); stagePicker(t, e.clientX, e.clientY); }}, s.name),
    t.assignee? avatar(t.assignee,"sm") : h("span",{class:"noav", title:"Unassigned"}, svg(ICF.none)));
}
function renderTaskList(tasks){
  const lst=h("div",{class:"tlist", id:"board"});
  if (!tasks.length) lst.append(h("p",{class:"note center"},"No tasks here yet."));
  STATUSES.forEach(s=>{ const l=tasks.filter(t=>stOf(t)===s.id); if (!l.length) return;
    lst.append(h("div",{class:"tlgroup", style:`--c:${s.c}`}, h("div",{class:"tlhead"}, h("span",{class:"colpill"}, s.name, h("i",{}, l.length))), h("div",{class:"tlrows"}, l.map(taskRow)))); });
  return lst;
}
function renderSubtasks(d, t, isNew, ro){
  d.subtasks=d.subtasks||[];
  const setSubs=arr=>{ d.subtasks=arr; if (!isNew && t) store.update("tasks/"+t.id,{subtasks:arr}).catch(()=>{}); render(); };
  const n=d.subtasks.length, dn=d.subtasks.filter(x=>x.done).length;
  const box=h("div",{class:"subs"});
  box.append(h("div",{class:"subhead"}, svg(ICF.list), h("b",{},"Subtasks"), n? h("span",{class:"subcount"}, dn+"/"+n):"", h("span",{class:"grow"}), n? h("span",{class:"subbar"}, h("i",{style:`width:${Math.round(dn/n*100)}%`})):""));
  d.subtasks.forEach(x=>box.append(h("div",{class:"subrow"+(x.done?" done":"")},
    h("button",{class:"subchk", "aria-label":x.done?"Mark not done":"Mark done", disabled:ro, onclick:()=>setSubs(d.subtasks.map(y=>y.id===x.id?{...y,done:!y.done}:y))}, x.done? svg(ICF.check):""),
    h("input",{class:"subtx", id:"st-"+x.id, value:x.text, disabled:ro, "aria-label":"Subtask", onchange:e=>{ const v=e.target.value.trim(); setSubs(v? d.subtasks.map(y=>y.id===x.id?{...y,text:v}:y) : d.subtasks.filter(y=>y.id!==x.id)); }, onkeydown:e=>{ if (e.key==="Enter") e.target.blur(); }}),
    ro? "" : h("button",{class:"subdel","aria-label":"Remove subtask", title:"Remove", onclick:()=>setSubs(d.subtasks.filter(y=>y.id!==x.id))}, svg(IC.x)))));
  if (!ro) box.append(h("div",{class:"subrow add"}, h("span",{class:"subchk ghostchk"}, svg(IC.plus)), h("input",{class:"subtx", id:"st-new", placeholder:"Add a subtask", "aria-label":"New subtask", onkeydown:e=>{ if (e.key==="Enter"){ const v=e.target.value.trim(); if (!v) return; e.target.value=""; setSubs([...d.subtasks, {id:uidShort().slice(0,6), text:v, done:false}]); } }})));
  return box;
}

// ---------- video status ----------
const VIDEO_MAX_S=300, UPLOAD_MAX=19.5*1024*1024;
function videoMeta(file){ return new Promise(res=>{ const v=document.createElement("video"); v.preload="metadata"; v.onloadedmetadata=()=>{ res(v.duration); URL.revokeObjectURL(v.src); }; v.onerror=()=>res(0); v.src=URL.createObjectURL(file); }); }
async function compressVideo(file, onp){
  const v=document.createElement("video"); v.playsInline=true; v.preload="auto"; v.src=URL.createObjectURL(file);
  await new Promise((res,rej)=>{ v.onloadedmetadata=res; v.onerror=rej; });
  const cap=v.captureStream||v.mozCaptureStream; if (!cap || !window.MediaRecorder) throw {code:"no_compress"};
  let stream; try { const ac=new (window.AudioContext||window.webkitAudioContext)(); const src=ac.createMediaElementSource(v); const dest=ac.createMediaStreamDestination(); src.connect(dest); const vs=cap.call(v); stream=new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]); } catch { v.muted=true; stream=cap.call(v); }
  const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>{ try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
  if (!mime) throw {code:"no_compress"};
  const bps=Math.floor(18*1024*1024*8/Math.max(1,v.duration))-64000;
  const mr=new MediaRecorder(stream,{mimeType:mime, videoBitsPerSecond:Math.max(180000,Math.min(2000000,bps)), audioBitsPerSecond:64000});
  const chunks=[]; mr.ondataavailable=e=>{ if (e.data.size) chunks.push(e.data); };
  const done=new Promise(r=>{ mr.onstop=r; });
  v.ontimeupdate=()=>onp(v.duration? v.currentTime/v.duration : 0); v.onended=()=>{ if (mr.state!=="inactive") mr.stop(); };
  mr.start(1000); await v.play(); await done; URL.revokeObjectURL(v.src);
  return new Blob(chunks,{type:"video/webm"});
}

// ---------- phone keypad ----------
const KEYS=[["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]];
const digits = s => String(s||"").replace(/[^\d+*#]/g,"");
function contactByNumber(n){ const d=digits(n).replace(/^\+?1?/,"").slice(-10); if (d.length<6) return null; return S.team.find(id=>{ const p=digits((S.teamDocs[id]||{}).phone).slice(-10); return p && p===d; })||null; }
function logPhoneCall(number){ const id="c"+now().toString(36)+uidShort().slice(0,4); const who=contactByNumber(number); store.set("calls/"+id, {from:S.me, members:[S.me], kind:"phone", number, peer:who||"", at:now(), status:"dialed"}).catch(()=>{}); }
function openCallPicker(mode="keypad"){
  let tab=mode, num="";
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const draw=()=>{
    const who=contactByNumber(num);
    const body = tab==="keypad"? h("div",{class:"keypad"},
      h("div",{class:"kpdisplay"}, h("input",{id:"kp-num", type:"tel", inputmode:"tel", value:num, placeholder:"Enter number", "aria-label":"Phone number", oninput:e=>{ num=e.target.value; const c=$("#kp-who"); if (c) c.textContent=(contactByNumber(num)? nameOf(contactByNumber(num)).replace(/^Example:\s*/,"") : ""); }}), h("span",{class:"kpwho", id:"kp-who"}, who? nameOf(who).replace(/^Example:\s*/,""):"")),
      h("div",{class:"kpgrid"}, KEYS.map(([k,l])=>h("button",{class:"kpkey", "aria-label":k, onclick:()=>{ num+=k; draw(); }}, h("b",{},k), h("span",{}, l||" ")))),
      h("div",{class:"kpbar"}, h("span"), h("a",{class:"round go kpcall"+(digits(num).length<3?" off":""), href: digits(num).length>=3? "tel:"+digits(num) : null, "aria-label":"Call", title:"Call", onclick:e=>{ if (digits(num).length<3) { e.preventDefault(); toast("Enter a number first."); return; } logPhoneCall(num); setTimeout(()=>scrim.remove(),200); }}, svg(IC.phone)),
        h("button",{class:"iconbtn kpdel", "aria-label":"Delete digit", title:"Delete", onclick:()=>{ num=num.slice(0,-1); draw(); }}, svg('<path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>'))))
    : h("div",{class:"picklist tall"}, S.team.filter(id=>id!==S.me).map(id=>{ const ph=(S.teamDocs[id]||{}).phone; return h("div",{class:"pick"}, avatar(id), h("span",{class:"ctx", style:"flex:1"}, h("b",{}, fullName(id).replace(/^Example:\s*/,"")), h("span",{}, ph||"No phone number")),
      h("button",{class:"ib","aria-label":"Voice call in Concept", title:"Concept voice call", onclick:()=>{ scrim.remove(); callPerson(id,"voice"); }}, svg(IC.phone)),
      h("button",{class:"ib","aria-label":"Video call in Concept", title:"Concept video call", onclick:()=>{ scrim.remove(); callPerson(id,"video"); }}, svg(IC.video)),
      ph? h("a",{class:"ib cell","aria-label":"Call phone", title:"Call "+ph, href:"tel:"+digits(ph), onclick:()=>{ logPhoneCall(ph); setTimeout(()=>scrim.remove(),200); }}, svg(ICF.cell)) : ""); }));
    scrim.replaceChildren(h("div",{class:"modal callsheet", role:"dialog", "aria-label":"New call"},
      h("div",{class:"sheethead"}, h("div",{class:"segmini wide", role:"tablist"}, h("button",{"aria-pressed":String(tab==="keypad"), onclick:()=>{ tab="keypad"; draw(); }}, svg(ICF.grid), "Keypad"), h("button",{"aria-pressed":String(tab==="contacts"), onclick:()=>{ tab="contacts"; draw(); }}, svg(ICF.all), "Contacts")), h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:()=>scrim.remove()}, svg(IC.x))),
      body));
    const k=$("#kp-num"); if (k && tab==="keypad") { k.focus(); k.setSelectionRange(num.length,num.length); }
  };
  draw(); document.body.append(scrim);
}

// ---------- stages ----------
const STAGE_COLORS=["#8E8E93","#0A6CFF","#F4A100","#1FA855","#7B4DFF","#E0457B","#0E8F9C","#F07A12","#E5383B"];
const stOf = t => STATUSES.some(s=>s.id===t.status)? t.status : STATUSES[0].id;
function setStages(arr){
  if (!Array.isArray(arr) || !arr.length) arr=DEFAULT_STAGES;
  let a=arr.filter(s=>s&&s.id&&s.name).map(s=>({id:s.id, name:String(s.name).slice(0,24), c:s.c||STAGE_COLORS[0]}));
  if (!a.find(s=>s.id==="todo")) a.unshift({...DEFAULT_STAGES[0]}); if (!a.find(s=>s.id==="done")) a.push({...DEFAULT_STAGES[3]});
  a=[a.find(s=>s.id==="todo"), ...a.filter(s=>s.id!=="todo"&&s.id!=="done"), a.find(s=>s.id==="done")];
  STATUSES.splice(0, STATUSES.length, ...a);
}
async function savePrefsDoc(){
  const doc={pins:S.pins, stages:STATUSES.map(s=>({id:s.id,name:s.name,c:s.c}))};
  if (DB) { try { await store.set("data/users/"+S.me+"/prefs", doc); } catch { toast("Couldn't save. Check your connection."); } }
  else { ls.set("pins", S.pins); ls.set("stages", doc.stages); }
}
function addStage(name){ name=name.trim(); if (!name) return; const used=STATUSES.map(s=>s.c); const c=STAGE_COLORS.find(x=>!used.includes(x))||STAGE_COLORS[STATUSES.length%STAGE_COLORS.length]; STATUSES.splice(STATUSES.length-1,0,{id:"s"+uidShort().slice(0,6), name:name.slice(0,24), c}); S.addingStage=false; savePrefsDoc(); render(); }
function stageMenu(s, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const i=STATUSES.findIndex(z=>z.id===s.id); const locked=s.id==="todo"||s.id==="done";
  const done=()=>{ scrim.remove(); savePrefsDoc(); render(); };
  const m=h("div",{class:"popmenu stagemenu", style:`left:${Math.max(8,Math.min(x-120, innerWidth-248))}px;top:${Math.min(y+8, innerHeight-230)}px`},
    h("input",{class:"sinp full", id:"stg-name", value:s.name, maxlength:"24", "aria-label":"Stage name", onkeydown:e=>{ if (e.key==="Enter"){ const v=e.target.value.trim(); if (v) s.name=v; done(); } }, onchange:e=>{ const v=e.target.value.trim(); if (v) s.name=v; }}),
    h("div",{class:"swatches left"}, STAGE_COLORS.map(c=>h("button",{class:"sw"+(s.c===c?" on":""), style:`--sw:${c}`, "aria-label":"Color", onclick:()=>{ s.c=c; done(); }}))),
    h("div",{class:"menuicons"},
      !locked && i>1? h("button",{class:"iconbtn", title:"Move left", "aria-label":"Move left", onclick:()=>{ STATUSES.splice(i,1); STATUSES.splice(i-1,0,s); done(); }}, svg(IC.back)) : h("span"),
      !locked && i<STATUSES.length-2? h("button",{class:"iconbtn", title:"Move right", "aria-label":"Move right", onclick:()=>{ STATUSES.splice(i,1); STATUSES.splice(i+1,0,s); done(); }}, svg(IC.arrow)) : h("span"),
      h("span",{class:"grow"}),
      !locked? h("button",{class:"iconbtn dangerbtn", title:"Delete stage", "aria-label":"Delete stage", onclick:()=>{ for (const t of S.tasks.filter(t=>t.status===s.id && canSeeTask(t))) store.update("tasks/"+t.id,{status:"todo"}).catch(()=>{}); STATUSES.splice(i,1); done(); }}, svg(IC.trash)) : "",
      h("button",{class:"iconbtn", title:"Done", "aria-label":"Done", onclick:()=>{ const v=$("#stg-name").value.trim(); if (v) s.name=v; done(); }}, svg(ICF.check))));
  scrim.append(m); document.body.append(scrim); setTimeout(()=>{ const n=$("#stg-name"); if (n) n.select(); });
}
function stagePicker(t, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  scrim.append(h("div",{class:"popmenu", style:`left:${Math.min(x-100, innerWidth-208)}px;top:${Math.min(y+6, innerHeight-STATUSES.length*42-20)}px`},
    STATUSES.map(s=>h("button",{onclick:()=>{ scrim.remove(); moveTask(t.id, s.id); }}, h("span",{class:"sdot2", style:`--c:${s.c}`}), s.name, stOf(t)===s.id? h("span",{class:"grow"}):"", stOf(t)===s.id? svg(ICF.check):""))));
  document.body.append(scrim);
}

// ---------- contacts ----------
const mutual = id => S.contacts.includes(id) && (S.allContacts[id]||[]).includes(S.me);
async function setContact(id, on){
  const ids = on? [...new Set([...S.contacts, id])] : S.contacts.filter(x=>x!==id);
  S.contacts=ids; S.allContacts[S.me]=ids; render();
  try { await guarded(store.set("contacts/"+S.me, {ids})); toast(on? "Contact saved" : "Contact removed"); } catch {}
}
const peopleForTasks = () => { const t=curTeam(); return [...new Set([S.me, ...(t? t.members||[] : []), ...S.contacts])].filter(Boolean); };

// ---------- messages → tasks ----------
const msgText = m => m.kind==="voice" ? "🎤 Voice note ("+fmtDur(m.voice&&m.voice.dur)+")" : shown(m);
async function quickTask(msgs, opts={}){
  msgs=(msgs||[]).filter(m=>m && !m.deleted); if (!msgs.length || !S.canWrite) return;
  const cid=S.active; const first=msgText(msgs[0]).split("\n")[0].trim();
  const title = (first || (msgs.length+" messages")).slice(0,90);
  const notes = msgs.length>1? msgs.map(m=>nameOf(m.by).replace(/^Example:\s*/,"")+": "+msgText(m)).join("\n") : (msgText(msgs[0]).length>first.length? msgText(msgs[0]) : "");
  const id="t"+now().toString(36)+uidShort().slice(0,3);
  try {
    const num=await guarded(nextNum());
    await guarded(store.set("tasks/"+id, {title, notes, status:STATUSES[0].id, assignee:"", due:"", priority:"normal", channel:cid, fromMsg:msgs[0].id, fromMsgs:msgs.map(m=>m.id), fromText:msgs.map(msgText).join("\n"), fromBy:msgs[0].by, team:(curTeam()||{}).id||"", num, createdBy:S.me, at:now(), subtasks:[], log:[{at:now(), by:S.me, what:"created from "+(msgs.length>1? msgs.length+" messages":"a message")}]}));
    for (const m of msgs) store.update(`channels/${cid}/messages/${m.id}`, {taskId:id}).catch(()=>{});
    S.justTied=msgs[0].id; S.actFor=null; S.selecting=false; S.sel=[]; render(true);
    if (opts.open) openTask(id); else if (!opts.silent) toast("Added to "+STATUSES[0].name, {label:"Open", fn:()=>openTask(id)});
    return id;
  } catch {}
}
function toggleSel(id){ S.sel = S.sel.includes(id)? S.sel.filter(x=>x!==id) : [...S.sel, id]; if (!S.sel.length) S.selecting=false; render(true); }

// ---------- end-to-end encryption (keys never leave this device) ----------
const E2E={ready:false, dev:null, priv:null, pub:null, sk:new Map()};
const b64e = buf => { let s=""; const u=new Uint8Array(buf); for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
const b64d = s => { const b=atob(s); const u=new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; };
const TE=new TextEncoder(), TD=new TextDecoder();
const DEC=new Map();
async function initE2E(){
  if (!window.crypto || !crypto.subtle) return;
  try {
    let rec=ls.get("e2e:"+S.me,null);
    if (!rec || !rec.priv) { const kp=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]); rec={dev:"d"+uidShort().slice(0,6), priv:await crypto.subtle.exportKey("jwk",kp.privateKey), pub:await crypto.subtle.exportKey("jwk",kp.publicKey)}; ls.set("e2e:"+S.me,rec); }
    E2E.dev=rec.dev; E2E.pub={kty:"EC", crv:"P-256", x:rec.pub.x, y:rec.pub.y};
    E2E.priv=await crypto.subtle.importKey("jwk",rec.priv,{name:"ECDH",namedCurve:"P-256"},false,["deriveKey"]);
    E2E.ready=true;
    const cur=await store.get("keys/"+S.me).catch(()=>null); const devices={...((cur&&cur.devices)||{})};
    if (!devices[E2E.dev] || devices[E2E.dev].x!==E2E.pub.x) { devices[E2E.dev]={...E2E.pub, at:now()}; const ent=Object.entries(devices).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,5); await store.set("keys/"+S.me,{devices:Object.fromEntries(ent)}).catch(()=>{}); }
    S.keys[S.me]={...(S.keys[S.me]||{}), [E2E.dev]:E2E.pub};
  } catch { E2E.ready=false; }
}
async function sharedKey(j){
  const k=j.x+"."+j.y; if (E2E.sk.has(k)) return E2E.sk.get(k);
  const p=(async()=>{ const pub=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:j.x,y:j.y},{name:"ECDH",namedCurve:"P-256"},false,[]); return crypto.subtle.deriveKey({name:"ECDH",public:pub},E2E.priv,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]); })();
  E2E.sk.set(k,p); return p;
}
async function seal(text, members){
  const mk=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
  const raw=await crypto.subtle.exportKey("raw",mk); const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},mk,TE.encode(text));
  const targets=[]; for (const u of new Set(members)) for (const [d,j] of Object.entries(S.keys[u]||{})) targets.push([u,d,j]);
  if (!targets.some(t=>t[0]===S.me && t[1]===E2E.dev)) targets.push([S.me,E2E.dev,E2E.pub]);
  const keys=[]; for (const [u,d,j] of targets) { try { const sk=await sharedKey(j); const wiv=crypto.getRandomValues(new Uint8Array(12)); keys.push({u,d,iv:b64e(wiv),k:b64e(await crypto.subtle.encrypt({name:"AES-GCM",iv:wiv},sk,raw))}); } catch {} }
  const env={v:1, pk:E2E.pub, iv:b64e(iv), ct:b64e(ct), keys};
  DEC.set(env.iv, text);
  return {env, mk};
}
async function openKey(env){
  const e=(env.keys||[]).find(k=>k.u===S.me && k.d===E2E.dev); if (!e || !E2E.ready) throw new Error("nokey");
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(e.iv)}, await sharedKey(env.pk), b64d(e.k));
  return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function unseal(env){ const mk=await openKey(env); return TD.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(env.iv)}, mk, b64d(env.ct))); }
async function decryptMany(envs){
  let changed=false;
  for (const env of envs) { if (!env || !env.iv || DEC.has(env.iv)) continue; try { DEC.set(env.iv, await unseal(env)); } catch { DEC.set(env.iv, false); } changed=true; }
  return changed;
}
function plain(m){ if (!m) return ""; if (!m.enc) return m.text||""; const v=DEC.get(m.enc.iv); return v===undefined? null : v; }
const LOCKED="🔒 Encrypted on another device";
function shown(m){ const v=plain(m); return v===null? "🔒 …" : v===false? LOCKED : v; }
async function fingerprint(){ if (!E2E.pub) return ""; const h=new Uint8Array(await crypto.subtle.digest("SHA-256", TE.encode(E2E.pub.x+E2E.pub.y))); return Array.from(h.slice(0,8)).map(b=>String(b%100).padStart(2,"0")).join("").replace(/(\d{4})/g,"$1 ").trim(); }

// ---------- phone numbers & phone contacts ----------
const COUNTRIES=[["+1","US/CA"],["+44","UK"],["+972","IL"],["+49","DE"],["+33","FR"],["+39","IT"],["+34","ES"],["+61","AU"],["+91","IN"],["+55","BR"],["+52","MX"],["+7","RU"],["+27","ZA"],["+971","AE"],["+32","BE"],["+31","NL"],["+41","CH"],["+43","AT"],["+46","SE"],["+48","PL"],["+380","UA"],["+81","JP"],["+82","KR"],["+86","CN"]];
const normPhone = p => { let d=String(p||"").replace(/[^\d+]/g,""); if (d.startsWith("00")) d="+"+d.slice(2); return d; };
const phoneKey = p => normPhone(p).replace(/\D/g,"").slice(-9);
function loadAddr(){ S.addr = ls.get("addr:"+S.me, []); matchAddr(); }
function matchAddr(){
  const byKey={}; for (const id of S.team) { const ph=(S.teamDocs[id]||{}).phone; if (ph && phoneKey(ph).length>=7) byKey[phoneKey(ph)]=id; }
  const names={}, matched=new Set();
  for (const c of S.addr||[]) for (const p of c.p||[]) { const id=byKey[phoneKey(p)]; if (id && id!==S.me) { names[id]=c.n; matched.add(id); c.on=id; } }
  S.addrNames=names; S.onConcept=[...matched];
  const missing=S.onConcept.filter(id=>!S.contacts.includes(id));
  if (missing.length && S.canWrite && S.mode==="live") { S.contacts=[...new Set([...S.contacts, ...missing])]; store.set("contacts/"+S.me,{ids:S.contacts}).catch(()=>{}); }
}
function parseVCF(text){
  const out=[]; const lines=text.replace(/\r/g,"").replace(/\n[ \t]/g,"").split("\n"); let cur=null;
  for (const l of lines) {
    if (/^BEGIN:VCARD/i.test(l)) cur={n:"",p:[]};
    else if (/^END:VCARD/i.test(l)) { if (cur && cur.p.length) out.push({n:cur.n||cur.p[0], p:cur.p}); cur=null; }
    else if (cur) { const i=l.indexOf(":"); if (i<0) continue; const k=l.slice(0,i).toUpperCase(), v=l.slice(i+1).trim();
      if (k.startsWith("FN")) cur.n=v; else if (k.startsWith("N") && !k.startsWith("NOTE") && !k.startsWith("NICK") && !cur.n) cur.n=v.split(";").filter(Boolean).reverse().join(" ");
      else if (k.includes("TEL")) { const p=normPhone(v.replace(/^tel:/i,"")); if (p.replace(/\D/g,"").length>=6) cur.p.push(p); } }
  }
  return out;
}
function saveAddr(list){
  const seen=new Set(); const clean=[]; for (const c of list) { const ps=[...new Set((c.p||[]).map(normPhone))].filter(p=>p.replace(/\D/g,"").length>=6); const key=ps.map(phoneKey).join(","); if (!ps.length || seen.has(key)) continue; seen.add(key); clean.push({n:String(c.n||ps[0]).slice(0,60), p:ps}); }
  const merged=[...(S.addr||[])]; for (const c of clean) if (!merged.some(m=>m.p.some(p=>c.p.map(phoneKey).includes(phoneKey(p))))) merged.push(c);
  S.addr=merged.sort((a,b)=>a.n.localeCompare(b.n)); ls.set("addr:"+S.me, S.addr); matchAddr(); render();
  toast(`${clean.length} contacts · ${S.onConcept.length} on Concept`);
}
async function importContacts(){
  if (navigator.contacts && navigator.contacts.select) {
    try { const r=await navigator.contacts.select(["name","tel"],{multiple:true}); if (r && r.length) { saveAddr(r.map(c=>({n:(c.name||[])[0]||"", p:c.tel||[]}))); return; } } catch {}
  }
  const inp=h("input",{type:"file", accept:".vcf,text/vcard,text/x-vcard", hidden:true, onchange:async e=>{ const f=e.target.files&&e.target.files[0]; inp.remove(); if (!f) return; try { saveAddr(parseVCF(await f.text())); } catch { toast("That file couldn't be read."); } }});
  document.body.append(inp); inp.click();
}
function openPhoneSetup(){
  if (document.getElementById("onboard")) return;
  let cc=ls.get("cc","+1"), num="", step="phone";
  const o=overlay("onboard","Sign up"); o.id="onboard";
  const draw=()=>{
    if (step==="phone") o.replaceChildren(h("div",{class:"ob"},
      h("div",{class:"oblogo"}, svg('<path d="M4 6.5h16v9.5H11l-5 4v-4H4z"/><path d="M8.5 11l2.2 2.2L15.5 8.6"/>')),
      h("h2",{},"Your phone number"),
      h("div",{class:"obrow"}, h("select",{class:"obcc", "aria-label":"Country code", onchange:e=>{ cc=e.target.value; ls.set("cc",cc); }}, COUNTRIES.map(([c,n])=>h("option",{value:c, selected:c===cc}, n+" "+c))),
        h("input",{class:"obnum", id:"ob-num", type:"tel", inputmode:"tel", autocomplete:"tel-national", placeholder:"Phone number", value:num, oninput:e=>num=e.target.value, onkeydown:e=>{ if (e.key==="Enter") next(); }})),
      h("div",{class:"obacts"}, h("button",{class:"oblink", onclick:()=>{ ls.set("skipPhone",1); o.remove(); }}, "Later"), h("button",{class:"fab obgo", "aria-label":"Next", onclick:next}, svg(IC.arrow)))));
    else o.replaceChildren(h("div",{class:"ob"},
      h("div",{class:"oblogo"}, svg(ICF.all)), h("h2",{},"Find your contacts"),
      h("div",{class:"obacts"}, h("button",{class:"oblink", onclick:()=>o.remove()}, "Skip"), h("button",{class:"fab obgo", "aria-label":"Import contacts", onclick:()=>{ o.remove(); importContacts(); }}, svg(ICF.personplus)))));
    const n=$("#ob-num"); if (n) n.focus();
  };
  async function next(){ const d=num.replace(/[^\d]/g,"").replace(/^0+/,""); if (d.length<6) { toast("Enter your phone number."); return; } const full=cc+" "+d; try { await guarded(store.update("team/"+S.me,{phone:full})); } catch { return; } step="contacts"; draw(); }
  draw();
}
function inviteRow(c){
  const ph=c.p[0];
  return h("div",{class:"contact"}, h("span",{class:"glyph", style:`background:${colorFor(c.n)};width:44px;height:44px;font-size:16px`}, (c.n||"?").trim()[0].toUpperCase()),
    h("span",{class:"ctx"}, h("b",{}, c.n), h("span",{}, ph)),
    h("a",{class:"invbtn", href:"sms:"+normPhone(ph)+"?&body="+encodeURIComponent("Join me on Concept"), title:"Invite", "aria-label":"Invite "+c.n}, "Invite"));
}

// ---------- inline dial pad ----------
function dialMatches(q){
  const t=q.trim().toLowerCase(), dg=digits(q).replace(/\D/g,""); if (!t) return [];
  const out=[];
  for (const id of S.team) { if (id===S.me) continue; const ph=(S.teamDocs[id]||{}).phone||""; const nm=nameOf(id).replace(/^Example:\s*/,"");
    if (nm.toLowerCase().includes(t) || (dg.length>=2 && ph.replace(/\D/g,"").includes(dg))) out.push({id, n:nm, ph}); }
  for (const c of S.addr||[]) { if (c.on) continue; const ph=c.p[0]; if (c.n.toLowerCase().includes(t) || (dg.length>=2 && c.p.some(p=>p.replace(/\D/g,"").includes(dg)))) out.push({n:c.n, ph}); }
  return out.slice(0,6);
}
function dialRow(m){
  return h("div",{class:"drow"}, m.id? avatar(m.id) : h("span",{class:"glyph", style:`background:${colorFor(m.n)};width:32px;height:32px;font-size:13px`}, (m.n||"?")[0].toUpperCase()),
    h("span",{class:"ctx"}, h("b",{}, m.n), h("span",{}, m.ph||"")),
    m.id && S.canWrite? h("button",{class:"ib", title:"Concept voice call", "aria-label":"Voice call "+m.n, onclick:()=>callPerson(m.id,"voice")}, svg(IC.phone)) : "",
    m.id && S.canWrite? h("button",{class:"ib", title:"Concept video call", "aria-label":"Video call "+m.n, onclick:()=>callPerson(m.id,"video")}, svg(IC.video)) : "",
    m.ph? h("a",{class:"ib cell", title:"Call "+m.ph, "aria-label":"Call phone "+m.n, href:"tel:"+digits(m.ph), onclick:()=>logPhoneCall(m.ph)}, svg(ICF.cell)) : "");
}
function refreshDial(){
  const q=S.dial.q; const box=$("#dialres"); if (box) box.replaceChildren(...dialMatches(q).map(dialRow));
  const ok=digits(q).replace(/\D/g,"").length>=3 && !/[a-z]/i.test(q);
  const go=$("#dialgo"); if (go) { go.classList.toggle("off", !ok); if (ok) go.setAttribute("href","tel:"+digits(q)); else go.removeAttribute("href"); }
  const del=$("#dialdel"); if (del) del.style.visibility = q? "visible" : "hidden";
}
function renderDial(w){
  const inp=h("input",{id:"dial-q", type:"search", inputmode:"search", autocomplete:"off", placeholder:"Search name or number", value:S.dial.q, "aria-label":"Search contacts or enter a number", oninput:e=>{ S.dial.q=e.target.value; refreshDial(); }});
  w.append(h("label",{class:"search dialsearch"}, svg(IC.search), inp, h("button",{class:"iconbtn sm", id:"dialdel", "aria-label":"Delete", title:"Delete", style:`visibility:${S.dial.q?"visible":"hidden"}`, onclick:e=>{ e.preventDefault(); S.dial.q=S.dial.q.slice(0,-1); inp.value=S.dial.q; refreshDial(); }}, svg('<path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>'))));
  w.append(h("div",{class:"dialres", id:"dialres"}));
  w.append(h("div",{class:"dialpad"},
    h("div",{class:"kpgrid"}, KEYS.map(([k,l])=>h("button",{class:"kpkey", "aria-label":k, onclick:()=>{ S.dial.q+=k; inp.value=S.dial.q; refreshDial(); }}, h("b",{},k), h("span",{}, l||" ")))),
    h("div",{class:"kpbar"}, h("span"), h("a",{class:"round go kpcall", id:"dialgo", "aria-label":"Call", title:"Call", onclick:e=>{ const d=digits(S.dial.q); if (d.replace(/\D/g,"").length<3 || /[a-z]/i.test(S.dial.q)) { e.preventDefault(); return; } logPhoneCall(S.dial.q); }}, svg(IC.phone)), h("span"))));
  setTimeout(refreshDial);
}

// ---------- message gestures ----------
const MORE_EMOJI=["👍","❤️","😂","😮","😢","🙏","🔥","✅","👏","🎉","💯","🤝","😍","🤔","👀","😅","🙌","💪","😎","🥳","😡","👌","⭐","🚀"];
function quickEmojis(){ const use=ls.get("emojiUse",{}); const top=Object.entries(use).sort((a,b)=>b[1]-a[1]).map(x=>x[0]); return [...new Set([...top, ...EMOJI])].slice(0,6); }
function holdMenu(m){ if (m.deleted || S.selecting || !S.canWrite) return; S.actFor=m.id; S.emojiMore=false; if (navigator.vibrate) try{ navigator.vibrate(8); }catch{} render(true); }
function swipeTask(m){
  const mode=S.prefs.swipeTask||"open";
  const existing=m.taskId && S.tasks.find(t=>t.id===m.taskId && canSeeTask(t));
  if (existing) { openTask(existing.id); return; }
  quickTask([m], {silent:mode==="silent", open:mode!=="silent"});
}
function attachGestures(el, strip, m){
  if (m.deleted) return;
  let x0=0,y0=0,dx=0,active=false,decided=false,horiz=false,lp=null,pid=null;
  strip.style.touchAction="pan-y";
  strip.addEventListener("pointerdown", e=>{ if (S.selecting || e.button>0 || e.target.closest("button,a,.vbars,input")) return; x0=e.clientX; y0=e.clientY; dx=0; active=true; decided=false; horiz=false; pid=e.pointerId; lp=setTimeout(()=>{ if (active && !decided){ active=false; holdMenu(m); } }, 430); });
  strip.addEventListener("pointermove", e=>{ if (!active || e.pointerId!==pid) return; const mx=e.clientX-x0, my=e.clientY-y0;
    if (!decided && (Math.abs(mx)>8 || Math.abs(my)>8)) { decided=true; clearTimeout(lp); horiz=Math.abs(mx)>Math.abs(my)*1.2; if (horiz) { try { strip.setPointerCapture(pid); } catch {} } else { active=false; return; } }
    if (horiz) { dx=Math.max(-96,Math.min(96,mx)); el.style.setProperty("--sx", dx+"px"); el.classList.add("swiping"); el.classList.toggle("swr", dx>56); el.classList.toggle("swl", dx<-56); } });
  const reset=()=>{ el.classList.remove("swiping","swr","swl"); el.style.setProperty("--sx","0px"); };
  strip.addEventListener("pointerup", ()=>{ clearTimeout(lp); if (!active) return; active=false; if (!horiz) return; reset();
    if (dx>56) { S.replyTo=m.id; S.actFor=null; render(true); setTimeout(()=>{ const c=$("#composer"); if (c) c.focus(); }); }
    else if (dx<-56) swipeTask(m); });
  strip.addEventListener("pointercancel", ()=>{ clearTimeout(lp); active=false; reset(); });
  strip.addEventListener("contextmenu", e=>{ e.preventDefault(); holdMenu(m); });
}
async function copyMsg(m){ const t=plain(m); S.actFor=null; render(true); try { await navigator.clipboard.writeText(t||""); toast("Copied"); } catch { toast("Couldn't copy here"); } }

// ---------- sending (shared by send + forward) ----------
async function sendTextTo(cid, text, extra={}){
  const chn=S.channels.find(c=>c.id===cid)||{}; const members=chn.members||[S.me];
  let env=null; if (E2E.ready) { try { env=(await seal(text, members)).env; } catch { env=null; } }
  const id="m"+now().toString(36)+uidShort().slice(0,4);
  const msg = env? {by:S.me, text:"", enc:env, at:now(), ...extra} : {by:S.me, text, at:now(), ...extra};
  await guarded(store.set(`channels/${cid}/messages/${id}`, msg));
  const last = env? {enc:env, text:"", by:S.me, at:msg.at} : {text:text.slice(0,120), by:S.me, at:msg.at}; if (extra.mentions && extra.mentions.length) last.mentions=extra.mentions;
  guarded(store.update(`channels/${cid}`, {last})).catch(()=>{});
  return {id, ...msg};
}
function forwardMenu(msgs){
  msgs=(Array.isArray(msgs)? msgs : [msgs]).filter(m=>m && !m.deleted && (m.kind==="voice" || plain(m)));
  if (!msgs.length) return;
  S.actFor=null; S.selecting=false; S.sel=[]; render(true);
  const MAX=5; let sel=[], q="", searching=false;
  const use=ls.get("fwdUse",{});
  const o=overlay("fwdview","Forward to"); o.id="fwdview";
  const close=()=>{ o.remove(); };
  const key=t=>t.type+":"+t.id;
  const isSel=t=>sel.some(x=>key(x)===key(t));
  const toggle=t=>{ if (isSel(t)) sel=sel.filter(x=>key(x)!==key(t)); else { if (sel.length>=MAX) { toast("You can share with up to "+MAX+" chats"); return; } sel=[...sel,t]; } draw(); };
  const labelOf=t=> t.type==="chan"? chanTitle(S.channels.find(c=>c.id===t.id)) : nameOf(t.id).replace(/^Example:\s*/,"");
  const row=(t, glyph, title, sub)=>h("button",{class:"frow"+(isSel(t)?" on":""), onclick:()=>toggle(t)}, h("span",{class:"cav"}, glyph), h("span",{class:"ctx"}, h("b",{}, title), sub? h("span",{}, sub):""), h("span",{class:"fck"}, isSel(t)? svg(ICF.check):""));
  function draw(){
    const ql=q.trim().toLowerCase(); const match=s=>!ql || String(s).toLowerCase().includes(ql);
    const chans=S.channels.filter(c=>match(chanTitle(c)));
    const recent=[...chans].sort((a,b)=>((b.last&&b.last.at)||b.at||0)-((a.last&&a.last.at)||a.at||0));
    const freq=ql? [] : recent.filter(c=>use[c.id]).sort((a,b)=>use[b.id]-use[a.id]).slice(0,3);
    const dmPeers=new Set(S.channels.filter(c=>c.kind==="dm").map(c=>(c.members||[]).find(x=>x!==S.me)));
    const people=[...new Set([...S.contacts, ...S.onConcept])].filter(id=>id!==S.me && !dmPeers.has(id) && match(nameOf(id))).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    const sub=c=> c.kind==="dm"? ((S.teamDocs[(c.members||[]).find(x=>x!==S.me)]||{}).about||"") : c.kind==="task"? "Task conversation" : (c.members||[]).map(id=>nameOf(id).replace(/^Example:\s*/,"").split(" ")[0]).join(", ");
    const chanRow=c=>row({type:"chan",id:c.id}, chanGlyph(c), chanTitle(c), sub(c));
    o.replaceChildren(
      h("header",{class:"fhead"},
        h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:close}, svg(IC.back)),
        searching? h("input",{id:"fwd-q", class:"fsearch", placeholder:"Search…", value:q, oninput:e=>{ q=e.target.value; draw(); const n=$("#fwd-q"); n.focus(); n.setSelectionRange(n.value.length,n.value.length); }})
          : h("div",{class:"ftitle"}, h("b",{},"Forward to…"), sel.length? h("span",{}, sel.length+" selected") : ""),
        h("button",{class:"iconbtn","aria-label":searching?"Close search":"Search", title:"Search", onclick:()=>{ searching=!searching; if (!searching) q=""; draw(); if (searching) setTimeout(()=>{ const n=$("#fwd-q"); if (n) n.focus(); }); }}, svg(searching? IC.x : IC.search))),
      h("div",{class:"flist"},
        freq.length? [h("div",{class:"seg-label"},"Frequently contacted"), ...freq.map(chanRow)] : "",
        recent.length? [h("div",{class:"seg-label"},"Recent chats"), ...recent.filter(c=>!freq.includes(c)).map(chanRow)] : "",
        people.length? [h("div",{class:"seg-label"},"Contacts on Concept"), ...people.map(id=>row({type:"person",id}, avatar(id,"lg"), nameOf(id).replace(/^Example:\s*/,""), (S.teamDocs[id]||{}).about||""))] : "",
        !recent.length && !people.length? h("p",{class:"note center"},"No results") : ""),
      sel.length? h("div",{class:"fbar"}, h("span",{class:"fnames"}, sel.map(labelOf).join(", ")), h("button",{class:"fsend","aria-label":"Send", title:"Send", onclick:send}, svg(IC.send))) : "");
  }
  async function send(){
    const targets=[...sel]; close();
    const cids=[];
    for (const t of targets) { let cid=t.id; if (t.type==="person") cid=await ensureDM(t.id); if (cid) cids.push(cid); }
    for (const cid of cids) { use[cid]=(use[cid]||0)+1; for (const m of msgs) await forwardTo(cid, m); }
    ls.set("fwdUse", use);
    if (cids.length===1) selectChannel(cids[0]); else toast("Forwarded to "+cids.length+" chats");
  }
  o.addEventListener("keydown", e=>{ if (e.key==="Escape") close(); });
  draw();
}
async function ensureDM(id){
  const cid="dm-"+[S.me,id].sort().join("-").replace(/[^A-Za-z0-9_\-.~:@+]/g,"");
  if (!S.channels.find(c=>c.id===cid)) { try { await guarded(store.set("channels/"+cid, {name:"", kind:"dm", members:[S.me,id], createdBy:S.me, at:now()})); } catch { return null; } }
  return cid;
}
async function forwardTo(cid, m){
  try {
    if (m.kind==="voice" && m.voice) { const url=await voiceUrl(m.voice, m.enc); const blob=await (await fetch(url)).blob(); await sendVoice(blob, m.voice.dur||0, m.voice.peaks||[], cid, {fwd:(m.fwd||0)+1}); }
    else { const t=plain(m); if (!t) return; await sendTextTo(cid, t, {fwd:(m.fwd||0)+1}); }
  } catch { toast("Couldn't forward that message."); }
}

// ---------- mentions ----------
function updateMention(ta, c){
  const box=$("#mentionbox"); if (!box) return;
  const pos=ta.selectionStart; const before=ta.value.slice(0,pos); const mm=before.match(/(^|\s)@([^\s@]{0,20})$/);
  if (!mm || !c || c.kind==="dm") { box.hidden=true; return; }
  const q=mm[2].toLowerCase(); const opts=(c.members||[]).filter(id=>id!==S.me && nameOf(id).replace(/^Example:\s*/,"").toLowerCase().includes(q)).slice(0,6);
  if (!opts.length) { box.hidden=true; return; }
  box.hidden=false;
  box.replaceChildren(...opts.map(id=>h("button",{class:"mopt", onmousedown:e=>e.preventDefault(), onclick:()=>{ const nm=nameOf(id).replace(/^Example:\s*/,"").split(" ")[0]; const start=pos-mm[2].length-1; ta.value=ta.value.slice(0,start)+"@"+nm+" "+ta.value.slice(pos); const np=start+nm.length+2; ta.focus(); ta.setSelectionRange(np,np); S.pendingMentions=[...new Set([...(S.pendingMentions||[]), id])]; box.hidden=true; ls.set("draft:"+S.active, ta.value); ta.closest(".crow").classList.add("has-text"); }}, avatar(id,"sm"), h("span",{}, nameOf(id).replace(/^Example:\s*/,"")))));
}
function richText(t){ const parts=String(t).split(/(@[^\s@.,!?;:]{1,30})/g); return parts.map((p,i)=> i%2? h("span",{class:"mention"}, p) : p); }

// ---------- chat menu: tasks of this chat ----------
function chatMenu(c, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const ts=visibleTasks().filter(t=>t.channel===c.id).sort((a,b)=>(b.at||0)-(a.at||0));
  const pinned=S.pins.includes(c.id);
  scrim.append(h("div",{class:"popmenu chatmenu", style:`right:${Math.max(8, innerWidth-x-16)}px;top:${y+10}px`},
    h("div",{class:"pmlabel"}, svg(IC.knot), "Task conversations", h("span",{class:"pmcount"}, ts.length)),
    ts.length? h("div",{class:"pmlist"}, ts.map(t=>{ const s=STATUSES.find(z=>z.id===stOf(t)); const th=t.thread && S.channels.find(z=>z.id===t.thread);
      return h("button",{class:"pmtask", onclick:()=>{ scrim.remove(); openTaskChat(t); }}, h("span",{class:"sdot2", style:`--c:${s.c}`}), h("span",{class:"pmt"}, h("b",{}, t.title), h("span",{}, "CN-"+t.num+" · "+s.name+(th&&th.last? " · "+fmtShort(th.last.at):""))), svg(th? IC.chat : IC.plus)); }))
      : h("div",{class:"pmempty"}, "—"),
    h("div",{class:"pmsep"}),
    h("button",{onclick:()=>{ scrim.remove(); togglePin(c.id); }}, svg(IC.pin), pinned? "Unpin chat" : "Pin chat"),
    h("button",{onclick:()=>{ scrim.remove(); S.view="board"; S.filter="chan:"+c.id; ls.set("view","board"); render(); }}, svg(ICF.stage), "Show on task board"),
    h("button",{onclick:()=>{ scrim.remove(); openWallpaper(); }}, svg(ICF.image), "Wallpaper")));
  document.body.append(scrim);
}

// ---------- task attachments ----------
function taskFilesSetter(){ const id=S.openTask; return arr=>{ if (S.draftTask) S.draftTask.files=arr; if (id && id!=="new") store.update("tasks/"+id,{files:arr}).catch(()=>{}); render(); }; }
function addTaskPhotos(){
  const set=taskFilesSetter();
  const inp=h("input",{type:"file", accept:"image/*", multiple:true, hidden:true, onchange:async e=>{ const fs=[...(e.target.files||[])]; inp.remove(); if (!fs.length) return;
    const add=[]; toast("Adding…");
    for (const f of fs.slice(0,8)) { try { const small=await shrinkImage(f); if (DB) { if (!ASSETS) { toast("Photo uploads are not ready yet."); break; } const r=await ASSETS.upload(small,{type:small.type||"image/jpeg"}); add.push({id:uidShort(), kind:"image", asset:r.id}); } else add.push({id:uidShort(), kind:"image", localUrl:URL.createObjectURL(small)}); } catch { toast("A photo didn't upload."); } }
    if (add.length) { set([...(S.draftTask.files||[]), ...add]); toast(add.length===1? "Photo added" : add.length+" photos added"); } }});
  document.body.append(inp); inp.click();
}
async function storeTaskVoice(blob, dur, peaks){
  if (blob.size>3.5*1024*1024) { toast("That recording is too long."); return; }
  const set=taskFilesSetter(); const vid="v"+now().toString(36)+uidShort().slice(0,4);
  try { const b64=await blobToB64(blob); const parts=Math.ceil(b64.length/CHUNK); for (let i=0;i<parts;i++) await guarded(store.set(`voice/${vid}/parts/${i}`, {d:b64.slice(i*CHUNK,(i+1)*CHUNK)}));
    VOICE_URLS[vid]=URL.createObjectURL(blob);
    set([...((S.draftTask&&S.draftTask.files)||[]), {id:vid, kind:"voice", by:S.me, at:now(), voice:{id:vid, parts, mime:blob.type||"audio/webm", dur:Math.round(dur*10)/10, peaks}}]); toast("Voice memo added");
  } catch { toast("The voice memo didn't save."); }
}
function viewPhoto(src){ const o=overlay("photoview","Photo"); o.append(h("button",{class:"sc-ic pvclose","aria-label":"Close", onclick:()=>o.remove()}, svg(IC.x)), h("img",{src, alt:"Task photo"})); o.addEventListener("click", e=>{ if (e.target===o) o.remove(); }); }
function renderTaskFiles(d, ro){
  d.files=d.files||[]; const set=taskFilesSetter();
  const box=h("div",{class:"tfiles"});
  box.append(h("div",{class:"subhead"}, svg(ICF.clip), h("b",{},"Attachments"), d.files.length? h("span",{class:"subcount"}, d.files.length):"", h("span",{class:"grow"}),
    ro? "" : h("button",{class:"iconbtn sm accent", title:"Add photo", "aria-label":"Add photo", onclick:addTaskPhotos}, svg(ICF.image)),
    ro? "" : h("button",{class:"iconbtn sm accent", title:"Record voice memo", "aria-label":"Record voice memo", onclick:()=>startRec(storeTaskVoice)}, svg(IC.mic))));
  if (S.rec && S.recFor==="task") box.append(h("div",{class:"recbar small"}, h("button",{class:"rectrash","aria-label":"Cancel recording", onclick:()=>stopRec(true)}, svg(IC.trash)), h("span",{class:"recdot"}), h("span",{class:"rectime mono", id:"recTime"}, fmtDur(REC? (now()-REC.t0)/1000:0)), h("div",{class:"recbars", id:"recBars"}, Array.from({length:24},()=>h("i"))), h("button",{class:"micbtn sending","aria-label":"Save voice memo", onclick:()=>stopRec(false)}, svg(ICF.check))));
  const imgs=d.files.filter(f=>f.kind==="image"), voices=d.files.filter(f=>f.kind==="voice");
  if (imgs.length) box.append(h("div",{class:"tthumbs"}, imgs.map(f=>{ const src=f.localUrl||blobUrl(f.asset); return h("div",{class:"tthumb"}, h("img",{src, alt:"", onclick:()=>viewPhoto(src)}), ro? "" : h("button",{class:"tdel","aria-label":"Remove photo", onclick:()=>set(d.files.filter(x=>x.id!==f.id))}, svg(IC.x))); })));
  voices.forEach(f=>box.append(h("div",{class:"tvoice"}, renderVoice({id:"tv-"+f.id, voice:f.voice}), ro? "" : h("button",{class:"iconbtn sm","aria-label":"Remove voice memo", onclick:()=>set(d.files.filter(x=>x.id!==f.id))}, svg(IC.x)))));
  return box;
}

// ---------- chat wallpaper ----------
let WP_FADED=false;
const wpMode = () => S.prefs.wp || "tools";
function wpData(){ try { return ls.get("wpimg:"+S.me, ""); } catch { return ""; } }
async function setWallpaperPhoto(){
  const inp=h("input",{type:"file", accept:"image/*", hidden:true, onchange:async e=>{ const f=e.target.files&&e.target.files[0]; inp.remove(); if (!f) return;
    try { const url=URL.createObjectURL(f); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
      const max=1400, k=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      let q=.82, data=c.toDataURL("image/jpeg",q); while (data.length>1.6e6 && q>.4) { q-=.12; data=c.toDataURL("image/jpeg",q); }
      ls.set("wpimg:"+S.me, data); WP_FADED=false; setPref("wp","photo"); const s=$("#wpsheet"); if (s) s.remove(); openWallpaper();
    } catch { toast("That photo couldn't be used."); } }});
  document.body.append(inp); inp.click();
}
function wallpaperLayer(main){
  const mode=wpMode(); main.classList.add("wp-"+(mode==="photo" && wpData()? "photo" : mode==="photo"? "tools" : mode));
  if (mode==="photo") { const d=wpData(); if (!d) return; const l=h("div",{class:"wplayer"+(WP_FADED?"":" fade"), style:`background-image:url("${d}");--wpdim:${S.prefs.wpDim??.25}`}); WP_FADED=true; main.prepend(l); }
}
function openWallpaper(){
  const scrim=h("div",{class:"scrim", id:"wpsheet", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const d=wpData(); const m=wpMode();
  const opt=(v, label, prev)=>h("button",{class:"wpopt", "aria-pressed":String(m===v), onclick:()=>{ if (v==="photo") { if (!d) { setWallpaperPhoto(); return; } } WP_FADED=v!=="photo"; setPref("wp",v); scrim.remove(); openWallpaper(); }}, prev, label);
  scrim.append(h("div",{class:"modal wpsheet", role:"dialog", "aria-label":"Chat wallpaper"},
    h("div",{class:"sheethead"}, h("b",{class:"sheettitle"},"Chat wallpaper"), h("span",{class:"grow"}), h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:()=>scrim.remove()}, svg(IC.x))),
    h("div",{class:"wpopts"},
      opt("tools","Tools", h("span",{class:"wpv tools"})),
      opt("plain","Plain", h("span",{class:"wpv"})),
      opt("photo","Photo", d? h("span",{class:"wpv photo", style:`background-image:url("${d}")`}) : h("span",{class:"wpv"}, svg(ICF.image)))),
    m==="photo" && d? h("div",{class:"wpdimrow"}, svg(ICF.moon), h("input",{type:"range", min:"0", max:"0.7", step:"0.05", value:String(S.prefs.wpDim??.25), "aria-label":"Dim photo", oninput:e=>{ S.prefs={...S.prefs, wpDim:+e.target.value}; ls.set("prefs",S.prefs); document.querySelectorAll(".wplayer").forEach(x=>x.style.setProperty("--wpdim", e.target.value)); }})) : "",
    m==="photo"? h("button",{class:"ghost", style:"align-self:center", onclick:setWallpaperPhoto}, svg(ICF.image), "Choose another photo") : ""));
  document.body.append(scrim);
}

// ---------- Supabase connection ----------
const CFG = window.CONCEPT_CONFIG || {};
(function fixUrl(){ const u=String(CFG.supabaseUrl||"").trim(); let m=u.match(/^(https:\/\/[a-z0-9-]+\.supabase\.co)/i); if (m) { CFG.supabaseUrl=m[1]; return; } m=u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i); if (m) CFG.supabaseUrl="https://"+m[1]+".supabase.co"; })();
CFG.supabaseKey=String(CFG.supabaseKey||"").trim();
let SB = null;
const sbErr = e => ({code: (e && (e.code==="42501" || /row-level security|permission/i.test(e.message||""))) ? "denied" : "unavailable", message: e && e.message});
function makeDocStore(sb){
  const colOf = p => p.split("/").slice(0,-1).join("/");
  return {
    async set(path, data){ const {error}=await sb.from("docs").upsert({path, col:colOf(path), data, updated_at:new Date().toISOString()}); if (error) throw sbErr(error); },
    async update(path, data){ const {error}=await sb.rpc("doc_merge", {p_path:path, p_patch:data}); if (error) throw sbErr(error); },
    async del(path){ const {error}=await sb.from("docs").delete().eq("path", path); if (error) throw sbErr(error); },
    async get(path){ const {data, error}=await sb.from("docs").select("data").eq("path", path).maybeSingle(); if (error) throw sbErr(error); return data? data.data : null; },
    sub(col, cb){
      const map=new Map(); let alive=true, ready=false;
      const emit=()=>{ if (alive && ready) cb([...map.entries()].map(([p,d])=>({id:p.split("/").pop(), ...d}))); };
      const ch=sb.channel("c:"+col+":"+Math.random().toString(36).slice(2))
        .on("postgres_changes", {event:"INSERT", schema:"public", table:"docs", filter:"col=eq."+col}, pl=>{ map.set(pl.new.path, pl.new.data); emit(); })
        .on("postgres_changes", {event:"UPDATE", schema:"public", table:"docs", filter:"col=eq."+col}, pl=>{ map.set(pl.new.path, pl.new.data); emit(); })
        .on("postgres_changes", {event:"DELETE", schema:"public", table:"docs"}, pl=>{ const p=pl.old && pl.old.path; if (p && map.delete(p)) emit(); })
        .subscribe();
      (async()=>{ let from=0; for (;;) { const {data, error}=await sb.from("docs").select("path,data").eq("col", col).range(from, from+999); if (error || !data) break; data.forEach(r=>map.set(r.path, r.data)); if (data.length<1000) break; from+=1000; } ready=true; emit(); })();
      return ()=>{ alive=false; sb.removeChannel(ch); };
    }
  };
}
function makeAssets(sb){
  return { async upload(blob, opts={}){ const type=(opts.type||blob.type||"application/octet-stream").split(";")[0]; const ext=(type.split("/")[1]||"bin").replace("jpeg","jpg").replace("quicktime","mov"); const name=S.me+"/"+Date.now().toString(36)+uidShort()+"."+ext;
    const {error}=await sb.storage.from("media").upload(name, blob, {contentType:type, upsert:false}); if (error) throw sbErr(error); return {id:name, url:blobUrl(name)}; } };
}
function blobUrl(id){ if (!id) return ""; if (id.includes("/") && CFG.supabaseUrl) return CFG.supabaseUrl.replace(/\/$/,"")+"/storage/v1/object/public/media/"+id.split("/").map(encodeURIComponent).join("/"); return "/_blob/"+id; }
const fmtPhone = p => { const d=String(p||"").replace(/[^\d]/g,""); return d? "+"+d : ""; };

// ---------- sign in with phone (texted code) ----------
function openLogin(){
  if (document.getElementById("onboard")) return;
  let cc=ls.get("cc","+1"), num="", step="phone", phone="", busy=false, wait=0, timer=null, err="";
  const o=overlay("onboard","Sign in"); o.id="onboard";
  const draw=()=>{
    if (step==="phone") o.replaceChildren(h("div",{class:"ob"},
      h("div",{class:"oblogo"}, svg('<path d="M4 6.5h16v9.5H11l-5 4v-4H4z"/><path d="M8.5 11l2.2 2.2L15.5 8.6"/>')),
      h("h2",{},"Your phone number"),
      h("div",{class:"obrow"}, h("select",{class:"obcc", "aria-label":"Country code", onchange:e=>{ cc=e.target.value; ls.set("cc",cc); }}, COUNTRIES.map(([c,n])=>h("option",{value:c, selected:c===cc}, n+" "+c))),
        h("input",{class:"obnum", id:"ob-num", type:"tel", inputmode:"tel", autocomplete:"tel-national", placeholder:"Phone number", value:num, oninput:e=>num=e.target.value, onkeydown:e=>{ if (e.key==="Enter") sendCode(); }})),
      err? h("p",{class:"oberr", role:"alert"}, err) : "",
      h("div",{class:"obacts end"}, h("button",{class:"fab obgo"+(busy?" busy":""), "aria-label":"Send code", disabled:busy, onclick:sendCode}, busy? h("span",{class:"spin"}) : svg(IC.arrow)))));
    else o.replaceChildren(h("div",{class:"ob"},
      h("div",{class:"oblogo"}, svg(ICF.lock)),
      h("h2",{},"Enter the code"), h("p",{class:"obsub"}, phone),
      err? h("p",{class:"oberr", role:"alert"}, err) : "",
      h("input",{class:"obnum otp", id:"ob-code", type:"text", inputmode:"numeric", autocomplete:"one-time-code", maxlength:"6", placeholder:"••••••", oninput:e=>{ const v=e.target.value.replace(/\D/g,""); e.target.value=v; if (v.length===6) verify(v); }}),
      h("div",{class:"obacts"}, h("button",{class:"oblink", onclick:()=>{ step="phone"; draw(); }}, "Change number"), h("button",{class:"oblink", id:"ob-resend", disabled:wait>0, onclick:sendCode}, wait>0? "Resend in "+wait+"s" : "Resend code"))));
    const f=$("#ob-num")||$("#ob-code"); if (f) f.focus();
  };
  async function sendCode(){
    const d=num.replace(/[^\d]/g,"").replace(/^0+/,""); if (d.length<6) { err="Enter your phone number."; draw(); return; }
    if (cc==="+1" && d.length===11 && d.startsWith("1")) num=d.slice(1);
    phone=cc+(cc==="+1" && d.length===11 && d.startsWith("1")? d.slice(1) : d); busy=true; err=""; draw();
    let error=null;
    try { const r=await Promise.race([SB.auth.signInWithOtp({phone}), new Promise((_,rej)=>setTimeout(()=>rej(new Error("No answer from the server. Check your connection and try again.")),20000))]); error=r && r.error; }
    catch (e) { error=e; }
    busy=false;
    if (error) { err=explainAuthError(error); draw(); return; }
    step="code"; wait=30; clearInterval(timer); timer=setInterval(()=>{ wait--; const r=$("#ob-resend"); if (r){ r.disabled=wait>0; r.textContent=wait>0? "Resend in "+wait+"s" : "Resend code"; } if (wait<=0) clearInterval(timer); },1000); draw();
  }
  async function verify(token){
    let data=null, error=null;
    try { const r=await SB.auth.verifyOtp({phone, token, type:"sms"}); data=r.data; error=r.error; } catch (e) { error=e; }
    if (error || !data || !data.session) { err=error? explainAuthError(error) : "That code didn't work."; draw(); const c=$("#ob-code"); if (c){ c.value=""; c.focus(); } return; }
    clearInterval(timer); o.remove(); startLive(data.session.user);
  }
  draw();
}
function explainAuthError(e){
  const m=String((e && (e.message||e.msg||e.error_description)) || e || "");
  if (/signups? not allowed|signup.*disabled/i.test(m)) return "Sign-ups are turned off. In Supabase: Authentication → Sign In / Providers → turn on “Allow new users to sign up”, then Save.";
  if (/unsupported phone provider|phone.*(provider|logins?).*(disabled|not enabled)|phone_provider_disabled/i.test(m)) return "Phone sign-in is off. In Supabase: Authentication → Sign In / Providers → Phone → turn on “Enable Phone provider”, then Save.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/expired|invalid.*(token|otp)|token.*invalid/i.test(m)) return "That code didn't work. Check the test number and code in Supabase (format 12125551234=123456), then try again.";
  if (/twilio|sms|send/i.test(m)) return "The text couldn't be sent: "+m;
  if (/fetch|network|load failed/i.test(m)) return "Can't reach Supabase. Check the Project URL in config.js and your connection.";
  return m || "Something went wrong. Try again.";
}
function openProfileSetup(u, existing){
  if (document.getElementById("profsetup")) return;
  let name=(existing&&existing.name)||"";
  const o=overlay("onboard","Your name"); o.id="profsetup";
  const save=async()=>{ if (!name.trim()) { toast("Enter your name."); return; }
    try { await guarded(store.set("team/"+S.me, {...(existing||{}), name:name.trim().slice(0,40), phone:fmtPhone(u.phone)||((existing||{}).phone||""), joinedAt:(existing&&existing.joinedAt)||now()})); } catch { return; }
    o.remove(); openFindContacts(); };
  o.replaceChildren(h("div",{class:"ob"},
    h("div",{class:"oblogo"}, svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.4-5.8 7-5.8s6.3 2 7 5.8"/>')),
    h("h2",{},"Your name"),
    h("input",{class:"obnum", id:"ob-name", maxlength:"40", autocomplete:"name", placeholder:"Name", value:name, oninput:e=>name=e.target.value, onkeydown:e=>{ if (e.key==="Enter") save(); }}),
    h("div",{class:"obacts end"}, h("button",{class:"fab obgo", "aria-label":"Continue", onclick:save}, svg(IC.arrow)))));
  setTimeout(()=>{ const n=$("#ob-name"); if (n) n.focus(); });
}
function openFindContacts(){
  const o=overlay("onboard","Find your contacts"); o.id="findc";
  o.replaceChildren(h("div",{class:"ob"},
    h("div",{class:"oblogo"}, svg(ICF.all)), h("h2",{},"Find your contacts"),
    h("div",{class:"obacts"}, h("button",{class:"oblink", onclick:()=>o.remove()}, "Skip"), h("button",{class:"fab obgo", "aria-label":"Import contacts", onclick:()=>{ o.remove(); importContacts(); }}, svg(ICF.personplus)))));
}
async function startLive(u){
  DB=makeDocStore(SB); ASSETS=makeAssets(SB); S.mode="live"; S.me=u.id; S.canWrite=true;
  const b=$("#banner"); if (b) b.hidden=true;
  let mine=null; try { mine=await store.get("team/"+S.me); } catch {}
  S.people[S.me]={id:S.me, name:(mine&&mine.name)||"You", avatarUrl:(mine&&mine.photo)||"", color:colorFor(S.me)};
  if (!mine || !mine.name) openProfileSetup(u, mine);
  else if (u.phone && fmtPhone(u.phone)!==mine.phone) store.update("team/"+S.me, {phone:fmtPhone(u.phone)}).catch(()=>{});
  subscribeAll(); render();
}
async function signOut(){ try { await SB.auth.signOut(); } catch {} location.reload(); }

// ---------- toast ----------
let toastT; function toast(t, act){ let el=$("#toast"); if (!el){ el=h("div",{class:"toast",id:"toast",role:"status"}); document.body.append(el);} el.replaceChildren(h("span",{},t), act? h("button",{class:"toastbtn", onclick:()=>{ el.hidden=true; act.fn(); }}, act.label):""); el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, act?4500:2400); }

// ---------- render ----------
let scrollDown=true;
function render(keepComposer){
  const app=$("#app");
  // preserve composer draft and focus
  const ta=$("#composer"); const draft = ta? ta.value : ls.get("draft:"+S.active, ""); const hadFocus = document.activeElement===ta;
  const streamEl=$("#stream"); const atBottom = streamEl ? (streamEl.scrollHeight-streamEl.scrollTop-streamEl.clientHeight<80) : true;
  const prevScroll = streamEl? streamEl.scrollTop: 0;
  const listScroll = $("#list")? $("#list").scrollTop: 0;
  const boardScroll = $("#board")? [$("#board").scrollLeft, $("#board").scrollTop]: null;
  const focusId = document.activeElement && document.activeElement.id && $("#drawer")?.contains(document.activeElement) ? document.activeElement.id : null;

  [...app.children].forEach(c => { if (!c.matches(".rail,.banner")) c.remove(); });
  document.querySelectorAll(".navb").forEach(b => b.setAttribute("aria-current", String(b.dataset.view===S.view)));
  updateDots();
  const ur = S.channels.filter(unread).length; const ud=$("#unreadDot"); ud.hidden=!ur; ud.textContent=ur;
  const mine = visibleTasks().filter(t=>t.assignee===S.me && t.status!=="done").length; const md=$("#mineDot"); md.hidden=!mine; md.textContent=mine;
  $("#meAv").replaceChildren(S.me? avatar(S.me): "");

  app.classList.toggle("wide-main", S.view!=="chats");
  app.classList.toggle("with-drawer", !!S.openTask);
  app.classList.toggle("in-thread", S.inThread);

  if (S.view==="chats") { app.append(renderLines(), renderThread()); }
  else if (S.view==="team" && !curTeam() && !S.teams.length && false) {}
  else if (S.view==="board") app.append(renderBoard());
  else if (S.view==="updates") app.append(renderUpdates());
  else if (S.view==="calls") app.append(renderCalls());
  else if (S.view==="settings") app.append(renderSettings());
  else app.append(renderTeam());
  if (S.openTask) app.append(renderDrawer());

  const nta=$("#composer"); if (nta){ nta.value = S.editing? (plain(S.msgs.find(m=>m.id===S.editing))||"") : draft; autoGrow(nta); nta.closest(".crow").classList.toggle("has-text", !!nta.value.trim() || !!S.editing); if (hadFocus||S.editing||S.replyTo) nta.focus(); }
  const ns=$("#stream"); if (ns){ if (scrollDown||atBottom) ns.scrollTop=ns.scrollHeight; else ns.scrollTop=prevScroll; scrollDown=false; }
  if ($("#list")) $("#list").scrollTop=listScroll;
  if (boardScroll && $("#board")) { $("#board").scrollLeft=boardScroll[0]; $("#board").scrollTop=boardScroll[1]; }
  if (focusId && $("#"+focusId)) $("#"+focusId).focus();
  S.justTied=null;
  if (playing) syncPlayer();
}
function updateDots(){
  const g=statusGroups(); const ns=Object.keys(g).filter(id=>id!==S.me && !seenAll(g[id])).length; const sd=$("#statusDot"); if (sd){ sd.hidden=!ns; }
  const mc=S.calls.filter(c=>c.from!==S.me && (c.members||[]).includes(S.me) && (c.status==="missed"||(c.status==="ringing"&&now()-c.at>RING_MS)) && c.at>(ls.get("callsSeen",0))).length; const cd=$("#callDot"); if (cd){ cd.hidden=!mc; cd.textContent=mc; }
}
function autoGrow(t){ t.style.height="auto"; t.style.height=Math.min(160,t.scrollHeight+2)+"px"; }

function renderLines(){
  if (S.newFlow) return renderFlow();
  const q=S.q.toLowerCase();
  const chans = S.channels.filter(c => !q || chanTitle(c).toLowerCase().includes(q) || (c.last&&c.last.text||"").toLowerCase().includes(q));
  const pinned=S.pins.map(id=>chans.find(c=>c.id===id)).filter(Boolean);
  const rest=chans.filter(c=>!S.pins.includes(c.id));
  const item = c => { const el=itemEl(c); longPress(el,(x,y)=>rowMenu(c,x,y)); return el; };
  const itemEl = c => h("button",{class:"lineitem", "aria-current":String(c.id===S.active && S.inThread || (c.id===S.active && window.innerWidth>860)), onclick:()=>selectChannel(c.id)},
    chanGlyph(c),
    h("span",{style:"min-width:0"}, h("div",{class:"nm"}, chanTitle(c)), h("div",{class:"pv"}, c.last? (c.kind!=="dm"? nameOf(c.last.by)+": ":"")+ (c.last.kind==="voice"? "🎤 Voice note" : c.last.enc? shown(c.last) : (c.last.text||"Message deleted")) : "")),
    h("span",{class:"meta"}, c.last? h("span",{class:"mono"}, fmtShort(c.last.at)):"", h("span",{class:"metaicons"}, S.pins.includes(c.id)? h("span",{class:"pinmark", title:"Pinned"}, svg(IC.pin)):"", unread(c)? h("span",{class:"badge"+((c.last.mentions||[]).includes(S.me)?" at":"")}, (c.last.mentions||[]).includes(S.me)? "@" : "1"):""))
  );
  function taskConvos(q){
    if (!curTeam()) return h("div",{class:"empty",style:"margin-top:30px"}, h("p",{},"Create a team on the Team tab to see task conversations."));
    const ts=visibleTasks().filter(t=>!q || (t.title||"").toLowerCase().includes(q) || ("cn-"+t.num).includes(q));
    const last=t=>{ const ch=t.thread&&S.channels.find(c=>c.id===t.thread); return ch&&ch.last; };
    const sorted=ts.sort((a,b)=>((a.status==="done")-(b.status==="done")) || (((last(b)||{}).at||b.at||0)-((last(a)||{}).at||a.at||0)));
    if (!sorted.length) return h("div",{class:"empty",style:"margin-top:30px"}, h("p",{},"No tasks yet."));
    return sorted.map(t=>{ const s=STATUSES.find(x=>x.id===t.status)||STATUSES[0]; const l=last(t); const ch=t.thread&&S.channels.find(c=>c.id===t.thread);
      return h("button",{class:"lineitem"+(t.status==="done"?" faded":""), "aria-current":String(!!ch && ch.id===S.active), onclick:()=>openTaskChat(t)},
        h("span",{class:"glyph tglyph", style:`--st:${s.c}`}, svg(IC.knot)),
        h("span",{style:"min-width:0"}, h("div",{class:"nm"}, h("span",{class:"tidmini", style:`--c:${s.c}`},"CN-"+t.num), " ", t.title), h("div",{class:"pv"}, l? nameOf(l.by)+": "+(l.text||"") : s.name+(t.assignee? " · "+nameOf(t.assignee).replace(/^Example:\s*/,""):"")+" · tap to discuss")),
        h("span",{class:"meta"}, l? h("span",{class:"mono"}, fmtShort(l.at)):"", ch&&unread(ch)? h("span",{class:"badge"},"new"):""));
    });
  }
  const fab = S.canWrite? h("button",{class:"fab chatfab","aria-label":"New chat", onclick:()=>openNewChat()}, svg('<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M12 9v6M9 12h6"/>')) : "";
  return h("section",{class:"lines","aria-label":"Conversations"}, fab,
    h("div",{class:"lines-head toprow"}, h("h1",{class:"h1"},"Chats"), h("span",{class:"grow"}), profBtn()),
    h("label",{class:"search"}, svg(IC.search), h("input",{id:"q", placeholder:"Search", value:S.q, oninput:e=>{S.q=e.target.value; const pos=e.target.selectionStart; render(); const n=$("#q"); n.focus(); n.setSelectionRange(pos,pos);}})),
    h("div",{class:"list", id:"list"},
      !S.channels.length && S.mode!=="loading" ? h("div",{class:"empty",style:"margin-top:30px"}, h("p",{},"No chats yet")) : "",
      pinned.map(item), rest.map(item)
    )
  );
}

function renderThread(){
  const c = S.channels.find(x=>x.id===S.active);
  const wrap = h("section",{class:"main chatmain","aria-label":"Conversation"});
  if (!c) { wrap.append(h("div",{class:"empty"}, S.mode==="loading"? h("p",{},"Loading your team…") : [h("svg",{viewBox:"0 0 60 60",width:"60",height:"60",html:'<rect x="4" y="10" width="40" height="28" rx="14" fill="var(--bubble)"/><rect x="18" y="26" width="38" height="24" rx="12" fill="var(--cobalt)"/><path d="M29 38l4 4 9-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'}), h("h2",{},"Concept")])); return wrap; }
  const memberCount = (c.members||[]).length;
  const openTasks = visibleTasks().filter(t=>t.channel===c.id && t.status!=="done").length;
  if (S.selecting) wrap.append(h("header",{class:"thead selhead"},
    h("button",{class:"iconbtn", "aria-label":"Cancel selection", title:"Cancel", onclick:()=>{ S.selecting=false; S.sel=[]; render(true); }}, svg(IC.x)),
    h("b",{class:"selcount"}, S.sel.length), h("span",{class:"grow"}),
    h("button",{class:"iconbtn accent", "aria-label":"Forward selected messages", title:"Forward", disabled:!S.sel.length, onclick:()=>forwardMenu(S.msgs.filter(m=>S.sel.includes(m.id)))}, svg(ICF.fwd)),
    h("button",{class:"iconbtn accent", "aria-label":"Make one task from the selected messages", title:"Make task", disabled:!S.sel.length, onclick:()=>quickTask(S.msgs.filter(m=>S.sel.includes(m.id)))}, svg(IC.knot))));
  else wrap.append(h("header",{class:"thead"},
    h("button",{class:"iconbtn back","aria-label":"Back to conversations", onclick:()=>{S.inThread=false; render();}}, svg(IC.back)),
    chanGlyph(c),
    h("div",{class:"t"}, h("b",{},chanTitle(c)), h("span",{}, c.kind==="task"? (()=>{ const t=S.tasks.find(x=>x.id===c.taskId); const par=S.channels.find(z=>z.id===c.parent); return t? "CN-"+t.num+" · "+stName(stOf(t))+(par? " · "+chanTitle(par):"") : ""; })() : c.kind==="dm"? ((S.teamDocs[(c.members||[]).find(x=>x!==S.me)]||{}).about||"") : (c.members||[]).map(id=>nameOf(id).replace(/^Example:\s*/,"").split(" ")[0]).join(", "))),
    h("span",{class:"grow"}),
    S.canWrite && (c.members||[]).length>1? h("button",{class:"iconbtn hcall","aria-label":"Video call", title:"Video call", onclick:()=>startCall(c,"video")}, svg(IC.video)):"",
    S.canWrite && (c.members||[]).length>1? h("button",{class:"iconbtn hcall","aria-label":"Voice call", title:"Voice call", onclick:()=>startCall(c,"voice")}, svg(IC.phone)):"",
    c.kind==="task" && S.tasks.find(x=>x.id===c.taskId)? h("button",{class:"iconbtn", title:"View task", "aria-label":"View task", onclick:()=>openTask(c.taskId)}, svg(IC.knot)) :
    "",
    h("button",{class:"iconbtn", title:"Menu", "aria-label":"Chat menu", onclick:e=>{ const r=e.currentTarget.getBoundingClientRect(); chatMenu(c, r.right, r.bottom); }}, svg(ICF.more))
  ));
  const stream = h("div",{class:"stream", id:"stream", onclick:e=>{ if (S.actFor && !e.target.closest(".holdmenu")) { S.actFor=null; S.emojiFor=null; render(true);} }});
  const spine = h("div",{class:"spine"});

  if (E2E.ready) spine.append(h("div",{class:"e2enote"}, svg(ICF.lock), "End-to-end encrypted"));
  let lastDay=null, lastBy=null, lastAt=0;
  for (const m of S.msgs) {
    const dk=dayKey(m.at); if (dk!==lastDay){ spine.append(h("div",{class:"day"}, fmtDay(m.at))); lastDay=dk; lastBy=null; }
    const cont = lastBy===m.by && m.at-lastAt<5*60000 && !m.taskId; lastBy=m.by; lastAt=m.at;
    spine.append(renderMsg(m, cont));
  }
  stream.append(spine); wrap.append(stream);
  wrap.append(renderComposer(c));
  wallpaperLayer(wrap);
  return wrap;
}

function renderMsg(m, cont){
  const mine = m.by===S.me; const task = m.taskId && S.tasks.find(t=>t.id===m.taskId && canSeeTask(t));
  const ch=S.channels.find(c=>c.id===S.active)||{}; const sel=S.selecting && S.sel.includes(m.id);
  const el = h("div",{style:mine?null:`--tint:${(S.people[m.by]&&S.people[m.by].color)||colorFor(m.by)}`, class:`msg${mine?" mine":""}${cont?" cont":""}${task?" knotted":""}${S.justTied===m.id?" justtied":""}${S.selecting?" selmode":""}${sel?" selected":""}`, id:"msg-"+m.id, onclick:e=>{ if (S.selecting && !m.deleted){ e.stopPropagation(); toggleSel(m.id); } }});
  if (S.selecting) el.append(h("span",{class:"selck"}, sel? svg(ICF.check):""));
  if (!cont && !mine && ch.kind!=="dm") el.append(h("div",{class:"who"}, nameOf(m.by).replace(/^Example:\s*/,"")));
  const strip = h("div",{class:"strip", tabindex:"0", "aria-label":"Message. Hold for options, swipe right to reply, swipe left to make a task", onkeydown:e=>{ if (e.key==="Enter"){ e.preventDefault(); holdMenu(m); } }});
  if (m.fwd) strip.append(h("div",{class:"fwdlabel"}, svg(m.fwd>=5? ICF.fwd2 : ICF.fwd), m.fwd>=5? "Forwarded many times" : "Forwarded"));
  if (m.replyTo) { const r=S.msgs.find(x=>x.id===m.replyTo); if (r) strip.append(h("div",{class:"quote", onclick:e=>{e.stopPropagation(); jumpToMessage(S.active, r.id);}}, h("b",{},nameOf(r.by)), (r.deleted?"Message deleted": r.kind==="voice"? "🎤 Voice note" : shown(r)).slice(0,140))); }
  if (m.statusQuote) strip.append(h("div",{class:"quote"}, h("b",{}, "Status · "+nameOf(m.statusQuote.by).replace(/^Example:\s*/,"")), String(m.statusQuote.text).slice(0,140)));
  if (m.deleted) strip.append(h("span",{class:"tx",style:"font-style:italic;color:var(--muted)"},"Message deleted"));
  else if (m.kind==="voice" && m.voice) { strip.classList.add("vstrip"); strip.append(renderVoice(m)); }
  else { const tx=shown(m); strip.append(h("span",{class:"tx"+(plain(m)===false?" locked":"")}, plain(m)? richText(tx) : tx)); }
  strip.append(h("span",{class:"mt"}, m.edited? "edited · ":"", fmtTime(m.at)));
  el.append(h("span",{class:"swi swi-r","aria-hidden":"true"}, svg(IC.reply)), h("span",{class:"swi swi-l","aria-hidden":"true"}, svg(IC.knot)));
  el.append(h("div",{class:"brow"}, strip,
    !m.deleted && !S.selecting && S.canWrite && plain(m)!==false? h("button",{class:"fwdbtn", title:"Forward", "aria-label":"Forward message", onclick:e=>{ e.stopPropagation(); forwardMenu(m); }}, svg(ICF.fwd)) : "",
    !m.deleted && !S.selecting && S.canWrite? h("button",{class:"mchev", title:"Options", "aria-label":"Message options", onclick:e=>{ e.stopPropagation(); holdMenu(m); }}, svg(ICF.chev)) : ""));
  attachGestures(el, strip, m);
  const rs = Object.entries(m.reactions||{}).filter(([,v])=>v&&v.length);
  if (rs.length) el.append(h("div",{class:"reacts"}, rs.map(([e,v])=>h("button",{class:"react"+(v.includes(S.me)?" on":""), title:v.map(nameOf).join(", "), disabled:!S.canWrite, onclick:()=>toggleReact(m,e)}, e, h("span",{class:"mono"},v.length)))));
  if (task && (task.fromMsg===m.id || !task.fromMsg)) el.append(h("button",{class:"tasktag", style:`--st:${(STATUSES.find(x=>x.id===stOf(task))||STATUSES[0]).c}`, onclick:e=>{ e.stopPropagation(); openTask(task.id); }}, h("span",{class:"mono"},"CN-"+task.num), h("span",{class:"st"}, stName(stOf(task))), task.assignee? avatar(task.assignee,"sm"):""));
  if (S.actFor===m.id && !m.deleted && S.canWrite) {
    const mine_r=(m.reactions||{});
    el.append(h("div",{class:"holdmenu", onclick:e=>e.stopPropagation()},
      h("div",{class:"emojis"+(S.emojiMore?" more":"")}, (S.emojiMore? MORE_EMOJI : quickEmojis()).map(e=>h("button",{class:(mine_r[e]||[]).includes(S.me)?"on":"", onclick:()=>toggleReact(m,e), "aria-label":"React "+e}, e)),
        S.emojiMore? "" : h("button",{class:"emore","aria-label":"More emojis", title:"More", onclick:()=>{ S.emojiMore=true; render(true); }}, svg(IC.plus))),
      h("div",{class:"acts"},
        h("button",{title:"Reply", "aria-label":"Reply", onclick:()=>{ S.replyTo=m.id; S.actFor=null; render(true); setTimeout(()=>{ const c=$("#composer"); if (c) c.focus(); }); }}, svg(IC.reply)),
        plain(m)!==false? h("button",{title:"Forward", "aria-label":"Forward", onclick:()=>forwardMenu(m)}, svg(ICF.fwd)) : "",
        task? h("button",{class:"tie", title:"Open task", "aria-label":"Open task", onclick:()=>openTask(task.id)}, svg(IC.knot)) : h("button",{class:"tie", title:"Make task", "aria-label":"Make task", onclick:()=>quickTask([m], {open:(S.prefs.swipeTask||"open")!=="silent"})}, svg(IC.knot)),
        h("button",{title:"Select", "aria-label":"Select messages", onclick:e=>{ e.stopPropagation(); S.selecting=true; S.sel=[m.id]; S.actFor=null; render(true); }}, svg(ICF.selm)),
        m.kind!=="voice" && plain(m)? h("button",{title:"Copy", "aria-label":"Copy", onclick:()=>copyMsg(m)}, svg(ICF.copy)) : "",
        mine && m.kind!=="voice" && plain(m)!==false? h("button",{title:"Edit", onclick:()=>{S.editing=m.id; S.actFor=null; render(true);}, "aria-label":"Edit"}, svg(IC.edit)):"",
        mine? h("button",{title:"Delete", onclick:()=>deleteMsg(m), "aria-label":"Delete message"}, svg(IC.trash)):"")));
  }
  return el;
}

function renderComposer(c){
  const box = h("div",{class:"compose"}); const inner=h("div",{class:"inner"}); box.append(inner);
  if (!S.canWrite) { inner.append(h("div",{class:"hint",style:"text-align:center"},"View only")); return box; }
  if (S.replyTo || S.editing) {
    const r = S.msgs.find(x=>x.id===(S.replyTo||S.editing));
    inner.append(h("div",{class:"replybar"}, svg(S.editing?IC.edit:IC.reply), h("b",{}, S.editing? "Editing" : "Replying to "+nameOf(r&&r.by)), h("span",{}, r? (r.kind==="voice"?"🎤 Voice note":shown(r)):""), h("button",{class:"iconbtn","aria-label":"Cancel", onclick:()=>{S.replyTo=null; S.editing=null; const t=$("#composer"); if(t) t.value=""; render(true);}}, svg(IC.x))));
  }
  if (S.rec && S.recFor!=="task") {
    inner.append(h("div",{class:"recbar"},
      h("button",{class:"rectrash", "aria-label":"Cancel recording", onclick:()=>stopRec(true)}, svg(IC.trash)),
      h("span",{class:"recdot"}), h("span",{class:"rectime mono", id:"recTime"}, fmtDur(REC? (now()-REC.t0)/1000 : 0)),
      h("div",{class:"recbars", id:"recBars", "aria-hidden":"true"}, Array.from({length:40},()=>h("i"))),
      h("button",{class:"micbtn sending", "aria-label":"Send voice note", onclick:()=>stopRec(false)}, svg(IC.send))
    ));
    return box;
  }
  if (S.statusReply) inner.append(h("div",{class:"replybar"}, svg(IC.reply), h("b",{},"Status"), h("span",{}, S.statusReply.text), h("button",{class:"iconbtn","aria-label":"Cancel", onclick:()=>{S.statusReply=null; render(true);}}, svg(IC.x))));
  const ta = h("textarea",{id:"composer", rows:"1", placeholder: S.asTask? "Task" : "Message", "aria-label":"Message",
    oninput:e=>{ autoGrow(e.target); e.target.closest(".crow").classList.toggle("has-text", !!e.target.value.trim()); if (!S.editing) ls.set("draft:"+S.active, e.target.value); updateMention(e.target, c); },
    onkeydown:e=>{ if (e.key==="Enter" && !e.shiftKey && !e.isComposing && S.prefs.enterSends!==false) { e.preventDefault(); const v=e.target.value; e.target.value=""; ls.set("draft:"+S.active,""); sendMessage(v); } if (e.key==="Escape") { S.replyTo=null; S.editing=null; render(true);} }});
  inner.append(h("div",{class:"mentionbox", id:"mentionbox", hidden:true}));
  inner.append(h("div",{class:"crow"},
    ta,
    S.editing? "" : h("button",{class:"knotbtn","aria-pressed":String(S.asTask), title:"Send this message and turn it into a task", onclick:()=>{S.asTask=!S.asTask; render(true); $("#composer").focus();}}, svg(IC.knot)),
    h("button",{class:"sendbtn", "aria-label":S.editing?"Save edit":"Send", onclick:()=>{ const t=$("#composer"); const v=t.value; t.value=""; t.closest(".crow").classList.remove("has-text"); ls.set("draft:"+S.active,""); sendMessage(v); }}, svg(S.editing?IC.edit:IC.send)),
    S.editing? "" : h("button",{class:"micbtn", "aria-label":"Record a voice note", title:"Record a voice note", onclick:startRec}, svg(IC.mic))
  ));
  return box;
}

// ---------- teams & task visibility ----------
const myTeams = () => S.teams.filter(t=>(t.members||[]).includes(S.me)).sort((a,b)=>(a.at||0)-(b.at||0));
const curTeam = () => { const ts=myTeams(); return ts.find(t=>t.id===S.teamId) || ts[0] || null; };
const teamMembers = () => { const t=curTeam(); return t? [S.me, ...(t.members||[]).filter(x=>x!==S.me)] : []; };
function canSeeTask(t){
  const tm = t.team ? S.teams.find(x=>x.id===t.team) : null;
  if (!tm) return t.createdBy===S.me || t.assignee===S.me;
  if (!(tm.members||[]).includes(S.me)) return false;
  if (tm.visibility==="assigned" && tm.owner!==S.me) return t.assignee===S.me || t.createdBy===S.me;
  return true;
}
const visibleTasks = () => S.tasks.filter(canSeeTask);
const ICF = { fwd2:'<path d="M11 5l6 6-6 6"/><path d="M16 5l6 6-6 6"/><path d="M17 11H9a6 6 0 0 0-6 6v2"/>', clip:'<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>', image:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/>', fwd:'<path d="M14 5l6 6-6 6"/><path d="M20 11h-9a6 6 0 0 0-6 6v2"/>', copy:'<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', chev:'<path d="M7 10l5 5 5-5"/>', lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>', book:'<path d="M5 4.5h12.5a1.5 1.5 0 0 1 1.5 1.5v13.5H6.5A1.5 1.5 0 0 1 5 18z"/><circle cx="12" cy="10.5" r="2.4"/><path d="M8.5 16c.5-1.6 1.8-2.5 3.5-2.5s3 .9 3.5 2.5M19 8h1.5M19 12h1.5"/>', more:'<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>', selm:'<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>', list:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>', stage:'<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>', listv:'<path d="M8.5 6H20M8.5 12H20M8.5 18H20"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>', info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', drop:'<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>', bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>', vib:'<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 9v6M20 9v6"/>', grid:'<circle cx="6" cy="6" r="1.4"/><circle cx="12" cy="6" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/><circle cx="6" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/>', cell:'<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>', media:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.5v5l4.2-2.5z" fill="currentColor"/>', all:'<circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3 18c.5-2.6 2.4-4 5-4s4.5 1.4 5 4M11 18c.5-2.6 2.4-4 5-4s4.5 1.4 5 4"/>', none:'<circle cx="12" cy="9" r="3.2" stroke-dasharray="2.5 2"/><path d="M5.5 19c.7-3 3.2-4.6 6.5-4.6s5.8 1.6 6.5 4.6" stroke-dasharray="2.5 2"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>', flag:'<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>', cal:'<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>', check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', personplus:'<circle cx="10" cy="8" r="3.4"/><path d="M3.5 20c.6-3.6 3.2-5.4 6.5-5.4 1.4 0 2.6.3 3.6.9M18 14v6M15 17h6"/>', goto:'<path d="M7 17L17 7M9 7h8v8"/>' };

function filteredTasks(){
  const f=S.filter;
  return visibleTasks().filter(t => f==="all" || (f==="me" && t.assignee===S.me) || (f==="none" && !t.assignee) || (f.startsWith("chan:") && t.channel===f.slice(5)) || t.assignee===f);
}
function needTeam(){ if (curTeam()) return false; toast("Create your team first, then you can add tasks."); S.view="team"; ls.set("view","team"); render(); return true; }
function renderBoard(){
  const wrap=h("section",{class:"boardwrap","aria-label":"Task board"});
  const tm=curTeam();

  const chanF = S.filter.startsWith("chan:")? S.channels.find(c=>c.id===S.filter.slice(5)) : null;
  const restricted = !!tm && tm.visibility==="assigned" && tm.owner!==S.me;
  const chip=(id, content, label)=>h("button",{class:"chip ichip","aria-pressed":String(S.filter===id), title:label, "aria-label":label, onclick:()=>{S.filter=id; render();}}, content);
  const vbtn=(v,icon,l)=>h("button",{"aria-pressed":String((S.taskView==="list"?"list":"stage")===v), title:l, "aria-label":l, onclick:()=>{ S.taskView=v; ls.set("taskView",v); render(); }}, svg(icon));
  wrap.append(h("header",{class:"bhead"},
    h("div",{class:"toprow"}, h("h1",{class:"h1"},"Tasks"), h("span",{class:"grow"}),
      h("div",{class:"vtoggle", role:"group", "aria-label":"Task view"}, vbtn("stage",ICF.stage,"Stage view"), vbtn("list",ICF.listv,"List view")), profBtn()),
    h("div",{class:"chips"},
      chip("all", svg(ICF.all), "All tasks"), chip("me", avatar(S.me,"sm"), "Assigned to me"),
      restricted? "" : chip("none", svg(ICF.none), "Unassigned"),
      restricted? "" : [...new Set(visibleTasks().map(t=>t.assignee).filter(id=>id && id!==S.me))].map(id=>chip(id, avatar(id,"sm"), nameOf(id).replace(/^Example:\s*/,""))),
      chanF? chip(S.filter, svg(IC.chat), "From "+chanTitle(chanF)) : "")
  ));
  const tasks=filteredTasks();
  if (S.taskView==="list") { wrap.append(renderTaskList(tasks)); if (S.canWrite) wrap.append(h("button",{class:"fab vfab", "aria-label":"New task", title:"New task", onclick:newBlankTask}, svg(IC.plus))); return wrap; }
  const board=h("div",{class:"board", id:"board"});
  STATUSES.forEach((s,si)=>{
    const list=tasks.filter(t=>stOf(t)===s.id);
    const col=h("div",{class:"col", style:`--c:${s.c}`, "data-status":s.id,
      ondragover:e=>{e.preventDefault(); col.classList.add("over");}, ondragleave:()=>col.classList.remove("over"),
      ondrop:e=>{e.preventDefault(); col.classList.remove("over"); const id=e.dataTransfer.getData("text/plain"); if (id) moveTask(id, s.id);}});
    col.append(h("div",{class:"colh"}, h("span",{class:"colpill"}, s.name, h("i",{}, list.length)), h("span",{class:"grow"}), S.canWrite? h("button",{class:"iconbtn sm", title:"Edit stage", "aria-label":"Edit stage "+s.name, onclick:e=>stageMenu(s, e.clientX, e.clientY)}, svg(ICF.more)) : ""));
    const cards=h("div",{class:"cards"});
    if (!list.length) cards.append(h("div",{class:"colempty"}, "—"));
    list.forEach(t=>{
      const late=isLate(t.due,t.status);
      cards.append(h("button",{class:"card pri-"+(t.priority||"normal"), draggable:S.canWrite?"true":null, onclick:()=>openTask(t.id),
        ondragstart:e=>{e.dataTransfer.setData("text/plain",t.id); e.currentTarget.classList.add("dragging");}, ondragend:e=>e.currentTarget.classList.remove("dragging")},
        h("div",{class:"ttl"}, t.title),
        h("div",{class:"bot"},
          h("span",{class:"tid"},"CN-"+t.num),
          (t.subtasks||[]).length? h("span",{class:"subchip"}, svg(ICF.list), t.subtasks.filter(x=>x.done).length+"/"+t.subtasks.length) : "",
          t.priority==="high"? h("span",{class:"flag", title:"High priority"}, svg(ICF.flag)) : "",
          t.due? h("span",{class:"due"+(late?" late":""), title:late?"Overdue":"Due"}, svg(ICF.cal), fmtDue(t.due)) : "",
          t.thread? h("span",{class:"cchat", title:"Has a conversation"}, svg(IC.chat)):"",
          t.fromText? h("span",{class:"cchat", title:"From a message: "+t.fromText.slice(0,80)}, svg(IC.reply)):"",
          h("span",{class:"grow"}),
          t.assignee? avatar(t.assignee,"sm") : h("span",{class:"noav", title:"Unassigned"}, svg(ICF.none)))
      ));
    });
    col.append(cards); board.append(col);
  });
  if (S.canWrite) board.append(S.addingStage? h("div",{class:"col addcol open"}, h("input",{class:"sinp full", id:"new-stage", placeholder:"Stage name", maxlength:"24", onkeydown:e=>{ if (e.key==="Enter") addStage(e.target.value); if (e.key==="Escape"){ S.addingStage=false; render(); } }, onblur:e=>{ if (!S.addingStage || !e.target.isConnected) return; const v=e.target.value; setTimeout(()=>{ if (!S.addingStage) return; if (v.trim()) addStage(v); else { S.addingStage=false; render(); } }); }}))
    : h("button",{class:"col addcol", title:"Add stage", "aria-label":"Add stage", onclick:()=>{ S.addingStage=true; render(); setTimeout(()=>{ const n=$("#new-stage"); if (n) n.focus(); }); }}, svg(IC.plus)));
  wrap.append(board);
  if (S.canWrite) wrap.append(h("button",{class:"fab vfab", "aria-label":"New task", title:"New task", onclick:newBlankTask}, svg(IC.plus)));
  return wrap;
}

function renderTeam(){
  const w=h("section",{class:"teamwrap","aria-label":"Team"});
  const tm=curTeam(); const ts=myTeams();
  w.append(h("div",{class:"bhead flat toprow"}, h("button",{class:"iconbtn", title:"Back", "aria-label":"Back to settings", onclick:openSettings}, svg(IC.back)),
    h("div",{class:"bt"}, h("h1",{class:"h1"}, tm? tm.name : "Team"), tm? h("span",{class:"teamname"}, `${(tm.members||[]).length} member${(tm.members||[]).length===1?"":"s"} · ${tm.visibility==="assigned"? "each sees only their tasks" : "everyone sees all tasks"}`) : ""),
    h("span",{class:"grow"}),
    ts.length>1? h("select",{class:"inp teamsel", "aria-label":"Switch team", onchange:e=>{ S.teamId=e.target.value; ls.set("teamId",S.teamId); render(); }}, ts.map(t=>h("option",{value:t.id, selected:tm&&t.id===tm.id}, t.name))) : "",
    tm && tm.owner===S.me? h("button",{class:"iconbtn", "aria-label":"Team settings", title:"Team settings", onclick:openTeamSettings}, svg(ICF.gear)) : "",
    S.canWrite? h("button",{class:"iconbtn", "aria-label":"Create another team", title:"Create another team", onclick:openTeamCreate}, svg(IC.plus)) : "", profBtn()));
  if (!tm) { w.append(h("div",{class:"empty"}, h("div",{class:"bigmic"}, svg(ICF.all)), h("h2",{},"Create a team"))); if (S.canWrite) w.append(h("button",{class:"fab vfab", "aria-label":"Create a team", title:"Create a team", onclick:openTeamCreate}, svg(ICF.personplus))); return w; }
  const g=h("div",{class:"teamgrid"});
  const vt=visibleTasks();
  for (const id of teamMembers()) {
    const mt=vt.filter(t=>t.assignee===id); const done=mt.filter(t=>t.status==="done").length; const open=mt.length-done;
    const phone=(S.teamDocs[id]||{}).phone;
    g.append(h("div",{class:"person"},
      h("div",{class:"r"}, avatar(id,"lg"), h("div",{style:"min-width:0;flex:1"}, h("div",{class:"n"}, fullName(id).replace(/^Example:\s*/,""), id===tm.owner? h("span",{class:"ownerb", title:"Team owner"},"Owner"):""), h("div",{class:"s"}, `${open} open · ${done} done`))),
      id===S.me && S.canWrite? h("label",{class:"phonefield"}, svg(IC.phone), h("input",{id:"myphone", type:"tel", placeholder:"Your phone number", value:(S.teamDocs[S.me]||{}).phone||"", onchange:e=>savePhone(e.target.value)})) :
      phone? h("div",{class:"phoneline"}, svg(IC.phone), h("span",{class:"selectable"}, phone)) : "",
      h("div",{class:"load","aria-hidden":"true"}, mt.length? mt.slice(0,14).map(t=>h("i",{class:t.status==="done"?"d":"o"})) : h("i")),
      h("div",{class:"iconrow"},
        id!==S.me && S.canWrite? h("button",{class:"ib", title:"Message", "aria-label":"Message", onclick:()=>createChannel("", [S.me,id], "dm")}, svg(IC.chat)):"",
        id!==S.me && S.canWrite? h("button",{class:"ib", title:"Voice call", "aria-label":"Voice call", onclick:()=>callPerson(id,"voice")}, svg(IC.phone)):"",
        id!==S.me && S.canWrite? h("button",{class:"ib", title:"Video call", "aria-label":"Video call", onclick:()=>callPerson(id,"video")}, svg(IC.video)):"",
        id!==S.me && phone? h("a",{class:"ib", title:"Call phone "+phone, "aria-label":"Call phone", href:"tel:"+phone.replace(/[^\d+]/g,"")}, svg('<path d="M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2"/>')):"",
        h("button",{class:"ib", title:"Their tasks", "aria-label":"Their tasks", onclick:()=>{S.view="board"; S.filter=id===S.me?"me":id; ls.set("view","board"); render();}}, svg(IC.knot)),
        tm.owner===S.me && id!==S.me? h("button",{class:"ib danger", title:"Remove from team", "aria-label":"Remove from team", onclick:()=>removeMember(id)}, svg(IC.x)):"")
    ));
  }
  w.append(g);
  if (S.canWrite && tm.owner===S.me) w.append(h("button",{class:"fab vfab", "aria-label":"Add people to the team", title:"Add people", onclick:openAddMembers}, svg(ICF.personplus)));
  return w;
}
function peoplePicker(title, candidates, onDone, opts={}){
  const sel=new Set(opts.pre||[]); let name=opts.name||"";
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const draw=()=>{ scrim.replaceChildren(h("div",{class:"modal", role:"dialog", "aria-label":title, onkeydown:e=>{ if(e.key==="Escape") scrim.remove(); }},
    h("h3",{},title),
    opts.askName? h("input",{class:"inp", id:"pp-name", placeholder:"Team name", value:name, oninput:e=>name=e.target.value}) : "",
    candidates.length? h("div",{class:"picklist"}, candidates.map(id=>h("button",{class:"pick contact","aria-pressed":String(sel.has(id)), onclick:()=>{ sel.has(id)?sel.delete(id):sel.add(id); draw(); }}, h("span",{class:"cav"}, avatar(id), sel.has(id)? h("span",{class:"tick"}, svg(ICF.check)):""), fullName(id).replace(/^Example:\s*/,""))))
      : h("p",{class:"note",style:"margin:0"},"Everyone on Concept is already here. Share Concept from the Share menu to invite more people."),
    h("div",{class:"modalacts"}, h("button",{class:"iconbtn","aria-label":"Cancel", title:"Cancel", onclick:()=>scrim.remove()}, svg(IC.x)), h("button",{class:"roundgo","aria-label":"Done", title:"Done", onclick:()=>{ if (opts.askName && !name.trim()) { toast("Give the team a name."); return; } scrim.remove(); onDone([...sel], name.trim()); }}, svg(ICF.check)))));
    const n=$("#pp-name"); if (n && document.activeElement!==n && opts.askName && !name) n.focus(); };
  draw(); document.body.append(scrim);
}
function openTeamCreate(){ peoplePicker("New team", S.team.filter(id=>id!==S.me), async (ids, name)=>{ const id="tm"+now().toString(36)+uidShort().slice(0,3); await guarded(store.set("teams/"+id, {name, owner:S.me, members:[S.me, ...ids], visibility:"all", at:now()})); S.teamId=id; ls.set("teamId",id); toast("Team created"); render(); }, {askName:true}); }
function openAddMembers(){ const tm=curTeam(); peoplePicker("Add to "+tm.name, S.team.filter(id=>!(tm.members||[]).includes(id)), async ids=>{ if (!ids.length) return; await guarded(store.update("teams/"+tm.id, {members:[...new Set([...(tm.members||[]), ...ids])]})); toast(ids.length===1? "Added to the team" : ids.length+" people added"); }); }
async function removeMember(id){ const tm=curTeam(); await guarded(store.update("teams/"+tm.id, {members:(tm.members||[]).filter(x=>x!==id)})); toast(nameOf(id).replace(/^Example:\s*/,"")+" removed"); }
function openTeamSettings(){
  const tm=curTeam(); let name=tm.name, vis=tm.visibility||"all";
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const opt=(v, icon, title, sub)=>h("button",{class:"visopt","aria-pressed":String(vis===v), onclick:()=>{ vis=v; draw(); }}, h("span",{class:"tbi"}, svg(icon)), h("span",{class:"tbt"}, h("b",{},title), h("span",{},sub)), vis===v? svg(ICF.check):"");
  const draw=()=>scrim.replaceChildren(h("div",{class:"modal", role:"dialog", "aria-label":"Team settings"},
    h("h3",{},"Team settings"),
    h("div",{class:"field"}, h("label",{for:"ts-name"},"Team name"), h("input",{class:"inp", id:"ts-name", value:name, oninput:e=>name=e.target.value})),
    h("div",{class:"field"}, h("span",{class:"lb"},"Who can see tasks"),
      opt("all", ICF.all, "Everyone sees all tasks", "The whole team sees every task"),
      opt("assigned", '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.7-3.6 3.4-5.4 7-5.4s6.3 1.8 7 5.4"/>', "Only their own tasks", "People see tasks assigned to them or that they created. You still see everything.")),
    h("div",{class:"modalacts"}, h("button",{class:"iconbtn","aria-label":"Cancel", title:"Cancel", onclick:()=>scrim.remove()}, svg(IC.x)), h("button",{class:"roundgo","aria-label":"Save settings", title:"Save", onclick:async()=>{ if (!name.trim()) { toast("Give the team a name."); return; } scrim.remove(); await guarded(store.update("teams/"+tm.id, {name:name.trim(), visibility:vis})); toast("Settings saved"); }}, svg(ICF.check)))));
  draw(); document.body.append(scrim);
}

function openTask(id){
  const t=S.tasks.find(x=>x.id===id); if (!t || !canSeeTask(t)) return;
  S.openTask=id; S.draftTask={files:(t.files||[]).slice(), subtasks:(t.subtasks||[]).map(x=>({...x})), title:t.title, notes:t.notes||"", status:t.status||"todo", assignee:t.assignee||"", due:t.due||"", priority:t.priority||"normal", channel:t.channel, fromMsg:t.fromMsg, fromText:t.fromText, fromBy:t.fromBy};
  S.actFor=null; S.confirmDel=false; render();
}
function renderDrawer(){
  const isNew = S.openTask==="new"; const t = isNew? null : S.tasks.find(x=>x.id===S.openTask);
  if (!isNew && !t) { S.openTask=null; return h("span"); }
  const d=S.draftTask; const ro=!S.canWrite; if (!STATUSES.some(s=>s.id===d.status)) d.status=STATUSES[0].id; const stc=(STATUSES.find(s=>s.id===d.status)||STATUSES[0]).c;
  const close=()=>{ S.openTask=null; S.draftTask=null; render(); };
  const dr=h("aside",{class:"drawer", id:"drawer", style:`--c:${stc}`, "aria-label":"Task", onkeydown:e=>{ if (e.key==="Escape") close(); }});
  const has = t && t.thread && S.channels.find(c=>c.id===t.thread);
  dr.append(h("div",{class:"dhead"}, h("span",{class:"tidbig"}, isNew? "New task" : "CN-"+t.num), h("span",{class:"grow"}),
    t && (S.canWrite||has)? h("button",{class:"iconbtn", title: has? "Open conversation":"Start a conversation about this task", "aria-label": has? "Open conversation":"Start conversation", onclick:()=>openTaskChat(t)}, svg(IC.thread)) : "",
    d.fromMsg && d.channel && S.channels.find(c=>c.id===d.channel)? h("button",{class:"iconbtn", title:"Go to the original message", "aria-label":"Go to message", onclick:()=>jumpToMessage(d.channel, d.fromMsg)}, svg(ICF.goto)) : "",
    h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:close}, svg(IC.x))));
  const body=h("div",{class:"dbody"});
  body.append(h("textarea",{class:"inp ttlinp", id:"t-title", rows:"1", placeholder:"Task title", disabled:ro, oninput:e=>{ d.title=e.target.value; e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; }, onkeydown:e=>{ if(e.key==="Enter"){ e.preventDefault(); saveTask(); } }}, d.title));
  body.append(h("div",{class:"statusrow"}, STATUSES.map(s=>h("button",{class:"stbtn","aria-pressed":String(d.status===s.id), style:`--c:${s.c}`, disabled:ro, onclick:()=>{ d.status=s.id; render(); }}, s.name))));
  body.append(renderSubtasks(d, t, isNew, ro));
  body.append(renderTaskFiles(d, ro));
  const members=peopleForTasks();
  body.append(h("div",{class:"lbl"}, svg(ICF.personplus)), h("div",{class:"assignrow"},
    h("button",{class:"apick"+(d.assignee===""?" on":""), title:"Unassigned", "aria-label":"Unassigned", disabled:ro, onclick:()=>{ d.assignee=""; render(); }}, svg(ICF.none)),
    members.map(id=>h("button",{class:"apick"+(d.assignee===id?" on":""), title:fullName(id).replace(/^Example:\s*/,""), "aria-label":"Assign to "+fullName(id), disabled:ro, onclick:()=>{ d.assignee=id; render(); }}, avatar(id)))));
  body.append(h("div",{class:"metarow"},
    h("label",{class:"metabox", title:"Due date"}, svg(ICF.cal), h("input",{type:"date", id:"t-due", value:d.due, disabled:ro, onchange:e=>d.due=e.target.value})),
    h("div",{class:"prirow", role:"group", "aria-label":"Priority"}, [["low","Low priority","var(--c-done)"],["normal","Normal priority","var(--c-doing)"],["high","High priority","var(--bad)"]].map(([v,l,c])=>h("button",{class:"pbtn","aria-pressed":String(d.priority===v), title:l, "aria-label":l, style:`--c:${c}`, disabled:ro, onclick:()=>{ d.priority=v; render(); }}, svg(ICF.flag), v==="high"?"!!":v==="normal"?"!":"")))));
  body.append(h("textarea",{class:"inp notes", id:"t-notes", disabled:ro, placeholder:"Add notes…", oninput:e=>d.notes=e.target.value}, d.notes));
  if (d.fromText) { const ch=S.channels.find(c=>c.id===d.channel); body.append(h("div",{class:"source"}, h("div",{class:"lb"}, svg(IC.chat), nameOf(d.fromBy), ch? " · "+chanTitle(ch):""), h("p",{}, d.fromText))); }
  if (t && t.log && t.log.length) body.append(h("div",{class:"history"}, [...t.log].reverse().slice(0,6).map(l=>h("div",{}, h("b",{}, nameOf(l.by)), " "+l.what+" · ", h("span",{}, fmtShort(l.at))))));
  dr.append(body);
  if (!ro) {
    const foot=h("div",{class:"dfoot"});
    if (!isNew) { if (S.confirmDel) foot.append(h("span",{class:"confirm"}, "Delete?"), h("button",{class:"iconbtn dangerbtn","aria-label":"Yes, delete", title:"Delete", onclick:()=>deleteTask(t.id)}, svg(IC.trash)), h("button",{class:"iconbtn","aria-label":"Keep task", title:"Keep", onclick:()=>{S.confirmDel=false; render();}}, svg(IC.x)));
      else foot.append(h("button",{class:"iconbtn dangerbtn","aria-label":"Delete task", title:"Delete task", onclick:()=>{S.confirmDel=true; render();}}, svg(IC.trash))); }
    foot.append(h("span",{class:"grow"}), h("button",{class:"roundgo", "aria-label":isNew?"Create task":"Save", title:isNew?"Create task":"Save", onclick:saveTask}, svg(ICF.check)));
    dr.append(foot);
  }
  setTimeout(()=>{ const ti=$("#t-title"); if (ti){ ti.style.height="auto"; ti.style.height=ti.scrollHeight+"px"; } });
  return dr;
}

// new conversation modal
function openNewChat(){ S.newFlow={step:"pick", sel:[], name:"", icon:"", q:""}; S.inThread=false; S.view="chats"; render(); setTimeout(()=>{ const i=$("#nf-q"); if (i) i.focus(); },30); }
function closeFlow(){ S.newFlow=null; render(); }
const GROUP_ICONS=["💬","🚀","📣","🛠️","🎯","📦","🎨","📈","☕","🏠","⚽","🎉"];
function renderFlow(){
  const F=S.newFlow; const others=S.team.filter(id=>id!==S.me).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
  const q=F.q.toLowerCase(); const match=others.filter(id=>!q || nameOf(id).toLowerCase().includes(q));
  const pane=h("section",{class:"lines flow","aria-label":"New chat", onkeydown:e=>{ if (e.key!=="Escape") return; if (F.step==="pick") closeFlow(); else { F.step = F.step==="members"? "pick" : "members"; render(); } }});
  const head=(title, sub, back)=>h("div",{class:"flowhead"}, h("button",{class:"iconbtn","aria-label":"Back", onclick:back}, svg(IC.back)), h("div",{class:"fht"}, h("b",{},title), sub? h("span",{},sub):""));
  const searchBox=()=>h("label",{class:"search"}, svg(IC.search), h("input",{id:"nf-q", placeholder:"Search name", value:F.q, oninput:e=>{F.q=e.target.value; const pos=e.target.selectionStart; render(); const n=$("#nf-q"); n.focus(); n.setSelectionRange(pos,pos);}}));
  const person=(id, opts={})=>h("div",{class:"contact", role:"button", tabindex:"0", "aria-pressed":opts.sel==null?null:String(opts.sel), onclick:opts.onclick, onkeydown:e=>{ if (e.key==="Enter") opts.onclick(); }},
    h("span",{class:"cav"}, avatar(id,"lg"), opts.sel? h("span",{class:"tick"}, svg('<path d="M6 12.5l4 4 8-9"/>')):""),
    h("span",{class:"ctx"}, h("b",{}, fullName(id).replace(/^Example:\s*/,"")), h("span",{}, (S.teamDocs[id]||{}).about || (S.addrNames[id]? (S.teamDocs[id]||{}).phone||"" : ""))),
    S.onConcept.includes(id)? h("span",{class:"onbadge", title:"In your phone contacts"}, svg(ICF.check)) : "",
    opts.add && !S.contacts.includes(id)? h("button",{class:"ib", title:"Save contact", "aria-label":"Save contact", onclick:e=>{ e.stopPropagation(); setContact(id,true); }}, svg(ICF.personplus)) : "");
  const empty=()=>h("div",{class:"flowempty"}, h("p",{}, q? "No results" : "No one yet"));

  if (F.step==="pick") {
    pane.append(head("New chat", "", closeFlow), searchBox());
    const list=h("div",{class:"list"});
    if (!q) {
      list.append(h("button",{class:"action", onclick:()=>{F.step="members"; F.q=""; render(); setTimeout(()=>{ const i=$("#nf-q"); if(i) i.focus(); },30);}}, h("span",{class:"actic"}, svg(IC.group)), h("b",{},"New group")));
    }
    if (!q) list.append(h("button",{class:"action", onclick:importContacts}, h("span",{class:"actic"}, svg(ICF.book)), h("b",{}, S.addr.length? "Update phone contacts" : "Import phone contacts")));
    const saved=match.filter(id=>S.contacts.includes(id)).sort((a,b)=>nameOf(a).localeCompare(nameOf(b))), more=match.filter(id=>!S.contacts.includes(id));
    const go=id=>()=>{ S.newFlow=null; createChannel("", [S.me,id], "dm"); };
    const invites=(S.addr||[]).filter(c=>!c.on && (!q || c.n.toLowerCase().includes(q) || c.p.some(p=>p.includes(q)))).slice(0,80);
    if (!match.length && !invites.length) list.append(empty());
    if (saved.length) list.append(h("div",{class:"seg-label"},"Contacts on Concept"), ...saved.map(id=>person(id,{onclick:go(id)})));
    if (more.length) list.append(h("div",{class:"seg-label"},"Others on Concept"), ...more.map(id=>person(id,{onclick:go(id), add:true})));
    if (invites.length) list.append(h("div",{class:"seg-label"},"Invite to Concept"), ...invites.map(inviteRow));
    pane.append(list);
  }
  else if (F.step==="members") {
    pane.append(head("Add members", F.sel.length? `${F.sel.length} selected` : "", ()=>{F.step="pick"; F.q=""; render();}));
    if (F.sel.length) pane.append(h("div",{class:"selrow"}, F.sel.map(id=>h("button",{class:"selchip", "aria-label":"Remove "+nameOf(id), onclick:()=>{F.sel=F.sel.filter(x=>x!==id); render();}}, h("span",{class:"cav"}, avatar(id,"lg"), h("span",{class:"xbadge"}, svg(IC.x))), h("span",{class:"sn"}, nameOf(id).replace(/^Example:\s*/,"").split(" ")[0])))));
    pane.append(searchBox());
    const list=h("div",{class:"list"});
    if (!match.length) list.append(empty());
    match.forEach(id=>{ const on=F.sel.includes(id); list.append(person(id,{sel:on, onclick:()=>{ F.sel = on? F.sel.filter(x=>x!==id) : [...F.sel,id]; render(); }})); });
    pane.append(list);
    pane.append(h("button",{class:"fab", "aria-label":"Next", disabled:!F.sel.length && others.length>0, onclick:()=>{ F.step="name"; render(); setTimeout(()=>{ const i=$("#nf-name"); if(i) i.focus(); },30); }}, svg(IC.arrow)));
  }
  else {
    pane.append(head("New group", "", ()=>{F.step="members"; render();}));
    const body=h("div",{class:"namestep"});
    body.append(h("div",{class:"gicon", style:`background:${F.icon? "var(--fill)" : colorFor(F.name||"g")}`}, F.icon || (F.name.trim()? F.name.trim()[0].toUpperCase() : svg(IC.group))));
    body.append(h("div",{class:"iconpick"}, GROUP_ICONS.map(e=>h("button",{"aria-pressed":String(F.icon===e), "aria-label":"Group icon "+e, onclick:()=>{F.icon=F.icon===e?"":e; render();}}, e))));
    body.append(h("label",{class:"gname"}, h("input",{id:"nf-name", maxlength:"60", placeholder:"Group name (required)", value:F.name, oninput:e=>{F.name=e.target.value; const pos=e.target.selectionStart; render(); const n=$("#nf-name"); n.focus(); n.setSelectionRange(pos,pos);}, onkeydown:e=>{ if (e.key==="Enter") finishGroup(); }}), h("span",{class:"count mono"}, 60-F.name.length)));
    body.append(h("div",{class:"seg-label",style:"padding-left:0"}, `Members: ${F.sel.length+1}`));
    body.append(h("div",{class:"memgrid"}, [S.me, ...F.sel].map(id=>h("span",{class:"mem"}, avatar(id,"lg"), h("span",{}, id===S.me? "You" : nameOf(id).replace(/^Example:\s*/,"").split(" ")[0])))));
    pane.append(body);
    pane.append(h("button",{class:"fab", "aria-label":"Create group", disabled:!F.name.trim(), onclick:finishGroup}, svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')));
  }
  return pane;
}
async function finishGroup(){ const F=S.newFlow; if (!F || !F.name.trim()) { toast("Give the group a name."); return; } S.newFlow=null; await createChannel(F.name.trim(), [S.me, ...F.sel], "group", F.icon); }

// nav
$("#meAv").addEventListener("click", ()=>openSettings());
document.querySelectorAll(".navb").forEach(b=>b.addEventListener("click",()=>{ S.view=b.dataset.view; ls.set("view",S.view); if (S.view==="chats") S.inThread=false; else S.newFlow=null; if (S.view==="calls") ls.set("callsSeen", now()); if (S.view!=="calls") S.dial.on=false; if (S.view==="board" && S.filter.startsWith("chan:")) {} render(); }));
window.addEventListener("resize", ()=>{ clearTimeout(window.__rt); window.__rt=setTimeout(()=>render(true),150); });

boot();
})();
