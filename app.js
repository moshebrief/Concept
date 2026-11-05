/* Task Message — chat that turns messages into tasks. */
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
  view: (v=>v==="updates"||v==="calls"?"chats":v)(ls.get("view","chats")), active: ls.get("active", null), inThread:false,
  openTask:null, draftTask:null, replyTo:null, editing:null, actFor:null, emojiFor:null,
  statuses:[], calls:[], teamDocs:{}, statusReply:null, teams:[], teamId:ls.get("teamId",null), prefs:ls.get("prefs",{}), pins:[], blocked:[], invites:[], pushState:"", expanded:ls.get("expanded",{}), pend:[], msgCache:{}, msgLimit:120, vdraft:null, emojiOpen:false, emojiTab:null, dial:{on:false,q:""}, contacts:[], allContacts:{}, keys:{}, addr:[], addrNames:{}, onConcept:[], selecting:false, sel:[], addingStage:false, listMode:ls.get("listMode","chats"), taskView:ls.get("taskView","stage"),
  q:"", filter:"all", asTask:false, lastRead: ls.get("lastRead", {}), justTied:null,
  nt: {tone:"note", groupTone:"chime", tones:{}, mute:{}, cleared:{}, unr:[], ...ls.get("nt",{})}
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
async function guarded(p){ try { return await p; } catch(e){ if (e && e.code==="denied") toast("You don't have access to change that."); else if (e && e.code==="quota_exceeded") toast("Storage is full. Delete some old tasks or messages."); else toast(e && e.message && !/fetch|network|load failed/i.test(e.message)? "That didn't save: "+String(e.message).slice(0,120) : "That didn't save. Check your connection and try again."); throw e; } }

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
      data.channels.kthread1={name:"Fix pricing table overflow on mobile", kind:"task", taskId:"t2", parent:"launch", members:["me","ava","noam","lea"], at:t0+60*26*60000, last:{text:"Pushed a fix, can you check on your phone?", by:"noam", at:t0+60*26*60000}};
      data.tasks.t2.thread="kthread1";
      data["channels/kthread1/messages"]={k1:{by:"noam", text:"Pushed a fix, can you check on your phone?", at:t0+60*26*60000}};
      data.contacts = {me:{ids:["ava","noam","lea"]}, ava:{ids:["me","noam"]}, noam:{ids:["me"]}, lea:{ids:["noam"]}};
      data.status = {s1:{by:"ava", kind:"text", text:"Launch week 🚀", bg:"#7B4DFF", at:now()-1000*60*90, views:[]}, s2:{by:"noam", kind:"text", text:"Heads down on mobile fixes", bg:"#0E8F9C", at:now()-1000*60*30, views:["me"]}};
      data.teams = {core:{name:"Example team", owner:"me", members:["me","ava","noam","lea"], visibility:"all", at:t0}, dz:{name:"Design crew", owner:"lea", members:["lea","ava"], visibility:"all", at:t0}};
      data.invites = {ivdemo:{phone:"+12125550100", team:"dz", teamName:"Design crew", by:"lea", byName:"Lea", at:now()-36e5}};
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
// Two letters like iPhone Contacts: "Ava Cohen" → "AC". Emoji or no letters → a person outline.
function initials(name){
  const w=String(name||"").replace(/^Example:\s*/,"").replace(/[^\p{L}\p{N}\s'-]/gu," ").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  return ((w[0][0]||"")+(w.length>1? w[w.length-1][0] : "")).toUpperCase();
}
const PERSON_SIL='<circle cx="12" cy="9" r="4.2"/><path d="M3.8 21.5c.9-4.3 4.2-6.6 8.2-6.6s7.3 2.3 8.2 6.6z"/>';
function monogram(name, cls){
  const t=initials(name); const el=h("span",{class:cls+" mgav"+(t.length>1?" mg2":"")});
  if (t) el.append(h("span",{class:"mgi"}, t)); else el.append(svg(PERSON_SIL));
  return el;
}
function avatar(id, cls=""){
  const p = S.people[id]||{}; const nm=(p.name||"").replace(/^Example:\s*/,"");
  const el = h("span",{class:"av mgav "+cls, title:fullName(id)});
  const pu=(typeof PROF!=="undefined" && PROF[id] && PROF[id].photo!==undefined)? PROF[id].photo : p.avatarUrl;
  if (pu) el.append(h("img",{src:pu, alt:"", onerror:e=>e.target.remove()}));
  else { const t=initials(nm); if (t) { el.append(h("span",{class:"mgi"}, t)); if (t.length>1) el.classList.add("mg2"); } else el.append(svg(PERSON_SIL)); }
  return el;
}
function chanTitle(c){ if (!c) return ""; if (c.kind==="task"){ const t=S.tasks.find(x=>x.id===c.taskId); return t? `CN-${t.num} · ${t.title}` : (c.name||"Task conversation"); } if (c.kind==="dm"){ const o=(c.members||[]).find(m=>m!==S.me)||S.me; return fullName(o).replace(/^Example:\s*/,""); } return c.name||"Untitled"; }
function chanGlyph(c){
  if (c.kind==="dm"){ const o=(c.members||[]).find(m=>m!==S.me)||S.me; return avatar(o,"lg"); }
  if (c.kind==="task"){ const t=S.tasks.find(x=>x.id===c.taskId); const g=h("span",{class:"glyph tglyph", style:`--st:${t? (STATUSES.find(s=>s.id===stOf(t))||STATUSES[0]).c : "var(--muted)"}`}, svg(IC.knot));
    const par=S.channels.find(x=>x.id===(c.parent || (t&&t.channel))); if (!par || par.kind==="task") return g;
    return h("span",{class:"tgwrap", title:"From "+chanTitle(par)}, g, h("span",{class:"tgpar"}, chanGlyph(par))); }
  if (c.icon) return h("span",{class:"glyph eglyph"}, c.icon);
  return monogram(c.name||"", "glyph");
}

// ---------- boot ----------
// Opening the app: if you were signed in, show your chats straight from this phone's saved copy
// (no waiting for the internet), then catch up with the server in the background.
let SPLASH_DONE=false;
function hideSplash(){ if (SPLASH_DONE) return; SPLASH_DONE=true; const ss=NP("SplashScreen"); if (ss) { try { ss.hide({fadeOutDuration:220}); } catch {} } document.documentElement.classList.add("ready"); }
function cachedSession(){
  try { const ref=(CFG.supabaseUrl.match(/https:\/\/([^.]+)\./)||[])[1]; const raw=localStorage.getItem("sb-"+ref+"-auth-token"); if (!raw) return null; const j=JSON.parse(raw); return j && j.user && j.user.id? j : null; } catch { return null; }
}
async function boot(){
  applyPrefs(); nativeInit(); render();
  setTimeout(hideSplash, 1500); // never keep the splash longer than this
  if (!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase && !/YOUR_/.test(CFG.supabaseUrl+CFG.supabaseKey))) { startDemo("Example data. Add your Supabase keys in config.js to go live."); hideSplash(); return; }
  SB=window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
  const cached=cachedSession();
  if (cached) {
    startLive(cached.user);
    SB.auth.getSession().then(({data})=>{ if ((!data || !data.session) && !cachedSession()) { location.reload(); } }).catch(()=>{}); // signed out elsewhere: show the sign-in screen (an offline start keeps working)
    return;
  }
  const {data}=await SB.auth.getSession();
  if (!data || !data.session) { openLogin(); hideSplash(); return; }
  await startLive(data.session.user);
}
function startDemo(msg){ S.mode="demo"; S.me="me"; demo.seed(); if (!S.active) S.active="launch"; showBanner(msg); subscribeAll(); }
function showBanner(t){ const b=$("#banner"); b.hidden=false; b.replaceChildren(h("span",{style:"width:9px;height:9px;background:var(--knot);transform:rotate(45deg);flex:none"}), h("span",{},t)); }

function subscribeAll(){
  loadPins(); loadAddr(); startE2E();
  store.sub("keys", rows => { S.keys=Object.fromEntries(rows.map(r=>[r.id, r.devices||{}])); if (E2E.ready) S.keys[S.me]={...(S.keys[S.me]||{}), [E2E.dev]:E2E.pub}; });
  store.sub("team", async rows => { LOCAL.save("team", rows); S.team=rows.map(r=>r.id); S.teamDocs=Object.fromEntries(rows.map(r=>[r.id,r])); if (!Object.keys(PROF).length || rows.some(r=>!PROF[r.id])) loadProfileData(); if (S.mode==="live") for (const r of rows) S.people[r.id]={id:r.id, name:r.name||r.phone||"Someone", avatarUrl:r.photo||"", color:colorFor(r.id)}; applyProfiles(); matchAddr(); await resolvePeople(S.team); scheduleRender(); });
  store.sub("teams", rows => { S.teams=rows; scheduleRender(); });
  store.sub("invites", rows => { S.invites=rows; scheduleRender(); });
  store.sub("contacts", async rows => { S.allContacts=Object.fromEntries(rows.map(r=>[r.id, r.ids||[]])); S.contacts=S.allContacts[S.me]||[]; await resolvePeople(Object.keys(S.allContacts)); scheduleRender(); });
  store.sub("channels", async rows => {
    S.channels = rows.filter(c => c.kind!=="dm" || (c.members||[]).includes(S.me)).sort((a,b)=>((b.last&&b.last.at)||b.at||0)-((a.last&&a.last.at)||a.at||0));
    await resolvePeople(rows.flatMap(c=>[...(c.members||[]), c.last&&c.last.by]).filter(Boolean));
    if (!S.active || !S.channels.find(c=>c.id===S.active)) S.active = S.channels[0] ? S.channels[0].id : null;
    decryptMany(S.channels.map(c=>c.last&&c.last.enc)).then(ch=>{ if (ch) scheduleRender(); });
    LOCAL.save("channels", S.channels); syncSoon(); noticeIncoming(S.channels); rtSync(); ackDelivered(); if (S.inThread && S.view==="chats") ackRead(S.channels.find(c=>c.id===S.active));
    openMsgs(); scheduleRender();
  });
  store.sub("tasks", async rows => { const have=new Set(rows.map(r=>r.id)); for (const k of [...PEND_TASKS.keys()]) if (have.has(k)) PEND_TASKS.delete(k); S.tasks=rows.concat([...PEND_TASKS.values()]).sort((a,b)=>(a.num||0)-(b.num||0)); primeNum(); await resolvePeople(rows.flatMap(t=>[t.assignee,t.createdBy]).filter(Boolean)); scheduleRender(); });
}
function openMsgs(){
  if (S.msgsFor===S.active) return;
  if (unsubMsgs) unsubMsgs(); S.msgs=S.msgCache[S.active]||[]; S.msgsFor=S.active; S.msgLimit=120;
  if (!S.active) return;
  const cid=S.active;
  S._lm=localMessages(cid);
  unsubMsgs = store.sub("channels/"+cid+"/messages", async rows => {
    if (S.msgsFor!==cid) return;
    rows.sort((a,b)=>a.at-b.at);
    await resolvePeople(rows.map(m=>m.by));
    if (!E2E.ready) await initPromise();
    await decryptMany(rows.flatMap(m=>[m.enc, m.penc]));
    if (S.msgsFor!==cid) return;
    S.msgCache[cid]=rows;
    S.msgs=(LOCAL.older[cid]||[]).length? mergeById(LOCAL.older[cid], rows) : rows;
    LOCAL.save("m:"+cid, S.msgs.slice(-5000), 800);
    const ids=new Set(rows.map(r=>r.id)); if (S.pend.some(p=>ids.has(p.id))) S.pend=S.pend.filter(p=>!ids.has(p.id));
    markRead(); scheduleRender();
  });
}
let _initP=null; function initPromise(){ return Promise.race([new Promise(r=>{ const t=setInterval(()=>{ if (E2E.ready){ clearInterval(t); r(); } },50); setTimeout(()=>{ clearInterval(t); r(); },1500); })]); }
function markRead(){ if (!S.active) return; if ((S.nt.unr||[]).includes(S.active)) { S.nt.unr=S.nt.unr.filter(x=>x!==S.active); saveNt(); } const c=S.channels.find(x=>x.id===S.active); const t=(c&&c.last&&c.last.at)||now(); S.lastRead[S.active]=t; ls.set("lastRead", S.lastRead); if (S.inThread || window.innerWidth>860) ackRead(c); }
const unread = c => (c.last && c.last.by!==S.me && c.last.at > (S.lastRead[c.id]||0) && c.id!==S.active) || ((S.nt.unr||[]).includes(c.id) && !(c.id===S.active && S.inThread));

// ---------- actions ----------
async function sendMessage(text){
  text=text.trim(); const vd=S.vdraft && S.vdraft.cid===S.active? S.vdraft : null;
  if ((!text && !vd) || !S.active) return;
  clearTimeout(TYP_STOP); sendAct("stop");
  if (vd && !S.editing) { S.vdraft=null; if (DRAFT_AUDIO) DRAFT_AUDIO.pause(); render(true); sendVoice(vd.blob, vd.dur, vd.peaks, null, {}, text); return; }
  const chn=S.channels.find(c=>c.id===S.active)||{}; const members=chn.members||[S.me];
  if (S.editing) { const id=S.editing; S.editing=null; if (await canSeal(members)) { const {env}=await seal(text, members); await guarded(store.update(`channels/${S.active}/messages/${id}`, {enc:env, text:"", edited:true})); } else await guarded(store.update(`channels/${S.active}/messages/${id}`, {text, edited:true})); render(true); return; }
  const extra={}; if (S.replyTo) extra.replyTo=S.replyTo; if (S.statusReply) { extra.statusQuote=S.statusReply; S.statusReply=null; }
  const ments=(S.pendingMentions||[]).filter(mid=>members.includes(mid) && text.includes("@"+nameOf(mid).replace(/^Example:\s*/,"").split(" ")[0])); S.pendingMentions=[]; if (ments.length) extra.mentions=ments;
  const hadBar=!!S.replyTo || S.asTask; S.replyTo=null; const asTask=S.asTask; S.asTask=false;
  const cid=S.active, id=newMsgId();
  addPending({id, cid, by:S.me, at:now(), text, pending:true, ...extra});
  if (hadBar) render(true);
  if (S.mode==="demo") setTimeout(()=>demoTyping(cid), 900);
  try { const sent=await sendTextTo(cid, text, extra, id); const pm=S.pend.find(p=>p.id===id); if (pm && SB) { pm.pending=false; scheduleRender(); } if (asTask) quickTask([sent]); if (S.mode==="demo") { dropPending(id); setTimeout(()=>{ const c=S.channels.find(x=>x.id===cid); if (c) { const patch={}; (c.members||[]).filter(u=>u!==S.me).forEach(u=>{ patch["r_"+u]=sent.at; patch["d_"+u]=sent.at; }); demo.update("channels/"+cid, patch); } }, 2600); } }
  catch { dropPending(id); const t=$("#composer"); if (t && !t.value) { t.value=text; t.dispatchEvent(new Event("input",{bubbles:true})); } }
}
// Task numbers come from the server. One number is fetched ahead of time, so a new task appears instantly.
const PEND_TASKS=new Map(); let NUM_VAL=null, NUM_BUSY=false;
function primeNum(){ if (NUM_VAL!=null || NUM_BUSY || !(S.mode==="live" && SB)) return; NUM_BUSY=true; nextNum().then(n=>{ NUM_VAL=n; }).catch(()=>{}).finally(()=>{ NUM_BUSY=false; }); }
function takeNum(){ const n=NUM_VAL; NUM_VAL=null; primeNum(); return n; }
const guessNum = () => Math.max(0, ...S.tasks.map(t=>+t.num||0))+1;
function putLocalTask(id, t){ PEND_TASKS.set(id, t); S.tasks=S.tasks.filter(x=>x.id!==id).concat([{id, ...t}]).sort((a,b)=>(a.num||0)-(b.num||0)); }
function dropLocalTask(id){ PEND_TASKS.delete(id); S.tasks=S.tasks.filter(x=>x.id!==id); scheduleRender(); }
// Shows the task right away, then saves it in the background (a number is fetched only if none was ready).
function saveTaskFast(id, fields, after){
  const ready=takeNum();
  const t={...fields, num:ready!=null? ready : guessNum()};
  putLocalTask(id, {id, ...t});
  (async()=>{
    try {
      if (ready==null) { t.num=await guarded(nextNum()); putLocalTask(id, {id, ...t}); scheduleRender(); }
      await guarded(store.set("tasks/"+id, t));
      if (after) after(t);
    } catch { dropLocalTask(id); }
  })();
  return t;
}
async function nextNum(){
  if (S.mode==="live" && SB) { const {data, error}=await SB.rpc("next_task_num"); if (error) throw sbErr(error); return data; }
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
    const {num:_n, ...rest}=d;
    saveTaskFast(id, {...rest, team:(curTeam()||{}).id||"", title:d.title.trim(), createdBy:S.me, at:now(), log:[{at:now(), by:S.me, what:"created"}]}, ()=>{
      for (const f of (d.files||[]).filter(f=>f.kind==="voice" && f.by===S.me)) for (let i=0;i<(f.voice&&f.voice.parts||0);i++) store.update(`voice/${f.voice.id}/parts/${i}`, {task:id}).catch(()=>{});
      if (d.fromMsg && d.channel) guarded(store.update(`channels/${d.channel}/messages/${d.fromMsg}`, {taskId:id})).catch(()=>{});
    });
    if (d.fromMsg && d.channel) S.justTied=d.fromMsg;
    toast("Task created");
  } else {
    const prev = S.tasks.find(t=>t.id===S.openTask)||{};
    const changes=[]; if (prev.status!==d.status) changes.push("moved to "+stName(d.status)); if (prev.assignee!==d.assignee) changes.push(d.assignee? "assigned "+nameOf(d.assignee): "unassigned");
    const log=[...(prev.log||[])]; if (changes.length) log.push({at:now(), by:S.me, what:changes.join(", ")}); else log.push({at:now(), by:S.me, what:"edited"});
    if (prev.thread && d.assignee && d.assignee!==prev.assignee) { const th=S.channels.find(c=>c.id===prev.thread); if (th && !(th.members||[]).includes(d.assignee)) store.update("channels/"+th.id, {members:[...(th.members||[]), d.assignee]}).catch(()=>{}); }
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
// Moving between screens on a phone: the new screen slides in from the right, going back slides it away
// (like iPhone apps). Uses the browser's View Transitions when available, a simple slide otherwise.
function navGo(dir, fn){
  const phone=window.innerWidth<=860, calm=window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!phone || calm) { fn(); return; }
  const root=document.documentElement;
  if (document.startViewTransition) {
    root.dataset.nav=dir;
    try { const t=document.startViewTransition(()=>{ fn(); }); t.finished.finally(()=>{ delete root.dataset.nav; }); } catch { delete root.dataset.nav; fn(); }
    return;
  }
  fn();
  const el=document.querySelector(dir==="fwd"? ".main.chatmain" : ".lines");
  if (el && el.animate) el.animate(dir==="fwd"? [{transform:"translateX(18px)", opacity:0},{transform:"none", opacity:1}] : [{opacity:.4},{opacity:1}], {duration:230, easing:"cubic-bezier(.2,.8,.2,1)"});
}
function selectChannel(id){ const wasIn=S.inThread && S.view==="chats"; S.selecting=false; S.sel=[]; S.active=id; S.inThread=true; S.view="chats"; S.replyTo=null; S.editing=null; S.actFor=null; ls.set("active",id); ls.set("view","chats"); openMsgs(); markRead(); scrollDown=true;
  if (wasIn) { render(); return; }
  // Get this chat's saved messages ready first, so the chat appears once, already filled in.
  const show=()=>navGo("fwd", ()=>render());
  if (S.msgs.length || !S._lm) show(); else Promise.race([S._lm, new Promise(r=>setTimeout(r,160))]).then(show);
}
function goBackToList(){ navGo("back", ()=>{ S.inThread=false; render(); }); }
// Every button gives a small "press" — it dips when touched and springs back when released.
(function pressFeedback(){
  const SEL="button, a, [role=button], label.td2chip, .lineitem, .card, .contact, .srow.pick, .srow.pick1, .apick";
  let cur=null;
  const release=()=>{ if (!cur) return; const el=cur; cur=null; el.classList.remove("tap"); el.classList.add("tapped"); setTimeout(()=>el.classList.remove("tapped"), 320); };
  document.addEventListener("pointerdown", e=>{ if (e.button>0) return; const el=e.target.closest(SEL); if (!el || el.disabled || el.closest(".micbtn, .vbars")) return; release(); cur=el; el.classList.add("tap"); }, true);
  ["pointerup","pointercancel","dragstart"].forEach(t=>document.addEventListener(t, release, true));
  document.addEventListener("pointermove", e=>{ if (cur && (Math.abs(e.movementX)>6 || Math.abs(e.movementY)>6)) release(); }, true);
})();
// iPhone-style swipe from the left edge of a chat to go back to the list.
(function edgeBack(){
  let st=null;
  document.addEventListener("touchstart", e=>{ if (window.innerWidth>860 || !S.inThread || S.view!=="chats" || S.openTask || REC) return; const t=e.touches[0]; if (!t || t.clientX>24) return;
    const main=document.querySelector(".main.chatmain"), list=document.querySelector(".app .lines"); if (!main || !main.contains(e.target)) return;
    st={x:t.clientX, y:t.clientY, main, list, dx:0, on:false}; }, {passive:true});
  document.addEventListener("touchmove", e=>{ if (!st) return; const t=e.touches[0]; const dx=t.clientX-st.x, dy=t.clientY-st.y;
    if (!st.on) { if (Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>8) { st=null; return; } if (dx<8) return; st.on=true; document.querySelector(".app").classList.add("peek"); }
    st.dx=Math.max(0,dx); const w=window.innerWidth;
    st.main.style.transform=`translateX(${st.dx}px)`; st.main.style.boxShadow="-8px 0 24px rgba(0,0,0,.14)";
    if (st.list) { st.list.style.transform=`translateX(${-28+28*st.dx/w}%)`; st.list.style.opacity=String(.75+.25*st.dx/w); }
  }, {passive:true});
  const end=()=>{ if (!st) return; const s=st; st=null; if (!s.on) return; const w=window.innerWidth, go=s.dx>w*.33;
    const ease="transform .24s cubic-bezier(.2,.8,.2,1), opacity .24s";
    s.main.style.transition=ease; if (s.list) s.list.style.transition=ease;
    s.main.style.transform=go? "translateX(100%)" : "none"; if (s.list) { s.list.style.transform=go? "none" : "translateX(-28%)"; s.list.style.opacity=go? "1" : ".75"; }
    setTimeout(()=>{ for (const el of [s.main, s.list]) if (el) { el.style.transition=""; el.style.transform=""; el.style.opacity=""; el.style.boxShadow=""; } document.querySelector(".app").classList.remove("peek"); if (go) { S.inThread=false; render(); } }, 250); };
  document.addEventListener("touchend", end); document.addEventListener("touchcancel", end);
})();
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
async function startRec(cb, opts={}){
  if (typeof cb!=="function") cb=null;
  if (!S.canWrite || REC || (!cb && !S.active)) return;
  // Show the recording screen the moment the mic is pressed; the microphone itself wakes up a split second later.
  REC = {pending:true, t0:now(), levels:[], chunks:[], cancel:false, cb, hold:!!opts.hold, cid:S.active};
  S.recFor = cb? "task" : "chat"; S.rec=true; if (navigator.vibrate) try{ navigator.vibrate(15); }catch{}
  if (REC.hold) holdUI(true); else render(true);
  REC.timer = setInterval(()=>{ const el=$("#recTime"); if (el && REC) el.textContent=fmtDur((now()-REC.t0)/1000); }, 250);
  let stream=null;
  try { if (!navigator.mediaDevices || !window.MediaRecorder) throw 0; stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); }
  catch { clearInterval(REC&&REC.timer); REC=null; S.rec=false; holdUI(false); render(true); openVoiceFallback(cb); return; }
  const early=REC;
  if (!early || early.abort) { stream.getTracks().forEach(t=>t.stop()); return; }
  clearInterval(early.timer);
  const mime = pickMime(); let mr;
  try { mr = new MediaRecorder(stream, mime? {mimeType:mime, audioBitsPerSecond:32000} : {audioBitsPerSecond:32000}); } catch { mr = new MediaRecorder(stream); }
  const ac = audioCtx() || new (window.AudioContext||window.webkitAudioContext)(); try { if (ac.state!=="running") ac.resume(); } catch {} const an = ac.createAnalyser(); an.fftSize=256; const srcNode=ac.createMediaStreamSource(stream); srcNode.connect(an);
  REC = Object.assign(early, {pending:false, mr, stream, ac, an, srcNode});
  mr.ondataavailable = e => { if (e.data && e.data.size) REC.chunks.push(e.data); };
  mr.onstop = async () => {
    const r=REC; REC=null; S.rec=false; holdUI(false); r.stream.getTracks().forEach(t=>t.stop()); try{ r.srcNode.disconnect(); if (r.ac!==AC) r.ac.close(); }catch{}
    clearInterval(r.timer); clearInterval(r.act); cancelAnimationFrame(r.raf); if (!r.cb) sendAct("stop", r.cid);
    if (r.cancel) { render(true); return; }
    const dur=(now()-r.t0)/1000; if (dur<0.6) { render(true); toast("Hold on a little longer to record"); return; }
    const blob = new Blob(r.chunks, {type:(r.mr.mimeType||mime||"audio/webm").split(";")[0]});
    const live=peaksFromLevels(r.levels);
    const flat=Math.max(...live)-Math.min(...live)<.15;
    const peaks=flat? ((await peaksFromBlob(blob)).peaks||live) : live;
    if (r.draft && !r.cb) { S.vdraft={cid:r.cid, blob, dur, peaks, url:URL.createObjectURL(blob)}; render(true); setTimeout(()=>{ const c=$("#composer"); if (c) c.focus(); }); return; }
    render(true);
    (r.cb||sendVoice)(blob, dur, peaks);
  };
  mr.start(250); S.rec=true;
  if (!cb) { sendAct("recording"); REC.act=setInterval(()=>sendAct("recording", REC&&REC.cid), 2500); }
  if (REC.stopAfter) { setTimeout(()=>{ if (REC===early) { try { early.mr.stop(); } catch {} } }, 50); }
  REC.timer = setInterval(()=>{ const el=$("#recTime"); const sec=(now()-REC.t0)/1000; if (el) el.textContent=fmtDur(sec); if (sec>=180) stopRec(false); }, 250);
  const buf=new Uint8Array(an.frequencyBinCount);
  const loop=()=>{ if (!REC) return; an.getByteTimeDomainData(buf); let sq=0; for (const v of buf) { const x=(v-128)/128; sq+=x*x; } const lv=Math.sqrt(sq/buf.length); REC.levels.push(lv);
    if (!REC.bars || !REC.bars.length || !REC.bars[0].isConnected) REC.bars=document.querySelectorAll("#recBars i"); const bars=REC.bars; if (bars.length){ const tail=REC.levels.slice(-bars.length); bars.forEach((b,i)=>b.style.transform=`scaleY(${Math.max(.1,Math.min(1,Math.sqrt(tail[i]||0)*2.2))})`); }
    REC.raf=requestAnimationFrame(loop); };
  loop();
  if (!REC.stopAfter) { if (REC.hold) holdUI(true); else render(true); }
}
// ---- WhatsApp-style voice button: hold to record, release to send, slide left to cancel, slide up to lock ----
let HOLD=null;
function holdUI(on){
  const row=document.querySelector(".crow"); if (!row) return;
  row.classList.toggle("holding", !!on);
  const old=row.querySelector(".holdbar"); if (on && old) return; if (old) old.remove();
  if (on) row.prepend(h("div",{class:"holdbar"}, h("span",{class:"recdot"}), h("span",{class:"rectime mono", id:"recTime"}, "0:00"),
    h("span",{class:"slidecancel", id:"slideCancel"}, svg(IC.back), "Slide to cancel"),
    h("span",{class:"lockhint", id:"lockHint"}, svg(ICF.lock), svg('<path d="M7 14l5-5 5 5"/>'))));
}
function micDown(e){
  if (e.button>0 || REC || HOLD) return;
  e.preventDefault();
  const btn=e.currentTarget, sx=e.clientX, sy=e.clientY, t0=Date.now(); let done=false;
  HOLD={}; try { btn.setPointerCapture(e.pointerId); } catch {}
  btn.classList.add("pressed");
  const started=startRec(null, {hold:true});
  const move=ev=>{ if (done) return; const dx=Math.min(0, ev.clientX-sx), dy=Math.min(0, ev.clientY-sy);
    const sc=$("#slideCancel"); if (sc) { sc.style.transform=`translateX(${dx}px)`; sc.style.opacity=String(Math.max(0, 1+dx/140)); }
    const lk=$("#lockHint"); if (lk) lk.style.transform=`translateY(${Math.max(-40, dy/2)}px)`;
    if (dx<-120) finish("cancel"); else if (dy<-70) finish("lock"); };
  const up=()=>finish(Date.now()-t0<300? "tap" : "send");
  const cancel=()=>finish("cancel");
  function finish(kind){
    if (done) return; done=true; HOLD=null; btn.classList.remove("pressed");
    for (const [t,f] of [["pointermove",move],["pointerup",up],["pointercancel",cancel]]) { btn.removeEventListener(t,f); removeEventListener(t,f); }
    started.then(()=>{
      if (!REC) return;
      if (kind==="lock" || kind==="tap") { REC.hold=false; holdUI(false); if (navigator.vibrate) try { navigator.vibrate(15); } catch {} render(true); }
      else if (kind==="send") stopRec(false);
      else { stopRec(true); if (navigator.vibrate) try { navigator.vibrate([10,40,10]); } catch {} }
    });
  }
  for (const [t,f] of [["pointermove",move],["pointerup",up],["pointercancel",cancel]]) { btn.addEventListener(t,f); addEventListener(t,f); }
}
function stopRec(cancel, draft){ if (!REC) return; REC.cancel=!!cancel; REC.draft=!!draft;
  if (REC.pending) { if (cancel) { REC.abort=true; clearInterval(REC.timer); REC=null; S.rec=false; holdUI(false); render(true); } else REC.stopAfter=true; return; }
  try { REC.mr.stop(); } catch { REC=null; S.rec=false; render(true); } }
// Waveform like WhatsApp: loudness of each slice of the recording (in decibels), so you can see
// where the voice went up and down. 64 values are stored; the bubble draws them as thin bars.
const WAVE_N=64;
function shapePeaks(rms){
  const db=rms.map(r=>20*Math.log10(Math.max(r,1e-5)));
  const top=Math.max(...db), floor=top-36;
  return rms.map((r,i)=>+Math.max(.05, Math.min(1, (db[i]-floor)/(top-floor||1))).toFixed(2));
}
function peaksFromLevels(lv){
  if (!lv.length) return Array(WAVE_N).fill(.2);
  const step=lv.length/WAVE_N, out=[];
  for (let i=0;i<WAVE_N;i++){ const sl=lv.slice(Math.floor(i*step), Math.max(Math.floor(i*step)+1, Math.floor((i+1)*step))); out.push(Math.sqrt(sl.reduce((a,v)=>a+v*v,0)/sl.length)); }
  return shapePeaks(out);
}
async function peaksFromBlob(blob){
  try { const AC=window.AudioContext||window.webkitAudioContext; const ac=new AC(); const buf=await blob.arrayBuffer();
    const ab=await new Promise((res,rej)=>{ const p=ac.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
    const d=ab.getChannelData(0), step=Math.max(1, Math.floor(d.length/WAVE_N)), out=[];
    for (let i=0;i<WAVE_N;i++){ let sum=0, n=0; for (let j=i*step;j<Math.min(d.length,(i+1)*step);j+=8){ sum+=d[j]*d[j]; n++; } out.push(Math.sqrt(sum/Math.max(1,n))); }
    try{ac.close();}catch{} return {peaks:shapePeaks(out), dur:ab.duration}; }
  catch { return {peaks:Array.from({length:WAVE_N},(_, i)=>+(.3+.5*Math.abs(Math.sin(i*1.7))).toFixed(2)), dur:0}; }
}
function blobToB64(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]||""); r.onerror=rej; r.readAsDataURL(blob); }); }
async function sendVoice(blob, dur, peaks, target, vextra={}, caption=""){
  if (!(target||S.active)) return;
  if (blob.size > 3.5*1024*1024) { toast("That recording is too long. Keep voice notes under about 3 minutes."); return; }
  const cid=target||S.active; const vid="v"+now().toString(36)+uidShort().slice(0,4); const mid=newMsgId();
  VOICE_URLS[vid]=URL.createObjectURL(blob);
  const pextra={}; if (S.replyTo && !target) pextra.replyTo=S.replyTo;
  addPending({id:mid, cid, by:S.me, at:now(), kind:"voice", text:caption, voice:{id:vid, parts:0, mime:blob.type||"audio/webm", dur:Math.round(dur*10)/10, peaks}, pending:true, ...pextra, ...vextra});
  try {
    const chv=S.channels.find(c=>c.id===cid)||{}; let venv=null, eiv="", b64;
    if (await canSeal(chv.members||[S.me])) { const sealed=await seal(caption||"", chv.members||[S.me]); venv=sealed.env; const iv=crypto.getRandomValues(new Uint8Array(12)); eiv=b64e(iv); b64=b64e(await crypto.subtle.encrypt({name:"AES-GCM",iv}, sealed.mk, await blob.arrayBuffer())); }
    else b64=await blobToB64(blob);
    const parts=Math.ceil(b64.length/CHUNK);
    for (let i=0;i<parts;i++) await guarded(store.set(`voice/${vid}/parts/${i}`, {d:b64.slice(i*CHUNK,(i+1)*CHUNK), by:S.me, ch:cid}));
    const msg={by:S.me, text: venv? "" : caption, at:now(), kind:"voice", voice:{id:vid, parts, mime:blob.type||"audio/webm", dur:Math.round(dur*10)/10, peaks, eiv}, ...vextra}; if (venv) msg.enc=venv;
    if (S.replyTo && !target) { msg.replyTo=S.replyTo; S.replyTo=null; }
    msg.at=S.pend.find(p=>p.id===mid)?.at||msg.at;
    await guarded(store.set(`channels/${cid}/messages/${mid}`, msg));
    if (S.mode==="demo") dropPending(mid);
    guarded(store.update(`channels/${cid}`, {last: venv? {enc:venv, text:"", kind:"voice", by:S.me, at:msg.at} : {text:caption, kind:"voice", by:S.me, at:msg.at}})).catch(()=>{});
    if (S.asTask && !target) { S.asTask=false; quickTask([{id:mid, ...msg}]); }
    scrollDown=true; scheduleRender();
  } catch(e) { dropPending(mid); if (!e || !e.code) toast("The voice note didn't send. Try again."); }
}
async function voiceUrl(v, env){
  if (VOICE_URLS[v.id]) return VOICE_URLS[v.id];
  if (S.mode==="live") { const dec=await kvGet(LOCAL.key("vd:"+v.id)); if (dec) { const u=b64d(dec); return VOICE_URLS[v.id]=URL.createObjectURL(new Blob([u],{type:v.mime||"audio/webm"})); } }
  let b64=S.mode==="live"? (await kvGet(LOCAL.key("v:"+v.id)))||"" : "";
  if (!b64) for (let i=0;i<v.parts;i++){ const p=await store.get(`voice/${v.id}/parts/${i}`); if (!p) throw new Error("missing"); b64+=p.d; }
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
    const vb=el.querySelector(".vbars"); if (vb) vb.style.setProperty("--p", String(frac));
    el.classList.toggle("playing", !!(me && (!PLAYER.paused || PLAYER.currentTime>0)));
    el.querySelector(".vdur").textContent = fmtDur(me && PLAYER.currentTime>0 ? PLAYER.currentTime : dur);
    const sp=el.querySelector(".vspeed"); if (sp) sp.textContent=(S.speed||1)+"×";
  });
}
PLAYER.addEventListener("timeupdate", ()=>syncPlayer()); PLAYER.addEventListener("pause", ()=>syncPlayer());
PLAYER.addEventListener("ended", ()=>{ playing=null; syncPlayer(); });
function renderVoice(m){
  const v=m.voice; const el=h("div",{class:"voice", "data-mid":m.id, "data-dur":v.dur||0, onclick:e=>e.stopPropagation()});
  el.append(h("button",{class:"vplay", "aria-label":"Play voice note", onclick:()=>togglePlay(m)}, svg(IC.play)));
  // Waveform: always 30 bars so every note looks even; a dot shows where you are.
  const src=v.peaks&&v.peaks.length? v.peaks : Array.from({length:30},(_,i)=>.25+.2*Math.abs(Math.sin(i*1.3)));
  const N=40, pk=Array.from({length:N},(_,i)=>{ const a=Math.floor(i*src.length/N), b=Math.max(a+1, Math.floor((i+1)*src.length/N)); let mx=0; for (let j=a;j<b;j++) mx=Math.max(mx, src[j]||0); return mx; });
  const top=Math.max(.05, ...pk);
  const bars=h("div",{class:"vbars", onclick:e=>{ if (playing!==m.id || !isFinite(PLAYER.duration)) return; const r=e.currentTarget.getBoundingClientRect(); PLAYER.currentTime=PLAYER.duration*Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); }});
  pk.forEach(p=>bars.append(h("i",{style:`height:${Math.round(10+Math.pow(p/top,1.15)*90)}%`})));
  bars.append(h("b",{class:"vknob"}));
  el.append(h("div",{class:"vmid"}, bars, h("div",{class:"vmeta"}, h("span",{class:"vdur"}, fmtDur(v.dur)))));
  // Right side: who recorded it (with a little mic), or the speed button while it plays — like WhatsApp.
  el.append(h("div",{class:"vside"},
    h("span",{class:"vwho"}, avatar(m.by||m.voice.by||"", "vav"), h("span",{class:"vmic"}, svg(ICF.micf||'<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'))),
    h("button",{class:"vspeed", "aria-label":"Playback speed", onclick:()=>{ S.speed = S.speed===1.5?2 : S.speed===2?1 : 1.5; PLAYER.playbackRate=S.speed; syncPlayer(); }}, (S.speed||1)+"×")));
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
// The chat a task came from (group or private chat). A task made inside a task conversation belongs
// to that conversation's main chat, so everything stays under one chat in the list.
const sourceChat = t => { let src=t && S.channels.find(c=>c.id===t.channel); if (src && src.kind==="task" && src.parent) src=S.channels.find(c=>c.id===src.parent)||src; return src||null; };
const groupOf = t => { const src=sourceChat(t); return src && src.kind!=="dm" && src.kind!=="task"? src : null; };
const canThread = t => !!(t && (S.canWrite || (t.thread && S.channels.find(c=>c.id===t.thread))));
const subsOf = cid => S.channels.filter(c=>c.kind==="task" && c.parent===cid);
// Everyone who belongs in a task's conversation: the whole chat it came from, plus whoever it's assigned to.
const taskChatMembers = t => { const src=sourceChat(t); return [...new Set([...(src? src.members||[] : [t.createdBy]), t.assignee, S.me].filter(Boolean))]; };
async function openTaskChat(t){
  const existing = t.thread && S.channels.find(c=>c.id===t.thread);
  const src=sourceChat(t);
  const members=taskChatMembers(t);
  const hide=()=>{ if (window.innerWidth<=860) { S.openTask=null; S.draftTask=null; } if (src) { S.expanded[src.id]=true; ls.set("expanded", S.expanded); } };
  if (existing) {
    const want=[...new Set([...(existing.members||[]), ...members])];
    if (want.length!==(existing.members||[]).length) store.update("channels/"+existing.id, {members:want}).catch(()=>{});
    hide(); selectChannel(existing.id); return;
  }
  if (!S.canWrite) return;
  const id="k"+now().toString(36)+uidShort().slice(0,3);
  await guarded(store.set("channels/"+id, {name:t.title, kind:"task", taskId:t.id, parent:src? src.id : "", members, createdBy:S.me, at:now()}));
  await guarded(store.update("tasks/"+t.id, {thread:id}));
  hide();
  S.active=id; S.view="chats"; S.inThread=true; ls.set("active",id); ls.set("view","chats"); openMsgs(); render();
}

// ---------- shared overlay helper ----------
function overlay(cls, label){ const o=h("div",{class:"overlay "+cls, role:"dialog", "aria-label":label}); document.body.append(o); return o; }
// Rebuilds a screen while you type in it, without replacing the box you're typing in
// (replacing it closes the phone keyboard).
function swapKids(parent, kids){
  kids=[kids].flat(Infinity).filter(k=>k!=null && k!=="" && k!==false).map(k=>typeof k==="string"? document.createTextNode(k) : k);
  const a=document.activeElement, id=a && a.id;
  if (!id || !parent.contains(a) || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) { parent.replaceChildren(...kids); return; }
  const holder=document.createElement("div"); holder.append(...kids);
  const nk=holder.querySelector("#"+CSS.escape(id));
  if (!nk) { parent.replaceChildren(...holder.childNodes); return; }
  (function place(oldP, newP){
    let to=a; while (to.parentNode!==oldP) to=to.parentNode;
    let tn=nk; while (tn.parentNode!==newP) tn=tn.parentNode;
    if (to!==a) {
      if (to.tagName!==tn.tagName) { oldP.replaceChildren(...newP.childNodes); const n2=oldP.querySelector("#"+CSS.escape(id)); if (n2) { n2.focus(); } return; }
      for (const at of [...to.attributes]) if (!tn.hasAttribute(at.name)) to.removeAttribute(at.name);
      for (const at of [...tn.attributes]) if (to.getAttribute(at.name)!==at.value) to.setAttribute(at.name, at.value);
      place(to, tn);
    } else {
      for (const at of ["placeholder","class","aria-label"]) { const v=tn.getAttribute(at); if (v!=null && a.getAttribute(at)!==v) a.setAttribute(at, v); }
    }
    const nks=[...newP.childNodes], i=nks.indexOf(tn);
    [...oldP.childNodes].forEach(n=>{ if (n!==to) n.remove(); });
    nks.slice(0,i).forEach(n=>oldP.insertBefore(n, to));
    let after=to; nks.slice(i+1).forEach(n=>{ after.after(n); after=n; });
  })(parent, holder);
}
// Long lists (phone contacts) show 150 rows first and add more as you scroll down.
function lazyRows(items, rowFn, step=150){
  const box=document.createDocumentFragment(); let shown=0;
  const more=h("div",{class:"lazymore", "aria-hidden":"true"});
  const add=()=>{ const next=items.slice(shown, shown+step); shown+=next.length; more.before(...next.map(rowFn)); if (shown>=items.length) { more.remove(); io && io.disconnect(); } };
  const io = items.length>step && "IntersectionObserver" in window ? new IntersectionObserver(es=>{ if (es.some(e=>e.isIntersecting)) add(); }, {rootMargin:"600px"}) : null;
  box.append(more); const first=items.slice(0,step); shown=first.length; more.before(...first.map(rowFn));
  if (shown>=items.length) more.remove(); else if (io) io.observe(more); else { while (shown<items.length) add(); }
  return box;
}
// Wraps lazy rows in a container element (needed where the list sits inside another element).
const lazyList = (cls, items, rowFn) => { const d=h("div",{class:cls}); d.append(lazyRows(items, rowFn)); return d; };

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
const callUrl = c => `https://meet.jit.si/Concept-${c.room}#config.prejoinConfig.enabled=false&config.startWithVideoMuted=${c.kind!=="video"}&userInfo.displayName=%22${encodeURIComponent(nameOf(S.me)==="You"? ((S.people[S.me]||{}).name||"Task Message user") : nameOf(S.me))}%22`;
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
      h("div",{class:"cs-top"}, h("span",{class:"cs-kind"}, svg(call.kind==="video"? IC.video : IC.phone), call.kind==="video"? "Task Message video call":"Task Message voice call")),
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
    h("div",{class:"cs-mid"}, h("div",{class:"cs-av pulse"}, avatar(caller,"xl")), h("b",{class:"cs-name"}, nameOf(caller).replace(/^Example:\s*/,"")), h("span",{class:"cs-st"}, call.title? "Calling "+call.title : "Task Message call")),
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
      c.title? monogram(c.title, "glyph") : avatar(peer,"lg"),
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
  if (DB) { store.sub("data/users/"+S.me, rows=>{ const d=rows.find(r=>r.id==="prefs")||{}; S.pins=d.pins||[]; S.blocked=d.blocked||[]; setStages(d.stages); S.nt={tone:d.tone||"note", groupTone:d.groupTone||"chime", tones:d.tones||{}, mute:d.mute||{}, cleared:d.cleared||{}, unr:d.unr||[]}; scheduleRender(); }); }
  else { S.pins = ls.get("pins", ["launch"]); S.blocked=ls.get("blocked", []); setStages(ls.get("stages", null)); }
}
async function togglePin(cid){
  let pins=[...S.pins];
  if (pins.includes(cid)) pins=pins.filter(x=>x!==cid); else { if (pins.length>=5) { toast("You can pin up to 5 chats."); return; } pins.unshift(cid); }
  S.pins=pins; render(); toast(pins.includes(cid)? "Chat pinned" : "Chat unpinned");
  savePrefsDoc();
}
function rowMenu(c, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }, oncontextmenu:e=>{ e.preventDefault(); scrim.remove(); }});
  const pinned=S.pins.includes(c.id), ur=unread(c), mu=isMuted(c), isTop=!(c.kind==="task" && c.parent);
  const go=fn=>()=>{ scrim.remove(); fn(); };
  const m=h("div",{class:"popmenu", role:"menu", style:`left:${Math.min(x, innerWidth-230)}px;top:${Math.min(y, innerHeight-250)}px`},
    isTop? h("button",{role:"menuitem", onclick:go(()=>togglePin(c.id))}, svg(IC.pin), pinned? "Unpin chat":"Pin chat") : "",
    h("button",{role:"menuitem", onclick:go(()=>toggleUnread(c))}, svg(ur? ICF.check : ICF.dotchat), ur? "Mark as read" : "Mark as unread"),
    h("button",{role:"menuitem", onclick:go(()=>mu? setMute(c.id, null) : openMute(c))}, svg(mu? ICF.bell : ICF.bellx), mu? "Unmute" : "Mute"),
    h("button",{role:"menuitem", onclick:go(()=>openChatNotif(c))}, svg(ICF.music), "Notification tone"),
    h("button",{role:"menuitem", class:"dangerrow", onclick:go(()=>confirmDeleteChat(c))}, svg(IC.trash), "Delete chat"));
  scrim.append(m); document.body.append(scrim);
}
function longPress(el, fn){ let t, sx=0, sy=0; const stop=()=>clearTimeout(t); el.addEventListener("pointerdown", e=>{ if (e.pointerType!=="touch") return; sx=e.clientX; sy=e.clientY; t=setTimeout(()=>{ if (SW.drag) return; el.dataset.lp="1"; fn(e.clientX, e.clientY); }, 520); }); el.addEventListener("pointermove", e=>{ if (Math.abs(e.clientX-sx)>8 || Math.abs(e.clientY-sy)>8) stop(); }); ["pointerup","pointerleave","pointercancel"].forEach(ev=>el.addEventListener(ev, stop)); el.addEventListener("contextmenu", e=>{ e.preventDefault(); fn(e.clientX, e.clientY); }); el.addEventListener("click", e=>{ if (el.dataset.lp) { e.stopImmediatePropagation(); e.preventDefault(); delete el.dataset.lp; } }, true); }

function renderSettings(){
  const w=h("section",{class:"teamwrap settings","aria-label":"Settings"});
  w.append(h("div",{class:"toprow"}, h("h1",{class:"h1"},"Settings"), h("span",{class:"grow"})));
  const me=S.teamDocs[S.me]||{}; const p=S.prefs;
  const group=(label, ...rows)=>[h("div",{class:"seg-label"},label), h("div",{class:"ulist sgroup"}, rows)];
  const row=(icon, title, control, sub)=>h("div",{class:"srow"}, h("span",{class:"sic"}, svg(icon)), h("span",{class:"stx"}, h("b",{},title), sub? h("span",{},sub):""), control||"");
  const toggle=(k, def)=>{ const on = p[k]===undefined? def : !!p[k]; return h("button",{class:"switch"+(on?" on":""), role:"switch", "aria-checked":String(on), "aria-label":k, onclick:()=>setPref(k,!on)}, h("i")); };
  w.append(h("button",{class:"profcard", onclick:openEditProfile, "aria-label":"Edit profile"}, avatar(S.me,"xl"), h("div",{class:"pcx"}, h("b",{}, (me.name||(S.people[S.me]||{}).name||"You").replace(/^Example:\s*/,"")), h("span",{}, myProf().about||me.about||me.phone||"Tap to add a photo and About")), h("span",{class:"pcedit"}, svg(ICF.edit||IC.edit))));
  w.append(...group("Profile",
    S.mode==="live"? row(ICF.personplus, "Name", h("input",{class:"sinp", id:"s-name", maxlength:"40", value:me.name||"", onchange:e=>{ const v=e.target.value.trim(); if (v) guarded(store.update("team/"+S.me,{name:v})).then(()=>toast("Saved")).catch(()=>{}); }})) : "",
    row(ICF.info, "About", h("input",{class:"sinp", id:"s-about", maxlength:"120", placeholder:"Available", value:myProf().about||me.about||"", onchange:e=>S.canWrite&&saveProfileField("about", e.target.value.trim()).then(()=>toast("Saved")).catch(()=>{})})),
    row(IC.phone, "Phone number", h("input",{class:"sinp", id:"s-phone", type:"tel", placeholder:"Add number", value:me.phone||"", onchange:e=>S.canWrite&&savePhone(e.target.value)})),
    row(ICF.book, "Phone contacts", h("button",{class:"iconbtn", title:"Import contacts", "aria-label":"Import contacts", onclick:importContacts}, svg(IC.arrow)), S.addr.length? `${S.addr.length} · ${S.onConcept.length} on Task Message` : "")));
  const visRow=(icon, title, f)=>h("button",{class:"srow pick", onclick:()=>openVisPicker(f, title)}, h("span",{class:"sic"}, svg(icon)), h("span",{class:"stx"}, h("b",{},title)), h("span",{class:"sval"}, visName((myProf().vis||{})[f])), svg(IC.arrow));
  w.append(...group("Privacy",
    visRow(ICF.image, "Profile photo", "photo"),
    visRow(ICF.info, "About", "about"),
    row(TICK2, "Read receipts", toggle("readReceipts", true), "If you turn this off, you won't send or see blue ticks"),
    row(ICF.lock, "End-to-end encryption", h("span",{class:"sval mono", id:"fp"}, E2E.ready? "On" : "Off"))));
  fingerprint().then(f=>{ const el=$("#fp"); if (el && f) el.textContent=f; });
  appUsage().then(b=>{ const el=$("#s-store"); if (el && b) el.textContent=fmtSize(b); });
  w.append(...group("Appearance",
    row(ICF.moon, "Theme", h("div",{class:"segmini", role:"group", "aria-label":"Theme"}, [["system","Auto"],["light","Light"],["dark","Dark"]].map(([v,l])=>h("button",{"aria-pressed":String((p.theme||"system")===v), onclick:()=>setPref("theme",v)}, l)))),
    row(ICF.drop, "Accent color", h("div",{class:"swatches"}, ACCENTS.map(([n,c])=>h("button",{class:"sw"+((p.accent||"#0A6CFF")===c?" on":""), style:`--sw:${c}`, title:n, "aria-label":n+" accent", onclick:()=>setPref("accent", c==="#0A6CFF"? "" : c)}))))));
  w.append(...group("Chats",
    row(ICF.image, "Chat wallpaper", h("button",{class:"iconbtn", title:"Change wallpaper", "aria-label":"Change wallpaper", onclick:openWallpaper}, svg(IC.arrow)), wpMode()==="photo"? "Your photo" : wpMode()==="plain"? "Plain" : "Tools"),
    h("button",{class:"srow pick", onclick:openBackup}, h("span",{class:"sic"}, svg(ICF.lock)), h("span",{class:"stx"}, h("b",{},"Chat backup"), h("span",{}, "iCloud Drive or Google Drive")), h("span",{class:"sval"}, (S.prefs.backup||{}).last? fmtShort(S.prefs.backup.last) : "Never"), svg(IC.arrow)),
    h("button",{class:"srow pick", onclick:openStorage}, h("span",{class:"sic", style:"background:#34C759"}, svg(STORAGE_IC)), h("span",{class:"stx"}, h("b",{},"Storage and data"), h("span",{}, "Manage what's saved on this phone")), h("span",{class:"sval", id:"s-store"}, ""), svg(IC.arrow)),
    row(IC.send, "Enter key sends", toggle("enterSends", true)),
    row(IC.knot, "Swipe left to make task", h("div",{class:"segmini", role:"group", "aria-label":"Swipe left"}, [["open","Open task"],["silent","Just add"]].map(([v,l])=>h("button",{"aria-pressed":String((p.swipeTask||"open")===v), onclick:()=>setPref("swipeTask",v)}, l)))),
    row(IC.pin, "Pinned chats", h("span",{class:"sval"}, S.pins.length+"/5"))));
  const nMuted=S.channels.filter(c=>mutedId(c.id)).length, nCustom=Object.keys(S.nt.tones||{}).length;
  const pickRow=(icon, title, val, fn, sub)=>h("button",{class:"srow pick", onclick:fn}, h("span",{class:"sic"}, svg(icon)), h("span",{class:"stx"}, h("b",{},title), sub? h("span",{},sub):""), h("span",{class:"sval"}, val), svg(IC.arrow));
  w.append(...group("Notifications",
    NATIVE? row(ICF.bell, "Notifications", h("span",{class:"sval"}, S.pushState==="on"? "On" : S.pushState==="off"? "Off" : "…"), S.pushState==="off"? "Turn on in your phone's Settings → Task Message" : "") : "",
    pickRow(ICF.music, "Message tone", toneName(S.nt.tone), ()=>openTonePicker({title:"Message tone", value:S.nt.tone, onPick:v=>{ S.nt.tone=v; saveNt(); render(); }}), "Private chats"),
    pickRow(ICF.music, "Group tone", toneName(S.nt.groupTone), ()=>openTonePicker({title:"Group tone", value:S.nt.groupTone, onPick:v=>{ S.nt.groupTone=v; saveNt(); render(); }}), "Groups and task conversations"),
    row(ICF.speaker, "In-app sounds", toggle("inAppSound", true), "Play the tone while Task Message is open"),
    row(ICF.banner, "In-app banners", toggle("inAppBanner", true)),
    row(ICF.vib, "Vibrate", toggle("vibrate", true)),
    nMuted||nCustom? pickRow(ICF.bellx, "Muted & custom chats", (nMuted? nMuted+" muted":"")+(nMuted&&nCustom?" · ":"")+(nCustom? nCustom+" custom":""), resetNotif, "Tap to reset all") : ""));
  const tm=curTeam();
  w.append(...group("Team",
    row(ICF.all, tm? tm.name : "Team", h("button",{class:"iconbtn", title:"Open team", "aria-label":"Open team", onclick:()=>{ S.view="team"; ls.set("view","team"); render(); }}, svg(IC.arrow))),
    tm && tm.owner===S.me? row(ICF.gear, "Team settings", h("button",{class:"iconbtn", title:"Team settings", "aria-label":"Team settings", onclick:openTeamSettings}, svg(IC.arrow))) : "",
    row(ICF.stage, "Task stages", h("span",{class:"sval"}, STATUSES.length))));
  w.append(...group("Help",
    row(ICF.block, "Blocked contacts", h("span",{class:"sval"}, String((S.blocked||[]).length)), (S.blocked||[]).map(id=>nameOf(id).replace(/^Example:\s*/,"")).join(", ")),
    h("a",{class:"srow", href:siteLink("privacy.html"), target:"_blank", rel:"noopener"}, h("span",{class:"sic"}, svg(ICF.lock)), h("span",{class:"stx"}, h("b",{},"Privacy Policy")), svg(IC.arrow)),
    h("a",{class:"srow", href:siteLink("terms.html"), target:"_blank", rel:"noopener"}, h("span",{class:"sic"}, svg(ICF.doc)), h("span",{class:"stx"}, h("b",{},"Terms of Service")), svg(IC.arrow))));
  w.append(h("div",{class:"ulist sgroup", style:"margin-top:18px"},
    S.mode==="live"? h("button",{class:"srow signout", onclick:signOut}, h("span",{class:"stx"}, h("b",{},"Log out"))) : "",
    h("button",{class:"srow signout", onclick:openDeleteAccount}, h("span",{class:"stx"}, h("b",{},"Delete my account")))));
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
      h("button",{class:"ib","aria-label":"Voice call in Task Message", title:"Task Message voice call", onclick:()=>{ scrim.remove(); callPerson(id,"voice"); }}, svg(IC.phone)),
      h("button",{class:"ib","aria-label":"Video call in Task Message", title:"Task Message video call", onclick:()=>{ scrim.remove(); callPerson(id,"video"); }}, svg(IC.video)),
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
  const n=S.nt; const doc={pins:S.pins, blocked:S.blocked||[], stages:STATUSES.map(s=>({id:s.id,name:s.name,c:s.c})), tone:n.tone, groupTone:n.groupTone, tones:n.tones||{}, mute:n.mute||{}, cleared:n.cleared||{}, unr:n.unr||[]};
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
    STATUSES.map(s=>h("button",{class:"stpick"+(stOf(t)===s.id?" on":""), onclick:()=>{ scrim.remove(); moveTask(t.id, s.id); }}, h("span",{class:"sdot2", style:`--c:${s.c}`}), h("span",{class:"stn"}, s.name), stOf(t)===s.id? svg(ICF.check):""))));
  document.body.append(scrim);
}

// ---------- contacts ----------
const mutual = id => S.contacts.includes(id) && (S.allContacts[id]||[]).includes(S.me);
async function setContact(id, on){
  const ids = on? [...new Set([...S.contacts, id])] : S.contacts.filter(x=>x!==id);
  S.contacts=ids; S.allContacts[S.me]=ids; render();
  try { await guarded(store.set("contacts/"+S.me, {ids})); toast(on? "Contact saved" : "Contact removed"); } catch {}
}
// Tasks can only be assigned to people who share a team with you (the task's team if it has one).
const peopleForTasks = (task) => { const tid=task&&task.team; const ts=myTeams().filter(t=>!tid || t.id===tid); return [...new Set([S.me, ...ts.flatMap(t=>t.members||[])])].filter(Boolean); };

// ---------- messages → tasks ----------
const msgText = m => { if (!m.kind) return shown(m); const p=m.kind==="media"? plainP(m) : null; const items=(p&&p.items)||[]; const lab=m.kind==="voice"? "🎤 Voice note ("+fmtDur(m.voice&&m.voice.dur)+")" : richLabel(m.kind, (items[0]||{}).t, items.length); const cap=plain(m); return cap? lab+" · "+cap : lab; };
async function quickTask(msgs, opts={}){
  msgs=(msgs||[]).filter(m=>m && !m.deleted); if (!msgs.length || !S.canWrite) return;
  const cid=S.active; const first=msgText(msgs[0]).split("\n")[0].trim();
  const title = (first || (msgs.length+" messages")).slice(0,90);
  const notes = msgs.length>1? msgs.map(m=>nameOf(m.by).replace(/^Example:\s*/,"")+": "+msgText(m)).join("\n") : (msgText(msgs[0]).length>first.length? msgText(msgs[0]) : "");
  const id="t"+now().toString(36)+uidShort().slice(0,3);
  try {
    saveTaskFast(id, {title, notes, status:STATUSES[0].id, assignee:"", due:"", priority:"normal", channel:cid, fromMsg:msgs[0].id, fromMsgs:msgs.map(m=>m.id), fromText:msgs.map(msgText).join("\n"), fromBy:msgs[0].by, team:(curTeam()||{}).id||"", createdBy:S.me, at:now(), subtasks:[], log:[{at:now(), by:S.me, what:"created from "+(msgs.length>1? msgs.length+" messages":"a message")}]}, ()=>{
      for (const m of msgs) store.update(`channels/${cid}/messages/${m.id}`, {taskId:id}).catch(()=>{});
      copyVoiceToTask(id, msgs);
    });
    for (const m of msgs) { const x=(S.msgs||[]).find(y=>y.id===m.id); if (x) x.taskId=id; }
    S.justTied=msgs[0].id; S.actFor=null; S.selecting=false; S.sel=[]; render(true);
    if (opts.open) openTask(id); else if (!opts.silent) toast("Added to "+STATUSES[0].name, {label:"Open", fn:()=>openTask(id)});
    return id;
  } catch {}
}
// A voice note turned into a task gets its own copy inside the task, so it keeps playing there
// even after the chat copy is cleared from the server, and for teammates who aren't in that chat.
async function copyVoiceToTask(taskId, msgs){
  const files=[];
  for (const m of msgs.filter(m=>m.kind==="voice" && m.voice)) {
    try {
      const blob=await (await fetch(await voiceUrl(m.voice, m.enc))).blob();
      const vid="v"+now().toString(36)+uidShort().slice(0,4); const b64=await blobToB64(blob); const parts=Math.ceil(b64.length/CHUNK);
      for (let i=0;i<parts;i++) await store.set(`voice/${vid}/parts/${i}`, {d:b64.slice(i*CHUNK,(i+1)*CHUNK), by:S.me, task:taskId});
      VOICE_URLS[vid]=URL.createObjectURL(blob);
      files.push({id:vid, kind:"voice", by:m.by, at:m.at, fromMsg:m.id, voice:{id:vid, parts, mime:blob.type||m.voice.mime||"audio/webm", dur:m.voice.dur, peaks:m.voice.peaks}});
    } catch {}
  }
  if (!files.length) return;
  const t=S.tasks.find(x=>x.id===taskId)||{}; const all=[...files, ...(t.files||[])];
  await store.update("tasks/"+taskId, {files:all}).catch(()=>{});
  if (S.openTask===taskId && S.draftTask) { S.draftTask.files=[...files, ...(S.draftTask.files||[]).filter(f=>!files.some(x=>x.id===f.id))]; render(true); }
}
function toggleSel(id){ S.sel = S.sel.includes(id)? S.sel.filter(x=>x!==id) : [...S.sel, id]; if (!S.sel.length) S.selecting=false; render(true); }

// ---------- end-to-end encryption (keys never leave this device) ----------
const E2E={ready:false, dev:null, priv:null, pub:null, sk:new Map(), privs:new Map()};
const b64e = buf => { let s=""; const u=new Uint8Array(buf); for (let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
const b64d = s => { const b=atob(s); const u=new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; };
const TE=new TextEncoder(), TD=new TextDecoder();
const DEC=new Map();
// One encryption key per account, shared by all of the person's phones and computers (like WhatsApp
// moving your chats to a new phone). The key is kept in a private record only that person can read.
// Keys that older installs used are kept too, so messages sent to them still open everywhere.
const KR_PATH = () => "data/users/"+S.me+"/keyring";
async function newKeyRec(){ const kp=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]); return {dev:"d"+uidShort().slice(0,6), priv:await crypto.subtle.exportKey("jwk",kp.privateKey), pub:await crypto.subtle.exportKey("jwk",kp.publicKey)}; }
const importPriv = jwk => crypto.subtle.importKey("jwk", jwk, {name:"ECDH",namedCurve:"P-256"}, false, ["deriveKey"]);
async function initE2E(){
  if (!window.crypto || !crypto.subtle || !S.me) return;
  try {
    const local=ls.get("e2e:"+S.me,null);
    let ring=null, ringOk=true, dirty=false;
    try { ring=await store.get(KR_PATH()); } catch { ringOk=false; }
    if (!ring || !ring.primary || !ring.primary.priv) {
      ring={primary:(local&&local.priv)? local : await newKeyRec(), old:{}};
      dirty=ringOk; // first device for this account: save the key for the person's other devices
    } else {
      ring={primary:ring.primary, old:{...(ring.old||{})}};
      if (local && local.priv && local.dev!==ring.primary.dev && !ring.old[local.dev]) { ring.old[local.dev]=local.priv; dirty=true; }
      for (const [d,p] of Object.entries(ls.get("e2eOld:"+S.me,{})||{})) if (d!==ring.primary.dev && !ring.old[d]) { ring.old[d]=p; dirty=true; }
    }
    if (dirty && S.mode==="live") {
      await store.set(KR_PATH(), ring);
      // Two devices could set this up at the same moment: keep whichever was saved first.
      const back=await store.get(KR_PATH()).catch(()=>null);
      if (back && back.primary && back.primary.dev!==ring.primary.dev) { const mine=ring.primary; ring={primary:back.primary, old:{...(back.old||{}), [mine.dev]:mine.priv}}; await store.set(KR_PATH(), ring).catch(()=>{}); }
    }
    const old={...(ring.old||{})}; if (local && local.priv && local.dev!==ring.primary.dev) old[local.dev]=local.priv;
    ls.set("e2eOld:"+S.me, old); ls.set("e2e:"+S.me, ring.primary);
    E2E.dev=ring.primary.dev; E2E.pub={kty:"EC", crv:"P-256", x:ring.primary.pub.x, y:ring.primary.pub.y};
    E2E.priv=await importPriv(ring.primary.priv);
    E2E.privs=new Map([[E2E.dev, E2E.priv]]);
    for (const [d,p] of Object.entries(old)) { try { E2E.privs.set(d, await importPriv(p)); } catch {} }
    E2E.ready=true; DEC.forEach((v,k)=>{ if (v===false) DEC.delete(k); }); // retry anything that failed before
    if (ringOk && S.mode==="live") {
      const cur=await store.get("keys/"+S.me).catch(()=>null); const devices=(cur&&cur.devices)||{};
      if (Object.keys(devices).length!==1 || !devices[E2E.dev] || devices[E2E.dev].x!==E2E.pub.x) await store.set("keys/"+S.me,{devices:{[E2E.dev]:{...E2E.pub, at:now()}}}).catch(()=>{});
    }
    S.keys[S.me]={[E2E.dev]:E2E.pub};
  } catch { E2E.ready=false; }
}
// Sets up encryption, tries again if the connection wasn't ready, then re-opens anything that was locked.
async function startE2E(tries=0){
  await initE2E();
  if (!E2E.ready && tries<5) { setTimeout(()=>startE2E(tries+1), 4000*(tries+1)); return; }
  if (E2E.ready) { await decryptMany([...S.channels.map(c=>c.last&&c.last.enc), ...(S.msgs||[]).flatMap(m=>[m.enc, m.penc])]); }
  render();
}
async function sharedKey(j, priv){
  priv=priv||E2E.priv;
  const k=j.x+"."+j.y+(priv===E2E.priv? "" : "#"+[...E2E.privs.entries()].find(e=>e[1]===priv)?.[0]); if (E2E.sk.has(k)) return E2E.sk.get(k);
  const p=(async()=>{ const pub=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:j.x,y:j.y},{name:"ECDH",namedCurve:"P-256"},false,[]); return crypto.subtle.deriveKey({name:"ECDH",public:pub},priv,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]); })();
  E2E.sk.set(k,p); return p;
}
// Encrypt only when every member can open it; otherwise the message is sent without the extra lock
// (it's still private to the chat) so nobody ever gets a message they can't read.
async function canSeal(members){ if (!E2E.ready) return false; try { return !(await ensureKeys(members||[])).length; } catch { return false; } }
// Before encrypting, make sure every member's key is known; ask the server for any that are missing.
const KEY_MISS={};
async function ensureKeys(members){
  const need=[...new Set(members)].filter(u=>u && u!==S.me && !Object.keys(S.keys[u]||{}).length && !(KEY_MISS[u] && Date.now()-KEY_MISS[u]<60000));
  await Promise.all(need.map(async u=>{ try { const d=await store.get("keys/"+u); if (d && d.devices) { S.keys[u]=d.devices; delete KEY_MISS[u]; } else KEY_MISS[u]=Date.now(); } catch { KEY_MISS[u]=Date.now(); } }));
  return [...new Set(members)].filter(u=>u && u!==S.me && !Object.keys(S.keys[u]||{}).length);
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
  if (!E2E.ready) throw new Error("nokey");
  const mine=(env.keys||[]).filter(k=>k.u===S.me && E2E.privs.has(k.d)).sort((a,b)=>(b.d===E2E.dev)-(a.d===E2E.dev));
  let raw=null;
  for (const e of mine) { try { raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64d(e.iv)}, await sharedKey(env.pk, E2E.privs.get(e.d)), b64d(e.k)); break; } catch {} }
  if (!raw) throw new Error("nokey");
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
function loadAddr(){ S.addr = ls.get("addr:"+S.me, []); S.matchByKey=ls.get("match:"+S.me, {}); matchAddr(); findOnApp(); }
// Ask the server which of the numbers already in your phone use the app. Nobody can browse other users.
let MATCH_T=0;
function findOnApp(){ clearTimeout(MATCH_T); MATCH_T=setTimeout(async()=>{
  if (!SB || S.mode!=="live" || !(S.addr||[]).length) return;
  const keys=[...new Set(S.addr.flatMap(c=>(c.p||[]).map(phoneKey)).filter(k=>k.length>=7))].slice(0,3000);
  try { const {data, error}=await SB.rpc("match_contacts", {p_keys:keys}); if (error) return;
    S.matchByKey=Object.fromEntries((data||[]).map(r=>[r.k, r.id])); ls.set("match:"+S.me, S.matchByKey); matchAddr(); scheduleRender(); } catch {}
}, 400); }
async function lookupPhone(phone){
  const k=phoneKey(phone); if (k.length<7) return null;
  if (S.matchByKey && S.matchByKey[k]) return S.matchByKey[k];
  if (!SB || S.mode!=="live") return null;
  try { const {data}=await SB.rpc("match_contacts", {p_keys:[k]}); return (data&&data[0]&&data[0].id)||null; } catch { return null; }
}
// Profiles you're newly allowed to see (a contact who uses the app) are fetched once.
const PROF_ASKED=new Set();
async function loadProfiles(ids){
  const need=ids.filter(id=>id && !S.teamDocs[id] && !PROF_ASKED.has(id)); if (!need.length) return;
  need.forEach(id=>PROF_ASKED.add(id));
  for (const id of need) { try { const d=await store.get("team/"+id); if (!d) continue; S.teamDocs[id]={id, ...d}; if (!S.team.includes(id)) S.team.push(id); S.people[id]={id, name:d.name||d.phone||"Someone", avatarUrl:d.photo||"", color:colorFor(id)}; } catch {} }
  scheduleRender();
}
function matchAddr(){
  const byKey={...(S.matchByKey||{})}; for (const id of S.team) { const ph=(S.teamDocs[id]||{}).phone; if (ph && phoneKey(ph).length>=7) byKey[phoneKey(ph)]=id; }
  const names={}, matched=new Set();
  for (const c of S.addr||[]) for (const p of c.p||[]) { const id=byKey[phoneKey(p)]; if (id && id!==S.me) { names[id]=c.n; matched.add(id); c.on=id; } }
  S.addrNames=names; S.onConcept=[...matched];
  const missing=S.onConcept.filter(id=>!S.contacts.includes(id));
  if (missing.length && S.canWrite && S.mode==="live") { S.contacts=[...new Set([...S.contacts, ...missing])]; store.set("contacts/"+S.me,{ids:S.contacts}).then(()=>loadProfiles(missing)).catch(()=>{}); }
  const unknown=S.onConcept.filter(id=>!S.teamDocs[id]); if (unknown.length && S.mode==="live") loadProfiles(unknown);
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
  S.addr=merged.sort((a,b)=>a.n.localeCompare(b.n)); ls.set("addr:"+S.me, S.addr); matchAddr(); findOnApp(); render();
  toast(`${clean.length} contacts · ${S.onConcept.length} on Task Message`);
}
async function importContacts(){
  if (NATIVE && await nativeContacts()) return;
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
  return h("div",{class:"contact"}, monogram(c.n, "glyph g44"),
    h("span",{class:"ctx"}, h("b",{}, c.n), h("span",{}, ph)),
    h("a",{class:"invbtn", href:"sms:"+normPhone(ph)+"?&body="+encodeURIComponent("Join me on Task Message"), title:"Invite", "aria-label":"Invite "+c.n}, "Invite"));
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
  return h("div",{class:"drow"}, m.id? avatar(m.id) : monogram(m.n, "glyph g32"),
    h("span",{class:"ctx"}, h("b",{}, m.n), h("span",{}, m.ph||"")),
    m.id && S.canWrite? h("button",{class:"ib", title:"Task Message voice call", "aria-label":"Voice call "+m.n, onclick:()=>callPerson(m.id,"voice")}, svg(IC.phone)) : "",
    m.id && S.canWrite? h("button",{class:"ib", title:"Task Message video call", "aria-label":"Video call "+m.n, onclick:()=>callPerson(m.id,"video")}, svg(IC.video)) : "",
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
// Swipe right = reply. Swipe left = slide the bubble over and show Forward / Task buttons (like the chat list).
// Touch events on phones (most reliable on iPhone), mouse/pen through pointer events.
let OPEN_MSG=null;
function closeMsgActions(){ if (!OPEN_MSG) return; const el=OPEN_MSG; OPEN_MSG=null; el.classList.remove("mopen"); el.style.setProperty("--sx","0px"); }
document.addEventListener("touchstart", e=>{ if (OPEN_MSG && !OPEN_MSG.contains(e.target)) closeMsgActions(); }, {passive:true, capture:true});
document.addEventListener("pointerdown", e=>{ if (OPEN_MSG && e.pointerType!=="touch" && !OPEN_MSG.contains(e.target)) closeMsgActions(); }, true);
const MOPEN=-132;
function attachGestures(el, strip, m){
  if (m.deleted) return;
  const canAct = !m.pending && S.canWrite && plain(m)!==false;
  if (canAct) (strip.parentElement||el).append(h("div",{class:"macts", "aria-hidden":"true"},
    h("button",{class:"mact", tabindex:"-1", onclick:e=>{ e.stopPropagation(); closeMsgActions(); forwardMenu(m); }}, h("span",{class:"maci"}, svg(ICF.fwd)), "Forward"),
    h("button",{class:"mact task", tabindex:"-1", onclick:e=>{ e.stopPropagation(); closeMsgActions(); swipeTask(m); }}, h("span",{class:"maci"}, svg(IC.knot)), m.taskId? "Open task" : "Task")));
  let x0=0,y0=0,dx=0,base=0,active=false,decided=false,horiz=false,lp=null,endedAt=0;
  const set=v=>{ el.style.setProperty("--sx", v+"px"); el.classList.toggle("swr", v>56); el.classList.toggle("swl", v<-40); el.style.setProperty("--mp", String(Math.min(1, Math.max(0, -v/ -MOPEN)))); };
  const start=(x,y,target)=>{ if (S.selecting || target.closest("button,a,.vbars,input,.macts")) return false;
    x0=x; y0=y; dx=0; base=OPEN_MSG===el? MOPEN : 0; active=true; decided=false; horiz=false;
    clearTimeout(lp); lp=setTimeout(()=>{ if (active && !decided){ active=false; holdMenu(m); } }, 430); return true; };
  const move=(x,y)=>{ if (!active) return false; const mx=x-x0, my=y-y0;
    if (!decided && (Math.abs(mx)>7 || Math.abs(my)>7)) { decided=true; clearTimeout(lp); horiz=Math.abs(mx)>Math.abs(my)*1.15; if (!horiz) { active=false; return false; } SW.drag=true; el.classList.add("swiping"); if (OPEN_MSG && OPEN_MSG!==el) closeMsgActions(); }
    if (!horiz) return false;
    let v=base+mx; if (!canAct) v=Math.max(0,v);
    v = v>0? Math.min(90, v) : Math.max(MOPEN-30, v);
    dx=v; set(v); return true; };
  const end=()=>{ clearTimeout(lp); if (!active) return; active=false; if (!horiz) return;
    el.classList.remove("swiping"); SW.drag=false; endedAt=Date.now();
    if (dx>56) { set(0); S.replyTo=m.id; S.actFor=null; render(true); setTimeout(()=>{ const c=$("#composer"); if (c) c.focus(); }); }
    else if (dx < MOPEN/2.4 && canAct) { set(MOPEN); el.classList.add("mopen"); OPEN_MSG=el; if (navigator.vibrate) try{ navigator.vibrate(6); }catch{} }
    else { set(0); el.classList.remove("mopen"); if (OPEN_MSG===el) OPEN_MSG=null; }
    if (SW.pending) { SW.pending=false; setTimeout(()=>{ if (!SW.drag && !OPEN_MSG) scheduleRender(); }, 300); } };
  const cancel=()=>{ clearTimeout(lp); if (active && horiz) { el.classList.remove("swiping"); SW.drag=false; set(OPEN_MSG===el? MOPEN : 0); } active=false; };
  if ("ontouchstart" in window) {
    strip.addEventListener("touchstart", e=>{ if (e.touches.length!==1) return; const t=e.touches[0]; start(t.clientX, t.clientY, e.target); }, {passive:true});
    strip.addEventListener("touchmove", e=>{ const t=e.touches[0]; if (t) move(t.clientX, t.clientY); }, {passive:true}); // CSS touch-action keeps sideways moves for us, so scrolling stays smooth
    strip.addEventListener("touchend", end); strip.addEventListener("touchcancel", cancel);
  }
  strip.addEventListener("pointerdown", e=>{ if (e.pointerType==="touch" && "ontouchstart" in window) return; if (e.button>0) return; if (start(e.clientX, e.clientY, e.target)) { try { strip.setPointerCapture(e.pointerId); } catch {} } });
  strip.addEventListener("pointermove", e=>{ if (e.pointerType==="touch" && "ontouchstart" in window) return; move(e.clientX, e.clientY); });
  strip.addEventListener("pointerup", e=>{ if (e.pointerType==="touch" && "ontouchstart" in window) return; end(); });
  strip.addEventListener("pointercancel", e=>{ if (e.pointerType==="touch" && "ontouchstart" in window) return; cancel(); });
  strip.addEventListener("click", e=>{ if (Date.now()-endedAt<400) { e.stopPropagation(); e.preventDefault(); return; } if (OPEN_MSG===el) { e.stopPropagation(); closeMsgActions(); } }, true);
  strip.addEventListener("contextmenu", e=>{ e.preventDefault(); if (!horiz) holdMenu(m); });
}
async function copyMsg(m){ const t=plain(m); S.actFor=null; render(true); try { await navigator.clipboard.writeText(t||""); toast("Copied"); } catch { toast("Couldn't copy here"); } }

// ---------- sending (shared by send + forward) ----------
async function sendTextTo(cid, text, extra={}, givenId){
  const chn=S.channels.find(c=>c.id===cid)||{}; const members=chn.members||[S.me];
  let env=null; if (await canSeal(members)) { try { env=(await seal(text, members)).env; } catch { env=null; } }
  const id=givenId||newMsgId();
  const msg = env? {by:S.me, text:"", enc:env, at:now(), ...extra} : {by:S.me, text, at:now(), ...extra};
  await guarded(store.set(`channels/${cid}/messages/${id}`, msg));
  const last = env? {enc:env, text:"", by:S.me, at:msg.at} : {text:text.slice(0,120), by:S.me, at:msg.at}; if (extra.mentions && extra.mentions.length) last.mentions=extra.mentions;
  guarded(store.update(`channels/${cid}`, {last})).catch(()=>{});
  return {id, ...msg};
}
function forwardMenu(msgs){
  msgs=(Array.isArray(msgs)? msgs : [msgs]).filter(m=>m && !m.deleted && !m.pending && (m.kind==="voice" || m.kind==="media" || m.kind==="contact" || m.kind==="location" || plain(m)));
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
    swapKids(o, [
      h("header",{class:"fhead"},
        h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:close}, svg(IC.back)),
        searching? h("input",{id:"fwd-q", class:"fsearch", placeholder:"Search…", value:q, oninput:e=>{ q=e.target.value; draw(); }})
          : h("div",{class:"ftitle"}, h("b",{},"Forward to…"), sel.length? h("span",{}, sel.length+" selected") : ""),
        h("button",{class:"iconbtn","aria-label":searching?"Close search":"Search", title:"Search", onclick:()=>{ searching=!searching; if (!searching) q=""; draw(); if (searching) setTimeout(()=>{ const n=$("#fwd-q"); if (n) n.focus(); }); }}, svg(searching? IC.x : IC.search))),
      h("div",{class:"flist"},
        freq.length? [h("div",{class:"seg-label"},"Frequently contacted"), ...freq.map(chanRow)] : "",
        recent.length? [h("div",{class:"seg-label"},"Recent chats"), ...recent.filter(c=>!freq.includes(c)).map(chanRow)] : "",
        people.length? [h("div",{class:"seg-label"},"Contacts on Task Message"), ...people.map(id=>row({type:"person",id}, avatar(id,"lg"), nameOf(id).replace(/^Example:\s*/,""), (S.teamDocs[id]||{}).about||""))] : "",
        !recent.length && !people.length? h("p",{class:"note center"},"No results") : ""),
      sel.length? h("div",{class:"fbar"}, h("span",{class:"fnames"}, sel.map(labelOf).join(", ")), h("button",{class:"fsend","aria-label":"Send", title:"Send", onclick:send}, svg(IC.send))) : ""]);
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
    if (m.kind==="voice" && m.voice) { const url=await voiceUrl(m.voice, m.enc); const blob=await (await fetch(url)).blob(); await sendVoice(blob, m.voice.dur||0, m.voice.peaks||[], cid, {fwd:(m.fwd||0)+1}, plain(m)||""); }
    else if (m.kind==="media" || m.kind==="contact" || m.kind==="location") { const pl=plainP(m); if (!pl) return; await sendRich(cid, m.kind, pl, plain(m)||"", {fwd:(m.fwd||0)+1}); }
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
const telHref = p => "tel:"+String(p||"").replace(/[^\d+]/g,"");
const LINK_RE=/(https?:\/\/[^\s<]+[^\s<.,!?;:)\]'"]|(?:\+?\d[\d\s().-]{6,}\d)|@[^\s@.,!?;:]{1,30})/g;
function richText(t){
  return String(t).split(LINK_RE).map((p,i)=>{
    if (i%2===0) return p;
    if (p[0]==="@") return h("span",{class:"mention"}, p);
    if (/^https?:/i.test(p)) return h("a",{class:"mlink", href:p, target:"_blank", rel:"noopener", onclick:e=>e.stopPropagation()}, p);
    const d=p.replace(/\D/g,""); if (d.length<7 || d.length>15) return p;
    return h("a",{class:"mlink", href:telHref(p), onclick:e=>e.stopPropagation()}, p);
  });
}

// ---------- chat menu: tasks of this chat ----------
function subsMenu(c, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const subs=subsOf(c.id).sort((a,b)=>((b.last&&b.last.at)||b.at||0)-((a.last&&a.last.at)||a.at||0));
  scrim.append(h("div",{class:"popmenu chatmenu", style:`right:${Math.max(8, innerWidth-x-16)}px;top:${y+10}px`},
    h("div",{class:"pmlabel"}, svg(IC.thread), "Task conversations", h("span",{class:"pmcount"}, subs.length)),
    h("div",{class:"pmlist"}, subs.map(x=>{ const t=S.tasks.find(z=>z.id===x.taskId); const st=t? STATUSES.find(z=>z.id===stOf(t)) : {c:"var(--muted)", name:""};
      return h("button",{class:"pmtask", onclick:()=>{ scrim.remove(); selectChannel(x.id); }}, h("span",{class:"sdot2", style:`--c:${st.c}`}), h("span",{class:"pmt"}, h("b",{}, t? t.title : chanTitle(x)), h("span",{}, (t? "CN-"+t.num+" · "+st.name : "")+(x.last? " · "+fmtShort(x.last.at) : ""))), unread(x)? h("i",{class:"tdot"}) : svg(IC.chat)); }))));
  document.body.append(scrim);
}
function chatMenu(c, x, y){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const ts=visibleTasks().filter(t=>t.channel===c.id).sort((a,b)=>(b.at||0)-(a.at||0));
  const pinned=S.pins.includes(c.id);
  scrim.append(h("div",{class:"popmenu chatmenu", style:`right:${Math.max(8, innerWidth-x-16)}px;top:${y+10}px`},
    h("div",{class:"pmlabel"}, svg(c.kind==="dm"? IC.knot : IC.thread), c.kind==="dm"? "Tasks" : "Task conversations", h("span",{class:"pmcount"}, ts.length)),
    ts.length? h("div",{class:"pmlist"}, ts.map(t=>{ const s=STATUSES.find(z=>z.id===stOf(t)); const th=t.thread && S.channels.find(z=>z.id===t.thread);
      return h("button",{class:"pmtask", onclick:()=>{ scrim.remove(); if (c.kind==="dm") openTask(t.id); else openTaskChat(t); }}, h("span",{class:"sdot2", style:`--c:${s.c}`}), h("span",{class:"pmt"}, h("b",{}, t.title), h("span",{}, "CN-"+t.num+" · "+s.name+(th&&th.last? " · "+fmtShort(th.last.at):""))), c.kind==="dm"? svg(IC.arrow) : svg(th? IC.chat : IC.plus)); }))
      : h("div",{class:"pmempty"}, "—"),
    h("div",{class:"pmsep"}),
    h("button",{onclick:()=>{ scrim.remove(); togglePin(c.id); }}, svg(IC.pin), pinned? "Unpin chat" : "Pin chat"),
    h("button",{onclick:()=>{ scrim.remove(); openChatInfo(c); }}, svg(c.kind==="dm"? ICF.contact : ICF.all), c.kind==="dm"? "Contact info" : "Group info"),
    h("button",{onclick:()=>{ scrim.remove(); openChatNotif(c); }}, svg(isMuted(c)? ICF.bellx : ICF.bell), "Notifications", h("span",{class:"pmval"}, isMuted(c)? muteText(c) : toneName(toneFor(c)))),
    h("button",{onclick:()=>{ scrim.remove(); S.view="board"; S.filter="chan:"+c.id; ls.set("view","board"); render(); }}, svg(ICF.stage), "Show on task board"),
    h("button",{onclick:()=>{ scrim.remove(); openWallpaper(); }}, svg(ICF.image), "Wallpaper"),
    dmPeer(c)? h("button",{class:"dangerrow", onclick:()=>{ scrim.remove(); setBlocked(dmPeer(c), !isBlocked(dmPeer(c))); }}, svg(ICF.block), isBlocked(dmPeer(c))? "Unblock "+nameOf(dmPeer(c)).replace(/^Example:\s*/,"") : "Block "+nameOf(dmPeer(c)).replace(/^Example:\s*/,"")) : "",
    h("button",{class:"dangerrow", onclick:()=>{ scrim.remove(); openReport({title: dmPeer(c)? "Report "+nameOf(dmPeer(c)).replace(/^Example:\s*/,"") : "Report group", user:dmPeer(c)||"", channel:c.id}); }}, svg(ICF.flag2), dmPeer(c)? "Report contact" : "Report group")));
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
  try { const b64=await blobToB64(blob); const parts=Math.ceil(b64.length/CHUNK); const tk=S.openTask && S.openTask!=="new"? S.openTask : ""; for (let i=0;i<parts;i++) await guarded(store.set(`voice/${vid}/parts/${i}`, {d:b64.slice(i*CHUNK,(i+1)*CHUNK), by:S.me, task:tk}));
    VOICE_URLS[vid]=URL.createObjectURL(blob);
    set([...((S.draftTask&&S.draftTask.files)||[]), {id:vid, kind:"voice", by:S.me, at:now(), voice:{id:vid, parts, mime:blob.type||"audio/webm", dur:Math.round(dur*10)/10, peaks}}]); toast("Voice memo added");
  } catch { toast("The voice memo didn't save."); }
}
function viewPhoto(src){ const o=overlay("photoview","Photo"); o.append(h("button",{class:"sc-ic pvclose","aria-label":"Close", onclick:()=>o.remove()}, svg(IC.x)), h("img",{src, alt:"Task photo"})); o.addEventListener("click", e=>{ if (e.target===o) o.remove(); }); }
// Photos and voice memos live inside the subtasks box: two small symbols in its header, items underneath.
function renderTaskFiles(d, ro, box){
  d.files=d.files||[]; const set=taskFilesSetter();
  box.classList.add("withfiles");
  const head=box.querySelector(".subhead");
  if (head && !ro) head.append(h("span",{class:"attbtns"},
    h("button",{class:"attb", title:"Add subtask", "aria-label":"Add subtask", onclick:()=>{ const i=$("#st-new"); if (i) { i.closest(".subrow").classList.add("show"); i.focus(); } }}, svg(ICF.list)),
    h("button",{class:"attb", title:"Add photo", "aria-label":"Add photo", onclick:addTaskPhotos}, svg(ICF.image)),
    h("button",{class:"attb", title:"Record voice memo", "aria-label":"Record voice memo", onclick:()=>startRec(storeTaskVoice)}, svg(IC.mic))));
  if (S.rec && S.recFor==="task") box.append(h("div",{class:"recbar small"}, h("button",{class:"rectrash","aria-label":"Cancel recording", onclick:()=>stopRec(true)}, svg(IC.trash)), h("span",{class:"recdot"}), h("span",{class:"rectime mono", id:"recTime"}, fmtDur(REC? (now()-REC.t0)/1000:0)), h("div",{class:"recbars", id:"recBars"}, Array.from({length:24},()=>h("i"))), h("button",{class:"micbtn sending savecheck","aria-label":"Save voice memo", onclick:()=>stopRec(false)}, svg(ICF.check))));
  const imgs=d.files.filter(f=>f.kind==="image"), voices=d.files.filter(f=>f.kind==="voice" && !f.fromMsg);
  if (imgs.length) box.append(h("div",{class:"tthumbs"}, imgs.map(f=>{ const src=f.localUrl||blobUrl(f.asset); return h("div",{class:"tthumb"}, h("img",{src, alt:"", onclick:()=>viewPhoto(src)}), ro? "" : h("button",{class:"tdel","aria-label":"Remove photo", onclick:()=>set(d.files.filter(x=>x.id!==f.id))}, svg(IC.x))); })));
  voices.forEach(f=>box.append(h("div",{class:"tvoice"}, renderVoice({id:"tv-"+f.id, voice:f.voice}), ro? "" : h("button",{class:"iconbtn sm","aria-label":"Remove voice memo", onclick:()=>set(d.files.filter(x=>x.id!==f.id))}, svg(IC.x)))));
  return box;
}

// ---------- chat wallpaper ----------
let WP_FADED=false;
const wpMode = () => S.prefs.wp || "tools";
// The wallpaper photo is kept in the browser's database (IndexedDB): localStorage is too small on iPhones.
let WP_IMG=null, WP_LOADING=false, WP_URL=["",""];
// Turns the saved photo into a short link once, so each screen update doesn't copy megabytes of text.
function wpURL(d){ if (WP_URL[0]===d) return WP_URL[1]; try { const [h0,b]=d.split(","); const bin=atob(b); const u=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  if (WP_URL[1]) URL.revokeObjectURL(WP_URL[1]); WP_URL=[d, URL.createObjectURL(new Blob([u],{type:(h0.match(/:(.*?);/)||[])[1]||"image/jpeg"}))]; return WP_URL[1]; } catch { return d; } }
const wpKey = () => "wpimg:"+S.me;
function idbOpen(){ return new Promise((res,rej)=>{ try { const r=indexedDB.open("concept",1); r.onupgradeneeded=()=>r.result.createObjectStore("kv"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); } catch(e){ rej(e); } }); }
async function kvGet(k){ try { const db=await idbOpen(); return await new Promise(res=>{ const q=db.transaction("kv").objectStore("kv").get(k); q.onsuccess=()=>res(q.result??null); q.onerror=()=>res(null); }); } catch { return null; } }
async function kvDel(keys){ keys=[keys].flat().filter(Boolean); if (!keys.length) return true; try { const db=await idbOpen(); await new Promise((res,rej)=>{ const t=db.transaction("kv","readwrite"); const st=t.objectStore("kv"); keys.forEach(k=>st.delete(k)); t.oncomplete=res; t.onerror=()=>rej(t.error); }); return true; } catch { return false; } }
const sizeOf = v => v==null? 0 : typeof v==="string"? v.length : v instanceof ArrayBuffer? v.byteLength : ArrayBuffer.isView(v)? v.byteLength : (typeof Blob!=="undefined" && v instanceof Blob)? v.size : (()=>{ try { return JSON.stringify(v).length; } catch { return 0; } })();
// Walks every saved item once and reports its key and size (doesn't keep the data in memory).
async function kvSizes(prefix){ const out=new Map(); try { const db=await idbOpen(); await new Promise(res=>{ const q=db.transaction("kv").objectStore("kv").openCursor(); q.onsuccess=()=>{ const c=q.result; if (!c) return res(); const k=String(c.key); if (!prefix || k.startsWith(prefix)) out.set(k, sizeOf(c.value)); c.continue(); }; q.onerror=()=>res(); }); } catch {} return out; }
async function kvSet(k,v){ try { const db=await idbOpen(); await new Promise((res,rej)=>{ const t=db.transaction("kv","readwrite"); t.objectStore("kv").put(v,k); t.oncomplete=res; t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); return true; } catch { return false; } }
function wpData(){
  if (WP_IMG!==null) return WP_IMG;
  const old=ls.get(wpKey(), "");
  if (!WP_LOADING) { WP_LOADING=true; kvGet(wpKey()).then(v=>{ WP_IMG=v||old||""; if (v && wpMode()==="photo") render(true); }); }
  return old;
}
async function setWallpaperPhoto(){
  const inp=h("input",{type:"file", accept:"image/*", style:"position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0", onchange:async e=>{ const f=e.target.files&&e.target.files[0]; inp.remove(); if (!f) return;
    toast("Setting wallpaper…");
    try { const url=URL.createObjectURL(f); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
      const sc=Math.min(3, window.devicePixelRatio||2), max=Math.max(1800, Math.round(Math.max(screen.width, screen.height)*sc)), k=Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
      
      const cx=c.getContext("2d"); cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality="high"; cx.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url); let q=.92, data=c.toDataURL("image/jpeg",q); while (data.length>6e6 && q>.6) { q-=.08; data=c.toDataURL("image/jpeg",q); }
      if (!data || data.length<100) throw new Error("empty");
      WP_IMG=data; WP_LOADING=true;
      const saved=await kvSet(wpKey(), data);
      if (saved) { try { localStorage.removeItem("concept:"+wpKey()); } catch {} } else ls.set(wpKey(), data);
      WP_FADED=false; setPref("wp","photo"); const s=$("#wpsheet"); if (s) s.remove(); openWallpaper();
      toast(saved? "Wallpaper set" : "Wallpaper set for now — this browser can't save it");
    } catch { toast("That photo couldn't be used."); } }});
  document.body.append(inp); inp.click();
}
function wallpaperLayer(main){
  const mode=wpMode(); main.classList.add("wp-"+(mode==="photo" && wpData()? "photo" : mode==="photo"? "tools" : mode));
  if (mode==="photo") { const d=wpData(); if (!d) return; const l=h("div",{class:"wplayer"+(WP_FADED?"":" fade"), style:`background-image:url("${wpURL(d)}");--wpdim:${S.prefs.wpDim??0}`}); WP_FADED=true; main.prepend(l); }
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
    m==="photo" && d? h("div",{class:"wpdimrow"}, svg(ICF.moon), h("input",{type:"range", min:"0", max:"0.7", step:"0.05", value:String(S.prefs.wpDim??0), "aria-label":"Dim photo", oninput:e=>{ S.prefs={...S.prefs, wpDim:+e.target.value}; ls.set("prefs",S.prefs); document.querySelectorAll(".wplayer").forEach(x=>x.style.setProperty("--wpdim", e.target.value)); }})) : "",
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
    if (step==="phone") o.replaceChildren(obScreen({
      title:"Welcome to Task Message", sub:"Chat with anyone and turn any message into a task. Enter your phone number to begin.",
      body:[h("div",{class:"obfield"},
          h("label",{class:"obccwrap"}, h("span",{class:"obccv"}, cc), svg(ICF.chev), h("select",{class:"obcc", "aria-label":"Country code", onchange:e=>{ cc=e.target.value; ls.set("cc",cc); draw(); }}, COUNTRIES.map(([c,n])=>h("option",{value:c, selected:c===cc}, n+" "+c)))),
          h("span",{class:"obsep"}),
          h("input",{class:"obnum", id:"ob-num", type:"tel", inputmode:"tel", autocomplete:"tel-national", placeholder:"Phone number", value:num, oninput:e=>num=e.target.value, onkeydown:e=>{ if (e.key==="Enter") sendCode(); }})),
        h("p",{class:"obhint"}, "We'll text you a 6-digit code.")],
      err, busy, label:"Continue", go:sendCode,
      foot:h("p",{class:"obterms"}, "By continuing you agree to the ", h("a",{href:siteLink("terms.html"), target:"_blank", rel:"noopener"}, "Terms"), " and ", h("a",{href:siteLink("privacy.html"), target:"_blank", rel:"noopener"}, "Privacy Policy"), ". No abusive or objectionable content is allowed.")}));
    else o.replaceChildren(obScreen({
      back:()=>{ step="phone"; err=""; draw(); },
      title:"Enter the code", sub:h("span",{}, "Sent by text to ", h("b",{}, phone)),
      body:[h("input",{class:"obotp", id:"ob-code", type:"text", inputmode:"numeric", autocomplete:"one-time-code", maxlength:"6", placeholder:"000000", "aria-label":"6-digit code", oninput:e=>{ const v=e.target.value.replace(/\D/g,"").slice(0,6); e.target.value=v; if (v.length===6) verify(v); }}),
        h("button",{class:"oblink", id:"ob-resend", disabled:wait>0, onclick:sendCode}, wait>0? "Resend code in "+wait+"s" : "Resend code")],
      err, busy, label:"Verify", go:()=>{ const v=($("#ob-code")||{}).value||""; if (v.length===6) verify(v); else { err="Enter the 6-digit code."; draw(); } }}));
    const f=$("#ob-num")||$("#ob-code"); if (f) setTimeout(()=>f.focus(), 60);
  };
  async function sendCode(){
    const d=num.replace(/[^\d]/g,"").replace(/^0+/,""); if (d.length<6) { err="Enter your phone number."; draw(); return; }
    if (cc==="+1" && d.length===11 && d.startsWith("1")) num=d.slice(1);
    phone=cc+(cc==="+1" && d.length===11 && d.startsWith("1")? d.slice(1) : d);
    if (cc==="+1" && phone.length!==12) { err="Enter a 10-digit phone number."; draw(); return; }
    // Each code is a paid text message: at most 5 per phone (device) in 30 minutes.
    const sent=(ls.get("otpSent",[])||[]).filter(t=>Date.now()-t<30*60e3);
    if (sent.length>=5) { err="Too many codes requested. Please wait about "+Math.ceil((30*60e3-(Date.now()-sent[0]))/60e3)+" minutes and try again."; draw(); return; }
    busy=true; err=""; draw();
    let error=null;
    try { const r=await Promise.race([SB.auth.signInWithOtp({phone}), new Promise((_,rej)=>setTimeout(()=>rej(new Error("No answer from the server. Check your connection and try again.")),20000))]); error=r && r.error; }
    catch (e) { error=e; }
    busy=false;
    if (error) { err=explainAuthError(error); draw(); return; }
    ls.set("otpSent", [...sent, Date.now()]);
    step="code"; wait=30; clearInterval(timer); timer=setInterval(()=>{ wait--; const r=$("#ob-resend"); if (r){ r.disabled=wait>0; r.textContent=wait>0? "Resend code in "+wait+"s" : "Resend code"; } if (wait<=0) clearInterval(timer); },1000); draw();
  }
  async function verify(token){
    if (busy) return; busy=true; err=""; draw();
    let data=null, error=null;
    try { const r=await SB.auth.verifyOtp({phone, token, type:"sms"}); data=r.data; error=r.error; } catch (e) { error=e; }
    busy=false;
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
  if (/fetch|network|load failed/i.test(m)) return "Can't connect to Task Message. Check your internet connection. If this phone has an internet filter or VPN, it may be blocking the app.";
  return m || "Something went wrong. Try again.";
}
// Shared layout for the sign-in screens: app icon, title, text, content, one big button at the bottom.
function obScreen({title, sub, body=[], err="", busy=false, label, go, foot, back}){
  return h("div",{class:"ob2"},
    h("div",{class:"ob2top"}, back? h("button",{class:"iconbtn obback", "aria-label":"Back", onclick:back}, svg(IC.back)) : ""),
    h("div",{class:"ob2main"},
      h("img",{class:"ob2icon", src:"icon.svg", alt:"", width:"84", height:"84"}),
      h("h1",{class:"ob2title"}, title), sub? h("p",{class:"ob2sub"}, sub) : "",
      h("div",{class:"ob2body"}, ...[body].flat()),
      err? h("p",{class:"oberr", role:"alert"}, err) : ""),
    h("div",{class:"ob2foot"},
      h("button",{class:"ob2btn"+(busy?" busy":""), disabled:busy, onclick:go}, busy? h("span",{class:"spin"}) : label),
      foot||""));
}
function openProfileSetup(u, existing){
  if (document.getElementById("profsetup")) return;
  let name=(existing&&existing.name)||"";
  const o=overlay("onboard","Your name"); o.id="profsetup";
  const save=async()=>{ if (!name.trim()) { toast("Enter your name."); return; }
    try { await guarded(store.set("team/"+S.me, {...(existing||{}), name:name.trim().slice(0,40), phone:fmtPhone(u.phone)||((existing||{}).phone||""), joinedAt:(existing&&existing.joinedAt)||now()})); } catch { return; }
    o.remove(); openFindContacts(); };
  o.replaceChildren(obScreen({
    title:"Create your profile", sub:"Add your name and an optional photo. This is how people will see you in chats and tasks.",
    body:[h("button",{class:"obphoto", "aria-label":"Add a profile photo", onclick:()=>pickProfilePhoto(()=>{ const b=o.querySelector(".obphoto"); if (b) b.replaceChildren(avatar(S.me,"xl"), h("span",{class:"epcam"}, svg(ICF.image))); })}, myProf().photo? avatar(S.me,"xl") : svg(ICF.image), h("span",{class:"epcam"}, svg(IC.plus))),
      h("div",{class:"obfield"}, h("input",{class:"obnum", id:"ob-name", maxlength:"40", autocomplete:"name", autocapitalize:"words", placeholder:"Your name", value:name, oninput:e=>name=e.target.value, onkeydown:e=>{ if (e.key==="Enter") save(); }}))],
    label:"Continue", go:save}));
  setTimeout(()=>{ const n=$("#ob-name"); if (n) n.focus(); });
}
function openFindContacts(){
  const o=overlay("onboard","Find your contacts"); o.id="findc";
  o.replaceChildren(obScreen({
    title:"Find your friends", sub:"See which of your contacts already use Task Message. Only the numbers in your phone are checked, and your address book isn't uploaded.",
    body:[h("div",{class:"obperks"},
      h("div",{}, h("span",{class:"obpk"}, svg(IC.chat)), h("span",{}, h("b",{}, "Chat with anyone"), h("span",{}, "Private chats, groups, voice notes and photos"))),
      h("div",{}, h("span",{class:"obpk"}, svg(IC.knot)), h("span",{}, h("b",{}, "Turn messages into tasks"), h("span",{}, "Swipe a message to make it a task"))),
      h("div",{}, h("span",{class:"obpk"}, svg(ICF.lock)), h("span",{}, h("b",{}, "Private by design"), h("span",{}, "Messages are end-to-end encrypted"))))],
    label:"Find my contacts", go:()=>{ o.remove(); importContacts(); },
    foot:h("button",{class:"oblink center", onclick:()=>o.remove()}, "Not now")}));
}
// ===================== profiles: photo + about, each with its own "who can see" =====================
// Stored as profile/<person>/photo and profile/<person>/about. The server only hands each one to
// the people allowed to see it: everyone, only the owner's contacts, or nobody.
const PROF={};
const VIS_OPTS=[["all","Everyone"],["contacts","My contacts"],["nobody","Nobody"]];
const visName = v => (VIS_OPTS.find(x=>x[0]===v)||VIS_OPTS[0])[1];
function myProf(){ return PROF[S.me]||(PROF[S.me]={photo:"", about:"", vis:{photo:"all", about:"all"}}); }
function applyProfiles(){
  for (const [id,p] of Object.entries(PROF)) {
    if (p.about!==undefined) S.teamDocs[id]={...(S.teamDocs[id]||{id}), about:p.about};
    if (S.people[id]) S.people[id]={...S.people[id], avatarUrl:p.photo||""};
  }
}
async function loadProfileData(){
  if (S.mode!=="live" || !SB) return;
  try {
    const {data, error}=await SB.from("docs").select("path,data").like("col","profile/%").limit(5000); if (error) return;
    const seen=new Set();
    for (const r of data||[]) { const [,id,f]=r.path.split("/"); seen.add(id); const p=PROF[id]||(PROF[id]={vis:{}}); p[f]=(r.data&&r.data.v)||""; p.vis=p.vis||{}; p.vis[f]=(r.data&&r.data.vis)||"all"; }
    for (const id of Object.keys(PROF)) if (!seen.has(id) && id!==S.me) { PROF[id].photo=""; }
    applyProfiles(); scheduleRender();
    try { ls.set("prof:"+S.me, PROF); } catch {}
  } catch {}
}
async function saveProfileField(f, v, vis){
  const p=myProf(); p[f]=v; p.vis={...(p.vis||{}), [f]:vis||p.vis[f]||"all"};
  applyProfiles(); render(true);
  if (S.mode!=="live") return;
  await guarded(store.set(`profile/${S.me}/${f}`, {v, vis:p.vis[f]}));
}
// Older versions kept "About" inside the always-visible profile; move it into the private record.
async function migrateAbout(mine){
  if (!mine || !mine.about) return;
  const p=myProf(); if (!p.about) await saveProfileField("about", mine.about, (p.vis&&p.vis.about)||"all").catch(()=>{});
  store.update("team/"+S.me, {about:""}).catch(()=>{});
}
async function squarePhoto(file, size=512){
  const url=URL.createObjectURL(file); const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; });
  const s=Math.min(img.naturalWidth, img.naturalHeight); const c=document.createElement("canvas"); c.width=c.height=size;
  const cx=c.getContext("2d"); cx.imageSmoothingQuality="high"; cx.drawImage(img, (img.naturalWidth-s)/2, (img.naturalHeight-s)/2, s, s, 0, 0, size, size); URL.revokeObjectURL(url);
  return await new Promise(res=>c.toBlob(res, "image/jpeg", .88));
}
function pickProfilePhoto(done){
  const inp=h("input",{type:"file", accept:"image/*", style:"position:fixed;left:-9999px;opacity:0", onchange:async e=>{ const f=e.target.files&&e.target.files[0]; inp.remove(); if (!f) return;
    try { toast("Updating photo…"); const blob=await squarePhoto(f); let url;
      if (S.mode==="live" && SB) { const path=S.me+"/avatar-"+now().toString(36)+".jpg"; const {error}=await SB.storage.from("media").upload(path, blob, {contentType:"image/jpeg", upsert:false}); if (error) throw error; url=blobUrl(path); }
      else url=URL.createObjectURL(blob);
      await saveProfileField("photo", url); toast("Photo updated"); done&&done();
    } catch { toast("The photo didn't upload. Try again."); } }});
  document.body.append(inp); inp.click();
}
function openEditProfile(){
  const me=S.teamDocs[S.me]||{}; let name=(me.name||(S.people[S.me]||{}).name||"").replace(/^Example:\s*/,""), about=myProf().about||me.about||"";
  sheet("Edit profile", (draw, close)=>[
    h("div",{class:"epav"},
      h("button",{class:"epphoto", "aria-label":"Change profile photo", onclick:()=>pickProfilePhoto(draw)}, avatar(S.me,"xl"), h("span",{class:"epcam"}, svg(ICF.image))),
      myProf().photo? h("button",{class:"oblink", onclick:async()=>{ await saveProfileField("photo",""); draw(); }}, "Remove photo") : h("button",{class:"oblink", onclick:()=>pickProfilePhoto(draw)}, "Add photo")),
    h("label",{class:"eplbl"}, "Name"),
    h("input",{class:"inp", id:"ep-name", maxlength:"40", autocomplete:"name", value:name, oninput:e=>name=e.target.value}),
    h("label",{class:"eplbl"}, "About"),
    h("input",{class:"inp", id:"ep-about", maxlength:"120", placeholder:"Available", value:about, oninput:e=>about=e.target.value}),
    h("p",{class:"note", style:"margin:0 2px"}, "Who sees your photo and About is set in Settings → Privacy."),
    h("button",{class:"primary wide", onclick:async()=>{ if (!name.trim()) { toast("Enter your name."); return; }
      try { if (name.trim()!==(me.name||"")) await guarded(store.update("team/"+S.me, {name:name.trim().slice(0,40)}));
        if (about.trim()!==(myProf().about||"")) await saveProfileField("about", about.trim().slice(0,120));
        S.people[S.me]={...(S.people[S.me]||{}), name:name.trim()}; close(); toast("Profile saved"); render(); } catch {} }}, "Save")]);
}
function openVisPicker(f, title){
  let cur=(myProf().vis||{})[f]||"all";
  sheet(title, (draw, close)=>[
    h("p",{class:"note", style:"margin:0 4px"}, f==="photo"? "Who can see your profile photo." : "Who can see your About."),
    pickList(VIS_OPTS.map(([v,l])=>[v,l, v==="contacts"? "People you've saved as contacts" : v==="all"? "Anyone on Task Message" : "Only you"]), cur, async v=>{ cur=v; draw(); await saveProfileField(f, myProf()[f]||"", v).catch(()=>{}); toast("Saved"); close(); })]);
}

async function startLive(u){
  DB=makeDocStore(SB); ASSETS=makeAssets(SB); S.mode="live"; S.me=u.id; S.canWrite=true;
  const b=$("#banner"); if (b) b.hidden=true;
  const was=ls.get("me:"+S.me, null);
  S.people[S.me]={id:S.me, name:(was&&was.name)||"You", avatarUrl:"", color:colorFor(S.me)};
  if (was) { S.teamDocs[S.me]={id:S.me, ...was}; }
  await Promise.race([loadLocalCopy(), new Promise(r=>setTimeout(r,700))]);
  try { Object.assign(PROF, ls.get("prof:"+S.me, {})||{}); applyProfiles(); } catch {}
  render(true); hideSplash();
  subscribeAll();
  let mine=null, fetched=false; try { mine=await store.get("team/"+S.me); fetched=true; } catch { mine=was; }
  if (mine) { ls.set("me:"+S.me, {name:mine.name||"", phone:mine.phone||""}); S.people[S.me]={...S.people[S.me], name:mine.name||"You"}; }
  loadProfileData().then(()=>migrateAbout(mine)); setInterval(loadProfileData, 5*60e3);
  if (fetched && (!mine || !mine.name)) openProfileSetup(u, mine);
  else if (mine && u.phone && fmtPhone(u.phone)!==mine.phone) store.update("team/"+S.me, {phone:fmtPhone(u.phone)}).catch(()=>{});
  render();
  setTimeout(pushRegister, 1500);
}
async function signOut(){ try { await SB.auth.signOut(); } catch {} clearLocalCopy(); setTimeout(()=>location.reload(), 150); }

// ===================== smooth rendering =====================
let RQ=0;
function scheduleRender(){ if (SW.drag) { SW.pending=true; return; } if (RQ) return; RQ=requestAnimationFrame(()=>{ RQ=0; softRender(); }); }
// While you're typing in a search box, task or settings field, background updates wait until you're
// done, so the keyboard never gets closed under your fingers.
let TYPING_HOLD=false;
function typingInField(){ const a=document.activeElement; return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.id!=="composer" && a.closest("#drawer, section.flow, .settings, .ntsheet")); }
document.addEventListener("focusout", ()=>{ if (TYPING_HOLD) setTimeout(()=>{ if (!typingInField() && TYPING_HOLD) { TYPING_HOLD=false; scheduleRender(); } }, 60); }, true);
function softRender(){
  if (typingInField()) { if (S.newFlow && document.activeElement.closest("section.flow")) { flowRedraw(); return; } TYPING_HOLD=true; return; }
  const main=$(".chatmain");
  const canPatch = S.view==="chats" && !S.newFlow && main && main.dataset.cid===String(S.active||"") && !S.openTask;
  if (!canPatch) { render(); return; }
  patchThread(main); patchList(); updateBadges(); updateTypingUI();
}
function patchThread(main){
  const c=S.channels.find(x=>x.id===S.active); const st=$("#stream"); if (!c || !st) { render(); return; }
  const atBottom = st.scrollHeight-st.scrollTop-st.clientHeight<90; const prev=st.scrollTop;
  const old=st.querySelector(".spine"); const nu=buildSpine(c); if (old) old.replaceWith(nu); else st.append(nu);
  if (scrollDown||atBottom) st.scrollTop=st.scrollHeight; else st.scrollTop=prev; scrollDown=false;
  const sub=$("#thead-sub"); if (sub) sub.dataset.orig=theadSub(c);
  if (playing) syncPlayer();
}
function patchList(){ if (SW.drag) { SW.pending=true; return; } const l=$("#list"); if (!l || S.newFlow) return; const y=l.scrollTop; l.replaceChildren(...listChildren()); l.scrollTop=y; }
function updateBadges(){
  updateDots();
  const ur=S.channels.filter(unread).length; const ud=$("#unreadDot"); if (ud){ ud.hidden=!ur; ud.textContent=ur; }
  const mine=visibleTasks().filter(t=>t.assignee===S.me && t.status!=="done").length; const md=$("#mineDot"); if (md){ md.hidden=!mine; md.textContent=mine; }
}
function msgsFor(cid){ const have=new Set(S.msgs.map(m=>m.id)); const cl=(S.nt.cleared||{})[cid]||0; const all=S.msgs.concat(S.pend.filter(p=>p.cid===cid && !have.has(p.id))).filter(m=>!cl || (m.at||0)>cl); return (S.blocked||[]).length? all.filter(m=>!isBlocked(m.by)) : all; }
const newMsgId = () => "m"+now().toString(36)+uidShort().slice(0,4);

// ===================== typing & recording indicators =====================
const RT={chans:new Map(), typing:{}};
function rtSync(){
  if (!SB) return;
  const want=new Set(S.channels.slice(0,60).map(c=>c.id));
  for (const [cid,ch] of RT.chans) if (!want.has(cid)) { try { SB.removeChannel(ch); } catch {} RT.chans.delete(cid); }
  for (const cid of want) if (!RT.chans.has(cid)) {
    const ch=SB.channel("chat:"+cid, {config:{broadcast:{self:false}}});
    ch.on("broadcast", {event:"act"}, ({payload})=>onAct(cid, payload)).subscribe();
    RT.chans.set(cid, ch);
  }
}
function onAct(cid, p){
  if (!p || !p.u || p.u===S.me) return;
  const t=RT.typing[cid]||(RT.typing[cid]={});
  if (p.k==="stop") delete t[p.u]; else t[p.u]={k:p.k==="recording"?"recording":"typing", at:Date.now()};
  updateTypingUI();
}
const ACT_LAST={}; let TYP_STOP=null;
function sendAct(kind, cid){
  cid=cid||S.active; if (!cid || S.mode!=="live") return;
  const n=Date.now(), key=cid+":"+kind;
  if (kind!=="stop" && ACT_LAST[key] && n-ACT_LAST[key]<2500) return;
  if (kind==="stop") { if (!ACT_LAST[cid+":typing"] && !ACT_LAST[cid+":recording"]) return; delete ACT_LAST[cid+":typing"]; delete ACT_LAST[cid+":recording"]; }
  else ACT_LAST[key]=n;
  const ch=RT.chans.get(cid); if (ch) { try { ch.send({type:"broadcast", event:"act", payload:{u:S.me, k:kind}}); } catch {} }
}
function onComposerTyping(v){
  if (!v.trim()) { sendAct("stop"); return; }
  sendAct("typing"); clearTimeout(TYP_STOP); TYP_STOP=setTimeout(()=>sendAct("stop"), 3500);
}
setInterval(()=>{ let ch=false; const n=Date.now(); for (const cid in RT.typing) for (const u in RT.typing[cid]) if (n-RT.typing[cid][u].at>(RT.typing[cid][u].demo?3000:6000)) { delete RT.typing[cid][u]; ch=true; } if (ch) updateTypingUI(); }, 1000);
function typText(cid){
  const t=RT.typing[cid]; if (!t) return null; const ids=Object.keys(t); if (!ids.length) return null;
  const c=S.channels.find(x=>x.id===cid)||{}; const rec=ids.filter(u=>t[u].k==="recording");
  const first=u=>nameOf(u).replace(/^Example:\s*/,"").split(" ")[0];
  if (c.kind==="dm") return {rec:!!rec.length, txt: rec.length? "recording audio…" : "typing…"};
  if (rec.length) return {rec:true, txt: first(rec[0])+" is recording audio…"};
  return {rec:false, txt: ids.length>1? ids.length+" people are typing…" : first(ids[0])+" is typing…"};
}
function updateTypingUI(){
  document.querySelectorAll(".pvt[data-cid]").forEach(el=>{ const t=typText(el.dataset.cid); if (el.dataset.orig===undefined) el.dataset.orig=el.textContent; el.classList.toggle("typing", !!t); el.textContent = t? t.txt : el.dataset.orig; });
  const sub=$("#thead-sub"); if (sub) { const t=typText(S.active); if (sub.dataset.orig===undefined) sub.dataset.orig=sub.textContent; sub.classList.toggle("typing", !!t); sub.textContent = t? t.txt : sub.dataset.orig; }
  const row=$("#typingrow"); if (row) { const t=typText(S.active); const st=$("#stream"); const atB=st && st.scrollHeight-st.scrollTop-st.clientHeight<90;
    row.hidden=!t; if (t) { const c=S.channels.find(x=>x.id===S.active)||{}; const ids=Object.keys(RT.typing[S.active]||{}); row.querySelector(".tyname").textContent = c.kind==="dm"? "" : nameOf(ids[0]).replace(/^Example:\s*/,"").split(" ")[0]; row.classList.toggle("rec", t.rec); if (atB && st) st.scrollTop=st.scrollHeight; } }
}
function demoTyping(cid, kind="typing"){ const c=S.channels.find(x=>x.id===cid); if (!c) return; const peer=(c.members||[]).find(u=>u!==S.me); if (!peer) return; (RT.typing[cid]||(RT.typing[cid]={}))[peer]={k:kind, at:Date.now(), demo:true}; updateTypingUI(); }

// ===================== read receipts =====================
const RR = () => S.prefs.readReceipts!==false;
const ACKED={};
function queueAck(cid, patch){ const k=cid+JSON.stringify(patch); if (ACKED[k]) return; ACKED[k]=1; store.update("channels/"+cid, patch).catch(()=>{ delete ACKED[k]; }); }
function ackDelivered(){ for (const c of S.channels) { const l=c.last; if (!l || l.by===S.me) continue; if (Math.max(c["d_"+S.me]||0, c["r_"+S.me]||0) < l.at) queueAck(c.id, {["d_"+S.me]:l.at}); } }
function ackRead(c){
  if (!c || !c.last || c.last.by===S.me || document.visibilityState==="hidden") return;
  const p={}; if ((c["d_"+S.me]||0) < c.last.at) p["d_"+S.me]=c.last.at; if (RR() && (c["r_"+S.me]||0) < c.last.at) p["r_"+S.me]=c.last.at;
  if (Object.keys(p).length) queueAck(c.id, p);
}
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible" && S.inThread && S.view==="chats") { markRead(); ackRead(S.channels.find(c=>c.id===S.active)); } });
const TICK1='<path d="M5 12.5l4.2 4.2L19 7"/>', TICK2='<path d="M2 12.5l4.2 4.2L16 7"/><path d="M10.5 16.2l.5.5L21 7"/>', CLOCK='<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4.3l2.8 1.7"/>';
function ticks(m, c){
  if (m.by!==S.me) return "";
  if (m.pending) return h("span",{class:"tk pend", title:"Sending"}, svg(CLOCK));
  const others=((c&&c.members)||[]).filter(u=>u!==S.me); if (!others.length) return h("span",{class:"tk", title:"Sent"}, svg(TICK1));
  const read = RR() && others.every(u=>(c["r_"+u]||0)>=m.at);
  const deliv = others.every(u=>Math.max(c["d_"+u]||0, c["r_"+u]||0)>=m.at);
  return h("span",{class:"tk"+(read?" read":""), title: read? "Read" : deliv? "Delivered" : "Sent"}, svg(read||deliv? TICK2 : TICK1));
}

// ===================== rich messages (photos, videos, files, contacts, location) =====================
const MEDIA_CACHE={}, MEDIA_P={};
function plainP(m){ if (m.local) return m.local; if (m.payload) return m.payload; if (!m.penc) return null; const v=DEC.get(m.penc.iv); if (v===undefined) return null; if (v===false) return false; try { return JSON.parse(v); } catch { return false; } }
function richLabel(kind, sub, n){ if (kind==="voice") return "🎤 Voice note"; if (kind==="media") return sub==="video"? "🎥 Video" : sub==="file"? "📄 Document" : (n>1? "📷 "+n+" photos" : "📷 Photo"); if (kind==="contact") return "👤 Contact"; if (kind==="location") return "📍 Location"; return ""; }
function lastPreview(l){
  if (!l) return ""; const cap = l.enc? shown(l) : (l.text||"");
  const lab = richLabel(l.kind, l.sub, l.n);
  if (lab) return cap && cap!=="🔒 …"? lab+" · "+cap : lab;
  return cap || "Message deleted";
}
function ensureMedia(it){
  if (!it) return Promise.reject(new Error("none"));
  if (it.local) return Promise.resolve(it.local);
  const k=it.path; if (!k) return Promise.reject(new Error("none"));
  if (MEDIA_CACHE[k]) return Promise.resolve(MEDIA_CACHE[k]);
  if (MEDIA_P[k]) return MEDIA_P[k];
  return MEDIA_P[k]=(async()=>{
    if (S.mode==="live") { const dec=await kvGet(LOCAL.key("fd:"+k)); if (dec) return MEDIA_CACHE[k]=URL.createObjectURL(new Blob([dec], {type:it.mime||"application/octet-stream"})); }
    let buf=S.mode==="live"? await kvGet(LOCAL.key("f:"+k)) : null;
    if (!buf) { const r=await fetch(blobUrl(k)); if (!r.ok) throw new Error("load"); buf=await r.arrayBuffer(); if (S.mode==="live") kvSet(LOCAL.key("f:"+k), buf); }
    if (it.k) { const key=await crypto.subtle.importKey("raw", b64d(it.k), {name:"AES-GCM"}, false, ["decrypt"]); buf=await crypto.subtle.decrypt({name:"AES-GCM", iv:b64d(it.iv)}, key, buf); }
    return MEDIA_CACHE[k]=URL.createObjectURL(new Blob([buf], {type:it.mime||"application/octet-stream"}));
  })().catch(e=>{ delete MEDIA_P[k]; throw e; });
}
async function sendRich(cid, kind, payload, caption="", extra={}, id){
  const chn=S.channels.find(c=>c.id===cid)||{}; const members=chn.members||[S.me];
  id=id||newMsgId();
  const msg={by:S.me, at:now(), kind, ...extra};
  if (await canSeal(members)) { const a=await seal(caption||"", members); msg.enc=a.env; msg.text=""; const b=await seal(JSON.stringify(payload), members); msg.penc=b.env; }
  else { msg.text=caption||""; msg.payload=payload; }
  await guarded(store.set(`channels/${cid}/messages/${id}`, msg));
  const items=payload.items||[]; const sub = kind==="media"? (items[0]||{}).t : kind;
  const last={by:S.me, at:msg.at, kind, sub, n:items.length||1}; if (msg.enc) { last.enc=msg.enc; last.text=""; } else last.text=(caption||"").slice(0,120);
  guarded(store.update(`channels/${cid}`, {last})).catch(()=>{});
  return {id, ...msg};
}
function addPending(p){ S.pend.push(p); scrollDown=true; scheduleRender(); return p; }
function dropPending(id){ S.pend=S.pend.filter(p=>p.id!==id); scheduleRender(); }
function setPendProg(id, txt){ const el=document.getElementById("up-"+id); if (el) el.textContent=txt; const p=S.pend.find(x=>x.id===id); if (p) p.prog=txt; }

const isVideoFile = f => (f.type||"").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(f.name||"");
const fmtSize = b => b<1024? b+" B" : b<1048576? (b/1024).toFixed(0)+" KB" : (b/1048576).toFixed(1)+" MB";
function imgDims(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res({w:i.naturalWidth, h:i.naturalHeight, img:i}); i.onerror=()=>res({w:4,h:3}); i.src=src; }); }
async function tinyThumb(src, max=40, q=.5){ const {w,h:hh,img}=await imgDims(src); if (!img) return {w,h:hh,thumb:""}; const k=Math.min(1,max/Math.max(w,hh)); const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(hh*k)); c.getContext("2d").drawImage(img,0,0,c.width,c.height); return {w,h:hh,thumb:c.toDataURL("image/jpeg",q)}; }
function videoPoster(url){
  return new Promise(res=>{ const v=document.createElement("video"); v.muted=true; v.playsInline=true; v.preload="auto"; let done=false; const fin=r=>{ if (done) return; done=true; res(r); };
    v.onloadeddata=()=>{ try { v.currentTime=Math.min(.2,(v.duration||1)/2); } catch { fin({}); } };
    v.onseeked=()=>{ try { const k=Math.min(1,320/Math.max(v.videoWidth,v.videoHeight||1)); const c=document.createElement("canvas"); c.width=Math.round(v.videoWidth*k)||320; c.height=Math.round(v.videoHeight*k)||180; c.getContext("2d").drawImage(v,0,0,c.width,c.height); fin({w:v.videoWidth,h:v.videoHeight,dur:v.duration,thumb:c.toDataURL("image/jpeg",.6)}); } catch { fin({}); } };
    v.onerror=()=>fin({}); setTimeout(()=>fin({}), 4000); v.src=url; });
}
async function uploadEncrypted(blob, mime){
  let up=blob, k="", iv="";
  if (E2E.ready && window.crypto && crypto.subtle) { const key=crypto.getRandomValues(new Uint8Array(32)); const ivb=crypto.getRandomValues(new Uint8Array(12)); const ck=await crypto.subtle.importKey("raw", key, {name:"AES-GCM"}, false, ["encrypt"]); up=new Blob([await crypto.subtle.encrypt({name:"AES-GCM", iv:ivb}, ck, await blob.arrayBuffer())], {type:"application/octet-stream"}); k=b64e(key); iv=b64e(ivb); }
  if (!SB) return {local:URL.createObjectURL(blob), k:"", iv:""};
  const path=S.me+"/"+Date.now().toString(36)+uidShort()+".bin";
  const {error}=await SB.storage.from("media").upload(path, up, {contentType:"application/octet-stream", upsert:false});
  if (error) throw {code:"upload", message:error.message};
  MEDIA_CACHE[path]=URL.createObjectURL(blob);
  return {path, k, iv, mime};
}
async function sendMedia(cid, files, caption, kindHint){
  if (!cid || !files.length) return;
  const id=newMsgId(); const extra={}; if (S.replyTo) { extra.replyTo=S.replyTo; S.replyTo=null; }
  const pitems=files.map(f=>({t: kindHint==="file"? "file" : isVideoFile(f)? "video":"image", local:URL.createObjectURL(f), name:f.name, size:f.size, mime:f.type}));
  const pend=addPending({id, cid, by:S.me, at:now(), kind:"media", text:caption||"", local:{items:pitems}, pending:true, prog:"0%"});
  try {
    const out=[];
    for (let i=0;i<files.length;i++) {
      const f=files[i], t=pitems[i].t; setPendProg(id, files.length>1? (i+1)+"/"+files.length : "…");
      if (t==="image") {
        const small=await shrinkImage(f); const url=URL.createObjectURL(small); const {w,h:hh,thumb}=await tinyThumb(url, 40, .5); pitems[i].w=w; pitems[i].h=hh;
        const u=await uploadEncrypted(small, small.type||"image/jpeg"); out.push({t, ...u, mime:small.type||"image/jpeg", w, h:hh, thumb});
      } else if (t==="video") {
        let blob=f, mime=(f.type||"video/mp4").split(";")[0]; if (mime==="video/quicktime") mime="video/mp4";
        const meta=await videoPoster(pitems[i].local); if ((meta.dur||0)>VIDEO_MAX_S+.5) throw {code:"long"};
        if (blob.size>48*1048576) { blob=await compressVideo(f, p=>setPendProg(id, Math.round(p*100)+"%")); mime="video/webm"; if (blob.size>48*1048576) throw {code:"big"}; }
        const u=await uploadEncrypted(blob, mime); out.push({t, ...u, mime, w:meta.w||16, h:meta.h||9, dur:meta.dur||0, thumb:meta.thumb||""});
      } else {
        if (f.size>48*1048576) throw {code:"big"};
        const u=await uploadEncrypted(f, f.type||"application/octet-stream"); out.push({t, ...u, mime:f.type||"application/octet-stream", name:f.name||"File", size:f.size});
      }
    }
    if (!SB) out.forEach((o,i)=>{ if (o.local) { o.local=pitems[i].local; } });
    await sendRich(cid, "media", {items:out}, caption, extra, id);
    if (!SB) { const m=S.pend.find(p=>p.id===id); if (m) { m.pending=false; m.local={items:out}; } scheduleRender(); }
  } catch(e) {
    dropPending(id);
    toast(e&&e.code==="long"? "Videos can be up to 5 minutes." : e&&e.code==="big"? "That file is too large (max 48 MB)." : e&&e.code==="no_compress"? "That video is too large to send from this browser." : "It didn't send. Check your connection and try again.");
  }
}
function pickFiles(opts){
  const inp=h("input",{type:"file", accept:opts.accept, multiple:!!opts.multiple, capture:opts.capture||null, hidden:true, onchange:e=>{ const fs=[...(e.target.files||[])]; inp.remove(); if (fs.length) opts.done(fs); }});
  document.body.append(inp); inp.click();
}
function openAttach(anchor){
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const r=anchor.getBoundingClientRect();
  const item=(cls, icon, label, fn)=>h("button",{onclick:()=>{ scrim.remove(); fn(); }}, h("span",{class:"aic "+cls}, svg(icon)), label);
  scrim.append(h("div",{class:"popmenu attachmenu", role:"menu", style:`left:${Math.max(8, Math.min(r.left-20, innerWidth-236))}px;bottom:${innerHeight-r.top+10}px`},
    item("a-photo", ICF.image, "Photos & Videos", ()=>pickFiles({accept:"image/*,video/*", multiple:true, done:fs=>openMediaPreview(fs.slice(0,10))})),
    item("a-cam", ICF.camera, "Camera", ()=>pickFiles({accept:"image/*,video/*", capture:"environment", done:fs=>openMediaPreview(fs)})),
    item("a-doc", ICF.doc, "Document", ()=>pickFiles({accept:"*/*", done:fs=>sendMedia(S.active, fs.slice(0,1), "", "file")})),
    item("a-loc", ICF.pin2, "Location", openLocationPicker),
    item("a-con", ICF.contact, "Contact", openContactPicker)));
  document.body.append(scrim);
}
function openMediaPreview(files){
  const cid=S.active; if (!cid) return;
  let items=files.map(f=>({f, url:URL.createObjectURL(f), v:isVideoFile(f)})), cur=0, cap="";
  const o=overlay("mprev","Send photos and videos");
  const close=()=>{ o.remove(); };
  const draw=()=>{
    if (!items.length) { close(); return; }
    cur=Math.min(cur, items.length-1); const it=items[cur];
    o.replaceChildren(
      h("div",{class:"mp-top"}, h("button",{class:"sc-ic","aria-label":"Close", title:"Close", onclick:close}, svg(IC.x)), h("span",{class:"grow"}), items.length>1? h("button",{class:"sc-ic","aria-label":"Remove this one", title:"Remove", onclick:()=>{ items.splice(cur,1); draw(); }}, svg(IC.trash)) : ""),
      h("div",{class:"mp-main"}, it.v? h("video",{src:it.url, controls:true, playsinline:true}) : h("img",{src:it.url, alt:""})),
      items.length>1 || true? h("div",{class:"mp-strip"}, items.map((x,i)=>h("button",{class:"mp-th"+(i===cur?" on":""), onclick:()=>{ cur=i; draw(); }}, x.v? h("video",{src:x.url, muted:true, playsinline:true, preload:"metadata"}) : h("img",{src:x.url, alt:""}))),
        items.length<10? h("button",{class:"mp-th add","aria-label":"Add more", title:"Add more", onclick:()=>pickFiles({accept:"image/*,video/*", multiple:true, done:fs=>{ items=items.concat(fs.slice(0,10-items.length).map(f=>({f, url:URL.createObjectURL(f), v:isVideoFile(f)}))); draw(); }})}, svg(IC.plus)) : "") : "",
      h("div",{class:"mp-bot"}, h("input",{class:"sc-cap", id:"mp-cap", placeholder:"Add a caption…", value:cap, oninput:e=>cap=e.target.value, onkeydown:e=>{ if (e.key==="Enter") send(); }}), h("button",{class:"sc-send","aria-label":"Send", title:"Send", onclick:send}, svg(IC.send))));
  };
  function send(){ const fs=items.map(x=>x.f); close(); sendMedia(cid, fs, cap.trim()); }
  draw();
}
function openViewer(items, idx, caption){
  let i=idx||0; const o=overlay("viewer","Media");
  const draw=()=>{ const it=items[i]; const box=h("div",{class:"vw-main"}, h("span",{class:"spin big"}));
    o.replaceChildren(h("div",{class:"vw-top"}, h("button",{class:"sc-ic","aria-label":"Close", title:"Close", onclick:()=>o.remove()}, svg(IC.x)), h("span",{class:"grow"}), items.length>1? h("span",{class:"vw-count"}, (i+1)+" / "+items.length) : ""),
      box, items.length>1? h("button",{class:"vw-nav l","aria-label":"Previous", onclick:()=>{ i=(i-1+items.length)%items.length; draw(); }}, svg(IC.back)) : "", items.length>1? h("button",{class:"vw-nav r","aria-label":"Next", onclick:()=>{ i=(i+1)%items.length; draw(); }}, svg(IC.arrow)) : "",
      caption? h("div",{class:"vw-cap"}, caption) : "");
    ensureMedia(it).then(url=>{ box.replaceChildren(it.t==="video"? h("video",{src:url, controls:true, autoplay:true, playsinline:true}) : h("img",{src:url, alt:""})); }).catch(()=>box.replaceChildren(h("p",{},"This couldn't be loaded.")));
  };
  o.addEventListener("keydown", e=>{ if (e.key==="Escape") o.remove(); }); draw();
}
function openFile(it){ toast("Opening…"); ensureMedia(it).then(url=>{ const a=h("a",{href:url, download:it.name||"file", target:"_blank", rel:"noopener"}); document.body.append(a); a.click(); a.remove(); }).catch(()=>toast("This file couldn't be loaded.")); }
function renderMedia(m, p){
  const items=(p&&p.items)||[]; const box=h("div",{class:"mbox n"+Math.min(items.length,4)});
  if (!items.length) return box;
  if (items[0].t==="file") { const it=items[0]; const ext=((it.name||"").split(".").pop()||"").slice(0,4).toUpperCase();
    return h("button",{class:"fcard", onclick:e=>{ e.stopPropagation(); if (!m.pending) openFile(it); }}, h("span",{class:"fic"}, ext||svg(ICF.doc)), h("span",{class:"fnm"}, h("b",{}, it.name||"Document"), h("span",{}, (it.size? fmtSize(it.size):"")+(m.pending? " · sending "+(m.prog||"") : ""))), m.pending? h("span",{class:"spin dark"}) : svg(IC.arrow)); }
  const shownItems=items.slice(0,4);
  shownItems.forEach((it,i)=>{
    const ar = items.length===1 && it.w && it.h? `aspect-ratio:${Math.max(.56,Math.min(1.8,it.w/it.h))}` : "";
    const cell=h("div",{class:"mcell"+(it.t==="video"?" vid":""), style:ar, onclick:e=>{ e.stopPropagation(); if (S.selecting || m.pending) return; openViewer(items, i, plain(m)||""); }});
    const cached = it.local || (it.path && MEDIA_CACHE[it.path]);
    if (it.t==="video") { cell.append(it.thumb? h("img",{src:it.thumb, alt:""}) : it.local? h("video",{src:it.local, muted:true, playsinline:true, preload:"metadata"}) : h("span"), h("span",{class:"playo"}, svg(IC.play)), it.dur? h("span",{class:"vdurb"}, fmtDur(it.dur)) : ""); }
    else { const img=h("img",{alt:"", src: cached || it.thumb || "", class: cached? "" : "blur"}); cell.append(img); if (!cached) ensureMedia(it).then(u=>{ img.src=u; img.classList.remove("blur"); }).catch(()=>{}); }
    if (i===3 && items.length>4) cell.append(h("span",{class:"moreo"}, "+"+(items.length-4)));
    box.append(cell);
  });
  if (m.pending) box.append(h("div",{class:"upo"}, h("span",{class:"spin"}), h("span",{id:"up-"+m.id}, m.prog||"")));
  return box;
}
// --- location ---
function mapStyle(lat, lng, W, H, z=15){
  const n=2**z, xt=(lng+180)/360*n, lr=lat*Math.PI/180, yt=(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n;
  const tx=Math.floor(xt), ty=Math.floor(yt), fx=(xt-tx)*256, fy=(yt-ty)*256; const imgs=[], pos=[];
  for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) { imgs.push(`url("https://tile.openstreetmap.org/${z}/${tx+dx}/${ty+dy}.png")`); pos.push(`${Math.round(W/2-fx+dx*256)}px ${Math.round(H/2-fy+dy*256)}px`); }
  // Under the map tiles: soft streets so the card still looks like a map while tiles load (or offline).
  imgs.push("linear-gradient(118deg,transparent 46%,rgba(255,255,255,.95) 46.5%,rgba(255,255,255,.95) 49%,transparent 49.5%)","linear-gradient(28deg,transparent 60%,rgba(255,255,255,.9) 60.5%,rgba(255,255,255,.9) 62%,transparent 62.5%)","linear-gradient(-14deg,transparent 30%,rgba(255,255,255,.8) 30.5%,rgba(255,255,255,.8) 31.5%,transparent 32%)","radial-gradient(circle at 78% 22%,rgba(200,226,190,.55) 0 12%,transparent 12.5%)","radial-gradient(circle at 12% 80%,rgba(196,220,240,.6) 0 14%,transparent 14.5%)");
  pos.push("0 0","0 0","0 0","0 0","0 0");
  return `background-image:${imgs.join(",")};background-position:${pos.join(",")};background-repeat:no-repeat;background-size:${imgs.map((x,i)=>i<9?"auto":"100% 100%").join(",")}`;
}
const mapsLink = (lat,lng) => /iPhone|iPad|Macintosh/.test(navigator.userAgent)? `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}` : `https://www.google.com/maps?q=${lat},${lng}`;
function renderLocation(p){
  if (!p || p.lat==null) return h("span",{class:"tx"},"📍 Location");
  return h("a",{class:"lcard", href:mapsLink(p.lat,p.lng), target:"_blank", rel:"noopener", onclick:e=>e.stopPropagation()},
    h("div",{class:"lmap", style:mapStyle(p.lat,p.lng,250,150)}, h("span",{class:"lpin2"}, h("i"), svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4" fill="#fff" stroke="none"/>')), h("span",{class:"losm"}, "© OpenStreetMap")),
    h("div",{class:"lmeta2", title:p.lat.toFixed(5)+", "+p.lng.toFixed(5)},
      h("span",{class:"lic"}, svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>')),
      h("span",{class:"ltx"}, h("b",{}, p.label||p.name||"Shared location"), h("span",{}, "Open in Maps")),
      svg('<path d="M9.5 6l6 6-6 6"/>')));
}
function openLocationPicker(){
  const cid=S.active; if (!cid) return;
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const box=h("div",{class:"modal locsheet", role:"dialog", "aria-label":"Send location"}, h("div",{class:"sheethead"}, h("b",{class:"sheettitle"},"Send location"), h("span",{class:"grow"}), h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:()=>scrim.remove()}, svg(IC.x))), h("div",{class:"locwait"}, h("span",{class:"spin dark"}), "Finding your location…"));
  scrim.append(box); document.body.append(scrim);
  if (!navigator.geolocation) { box.lastChild.replaceWith(h("p",{class:"note"},"Location isn't available in this browser.")); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const lat=+pos.coords.latitude.toFixed(6), lng=+pos.coords.longitude.toFixed(6), acc=Math.round(pos.coords.accuracy||0);
    box.lastChild.replaceWith(h("div",{class:"locprev"}, h("div",{class:"lmap big", style:mapStyle(lat,lng,320,180)}, h("span",{class:"lpin"}, svg(ICF.pin2))), h("p",{class:"note"}, "Accurate to "+acc+" m · © OpenStreetMap"),
      h("button",{class:"primary wide", onclick:async()=>{ scrim.remove(); const id=newMsgId(); addPending({id, cid, by:S.me, at:now(), kind:"location", local:{lat,lng,acc}, pending:true}); try { await sendRich(cid, "location", {lat,lng,acc}, "", {}, id); if (!SB) { const m=S.pend.find(x=>x.id===id); if (m) m.pending=false; scheduleRender(); } } catch { dropPending(id); } }}, svg(ICF.pin2), "Send your current location")));
  }, err=>{ box.lastChild.replaceWith(h("p",{class:"note"}, err && err.code===1? "Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App." : "Couldn't get your location. Try again outside or with Wi-Fi on.")); }, {enableHighAccuracy:true, timeout:15000, maximumAge:30000});
}
// --- contacts ---
function renderContactCard(p){
  if (!p) return h("span",{class:"tx"},"👤 Contact");
  const ph=(p.p||[])[0]||""; const uid=p.uid && p.uid!==S.me? p.uid : null;
  return h("div",{class:"ccard", onclick:e=>e.stopPropagation()},
    h("div",{class:"cchead"}, uid && S.people[uid]? avatar(uid,"lg") : monogram(p.n, "glyph g44"), h("div",{class:"ccx"}, h("b",{}, p.n||ph), h("span",{}, ph))),
    h("div",{class:"ccacts"},
      uid? h("button",{onclick:async()=>{ const id=await ensureDM(uid); if (id) selectChannel(id); }}, "Message") : ph? h("a",{href:"sms:"+normPhone(ph)+"?&body="+encodeURIComponent("Join me on Task Message")}, "Invite") : "",
      uid && !S.contacts.includes(uid)? h("button",{onclick:()=>setContact(uid,true)}, "Save") : ph? h("a",{href:"tel:"+normPhone(ph)}, "Call") : ""));
}
function openContactPicker(){
  const cid=S.active; if (!cid) return; let q="";
  const o=overlay("fwdview","Share contact"); o.id="conpick";
  const draw=()=>{
    const ql=q.trim().toLowerCase(); const match=s=>!ql || String(s||"").toLowerCase().includes(ql);
    const onC=[...new Set([...S.contacts, ...S.onConcept])].filter(id=>id!==S.me && (match(nameOf(id)) || match((S.teamDocs[id]||{}).phone))).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    const book=(S.addr||[]).filter(c=>!c.on && (match(c.n) || c.p.some(x=>x.includes(ql))));
    const send=async (payload)=>{ o.remove(); const id=newMsgId(); addPending({id, cid, by:S.me, at:now(), kind:"contact", local:payload, pending:true}); try { await sendRich(cid, "contact", payload, "", {}, id); if (!SB) { const m=S.pend.find(x=>x.id===id); if (m) m.pending=false; scheduleRender(); } } catch { dropPending(id); } };
    swapKids(o, [
      h("header",{class:"fhead"}, h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:()=>o.remove()}, svg(IC.back)), h("input",{id:"cp-q", class:"fsearch", placeholder:"Search contacts", value:q, oninput:e=>{ q=e.target.value; draw(); }})),
      h("div",{class:"flist"},
        onC.length? [h("div",{class:"seg-label"},"On Task Message"), ...onC.map(id=>h("button",{class:"frow", onclick:()=>send({n:nameOf(id).replace(/^Example:\s*/,""), p:[(S.teamDocs[id]||{}).phone].filter(Boolean), uid:id})}, h("span",{class:"cav"}, avatar(id,"lg")), h("span",{class:"ctx"}, h("b",{}, nameOf(id).replace(/^Example:\s*/,"")), h("span",{}, (S.teamDocs[id]||{}).phone||""))))] : "",
        book.length? [h("div",{class:"seg-label"},"Phone contacts"), lazyRows(book, c=>h("button",{class:"frow", onclick:()=>send({n:c.n, p:c.p})}, monogram(c.n, "glyph g44"), h("span",{class:"ctx"}, h("b",{}, c.n), h("span",{}, c.p[0]))))] : "",
        !onC.length && !book.length? h("div",{class:"flowempty"}, h("p",{}, ql? "No results" : "No contacts yet"), ql? "" : h("button",{class:"ghost", onclick:()=>{ o.remove(); importContacts(); }}, svg(ICF.book), "Import phone contacts")) : "")]);
  };
  draw(); setTimeout(()=>{ const n=$("#cp-q"); if (n) n.focus(); }, 50);
}

// ===================== emoji keyboard =====================
const EMOJI_SETS=[
  ["😀", "😀😃😄😁😆😅😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🫡🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👻💀🤖👽🎃😺😸"],
  ["👍", "👍👎👊✊🤛🤜🤞✌️🫶🤟🤘👌🤌🤏👈👉👆👇☝️✋🤚🖐️🖖👋🤙💪🦾🙏🫡👏🙌👐🤲🤝✍️💅🤳👀👁️👅👄🫦👶🧒👦👧🧑👨👩🧓👴👵👮👷💂🕵️👩‍⚕️👨‍🍳👩‍🔧👨‍🔧👩‍💻👨‍💻👩‍🏫👨‍🏭🧑‍🚒👰🤵🫅👸🤴🦸🧙🧚🙋🙆🙅🤷🤦💁🙇"],
  ["❤️", "❤️🧡💛💚💙💜🖤🤍🤎💔❤️‍🔥❣️💕💞💓💗💖💘💝💟☮️✝️✡️🕎🔯☪️🕉️☯️♈♉♊♋♌♍♎♏♐♑♒♓🆗🆒🆕🆙🆓✅☑️✔️❌❎➕➖➗✖️💯🔥⭐🌟✨⚡💥💢💤💬💭🗯️♻️⚠️🚫⛔📛🔴🟠🟡🟢🔵🟣⚫⚪"],
  ["🍕", "🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🥑🍆🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🥪🌮🌯🥗🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯☕🍵🧃🥤🧋🍺🍻🥂🍷🥃🍸🍹🍾🧊"],
  ["⚽", "⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🏑🥍🏏🪃🥅⛳🏹🎣🥊🥋🎽🛹🛼⛸️🥌🎿⛷️🏂🏋️🤸⛹️🤺🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🎰🧩"],
  ["🚗", "🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🛻🚚🚛🚜🛵🏍️🛺🚲🛴🚨🚔🚍🚘🚖✈️🛫🛬🛩️🚀🛸🚁⛵🚤🛥️🛳️⛴️🚢⚓🚧⛽🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋"],
  ["🔧", "🔧🔨⚒️🛠️⛏️🪚🔩⚙️🧰🪛🪜🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️🏺🔮📿🧿💈⚗️🔭🔬🕳️🩹🩺💊💉🩸🧬🦠🧫🧪🌡️🧹🧺🧻🚽🚰🚿🛁🧼🪥🪒🧽🪣🧴🛎️🔑🗝️🚪🪑🛋️🛏️🧸🖼️🛍️🛒🎁🎈🎏🎀🎊🎉📦📫📮📯📜📃📄📑🧾📊📈📉🗒️🗓️📆📅📇🗃️🗳️🗄️📋📁📂🗂️🗞️📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇️📐📏🧮📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓💡🔦🏮📱💻⌨️🖥️🖨️🖱️💾💿📷📸📹🎥📞☎️📟📠📺📻⏰⏱️⏲️🕰️⌛⏳📡🔋🔌💰💵💳💎⚖️"],
  ["🐶", "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐒🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🪲🦟🦗🕷️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🐓🦃🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦫🦦🦥🐁🐀🐿️🦔🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🎋🍃🍂🍁🍄🐚🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️🌨️❄️☃️⛄🌬️💨💧💦☔☂️🌊🌫️"]
];
const splitEmoji = s => { try { return [...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(s)].map(x=>x.segment); } catch { return Array.from(s); } };
function renderEmojiPanel(){
  const recent=Object.entries(ls.get("emojiUse",{})).sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,32);
  const tab=S.emojiTab ?? (recent.length? -1 : 0);
  const list = tab===-1? recent : splitEmoji(EMOJI_SETS[tab][1]);
  return h("div",{class:"emojipanel", onmousedown:e=>e.preventDefault()},
    h("div",{class:"epgrid"}, list.map(e=>h("button",{class:"ep", "aria-label":e, onclick:()=>insertEmoji(e)}, e))),
    h("div",{class:"eptabs"},
      recent.length? h("button",{class:"ept"+(tab===-1?" on":""), "aria-label":"Recent", onclick:()=>{ S.emojiTab=-1; refreshEmoji(); }}, svg(CLOCK)) : "",
      EMOJI_SETS.map(([icon],i)=>h("button",{class:"ept"+(tab===i?" on":""), "aria-label":"Category", onclick:()=>{ S.emojiTab=i; refreshEmoji(); }}, icon)),
      h("button",{class:"ept del", "aria-label":"Delete", title:"Delete", onclick:()=>{ const t=$("#composer"); if (!t) return; const a=t.selectionStart??t.value.length, b=t.selectionEnd??a; if (a!==b) { t.value=t.value.slice(0,a)+t.value.slice(b); t.setSelectionRange(a,a); } else if (a>0) { const before=splitEmoji(t.value.slice(0,a)); before.pop(); const nb=before.join(""); t.value=nb+t.value.slice(a); t.setSelectionRange(nb.length,nb.length); } t.dispatchEvent(new Event("input",{bubbles:true})); }}, svg('<path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>'))));
}
function refreshEmoji(){ const p=$(".emojipanel"); if (p) p.replaceWith(renderEmojiPanel()); }
function insertEmoji(e){
  const t=$("#composer"); if (!t) return;
  const a=t.selectionStart??t.value.length, b=t.selectionEnd??a;
  t.value=t.value.slice(0,a)+e+t.value.slice(b); const p=a+e.length; try { t.setSelectionRange(p,p); } catch {}
  const u=ls.get("emojiUse",{}); u[e]=(u[e]||0)+1; ls.set("emojiUse",u);
  t.dispatchEvent(new Event("input",{bubbles:true}));
}

// ===================== voice note draft (voice + text in one message) =====================
let DRAFT_AUDIO=null;
function renderVoiceDraft(){
  const d=S.vdraft; if (!d || d.cid!==S.active) return "";
  const btn=h("button",{class:"vdplay","aria-label":"Play", title:"Play", onclick:()=>{ if (DRAFT_AUDIO && !DRAFT_AUDIO.paused) { DRAFT_AUDIO.pause(); return; } DRAFT_AUDIO=new Audio(d.url); DRAFT_AUDIO.onended=DRAFT_AUDIO.onpause=()=>btn.replaceChildren(svg(IC.play)); DRAFT_AUDIO.play().catch(()=>{}); btn.replaceChildren(svg(IC.pause)); }}, svg(IC.play));
  return h("div",{class:"vdraft"}, btn, h("div",{class:"vdbars"}, (d.peaks||[]).map(p=>h("i",{style:`height:${Math.round(18+p*82)}%`}))), h("span",{class:"vddur mono"}, fmtDur(d.dur)), h("button",{class:"iconbtn sm","aria-label":"Remove voice note", title:"Remove", onclick:()=>{ if (DRAFT_AUDIO) DRAFT_AUDIO.pause(); S.vdraft=null; render(true); }}, svg(IC.x)));
}

// ===================== notification tones, mute, delete & swipe actions =====================
const TN = window.CONCEPT_TONES || {TONES:[], render:()=>new Float32Array(1)};
const toneName = id => id==="none"? "None" : ((TN.TONES.find(t=>t.id===id)||TN.TONES[0]||{name:"Default"}).name);
const validTone = id => id==="none" || TN.TONES.some(t=>t.id===id);
function toneFor(c){ const tt=S.nt.tones||{}; const own=tt[c.id] || (c.parent && tt[c.parent]); if (own && validTone(own)) return own; return c.kind==="dm"? (S.nt.tone||"note") : (S.nt.groupTone||"chime"); }
const muteUntil = id => { const u=(S.nt.mute||{})[id]; return u===undefined || u===null? null : u; };
const mutedId = id => { const u=muteUntil(id); return u===0 || (u!==null && u>now()); };
const isMuted = c => !!c && (mutedId(c.id) || (c.kind==="task" && !!c.parent && mutedId(c.parent)));
function muteText(c){ const u=muteUntil(c.id); if (u===0) return "Always"; if (u && u>now()) { const d=new Date(u); const same=new Date().toDateString()===d.toDateString(); return "Until "+(same? d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}) : d.toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"})); } return c.parent && mutedId(c.parent)? "Group muted" : "Off"; }
function saveNt(){ ls.set("nt", S.nt); savePrefsDoc(); }
function setMute(cid, until){ const m={...(S.nt.mute||{})}; if (until===null) delete m[cid]; else m[cid]=until; S.nt.mute=m; saveNt(); render(true); toast(until===null? "Unmuted" : "Muted"); }
function setChatTone(cid, id){ const t={...(S.nt.tones||{})}; if (!id) delete t[cid]; else t[cid]=id; S.nt.tones=t; saveNt(); }
function toggleUnread(c){ const u=S.nt.unr||[]; if (unread(c)) { S.nt.unr=u.filter(x=>x!==c.id); S.lastRead[c.id]=now(); ls.set("lastRead",S.lastRead); } else S.nt.unr=[...new Set([...u, c.id])]; saveNt(); render(true); }

// --- sound ---
let AC=null; const toneBuf={};
function audioCtx(){ if (!AC) { try { AC=new (window.AudioContext||window.webkitAudioContext)(); } catch { AC=null; } } if (AC && AC.state==="suspended") AC.resume().catch(()=>{}); return AC; }
["pointerdown","keydown"].forEach(ev=>addEventListener(ev, ()=>audioCtx(), {once:true, capture:true}));
function playTone(id){
  if (!id || id==="none") return; const t=TN.TONES.find(x=>x.id===id); const ac=audioCtx(); if (!t || !ac) return;
  try {
    if (!toneBuf[id]) { const d=TN.render(t, ac.sampleRate); const b=ac.createBuffer(1, d.length, ac.sampleRate); b.getChannelData(0).set(d); toneBuf[id]=b; }
    const src=ac.createBufferSource(), g=ac.createGain(); g.gain.value=.55; src.buffer=toneBuf[id]; src.connect(g).connect(ac.destination); src.start();
  } catch {}
}
let seenLast=null, lastBuzz=0;
function noticeIncoming(chans){
  const fresh=!seenLast; if (fresh) seenLast={};
  let hit=null;
  for (const c of chans) { const l=c.last; if (!l) continue; const prev=seenLast[c.id]; seenLast[c.id]=l.at;
    if (fresh || prev===undefined || l.at<=prev || l.by===S.me || isBlocked(l.by) || isMuted(c)) continue;
    if (now()-l.at>60000) continue;
    if (!hit || l.at>hit.last.at) hit=c; }
  if (!hit) return;
  const visible=document.visibilityState==="visible", here=hit.id===S.active && S.inThread && S.view==="chats";
  if (!visible) return;
  if (Date.now()-lastBuzz<1200) return; lastBuzz=Date.now();
  if (S.prefs.inAppSound!==false) playTone(here? null : toneFor(hit)) ;
  if (here) { if (S.prefs.inAppSound!==false) playTone(null); return; }
  if (S.prefs.vibrate!==false && navigator.vibrate) try { navigator.vibrate(60); } catch {}
  if (S.prefs.inAppBanner!==false) msgBanner(hit);
}
let bannerT;
function msgBanner(c){
  document.querySelectorAll(".inbanner").forEach(x=>x.remove());
  const l=c.last||{}; const who=c.kind!=="dm" && l.by? nameOf(l.by).replace(/^Example:\s*/,"").split(" ")[0]+": " : "";
  const b=h("button",{class:"inbanner", role:"status", onclick:()=>{ b.remove(); selectChannel(c.id); }}, chanGlyph(c), h("span",{class:"ibx"}, h("b",{}, chanTitle(c)), h("span",{}, who+lastPreview(l))));
  let sy=null; b.addEventListener("pointerdown", e=>sy=e.clientY); b.addEventListener("pointermove", e=>{ if (sy!==null && e.clientY-sy<-14) { b.classList.add("out"); setTimeout(()=>b.remove(), 200); sy=null; } });
  document.body.append(b); clearTimeout(bannerT); bannerT=setTimeout(()=>{ b.classList.add("out"); setTimeout(()=>b.remove(), 220); }, 3800);
}

// --- sheets ---
function sheet(title, build, opts={}){
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) close(); }}); const close=()=>{ scrim.remove(); opts.onClose&&opts.onClose(); };
  const draw=()=>{ const old=scrim.firstChild; const m=h("div",{class:"modal ntsheet", role:"dialog", "aria-label":title},
    h("div",{class:"sheethead"}, h("b",{class:"sheettitle"}, title), h("span",{class:"grow"}), h("button",{class:"iconbtn", title:"Close", "aria-label":"Close", onclick:close}, svg(IC.x))),
    ...[build(draw, close)].flat());
    if (old && old.contains(document.activeElement) && document.activeElement.id) { const st=old.scrollTop; swapKids(old, [...m.childNodes]); old.scrollTop=st; old.__draw=draw; } else { const st=old? old.scrollTop : 0; scrim.replaceChildren(m); m.__draw=draw; if (st) m.scrollTop=st; } };
  draw(); document.body.append(scrim); return close;
}
const pickList = (items, cur, pick) => h("div",{class:"ulist sgroup"}, items.map(([v,l,sub])=>h("button",{class:"srow pick1"+(v===cur?" on":""), onclick:()=>pick(v)}, h("span",{class:"stx"}, h("b",{}, l), sub? h("span",{}, sub):""), v===cur? svg(ICF.check) : "")));
const toneItems = () => [...TN.TONES.map(t=>[t.id, t.name]), ["none","None"]];
function openTonePicker({title, value, onPick}){
  let cur=value;
  sheet(title, draw=>[pickList(toneItems(), cur, v=>{ cur=v; playTone(v); onPick(v); draw(); })]);
}
const MUTE_OPTS = [["8h","8 hours"],["1w","1 week"],["always","Always"]];
const muteFor = k => k==="8h"? now()+8*3600e3 : k==="1w"? now()+7*86400e3 : 0;
function openMute(c){
  sheet("Mute "+chanTitle(c), (draw, close)=>[h("p",{class:"note", style:"margin:0"}, "No sound or banner for new messages. "+(c.kind==="dm"? "They won't know." : "Others won't know.")),
    pickList(MUTE_OPTS, null, k=>{ close(); setMute(c.id, muteFor(k)); })]);
}
function openChatNotif(c){
  sheet(chanTitle(c), draw=>{
    const u=muteUntil(c.id), on=mutedId(c.id); const tt=(S.nt.tones||{})[c.id]||"";
    const def=c.kind==="dm"? S.nt.tone : S.nt.groupTone;
    return [
      h("div",{class:"seg-label"}, "Mute"),
      h("div",{class:"segmini wide", role:"group", "aria-label":"Mute"}, [["off","Off"],...MUTE_OPTS].map(([k,l])=>h("button",{"aria-pressed":String(k==="off"? !on : on && (k==="always"? u===0 : k==="1w"? u>now()+86400e3 : u!==0 && u<=now()+86400e3)), onclick:()=>{ const m={...(S.nt.mute||{})}; if (k==="off") delete m[c.id]; else m[c.id]=muteFor(k); S.nt.mute=m; saveNt(); draw(); }}, l))),
      on? h("p",{class:"note", style:"margin:-6px 4px 0"}, u===0? "Muted until you turn it back on" : "Muted "+muteText(c).toLowerCase()) : "",
      h("div",{class:"seg-label"}, "Notification tone"),
      pickList([["", "Default", toneName(def)], ...toneItems()], tt, v=>{ setChatTone(c.id, v); playTone(v||def); draw(); })];
  }, {onClose:()=>render(true)});
}
function confirmDeleteChat(c){
  sheet("Delete chat?", (draw, close)=>[
    h("p",{class:"note", style:"margin:0"}, "“"+chanTitle(c)+"” will be removed from your chat list and its messages hidden on your devices. It comes back if someone sends a new message."),
    h("div",{class:"modalacts"}, h("button",{class:"ghost", onclick:close}, "Cancel"), h("button",{class:"primary danger-bg", onclick:()=>{ close(); deleteChat(c); }}, "Delete"))]);
}
function deleteChat(c){
  const t=Math.max(now(), (c.last&&c.last.at)||0, ...subsOf(c.id).map(x=>(x.last&&x.last.at)||0));
  S.nt.cleared={...(S.nt.cleared||{}), [c.id]:t}; S.nt.unr=(S.nt.unr||[]).filter(x=>x!==c.id);
  if (S.pins.includes(c.id)) S.pins=S.pins.filter(x=>x!==c.id);
  if (S.active===c.id) { S.inThread=false; S.active=null; ls.set("active", null); }
  saveNt(); render(); toast("Chat deleted", {label:"Undo", fn:()=>{ const cl={...S.nt.cleared}; delete cl[c.id]; S.nt.cleared=cl; saveNt(); render(); }});
}
function resetNotif(){
  sheet("Reset notifications?", (draw, close)=>[h("p",{class:"note", style:"margin:0"}, "Unmutes every chat and puts every chat back on the default tone."),
    h("div",{class:"modalacts"}, h("button",{class:"ghost", onclick:close}, "Cancel"), h("button",{class:"primary", onclick:()=>{ close(); S.nt.mute={}; S.nt.tones={}; saveNt(); render(); toast("Reset"); }}, "Reset"))]);
}

// --- swipe a chat row: right = read/pin, left = mute/delete ---
const SW={drag:false, pending:false, open:null};
const SWB=72;
function swipeActs(c){
  const isTop=!(c.kind==="task" && c.parent), ur=unread(c), mu=isMuted(c), pinned=S.pins.includes(c.id);
  return {
    l:[{k:"read", cls:"sw-blue", icon: ur? ICF.check : ICF.dotchat, label: ur? "Read" : "Unread", fn:()=>toggleUnread(c)},
       isTop? {k:"pin", cls:"sw-gray", icon:IC.pin, label: pinned? "Unpin" : "Pin", fn:()=>togglePin(c.id)} : null].filter(Boolean),
    r:[{k:"mute", cls:"sw-orange", icon: mu? ICF.bell : ICF.bellx, label: mu? "Unmute" : "Mute", fn:()=> mu? setMute(c.id, null) : openMute(c)},
       {k:"del", cls:"sw-red", icon:IC.trash, label:"Delete", fn:()=>confirmDeleteChat(c)}]
  };
}
function closeSwipe(anim=true){ if (!SW.open) return; const r=document.querySelector(`.swrow[data-sw="${SW.open}"]`); SW.open=null; if (r) setOff(r, 0, anim); }
function setOff(row, x, anim){ const li=row.querySelector(":scope > .lineitem"); if (!li) return; row.classList.toggle("anim", !!anim); li.style.setProperty("--swx", x+"px"); row.dataset.off=String(x); row.classList.toggle("sl", x>0); row.classList.toggle("sr", x<0); }
document.addEventListener("pointerdown", e=>{ if (SW.open && !e.target.closest(`.swrow[data-sw="${SW.open}"] .swacts`)) { const inRow=e.target.closest(`.swrow[data-sw="${SW.open}"]`); closeSwipe(); if (inRow) inRow.dataset.eat="1"; } }, true);
// Gmail-style swipe on a chat row: the row follows your finger over a colored strip with one icon.
// Swipe right = mark read / unread. Swipe left = delete (asks first). Let go past the line to do it.
function swipeWrap(li, c){
  const ur=unread(c);
  const R={cls:"sw-blue", icon: ur? ICF.check : ICF.dotchat, label: ur? "Read" : "Unread", fn:()=>toggleUnread(c)};
  const L={cls:"sw-red", icon:IC.trash, label:"Delete"};
  const row=h("div",{class:"swrow gm", "data-sw":c.id},
    h("div",{class:"gmbg l "+R.cls, "aria-hidden":"true"}, h("span",{class:"gmic"}, svg(R.icon)), h("b",{}, R.label)),
    h("div",{class:"gmbg r "+L.cls, "aria-hidden":"true"}, h("b",{}, L.label), h("span",{class:"gmic"}, svg(L.icon))),
    li);
  let st=null;
  const TH=()=>Math.min(140, row.clientWidth*.3);
  row.addEventListener("pointerdown", e=>{ if (e.button>0 || e.target.closest(".subtoggle")) return; st={x:e.clientX, y:e.clientY, id:e.pointerId, mode:null, off:0, armed:false}; });
  row.addEventListener("pointermove", e=>{
    if (!st || e.pointerId!==st.id) return; const dx=e.clientX-st.x, dy=e.clientY-st.y;
    if (!st.mode) { if (Math.abs(dx)>10 && Math.abs(dx)>Math.abs(dy)*1.4) { st.mode="h"; SW.drag=true; try { row.setPointerCapture(st.id); } catch {} } else if (Math.abs(dy)>10) { st=null; return; } else return; }
    const W=row.clientWidth; let x=Math.max(-W, Math.min(W, dx));
    st.off=x; setOff(row, x, false);
    const armed=Math.abs(x)>TH(); if (armed!==st.armed) { st.armed=armed; row.classList.toggle("armed", armed); if (armed && navigator.vibrate) try { navigator.vibrate(8); } catch {} }
    e.preventDefault();
  });
  const end=()=>{
    if (!st) return; const s=st; st=null; if (s.mode!=="h") return;
    row.dataset.eat="1"; setTimeout(()=>{ delete row.dataset.eat; }, 350);
    SW.drag=false; row.classList.remove("armed");
    const flush=()=>{ if (SW.pending) { SW.pending=false; setTimeout(()=>{ if (!SW.drag) scheduleRender(); }, 300); } };
    if (s.off>TH()) { setOff(row, 0, true); setTimeout(()=>{ R.fn(); flush(); }, 260); return; }
    if (-s.off>TH()) {
      setOff(row, -row.clientWidth, true);
      let gone=false;
      setTimeout(()=>sheet("Delete chat?", (draw, close)=>[
        h("p",{class:"note", style:"margin:0"}, "“"+chanTitle(c)+"” will be removed from your chat list and its messages hidden on your devices. It comes back if someone sends a new message."),
        h("div",{class:"modalacts"}, h("button",{class:"ghost", onclick:close}, "Cancel"), h("button",{class:"primary danger-bg", onclick:()=>{ gone=true; close(); deleteChat(c); }}, "Delete"))],
        {onClose:()=>{ if (!gone) { setOff(row, 0, true); flush(); } }}), 240);
      return;
    }
    setOff(row, 0, true); flush();
  };
  row.addEventListener("pointerup", end); row.addEventListener("pointercancel", end);
  row.addEventListener("click", e=>{ if (row.dataset.eat) { e.stopImmediatePropagation(); e.preventDefault(); delete row.dataset.eat; } }, true);
  return row;
}

// ===================== team invites by phone number =====================
const dgt = s => String(s||"").replace(/\D/g,"");
function toE164(raw, cc){ const t=String(raw||"").trim(); if (!t) return ""; if (t.startsWith("+")) return "+"+dgt(t); if (t.startsWith("00")) return "+"+dgt(t).slice(2); const d=dgt(t); if (!d) return ""; const c=dgt(cc||"+1"); return "+"+(c==="1" && d.length===11 && d[0]==="1"? d : c+d.replace(/^0+/,"")); }
function userByPhone(e164){ const d=dgt(e164); if (d.length<7) return null; for (const [id,doc] of Object.entries(S.teamDocs)) { const p=dgt(doc.phone); if (p && (p===d || (p.length>=10 && d.length>=10 && p.slice(-10)===d.slice(-10) && p.length===d.length))) return id; } return null; }
const myName = () => ((S.teamDocs[S.me]||{}).name || (S.people[S.me]||{}).name || "A friend").replace(/^Example:\s*/,"");
function inviteText(teamName){ const link=siteLink("").replace(/\/$/,"") || location.origin; return `${myName()} invited you to the team “${teamName}” on Task Message. Sign up with this phone number to join: ${link}`; }
function smsHref(phone, body){ const ios=/iP(hone|ad|od)/.test(navigator.userAgent) || PLAT==="ios"; return "sms:"+phone+(ios? "&" : "?")+"body="+encodeURIComponent(body); }
function openSms(phone, body){ const a=h("a",{href:smsHref(phone, body), style:"display:none"}); document.body.append(a); a.click(); a.remove(); }
const pendingInvites = tm => (S.invites||[]).filter(v=>v.team===tm.id && !v.status);
const incomingInvites = () => (S.invites||[]).filter(v=>!v.status && v.by!==S.me && !myTeams().some(t=>t.id===v.team));

async function inviteByPhone(tm, raw, cc, label){
  const phone=toE164(raw, cc);
  if (dgt(phone).length<8) { toast("That doesn't look like a phone number."); return false; }
  const uid=userByPhone(phone) || await lookupPhone(phone);
  if (uid===S.me) { toast("That's your own number."); return false; }
  if (uid) {
    if ((tm.members||[]).includes(uid)) { toast(nameOf(uid).replace(/^Example:\s*/,"")+" is already on the team."); return false; }
    await guarded(store.update("teams/"+tm.id, {members:[...new Set([...(tm.members||[]), uid])]}));
    toast(nameOf(uid).replace(/^Example:\s*/,"")+" added to the team"); return true;
  }
  if (pendingInvites(tm).some(v=>dgt(v.phone)===dgt(phone))) { openSms(phone, inviteText(tm.name)); return true; }
  const id="iv"+now().toString(36)+uidShort().slice(0,4);
  await guarded(store.set("invites/"+id, {phone, name:label||"", team:tm.id, teamName:tm.name, by:S.me, byName:myName(), at:now()}));
  toast("Invite saved. Send the text to let them know.", {label:"Text", fn:()=>openSms(phone, inviteText(tm.name))});
  openSms(phone, inviteText(tm.name));
  return true;
}
function openAddMembers(){
  const tm=curTeam(); if (!tm) return;
  let cc=ls.get("cc","+1"), num="", sel=new Set(), q="";
  sheet("Add to "+tm.name, (draw, close)=>{
    const cands=S.team.filter(id=>id!==S.me && !(tm.members||[]).includes(id) && (!q || fullName(id).toLowerCase().includes(q)));
    const addr=(S.addr||[]).filter(c=>!c.on && c.p && c.p.length && (!q || c.n.toLowerCase().includes(q) || c.p.some(p=>dgt(p).includes(dgt(q)||"~"))));
    const go=async()=>{ const ok=await inviteByPhone(tm, num, cc); if (ok) { num=""; draw(); const i=$("#inv-num"); if (i) i.focus(); } };
    return [
      h("div",{class:"seg-label"}, "Invite by phone number"),
      h("div",{class:"invrow"},
        h("select",{class:"obcc", "aria-label":"Country code", onchange:e=>{ cc=e.target.value; ls.set("cc",cc); }}, COUNTRIES.map(([c,n])=>h("option",{value:c, selected:c===cc}, n+" "+c))),
        h("input",{class:"inp", id:"inv-num", type:"tel", inputmode:"tel", autocomplete:"tel", placeholder:"Phone number", value:num, oninput:e=>{ num=e.target.value; const b=$("#inv-go"); if (b) b.disabled=dgt(num).length<6; }, onkeydown:e=>{ if (e.key==="Enter") go(); }}),
        h("button",{class:"roundgo", id:"inv-go", "aria-label":"Invite", title:"Invite", disabled:dgt(num).length<6, onclick:go}, svg(IC.send))),
      h("p",{class:"note", style:"margin:-4px 4px 0"}, "If they're on Task Message they're added right away. If not, they get a text, and they join when they sign up with that number."),
      (cands.length || addr.length || q)? h("label",{class:"search"}, svg(IC.search), h("input",{id:"inv-q", placeholder:"Search people", value:q, oninput:e=>{ q=e.target.value.toLowerCase(); draw(); }})) : "",
      cands.length? [h("div",{class:"seg-label"}, "On Task Message"), h("div",{class:"picklist"}, cands.map(id=>h("button",{class:"pick contact","aria-pressed":String(sel.has(id)), onclick:()=>{ sel.has(id)?sel.delete(id):sel.add(id); draw(); }}, h("span",{class:"cav"}, avatar(id), sel.has(id)? h("span",{class:"tick"}, svg(ICF.check)):""), fullName(id).replace(/^Example:\s*/,""))))] : "",
      sel.size? h("button",{class:"primary wide", onclick:async()=>{ const ids=[...sel]; close(); await guarded(store.update("teams/"+tm.id, {members:[...new Set([...(tm.members||[]), ...ids])]})); toast(ids.length===1? "Added to the team" : ids.length+" people added"); }}, "Add "+sel.size) : "",
      addr.length? [h("div",{class:"seg-label"}, "From your phone contacts"), h("div",{class:"ulist sgroup"}, lazyRows(addr, c=>h("button",{class:"srow pick1", onclick:async()=>{ await inviteByPhone(tm, c.p[0], cc, c.n); draw(); }}, h("span",{class:"stx"}, h("b",{}, c.n||c.p[0]), h("span",{}, c.p[0])), h("span",{class:"invtag"}, "Invite"))))] : "",
    ];
  });
  setTimeout(()=>{ const i=$("#inv-num"); if (i) i.focus(); }, 60);
}
function invitesSection(tm){
  const inv=pendingInvites(tm); if (!inv.length) return "";
  const own=tm.owner===S.me;
  return h("div",{class:"invpending"}, h("div",{class:"seg-label"}, "Invited · waiting to join"), h("div",{class:"ulist sgroup"}, inv.map(v=>h("div",{class:"srow"},
    h("span",{class:"sic gray"}, svg(ICF.personplus)),
    h("span",{class:"stx"}, h("b",{}, v.name || v.phone), h("span",{}, (v.name? v.phone+" · " : "")+"invited "+fmtShort(v.at))),
    h("button",{class:"iconbtn", title:"Text again", "aria-label":"Text the invite again", onclick:()=>openSms(v.phone, inviteText(tm.name))}, svg(IC.send)),
    own || v.by===S.me? h("button",{class:"iconbtn", title:"Cancel invite", "aria-label":"Cancel invite", onclick:async()=>{ try { await guarded(store.del("invites/"+v.id)); toast("Invite canceled"); } catch {} }}, svg(IC.x)) : ""))));
}
async function answerInvite(v, accept){
  try {
    if (SB) { const {error}=await SB.rpc("respond_invite", {p_path:"invites/"+v.id, p_accept:accept}); if (error) throw error; }
    else { if (accept) { const t=S.teams.find(x=>x.id===v.team); if (t) await store.update("teams/"+v.team, {members:[...new Set([...(t.members||[]), S.me])]}); } await store.update("invites/"+v.id, {status: accept? "accepted" : "declined"}); }
    if (accept) { S.teamId=v.team; ls.set("teamId", v.team); toast("You joined "+(v.teamName||"the team"), {label:"Open", fn:()=>{ S.view="team"; ls.set("view","team"); render(); }}); }
    else toast("Invite declined");
    S.invites=(S.invites||[]).map(x=>x.id===v.id? {...x, status: accept? "accepted":"declined"} : x); render(true);
  } catch (e) { toast("Couldn't answer the invite. Try again."); }
}
function inviteCards(){
  const inc=incomingInvites(); if (!inc.length) return "";
  return h("div",{class:"invcards"}, inc.map(v=>h("div",{class:"invcard"},
    h("span",{class:"glyph", style:"background:var(--cobalt)"}, svg(ICF.all)),
    h("span",{class:"ivx"}, h("b",{}, v.teamName||"A team"), h("span",{}, (v.byName||"Someone")+" invited you to join")),
    h("button",{class:"ghost ivno", "aria-label":"Decline", title:"Decline", onclick:()=>answerInvite(v,false)}, svg(IC.x)),
    h("button",{class:"primary ivyes", onclick:()=>answerInvite(v,true)}, "Join"))));
}

// ===================== messages kept on this device =====================
// Chats, people and messages are saved in the phone's own database (IndexedDB), so chats open
// instantly and can be read without internet. The server copy stays (encrypted) for new devices.
const LOCAL = {
  t:{},
  key: k => "u:"+S.me+":"+k,
  load(k){ return S.mode==="live"? kvGet(LOCAL.key(k)) : Promise.resolve(null); },
  save(k, v, delay=500){ if (S.mode!=="live") return; clearTimeout(LOCAL.t[k]); LOCAL.t[k]=setTimeout(()=>{ kvSet(LOCAL.key(k), v); }, delay); },
  older:{}
};
async function loadLocalCopy(){
  const [ch, tm] = await Promise.all([LOCAL.load("channels"), LOCAL.load("team")]);
  if (Array.isArray(tm) && !S.team.length) { S.team=tm.map(r=>r.id); S.teamDocs=Object.fromEntries(tm.map(r=>[r.id,r])); for (const r of tm) if (!S.people[r.id] || r.id===S.me) S.people[r.id]={id:r.id, name:r.name||r.phone||"Someone", avatarUrl:r.photo||"", color:colorFor(r.id)}; }
  if (Array.isArray(ch) && !S.channels.length) {
    S.channels=ch; if (!S.active || !S.channels.find(c=>c.id===S.active)) S.active=S.channels[0]? S.channels[0].id : null;
    if (!E2E.ready) await initPromise();
    await decryptMany(S.channels.map(c=>c.last&&c.last.enc));
  }
  if (ch || tm) render(true);
}
function localMessages(cid){
  return LOCAL.load("m:"+cid).then(async rows=>{
    if (!Array.isArray(rows) || !rows.length) return;
    if (!E2E.ready) await initPromise();
    await decryptMany(rows.flatMap(m=>[m.enc, m.penc]));
    if (S.msgsFor!==cid) return;
    if (S.msgCache[cid]) { // server copy already here: add what only this device still has
      LOCAL.older[cid]=rows; S.msgs=mergeById(rows, S.msgCache[cid]); scheduleRender(); return;
    }
    LOCAL.older[cid]=rows; S.msgs=rows; scheduleRender();
  });
}
function clearLocalCopy(){ try { indexedDB.deleteDatabase("concept"); } catch {} }

// ===================== WhatsApp-style storage: every chat is downloaded to this device =====================
// The server only holds messages until everyone in the chat has them on their device (or for 30 days).
const mergeById = (a, b) => { const m=new Map(); for (const x of a||[]) m.set(x.id, x); for (const x of b||[]) m.set(x.id, {...(m.get(x.id)||{}), ...x}); return [...m.values()].sort((x,y)=>(x.at||0)-(y.at||0)); };
let SYNCING=false, SYNC_AGAIN=false, SYNC_T=0;
function syncSoon(){ clearTimeout(SYNC_T); SYNC_T=setTimeout(syncAll, 1200); }
async function syncAll(){
  if (S.mode!=="live" || !SB || !S.me) return;
  if (SYNCING) { SYNC_AGAIN=true; return; } SYNCING=true;
  try {
    const meta=(await LOCAL.load("syncmeta"))||{};
    for (const c of [...S.channels]) {
      const top=(c.last&&c.last.at)||0; if (!top || (meta[c.id]||0)>=top) continue;
      let q=SB.from("docs").select("path,data").eq("col","channels/"+c.id+"/messages").order("updated_at",{ascending:true}).limit(1000);
      if (meta[c.id]) q=q.gte("updated_at", new Date(meta[c.id]-10*60e3).toISOString());
      const {data, error}=await q; if (error) continue;
      const rows=(data||[]).map(r=>({id:r.path.split("/").pop(), ...r.data}));
      if (!E2E.ready) await initPromise();
      await decryptMany(rows.flatMap(m=>[m.enc, m.penc]));
      const merged=mergeById((await LOCAL.load("m:"+c.id))||[], rows).slice(-5000);
      await kvSet(LOCAL.key("m:"+c.id), merged);
      for (const r of rows) { try { await saveAttachments(r); } catch {} }
      meta[c.id]=top; await kvSet(LOCAL.key("syncmeta"), meta);
      if ((c["s_"+S.me]||0) < top) queueAck(c.id, {["s_"+S.me]: top});
      LOCAL.older[c.id]=merged;
    }
  } catch {} finally { SYNCING=false; if (SYNC_AGAIN) { SYNC_AGAIN=false; syncSoon(); } }
}
async function saveAttachments(r){
  if (r.deleted) return;
  const pf=S.prefs||{};
  if (r.kind==="voice" && pf.autoVoice===false) return;
  if (r.kind==="media" && pf.autoMedia===false) return;
  if (r.kind==="voice" && r.voice && r.voice.id && r.voice.parts) {
    const k=LOCAL.key("v:"+r.voice.id); if (await kvGet(k)) return;
    let b64=""; for (let i=0;i<r.voice.parts;i++){ const p=await store.get(`voice/${r.voice.id}/parts/${i}`); if (!p) return; b64+=p.d; }
    await kvSet(k, b64);
  }
  if (r.kind==="media") { const p=plainP(r); for (const it of (p&&p.items)||[]) { if (!it.path || (it.size||0)>60e6) continue; const k=LOCAL.key("f:"+it.path); if (await kvGet(k)) continue; const res=await fetch(blobUrl(it.path)); if (res.ok) await kvSet(k, await res.arrayBuffer()); } }
}

// ===================== Settings → Storage and data =====================
const STORAGE_IC='<ellipse cx="12" cy="6" rx="7" ry="2.7"/><path d="M5 6v12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>';
async function appUsage(){ try { if (navigator.storage && navigator.storage.estimate) { const e=await navigator.storage.estimate(); if (e && e.usage) return e.usage; } } catch {} let t=0; (await kvSizes()).forEach(v=>t+=v); return t; }
// What's saved on this phone, split by type and by chat.
async function storageReport(){
  const sizes=await kvSizes(), P="u:"+S.me+":";
  const get=k=>sizes.get(P+k)||0;
  const kinds={msgs:0, media:0, voice:0, cache:0, other:0};
  for (const [k,v] of sizes) {
    if (!k.startsWith(P)) { kinds.other+=v; continue; }
    const r=k.slice(P.length);
    if (r.startsWith("m:")) kinds.msgs+=v; else if (r.startsWith("f:")) kinds.media+=v; else if (r.startsWith("v:")) kinds.voice+=v;
    else if (r.startsWith("fd:")||r.startsWith("vd:")) kinds.cache+=v; else kinds.other+=v;
  }
  const chats=[];
  for (const c of S.channels) {
    const rows=(await kvGet(P+"m:"+c.id))||[]; if (!Array.isArray(rows)) continue;
    await decryptMany(rows.flatMap(m=>[m.penc]));
    const vids=[], paths=[];
    for (const m of rows) { if (m.kind==="voice" && m.voice && m.voice.id) vids.push(m.voice.id); if (m.kind==="media") { const p=plainP(m); for (const it of (p&&p.items)||[]) if (it.path) paths.push(it.path); } }
    const voice=vids.reduce((a,v)=>a+get("v:"+v)+get("vd:"+v),0), media=paths.reduce((a,p)=>a+get("f:"+p)+get("fd:"+p),0), msgs=get("m:"+c.id);
    chats.push({c, msgs, voice, media, vids, paths, n:rows.length, total:msgs+voice+media});
  }
  chats.sort((a,b)=>b.total-a.total);
  const kvTotal=Object.values(kinds).reduce((x,y)=>x+y,0);
  return {kinds, chats, total:Math.max(kvTotal, await appUsage()), quota:await (async()=>{ try { return (await navigator.storage.estimate()).quota||0; } catch { return 0; } })()};
}
async function clearChatMedia(x, what){
  const P="u:"+S.me+":"; const keys=[];
  if (what!=="voice") x.paths.forEach(p=>{ keys.push(P+"f:"+p, P+"fd:"+p); if (MEDIA_CACHE[p]) { try { URL.revokeObjectURL(MEDIA_CACHE[p]); } catch {} delete MEDIA_CACHE[p]; } });
  if (what!=="media") x.vids.forEach(v=>{ keys.push(P+"v:"+v, P+"vd:"+v); if (VOICE_URLS[v]) { try { URL.revokeObjectURL(VOICE_URLS[v]); } catch {} delete VOICE_URLS[v]; } });
  await kvDel(keys);
}
function openStorage(){
  let rep=null, busy=false;
  const KC=[["msgs","Messages","#007AFF"],["media","Photos & files","#FF9500"],["voice","Voice notes","#AF52DE"],["cache","Cache","#8E8E93"],["other","Other","#C7C7CC"]];
  const close=sheet("Storage and data", (draw)=>{
    if (!rep) return [h("div",{class:"stwait"}, h("span",{class:"spin dark"}), "Checking storage…")];
    const k=rep.kinds, sum=Object.values(k).reduce((a,b)=>a+b,0)||1;
    const swt=(key, def, title, sub)=>{ const on=S.prefs[key]===undefined? def : !!S.prefs[key]; return h("div",{class:"srow"}, h("span",{class:"stx"}, h("b",{},title), sub? h("span",{},sub):""), h("button",{class:"switch"+(on?" on":""), role:"switch", "aria-checked":String(on), "aria-label":title, onclick:()=>{ S.prefs={...S.prefs,[key]:!on}; ls.set("prefs",S.prefs); draw(); }}, h("i"))); };
    return [
      h("div",{class:"stsum"},
        h("div",{class:"sttop"}, h("b",{}, fmtSize(rep.total)), h("span",{}, "used by Task Message on this phone")),
        h("div",{class:"stbar", role:"img", "aria-label":"Storage use by type"}, KC.filter(([key])=>k[key]>0).map(([key,,col])=>h("i",{style:`flex:${Math.max(k[key]/sum, .012)};background:${col}`}))),
        h("div",{class:"stlegend"}, KC.filter(([key])=>k[key]>0 || key==="msgs").map(([key,l,col])=>h("span",{}, h("i",{style:`background:${col}`}), l+" ", h("em",{}, fmtSize(k[key])))))),
      h("div",{class:"seg-label"}, "Save automatically"),
      h("div",{class:"ulist sgroup"},
        swt("autoMedia", true, "Photos, videos & documents", "Keep a copy on this phone when they arrive"),
        swt("autoVoice", true, "Voice notes", "Keep a copy on this phone when they arrive")),
      h("p",{class:"note", style:"margin:-2px 4px 0"}, "When this is off, items open from the internet when you tap them, while they're still available there."),
      h("div",{class:"seg-label"}, "Chats"),
      rep.chats.filter(x=>x.total>0).length? h("div",{class:"ulist sgroup"}, rep.chats.filter(x=>x.total>0).map(x=>h("button",{class:"srow pick stchat", onclick:()=>openChatStorage(x, async()=>{ rep=await storageReport(); draw(); })},
        h("span",{class:"cav"}, chanGlyph(x.c)), h("span",{class:"stx"}, h("b",{}, chanTitle(x.c)), h("span",{}, [x.media? "Photos & files "+fmtSize(x.media) : "", x.voice? "Voice "+fmtSize(x.voice) : "", x.n+" messages"].filter(Boolean).join(" · "))),
        h("span",{class:"sval"}, fmtSize(x.total)), svg(IC.arrow)))) : h("p",{class:"note", style:"margin:0 4px"}, "Nothing saved yet."),
      h("div",{class:"seg-label"}, "Cache"),
      h("div",{class:"ulist sgroup"}, h("button",{class:"srow pick", disabled:busy || !k.cache, onclick:async()=>{ busy=true; draw(); const sz=await kvSizes("u:"+S.me+":"); await kvDel([...sz.keys()].filter(x=>/^u:[^:]+:(fd|vd):/.test(x))); for (const p in MEDIA_CACHE) { try { URL.revokeObjectURL(MEDIA_CACHE[p]); } catch {} delete MEDIA_CACHE[p]; } busy=false; rep=await storageReport(); draw(); toast("Cache cleared"); }},
        h("span",{class:"stx"}, h("b",{class:"blue"}, "Clear cache"), h("span",{}, "Ready-to-open copies. Safe to clear: nothing is lost.")), h("span",{class:"sval"}, fmtSize(k.cache))))
    ];
  });
  storageReport().then(r=>{ rep=r; const s=document.querySelector(".ntsheet"); if (s) { /* redraw via the sheet's own button-less path */ } drawStorage(); }).catch(()=>{ rep={kinds:{msgs:0,media:0,voice:0,cache:0,other:0}, chats:[], total:0}; drawStorage(); });
  function drawStorage(){ const m=document.querySelector(".ntsheet[aria-label='Storage and data']"); if (m && m.__draw) m.__draw(); }
  return close;
}
function openChatStorage(x, after){
  const ask=(title, text, what)=>sheet(title, (draw, close)=>[
    h("p",{class:"note", style:"margin:0 4px"}, text),
    h("button",{class:"primary wide danger", onclick:async()=>{ close(); await clearChatMedia(x, what); toast("Deleted from this phone"); after&&after(); }}, "Delete from this phone"),
    h("button",{class:"ghost wide", onclick:close}, "Cancel")]);
  sheet(chanTitle(x.c), (draw, close)=>[
    h("div",{class:"ulist sgroup"},
      h("div",{class:"srow"}, h("span",{class:"stx"}, h("b",{},"Messages"), h("span",{}, x.n+" saved")), h("span",{class:"sval"}, fmtSize(x.msgs))),
      h("div",{class:"srow"}, h("span",{class:"stx"}, h("b",{},"Photos, videos & files")), h("span",{class:"sval"}, fmtSize(x.media))),
      h("div",{class:"srow"}, h("span",{class:"stx"}, h("b",{},"Voice notes")), h("span",{class:"sval"}, fmtSize(x.voice)))),
    h("div",{class:"ulist sgroup"},
      h("button",{class:"srow pick", disabled:!x.media, onclick:()=>{ close(); ask("Delete photos & files?", "Photos, videos and documents in this chat will be removed from this phone. The messages stay. Once the server copy has expired they can't be opened again unless you have a backup.", "media"); }}, h("span",{class:"stx"}, h("b",{class:"red"}, "Delete photos & files")), h("span",{class:"sval"}, fmtSize(x.media))),
      h("button",{class:"srow pick", disabled:!x.voice, onclick:()=>{ close(); ask("Delete voice notes?", "Voice notes in this chat will be removed from this phone. Once the server copy has expired they can't be played again unless you have a backup.", "voice"); }}, h("span",{class:"stx"}, h("b",{class:"red"}, "Delete voice notes")), h("span",{class:"sval"}, fmtSize(x.voice))))
  ]);
}

// ===================== chat backup to iCloud Drive / Google Drive =====================
const BK_MAGIC="CNCPT1";
async function bkKey(pw, salt){ const base=await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:250000, hash:"SHA-256"}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]); }
async function gz(bytes, dir){ if (!window.CompressionStream) return bytes; const s=new Blob([bytes]).stream().pipeThrough(dir==="d"? new DecompressionStream("gzip") : new CompressionStream("gzip")); return new Uint8Array(await new Response(s).arrayBuffer()); }
const b64Of = buf => { const u=new Uint8Array(buf); let s=""; for (let i=0;i<u.length;i+=32768) s+=String.fromCharCode(...u.subarray(i,i+32768)); return btoa(s); };
async function buildBackup(pw, withMedia, onp){
  const out={v:1, app:"concept", at:now(), me:S.me, chats:[], msgs:{}, voice:{}, files:{}};
  const chans=S.channels.filter(c=>!(S.nt.cleared||{})[c.id] || ((c.last&&c.last.at)||0)>(S.nt.cleared||{})[c.id]);
  let i=0;
  for (const c of chans) {
    onp && onp(`Chats ${++i}/${chans.length}`);
    out.chats.push({id:c.id, kind:c.kind, title:chanTitle(c), members:c.members||[]});
    const rows=mergeById((await LOCAL.load("m:"+c.id))||[], S.msgCache[c.id]||[]);
    await decryptMany(rows.flatMap(m=>[m.enc, m.penc]));
    const list=[];
    for (const m of rows) {
      const r={...m}; const t=plain(m); delete r.enc; delete r.penc; delete r.pending;
      if (t===null || t===false) { if (m.enc) continue; } else r.text=t;
      if (m.penc) { const p=plainP(m); if (!p) continue; r.payload=p; }
      if (m.kind==="voice" && m.voice) { try { const url=await voiceUrl(m.voice, m.enc); const buf=await (await fetch(url)).arrayBuffer(); out.voice[m.voice.id]=b64Of(buf); r.voice={...m.voice, eiv:""}; } catch {} }
      if (withMedia && m.kind==="media" && r.payload) { for (const it of r.payload.items||[]) { if (!it.path || out.files[it.path]) continue; try { const u=await ensureMedia(it); out.files[it.path]=b64Of(await (await fetch(u)).arrayBuffer()); } catch {} } }
      list.push(r);
    }
    out.msgs[c.id]=list;
  }
  onp && onp("Locking your backup…");
  const raw=await gz(new TextEncoder().encode(JSON.stringify(out)));
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv}, await bkKey(pw, salt), raw));
  const file=new Uint8Array(6+16+12+ct.length); file.set(new TextEncoder().encode(BK_MAGIC),0); file.set(salt,6); file.set(iv,22); file.set(ct,34);
  const d=new Date(); const name=`TaskMessage-backup-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.taskmessage`;
  return {file:new File([file], name, {type:"application/octet-stream"}), count:Object.values(out.msgs).reduce((a,l)=>a+l.length,0)};
}
async function readBackup(f, pw){
  const u=new Uint8Array(await f.arrayBuffer());
  if (new TextDecoder().decode(u.slice(0,6))!==BK_MAGIC) throw new Error("notbackup");
  let raw; try { raw=await crypto.subtle.decrypt({name:"AES-GCM", iv:u.slice(22,34)}, await bkKey(pw, u.slice(6,22)), u.slice(34)); } catch { throw new Error("password"); }
  return JSON.parse(new TextDecoder().decode(await gz(new Uint8Array(raw), "d")));
}
async function restoreBackup(data){
  let n=0;
  for (const [cid, list] of Object.entries(data.msgs||{})) { const merged=mergeById(list, (await LOCAL.load("m:"+cid))||[]); await kvSet(LOCAL.key("m:"+cid), merged.slice(-5000)); LOCAL.older[cid]=merged; n+=list.length; }
  for (const [vid, b64] of Object.entries(data.voice||{})) await kvSet(LOCAL.key("vd:"+vid), b64);
  for (const [path, b64] of Object.entries(data.files||{})) { const bin=atob(b64), u=new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); await kvSet(LOCAL.key("fd:"+path), u.buffer); }
  S.msgsFor=null; openMsgs(); render(true);
  return n;
}
function openBackup(){
  const bk=S.prefs.backup||{};
  let busy="", ready=null;
  const close=sheet("Chat backup", (draw)=>{
    const last=bk.last? new Date(bk.last).toLocaleString([], {dateStyle:"medium", timeStyle:"short"}) : "Never";
    return [
      h("p",{class:"note", style:"margin:0"}, "Back up your chats to iCloud Drive or Google Drive. Messages are kept on your phone, so a backup is how you bring them to a new phone. The backup is locked with a password only you know."),
      h("div",{class:"ulist sgroup"},
        h("div",{class:"srow"}, h("span",{class:"sic"}, svg(CLOCK)), h("span",{class:"stx"}, h("b",{}, "Last backup")), h("span",{class:"sval"}, last)),
        h("div",{class:"srow"}, h("span",{class:"sic"}, svg(ICF.image)), h("span",{class:"stx"}, h("b",{}, "Include photos and videos")), h("button",{class:"switch"+(bk.media!==false?" on":""), role:"switch", "aria-checked":String(bk.media!==false), onclick:()=>{ bk.media=bk.media===false; setPref("backup", {...bk}); draw(); }}, h("i"))),
        h("div",{class:"srow col"}, h("span",{class:"sic"}, svg(ICF.cal)), h("span",{class:"stx"}, h("b",{}, "Backup reminder")),
          h("div",{class:"segmini wide", role:"group", "aria-label":"Backup reminder"}, [["off","Off"],["day","Daily"],["week","Weekly"],["month","Monthly"]].map(([v,l])=>h("button",{"aria-pressed":String((bk.freq||"week")===v), onclick:()=>{ bk.freq=v; setPref("backup", {...bk}); draw(); }}, l))))),
      busy? h("div",{class:"bkbusy"}, h("span",{class:"spin dark"}), busy) :
      ready? h("button",{class:"primary wide", onclick:async()=>{ const f=ready.file; try { await saveBackupFile(f); bk.last=now(); setPref("backup", {...bk}); ready=null; toast("Backup saved"); draw(); } catch (e) { if (e && e.name==="AbortError") return; toast("Couldn't save the backup."); } }}, svg(IC.send), "Save to iCloud Drive / Google Drive") :
      h("button",{class:"primary wide", onclick:()=>askPassword(true, async pw=>{ busy="Preparing…"; draw(); try { ready=await buildBackup(pw, bk.media!==false, t=>{ busy=t; draw(); }); busy=""; draw(); toast(ready.count+" messages ready to save"); } catch { busy=""; draw(); toast("Couldn't make the backup."); } })}, svg(ICF.lock), "Back up now"),
      ready? h("p",{class:"note", style:"margin:-4px 4px 0"}, PLAT==="android"? "Tap the button, then choose Drive." : "Tap the button, then Save to Files → iCloud Drive.") : "",
      h("button",{class:"ghost", style:"align-self:center", onclick:()=>{
        const inp=h("input",{type:"file", style:"position:fixed;left:-9999px;opacity:0", onchange:e=>{ const f=e.target.files&&e.target.files[0]; inp.remove(); if (!f) return;
          askPassword(false, async pw=>{ busy="Restoring…"; draw(); try { const data=await readBackup(f, pw); const n=await restoreBackup(data); busy=""; draw(); toast(n+" messages restored"); } catch (err) { busy=""; draw(); toast(err && err.message==="password"? "Wrong password." : err && err.message==="notbackup"? "That isn't a Task Message backup file." : "Couldn't restore that backup."); } }); }});
        document.body.append(inp); inp.click(); }}, svg(IC.arrow), "Restore from a backup")
    ];
  });
}
// Saving the backup file. In the iPhone/Android app the phone's own share screen opens, where you pick
// "Save to Files → iCloud Drive" (iPhone) or "Drive" (Android). On iPhone a copy is also kept in
// Files → On My iPhone → Task Message, which the iPhone's own iCloud Backup includes.
async function saveBackupFile(f){
  const FS=NP("Filesystem"), SH=NP("Share");
  if (FS && SH) {
    const data=b64Of(await f.arrayBuffer());
    if (PLAT==="ios") { try { await FS.writeFile({path:"Backups/"+f.name, data, directory:"DOCUMENTS", recursive:true}); } catch {} }
    const w=await FS.writeFile({path:f.name, data, directory:"CACHE"});
    try { await SH.share({title:"Task Message backup", files:[w.uri], dialogTitle:"Save your backup"}); }
    catch (e) { if (/cancel/i.test(String(e && (e.message||e)))) { const err=new Error("cancel"); err.name="AbortError"; throw err; } throw e; }
    return;
  }
  if (navigator.canShare && navigator.canShare({files:[f]})) { await navigator.share({files:[f], title:"Task Message backup"}); return; }
  const a=h("a",{href:URL.createObjectURL(f), download:f.name}); document.body.append(a); a.click(); a.remove();
}
function askPassword(isNew, done){
  let a="", b="";
  sheet(isNew? "Backup password" : "Enter backup password", (draw, close)=>[
    h("p",{class:"note", style:"margin:0"}, isNew? "Choose a password for this backup. You'll need it to restore — we can't recover it for you." : "Type the password you used when you made the backup."),
    h("input",{class:"inp", id:"bk-p1", type:"password", autocomplete:isNew?"new-password":"current-password", placeholder:"Password (at least 6 characters)", oninput:e=>a=e.target.value}),
    isNew? h("input",{class:"inp", id:"bk-p2", type:"password", autocomplete:"new-password", placeholder:"Type it again", oninput:e=>b=e.target.value}) : "",
    h("button",{class:"primary wide", onclick:()=>{ if (a.length<6) { toast("Use at least 6 characters."); return; } if (isNew && a!==b) { toast("The passwords don't match."); return; } close(); done(a); }}, "Continue")]);
  setTimeout(()=>{ const i=$("#bk-p1"); if (i) i.focus(); }, 60);
}
function backupReminder(){
  const bk=S.prefs.backup||{}; const f=bk.freq||"week"; if (f==="off" || S.mode!=="live") return;
  const span={day:864e5, week:7*864e5, month:30*864e5}[f]; if (bk.last && now()-bk.last<span) return;
  if (!S.channels.some(c=>c.last)) return;
  toast(bk.last? "Time to back up your chats" : "Back up your chats to iCloud or Google Drive", {label:"Back up", fn:openBackup});
}

// ===================== keep pop-up menus inside the screen =====================
function fitMenu(m){
  const pad=10, vw=innerWidth, vh=innerHeight;
  m.style.maxWidth=(vw-pad*2)+"px"; m.style.maxHeight=(vh-pad*2)+"px"; m.style.overflowY="auto";
  const r=m.getBoundingClientRect();
  if (r.right>vw-pad) { m.style.left=Math.max(pad, vw-pad-r.width)+"px"; m.style.right="auto"; }
  if (r.left<pad) { m.style.left=pad+"px"; m.style.right="auto"; }
  const r2=m.getBoundingClientRect();
  if (r2.bottom>vh-pad) { m.style.top=Math.max(pad, vh-pad-r2.height)+"px"; m.style.bottom="auto"; }
  if (r2.top<pad) { m.style.top=pad+"px"; m.style.bottom="auto"; }
}
new MutationObserver(list=>{ for (const mu of list) for (const n of mu.addedNodes) { if (n.nodeType!==1) continue; const ms=n.matches && n.matches(".popmenu")? [n] : [...n.querySelectorAll? n.querySelectorAll(".popmenu") : []]; ms.forEach(m=>{ fitMenu(m); requestAnimationFrame(()=>fitMenu(m)); }); } }).observe(document.body, {childList:true, subtree:true});

// ===================== chat / group info (tap the chat header) =====================
function openChatInfo(c){
  if (!c) return;
  const prev=document.getElementById("chatinfo"); if (prev) prev.remove();
  const o=h("div",{class:"infoview", id:"chatinfo", role:"dialog", "aria-label":"Chat info"});
  const close=()=>o.remove();
  const isGroup=c.kind!=="dm";
  const peer=dmPeer(c);
  const admin=c.createdBy||(c.members||[])[0];
  const clean=s=>String(s||"").replace(/^Example:\s*/,"");
  const draw=()=>{
    const cc=S.channels.find(x=>x.id===c.id)||c; const mem=[...new Set(cc.members||[])];
    const sorted=[S.me, ...mem.filter(x=>x!==S.me).sort((a,b)=>(a===admin?-1:b===admin?1:0) || clean(fullName(a)).localeCompare(clean(fullName(b))))].filter(x=>mem.includes(x));
    const doc=peer? (S.teamDocs[peer]||{}) : {};
    const act=(icon,label,fn,cls="")=>h("button",{class:"iact "+cls, onclick:fn}, svg(icon), h("span",{}, label));
    const row=(icon,title,val,fn,cls="")=>h("button",{class:"srow pick "+cls, onclick:fn}, h("span",{class:"sic"}, svg(icon)), h("span",{class:"stx"}, h("b",{},title)), val? h("span",{class:"sval"}, val):"", svg(IC.arrow));
    o.replaceChildren(
      h("header",{class:"ihead"}, h("button",{class:"iconbtn", "aria-label":"Back", onclick:close}, svg(IC.back)), h("b",{}, isGroup? (cc.kind==="task"? "Task conversation" : "Group info") : "Contact info"), h("span",{class:"grow"})),
      h("div",{class:"ibody"},
        h("div",{class:"ihero"}, (()=>{ const g=peer? avatar(peer,"xl") : chanGlyph(cc); g.classList.add("ibig"); return g; })(),
          isGroup && cc.kind!=="task"? h("input",{class:"iname", value:chanTitle(cc), "aria-label":"Group name", maxlength:"60", onchange:e=>{ const v=e.target.value.trim(); if (v) guarded(store.update("channels/"+cc.id,{name:v})).then(()=>toast("Group name saved")).catch(()=>{}); }}) : h("h2",{class:"iname"}, chanTitle(cc)),
          h("span",{class:"isub"}, isGroup? (cc.kind==="task"? "Task conversation · " : "Group · ")+mem.length+" member"+(mem.length===1?"":"s") : (doc.phone||"")),
          peer && doc.about? h("span",{class:"iabout"}, doc.about) : ""),
        h("div",{class:"iacts"},
          peer && doc.phone? h("a",{class:"iact", href:telHref(doc.phone)}, svg(IC.phone), h("span",{}, "Call")) : "",
          act(IC.chat, "Message", close),
          act(isMuted(cc)? ICF.bellx : ICF.bell, isMuted(cc)? "Muted" : "Mute", ()=>{ if (isMuted(cc)) { setMute(cc.id, null); draw(); } else openMute(cc); }),
          act(IC.search, "Search", ()=>{ close(); toast("Scroll up to see earlier messages"); })),
        h("div",{class:"ulist sgroup"},
          row(ICF.music, "Notifications", isMuted(cc)? muteText(cc) : toneName(toneFor(cc)), ()=>openChatNotif(cc)),
          row(ICF.image, "Wallpaper", "", openWallpaper),
          row(ICF.stage, "Tasks from this chat", String(visibleTasks().filter(t=>t.channel===cc.id).length), ()=>{ close(); S.view="board"; S.filter="chan:"+cc.id; ls.set("view","board"); render(); })),
        isGroup? h("div",{class:"seg-label"}, mem.length+" member"+(mem.length===1?"":"s")) : "",
        isGroup? h("div",{class:"ulist sgroup imembers"},
          cc.kind!=="task" && S.canWrite? h("button",{class:"srow pick iadd", onclick:()=>addGroupMembers(cc, draw)}, h("span",{class:"sic"}, svg(ICF.personplus)), h("span",{class:"stx"}, h("b",{}, "Add members"))) : "",
          sorted.map(id=>{ const d=S.teamDocs[id]||{};
            return h("button",{class:"srow imem", onclick:e=>{ if (id===S.me) return; memberMenu(cc, id, e.clientX, e.clientY, draw); }},
              avatar(id), h("span",{class:"stx"}, h("b",{}, id===S.me? "You" : clean(fullName(id))), h("span",{}, d.about || d.phone || "")),
              id===admin? h("span",{class:"iadmin"}, "Admin") : ""); })) : "",
        h("div",{class:"ulist sgroup idanger"},
          isGroup && cc.kind!=="task"? h("button",{class:"srow pick dangerrow", onclick:()=>exitGroup(cc, close)}, h("span",{class:"sic"}, svg(IC.back)), h("span",{class:"stx"}, h("b",{}, "Exit group"))) : "",
          peer? h("button",{class:"srow pick dangerrow", onclick:()=>{ setBlocked(peer, !isBlocked(peer)); draw(); }}, h("span",{class:"sic"}, svg(ICF.block)), h("span",{class:"stx"}, h("b",{}, (isBlocked(peer)? "Unblock " : "Block ")+clean(nameOf(peer))))) : "",
          h("button",{class:"srow pick dangerrow", onclick:()=>openReport({title: peer? "Report "+clean(nameOf(peer)) : "Report group", user:peer||"", channel:cc.id})}, h("span",{class:"sic"}, svg(ICF.flag2)), h("span",{class:"stx"}, h("b",{}, peer? "Report contact" : "Report group"))),
          h("button",{class:"srow pick dangerrow", onclick:()=>{ close(); confirmDeleteChat(cc); }}, h("span",{class:"sic"}, svg(IC.trash)), h("span",{class:"stx"}, h("b",{}, "Delete chat"))))));
  };
  draw(); document.body.append(o);
}
function memberMenu(c, id, x, y, redraw){
  const admin=c.createdBy||(c.members||[])[0]; const d=S.teamDocs[id]||{}; const nm=fullName(id).replace(/^Example:\s*/,"");
  const scrim=h("div",{class:"scrim clear", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const go=fn=>()=>{ scrim.remove(); fn(); };
  scrim.append(h("div",{class:"popmenu", role:"menu", style:`left:${x}px;top:${y}px`},
    h("button",{onclick:go(()=>{ const ci=document.getElementById("chatinfo"); if (ci) ci.remove(); createChannel("", [S.me,id], "dm"); })}, svg(IC.chat), "Message "+nm.split(" ")[0]),
    d.phone? h("button",{onclick:go(()=>{ location.href=telHref(d.phone); })}, svg(IC.phone), "Call "+d.phone) : "",
    admin===S.me && c.kind!=="task"? h("button",{class:"dangerrow", onclick:go(async()=>{ await guarded(store.update("channels/"+c.id, {members:(c.members||[]).filter(x=>x!==id)})).catch(()=>{}); toast(nm+" removed"); setTimeout(redraw, 300); })}, svg(IC.x), "Remove "+nm.split(" ")[0]) : ""));
  document.body.append(scrim);
}
function addGroupMembers(c, redraw){
  const cand=[...new Set([...S.contacts, ...S.onConcept, ...teamMembers()])].filter(id=>id && id!==S.me && !(c.members||[]).includes(id));
  peoplePicker("Add to "+chanTitle(c), cand, async ids=>{ if (!ids.length) return; await guarded(store.update("channels/"+c.id, {members:[...new Set([...(c.members||[]), ...ids])]})); toast(ids.length===1? "Member added" : ids.length+" members added"); setTimeout(redraw, 300); });
}
function exitGroup(c, close){
  sheet("Exit “"+chanTitle(c)+"”?", (draw, done)=>[h("p",{class:"note", style:"margin:0"}, "You won't get messages from this group anymore."),
    h("div",{class:"modalacts"}, h("button",{class:"ghost", onclick:done}, "Cancel"), h("button",{class:"primary danger-bg", onclick:async()=>{ done(); close();
      try { if (SB) { const {error}=await SB.rpc("leave_channel", {p_cid:c.id}); if (error) throw error; } else await store.update("channels/"+c.id, {members:(c.members||[]).filter(x=>x!==S.me)}); }
      catch { toast("Couldn't exit the group. Try again."); return; }
      S.inThread=false; if (S.active===c.id) S.active=null; render(); toast("You left the group"); }}, "Exit"))]);
}

// ===================== native app (iPhone / Android) =====================
const CAP = window.Capacitor;
const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const IOS = NATIVE ? (CAP.getPlatform && CAP.getPlatform()==="ios") : /iPhone|iPad|iPod/.test(navigator.userAgent);
const PLAT = NATIVE ? CAP.getPlatform() : "web";
const NP = name => (NATIVE && CAP.Plugins && CAP.Plugins[name]) || null;
const siteLink = file => (NATIVE || CFG.siteUrl? (CFG.siteUrl||"https://concept-rnmb.onrender.com").replace(/\/$/,"")+"/" : "") + file;
let PUSH_READY=false;
async function nativeInit(){
  if (!NATIVE) return;
  document.documentElement.classList.add("native", "plat-"+PLAT);
  const kb=NP("Keyboard");
  if (kb) { try { kb.setAccessoryBarVisible && kb.setAccessoryBarVisible({isVisible:false}); } catch {}
    kb.addListener("keyboardDidShow", ()=>{ const st=$("#stream"); if (st) st.scrollTop=st.scrollHeight; }); }
  const app=NP("App");
  if (app) app.addListener("appStateChange", ({isActive})=>{ if (isActive && S.inThread && S.view==="chats") { markRead(); scheduleRender(); } });
  const sb=NP("SystemBars"); const dark=matchMedia("(prefers-color-scheme: dark)").matches;
  if (sb) { try { sb.setStyle({style: "DEFAULT"}); } catch {} }
  void dark;

}
async function pushRegister(){
  const fm=NP("FirebaseMessaging"); if (!fm || PUSH_READY || S.mode!=="live") return;
  PUSH_READY=true;
  try {
    if (PLAT==="android" && fm.createChannel) {
      try { await fm.createChannel({id:"messages", name:"Messages", description:"New messages", importance:5, visibility:1, vibration:true}); } catch {}
      for (const t of TN.TONES) { try { await fm.createChannel({id:"msg_"+t.id, name:"Messages · "+t.name, description:"Messages that use the "+t.name+" tone", importance:5, visibility:1, vibration:true, sound:"tone_"+t.id+".wav"}); } catch {} }
      try { await fm.createChannel({id:"msg_none", name:"Messages · No sound", description:"Messages with no tone", importance:2, visibility:1, vibration:false}); } catch {}
    }
    let perm=await fm.checkPermissions(); if (perm.receive!=="granted") perm=await fm.requestPermissions();
    if (perm.receive!=="granted") { S.pushState="off"; return; }
    S.pushState="on";
    const {token}=await fm.getToken(); if (token) await saveDeviceToken(token);
    fm.addListener("tokenReceived", ev=>{ if (ev && ev.token) saveDeviceToken(ev.token); });
    fm.addListener("notificationActionPerformed", ev=>{ const d=(ev && ev.notification && ev.notification.data)||{}; if (d.cid) { S.view="chats"; selectChannel(d.cid); } });
    fm.addListener("notificationReceived", ()=>{});
  } catch (e) { PUSH_READY=false; }
}
async function saveDeviceToken(token){
  try {
    const cur=(await store.get("devices/"+S.me))||{}; const tokens={...(cur.tokens||{})};
    tokens[token.slice(-40)]={t:token, p:PLAT, at:now()};
    const keep=Object.entries(tokens).sort((a,b)=>b[1].at-a[1].at).slice(0,5);
    await store.set("devices/"+S.me, {tokens:Object.fromEntries(keep)});
  } catch {}
}
async function nativeContacts(){
  const c=NP("Contacts"); if (!c) return false;
  try {
    let p=await c.checkPermissions(); const ok=v=>v==="granted"||v==="limited";
    if (!ok(p.contacts)) p=await c.requestPermissions();
    if (!ok(p.contacts)) { toast("Allow Contacts in Settings to find people you know."); return true; }
    const r=await c.getContacts({projection:{name:true, phones:true, organization:true}});
    S.addr=[]; // read fresh from the phone each time
    saveAddr((r.contacts||[]).map(x=>{ const p=(x.phones||[]).map(ph=>ph.number).filter(Boolean); return {n:(x.name&&(x.name.display||[x.name.given,x.name.middle,x.name.family].filter(Boolean).join(" ")))||(x.organization&&x.organization.company)||p[0]||"", p}; }));
    if (p.contacts==="limited") toast("You shared only some contacts. To see everyone: iPhone Settings → Apps → Task Message → Contacts → Full Access.", {ms:7000});
  } catch { toast("Couldn't read your contacts."); }
  return true;
}

// ===================== block & report (required by the app stores) =====================
const isBlocked = id => (S.blocked||[]).includes(id);
async function setBlocked(id, on){
  S.blocked = on? [...new Set([...(S.blocked||[]), id])] : (S.blocked||[]).filter(x=>x!==id);
  if (!DB) ls.set("blocked", S.blocked);
  await savePrefsDoc(); render(true);
  toast(on? nameOf(id).replace(/^Example:\s*/,"")+" blocked" : "Unblocked");
}
function dmPeer(c){ return c && c.kind==="dm"? (c.members||[]).find(x=>x!==S.me) : null; }
function openReport(opts){
  const reasons=["Spam","Harassment or bullying","Hate or violence","Sexual content","Scam or fraud","Something else"];
  let reason="", alsoBlock=!!opts.user;
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const draw=()=>scrim.replaceChildren(h("div",{class:"modal reportsheet", role:"dialog", "aria-label":"Report"},
    h("div",{class:"sheethead"}, h("b",{class:"sheettitle"}, opts.title||"Report"), h("span",{class:"grow"}), h("button",{class:"iconbtn","aria-label":"Close", title:"Close", onclick:()=>scrim.remove()}, svg(IC.x))),
    h("div",{class:"ulist sgroup"}, reasons.map(r=>h("button",{class:"srow pick1"+(reason===r?" on":""), onclick:()=>{ reason=r; draw(); }}, h("span",{class:"stx"}, h("b",{}, r)), reason===r? svg(ICF.check) : ""))),
    opts.user? h("label",{class:"srow chk"}, h("input",{type:"checkbox", checked:alsoBlock, onchange:e=>alsoBlock=e.target.checked}), h("span",{class:"stx"}, h("b",{}, "Also block "+nameOf(opts.user).replace(/^Example:\s*/,"")))) : "",
    h("button",{class:"primary wide danger-bg", disabled:!reason, onclick:async()=>{
      scrim.remove();
      const id="r"+now().toString(36)+uidShort().slice(0,4);
      const doc={by:S.me, user:opts.user||"", channel:opts.channel||"", message:opts.message||"", text:String(opts.text||"").slice(0,2000), reason, at:now()};
      try { if (DB) await store.set("reports/"+id, doc); } catch {}
      if (alsoBlock && opts.user) await setBlocked(opts.user, true);
      toast("Thanks — we'll review this report.");
    }}, "Send report")));
  draw(); document.body.append(scrim);
}

// ===================== delete account (required by the app stores) =====================
function openDeleteAccount(){
  let typed="";
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const draw=()=>scrim.replaceChildren(h("div",{class:"modal", role:"dialog", "aria-label":"Delete account"},
    h("h3",{}, "Delete your account?"),
    h("p",{class:"note", style:"margin:0"}, "This permanently deletes your profile, contacts, settings and devices, removes you from all chats, and signs you out. Messages you already sent stay with the people who received them."),
    h("input",{class:"inp", id:"del-confirm", placeholder:"Type DELETE to confirm", autocomplete:"off", autocapitalize:"characters", oninput:e=>{ typed=e.target.value; const b=$("#del-go"); if (b) b.disabled=typed.trim().toUpperCase()!=="DELETE"; }}),
    h("div",{class:"modalacts"}, h("button",{class:"ghost", onclick:()=>scrim.remove()}, "Cancel"),
      h("button",{class:"primary danger-bg", id:"del-go", disabled:true, onclick:async e=>{
        e.currentTarget.disabled=true; e.currentTarget.textContent="Deleting…";
        if (!SB) { scrim.remove(); toast("This is the test version — nothing to delete."); return; }
        try { const {error}=await SB.functions.invoke("delete-account", {body:{confirm:true}}); if (error) throw error; }
        catch (err) { scrim.remove(); toast("Couldn't delete your account. Try again."); return; }
        try { localStorage.clear(); } catch {}
        await signOut();
      }}, "Delete"))));
  draw(); document.body.append(scrim); setTimeout(()=>{ const i=$("#del-confirm"); if (i) i.focus(); }, 50);
}

// ---------- toast ----------
let toastT; function toast(t, act){ let el=$("#toast"); if (!el){ el=h("div",{class:"toast",id:"toast",role:"status"}); document.body.append(el);} el.replaceChildren(h("span",{},t), act&&act.label? h("button",{class:"toastbtn", onclick:()=>{ el.hidden=true; act.fn(); }}, act.label):""); el.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>el.hidden=true, (act&&act.ms)||(act?4500:2400)); }

// ---------- render ----------
let scrollDown=true;
function render(keepComposer){
  if (RQ) { cancelAnimationFrame(RQ); RQ=0; }
  if (S.view==="updates"||S.view==="calls") S.view="chats";
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
  if (S.openTask) app.append(renderDrawer()); else LAST_DRAWER=null;

  const nta=$("#composer"); if (nta){ nta.value = S.editing? (plain(S.msgs.find(m=>m.id===S.editing))||"") : draft; autoGrow(nta); nta.closest(".crow").classList.toggle("has-text", !!nta.value.trim() || !!S.editing || !!(S.vdraft && S.vdraft.cid===S.active)); if (hadFocus||S.editing||S.replyTo) nta.focus(); }
  const ns=$("#stream"); if (ns){ if (scrollDown||atBottom) ns.scrollTop=ns.scrollHeight; else ns.scrollTop=prevScroll; scrollDown=false; }
  if ($("#list")) $("#list").scrollTop=listScroll;
  if (boardScroll && $("#board")) { $("#board").scrollLeft=boardScroll[0]; $("#board").scrollTop=boardScroll[1]; }
  if (focusId && $("#"+focusId)) $("#"+focusId).focus();
  S.justTied=null;
  if (playing) syncPlayer();
  updateTypingUI();
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
  const fab = S.canWrite? h("button",{class:"fab chatfab","aria-label":"New chat", onclick:()=>openNewChat()}, svg('<path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M12 9v6M9 12h6"/>')) : "";
  return h("section",{class:"lines","aria-label":"Conversations"}, fab,
    h("div",{class:"lines-head toprow"}, h("h1",{class:"h1"},"Chats"), h("span",{class:"grow"}), profBtn()),
    h("label",{class:"search"}, svg(IC.search), h("input",{id:"q", placeholder:"Search", value:S.q, oninput:e=>{S.q=e.target.value; patchList(); updateTypingUI(); }})),
    inviteCards(),
    h("div",{class:"list", id:"list"}, ...listChildren()));
}
function listChildren(){
  const q=S.q.toLowerCase();
  const chans = S.channels.filter(c => !q || chanTitle(c).toLowerCase().includes(q) || lastPreview(c.last).toLowerCase().includes(q));
  const ids=new Set(S.channels.map(c=>c.id));
  const isSub = c => c.kind==="task" && c.parent && ids.has(c.parent);
  const subMatch = new Set(chans.filter(isSub).map(c=>c.parent));
  const top = S.channels.filter(c => !isSub(c) && (chans.includes(c) || subMatch.has(c.id)));
  const act = c => Math.max((c.last&&c.last.at)||c.at||0, ...subsOf(c.id).map(x=>(x.last&&x.last.at)||x.at||0));
  for (let i=top.length-1; i>=0; i--) { const cl=(S.nt.cleared||{})[top[i].id]; if (cl && act(top[i])<=cl && top[i].id!==S.active) top.splice(i,1); }
  top.sort((a,b)=>act(b)-act(a));
  const pinned=S.pins.map(id=>top.find(c=>c.id===id)).filter(Boolean);
  const rest=top.filter(c=>!S.pins.includes(c.id));
  const item = c => {
    const li=itemEl(c); longPress(li,(x,y)=>rowMenu(c,x,y)); const el=swipeWrap(li, c);
    const subs=c.kind!=="task"? subsOf(c.id).filter(x=>!q || chans.includes(x) || chans.includes(c)) : [];
    if (!subs.length) return el;
    const open = !!S.expanded[c.id] || (q && subMatch.has(c.id));
    const su=subs.filter(unread).length;
    const tog=h("button",{class:"subtoggle"+(open?" open":"")+(su?" has":""), "aria-expanded":String(open), "aria-label":(open?"Hide":"Show")+" task conversations", title:"Task conversations", onclick:e=>{ e.stopPropagation(); S.expanded[c.id]=!open; S.justOpened=open? null : c.id; ls.set("expanded",S.expanded); patchList(); S.justOpened=null; updateTypingUI(); }}, svg(IC.thread), h("b",{}, subs.length), su? h("i",{class:"tdot"}) : "", svg(ICF.chev));
    li.querySelector(".metaicons").prepend(tog);
    if (!open) return el;
    subs.sort((a,b)=>((b.last&&b.last.at)||b.at||0)-((a.last&&a.last.at)||a.at||0));
    return [el, h("div",{class:"subgroup"+(S.justOpened===c.id?" enter":"")}, subs.map(x=>{ const t=S.tasks.find(z=>z.id===x.taskId); const st=t? STATUSES.find(z=>z.id===stOf(t)) : null;
      const row=h("button",{class:"lineitem subitem", "aria-current":String(x.id===S.active && (S.inThread || window.innerWidth>860)), onclick:()=>selectChannel(x.id)},
        h("span",{class:"glyph tglyph sm", style:`--st:${st? st.c : "var(--muted)"}`}, svg(IC.knot)),
        h("span",{style:"min-width:0"}, h("div",{class:"nm"}, t? h("span",{class:"tidmini", style:`--c:${st.c}`},"CN-"+t.num) : "", " ", t? t.title : chanTitle(x)), h("div",{class:"pv"}, h("span",{class:"pvt", "data-cid":x.id}, x.last? (x.last.by!==S.me? nameOf(x.last.by).replace(/^Example:\s*/,"").split(" ")[0]+": ":"")+lastPreview(x.last) : (st? st.name : "")))),
        h("span",{class:"meta"}, x.last? h("span",{class:"mono"}, fmtShort(x.last.at)):"", h("span",{class:"metaicons"}, isMuted(x)? h("span",{class:"mutemark", title:"Muted"}, svg(ICF.bellx)):"", unread(x)? h("span",{class:"badge"+(isMuted(x)?" muted":"")},"1"):"")));
      longPress(row,(px,py)=>rowMenu(x,px,py)); return swipeWrap(row, x); }))];
  };
  const itemEl = c => h("button",{class:"lineitem", "aria-current":String(c.id===S.active && S.inThread || (c.id===S.active && window.innerWidth>860)), onclick:()=>selectChannel(c.id)},
    chanGlyph(c),
    h("span",{style:"min-width:0"}, h("div",{class:"nm"}, chanTitle(c)), h("div",{class:"pv"}, c.last && c.last.by===S.me? ticks({by:S.me, at:c.last.at}, c) : "", h("span",{class:"pvt", "data-cid":c.id}, c.last? (c.kind!=="dm" && c.last.by!==S.me? nameOf(c.last.by).replace(/^Example:\s*/,"").split(" ")[0]+": ":"")+lastPreview(c.last) : ""))),
    h("span",{class:"meta"}, c.last? h("span",{class:"mono"}, fmtShort(c.last.at)):"", h("span",{class:"metaicons"}, isMuted(c)? h("span",{class:"mutemark", title:"Muted"}, svg(ICF.bellx)):"", S.pins.includes(c.id)? h("span",{class:"pinmark", title:"Pinned"}, svg(IC.pin)):"", unread(c)? h("span",{class:"badge"+(isMuted(c)?" muted":"")+(c.last&&(c.last.mentions||[]).includes(S.me)?" at":"")}, c.last&&(c.last.mentions||[]).includes(S.me)? "@" : "1"):""))
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
  return [!S.channels.length && S.mode!=="loading" ? h("div",{class:"empty",style:"margin-top:30px"}, h("p",{},"No chats yet")) : "", ...pinned.flatMap(c=>[item(c)].flat()), ...rest.flatMap(c=>[item(c)].flat())];
}

function renderThread(){
  const c = S.channels.find(x=>x.id===S.active);
  const wrap = h("section",{class:"main chatmain","aria-label":"Conversation", "data-cid":String(S.active||"")});
  if (!c) { wrap.append(h("div",{class:"empty"}, S.mode==="loading"? h("p",{},"Loading your team…") : [h("svg",{viewBox:"0 0 60 60",width:"60",height:"60",html:'<rect x="4" y="10" width="40" height="28" rx="14" fill="var(--bubble)"/><rect x="18" y="26" width="38" height="24" rx="12" fill="var(--cobalt)"/><path d="M29 38l4 4 9-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'}), h("h2",{},"Task Message")])); return wrap; }
  const memberCount = (c.members||[]).length;
  const openTasks = visibleTasks().filter(t=>t.channel===c.id && t.status!=="done").length;
  if (S.selecting) wrap.append(h("header",{class:"thead selhead"},
    h("button",{class:"iconbtn", "aria-label":"Cancel selection", title:"Cancel", onclick:()=>{ S.selecting=false; S.sel=[]; render(true); }}, svg(IC.x)),
    h("b",{class:"selcount"}, S.sel.length), h("span",{class:"grow"}),
    h("button",{class:"iconbtn accent", "aria-label":"Forward selected messages", title:"Forward", disabled:!S.sel.length, onclick:()=>forwardMenu(S.msgs.filter(m=>S.sel.includes(m.id)))}, svg(ICF.fwd)),
    h("button",{class:"iconbtn accent", "aria-label":"Make one task from the selected messages", title:"Make task", disabled:!S.sel.length, onclick:()=>quickTask(S.msgs.filter(m=>S.sel.includes(m.id)))}, svg(IC.knot))));
  else wrap.append(h("header",{class:"thead"},
    h("button",{class:"iconbtn back","aria-label":"Back to conversations", onclick:goBackToList}, svg(IC.back)),
    h("button",{class:"tinfo", "aria-label":"Chat info", onclick:()=>openChatInfo(c)}, chanGlyph(c),
      h("div",{class:"t"}, h("b",{},chanTitle(c)), h("span",{id:"thead-sub", "data-orig":theadSub(c)}, theadSub(c)))),
    h("span",{class:"grow"}),
    c.kind!=="task" && subsOf(c.id).length? h("button",{class:"iconbtn subsbtn", title:"Task conversations", "aria-label":"Task conversations in this chat", onclick:e=>{ const r=e.currentTarget.getBoundingClientRect(); subsMenu(c, r.right, r.bottom); }}, svg(IC.thread), h("b",{}, subsOf(c.id).length), subsOf(c.id).some(unread)? h("i",{class:"tdot"}) : "") : "",
    c.kind==="task" && S.channels.find(z=>z.id===c.parent)? h("button",{class:"iconbtn", title:"Back to the main chat", "aria-label":"Open the main chat", onclick:()=>selectChannel(c.parent)}, (()=>{ const g=chanGlyph(S.channels.find(z=>z.id===c.parent)); g.classList.add("mini"); return g; })()) : "",
    (()=>{ if (c.kind!=="dm") return ""; const ph=(S.teamDocs[(c.members||[]).find(x=>x!==S.me)]||{}).phone; return ph? h("a",{class:"iconbtn hcall", href:telHref(ph), title:"Call "+ph, "aria-label":"Call "+ph+" with your phone"}, svg(IC.phone)) : ""; })(),
    c.kind==="task" && S.tasks.find(x=>x.id===c.taskId)? h("button",{class:"iconbtn", title:"View task", "aria-label":"View task", onclick:()=>openTask(c.taskId)}, svg(IC.knot)) :
    "",
    h("button",{class:"iconbtn", title:"Menu", "aria-label":"Chat menu", onclick:e=>{ const r=e.currentTarget.getBoundingClientRect(); chatMenu(c, r.right, r.bottom); }}, svg(ICF.more))
  ));
  const stream = h("div",{class:"stream", id:"stream", onclick:e=>{ if (S.actFor && !e.target.closest(".holdmenu")) { S.actFor=null; S.emojiFor=null; scheduleRender();} if (S.emojiOpen && !e.target.closest(".compose")) { S.emojiOpen=false; render(true); } }});
  stream.append(buildSpine(c)); wrap.append(stream);
  wrap.append(renderComposer(c));
  wallpaperLayer(wrap);
  return wrap;
}

function theadSub(c){
  if (c.kind==="task") { const t=S.tasks.find(x=>x.id===c.taskId); const par=S.channels.find(z=>z.id===c.parent); return t? "CN-"+t.num+" · "+stName(stOf(t))+(par? " · "+chanTitle(par):"") : ""; }
  if (c.kind==="dm") return (S.teamDocs[(c.members||[]).find(x=>x!==S.me)]||{}).about||"";
  return (c.members||[]).map(id=>nameOf(id).replace(/^Example:\s*/,"").split(" ")[0]).join(", ");
}
// Only messages that just arrived animate in; re-drawing the screen never replays animations (no blinking).
const SEEN_MSG=new Set(); let SPINE_CHAT=null;
function buildSpine(c){
  const spine=h("div",{class:"spine"});
  const sameChat=SPINE_CHAT===c.id; SPINE_CHAT=c.id;
  if (E2E.ready) spine.append(h("div",{class:"e2enote"}, svg(ICF.lock), "End-to-end encrypted"));
  const all=msgsFor(c.id); const from=Math.max(0, all.length-S.msgLimit);
  if (from>0) spine.append(h("button",{class:"loadmore", onclick:e=>{ e.stopPropagation(); const st=$("#stream"); const h0=st.scrollHeight; S.msgLimit+=150; patchThread($(".chatmain")); st.scrollTop=st.scrollHeight-h0; }}, "Load earlier messages"));
  let lastDay=null, lastBy=null, lastAt=0;
  for (let i=from; i<all.length; i++) { const m=all[i];
    const dk=dayKey(m.at); if (dk!==lastDay){ spine.append(h("div",{class:"day"}, fmtDay(m.at))); lastDay=dk; lastBy=null; }
    const cont = lastBy===m.by && m.at-lastAt<5*60000 && !m.taskId; lastBy=m.by; lastAt=m.at;
    const el=renderMsg(m, cont, c);
    if (sameChat && !SEEN_MSG.has(m.id)) el.classList.add("fresh");
    SEEN_MSG.add(m.id); spine.append(el);
  }
  spine.append(h("div",{class:"msg typingrow", id:"typingrow", hidden:true}, h("div",{class:"who tyname"}), h("div",{class:"brow"}, h("div",{class:"strip tybub"}, h("span",{class:"dots"}, h("i"), h("i"), h("i")), h("span",{class:"tymic"}, svg(IC.mic))))));
  return spine;
}
function renderMsg(m, cont, chan){
  const mine = m.by===S.me; const task = m.taskId && S.tasks.find(t=>t.id===m.taskId && canSeeTask(t));
  const ch=chan||S.channels.find(c=>c.id===S.active)||{}; const sel=S.selecting && S.sel.includes(m.id); const rich=m.kind==="media"||m.kind==="contact"||m.kind==="location"; const pl=rich? plainP(m) : null;
  const el = h("div",{style:mine?null:`--tint:${(S.people[m.by]&&S.people[m.by].color)||colorFor(m.by)}`, class:`msg${mine?" mine":""}${cont?" cont":""}${task?" knotted":""}${m.pending?" pending":""}${rich?" rich k-"+m.kind:""}${S.justTied===m.id?" justtied":""}${S.selecting?" selmode":""}${sel?" selected":""}`, id:"msg-"+m.id, onclick:e=>{ if (S.selecting && !m.deleted){ e.stopPropagation(); toggleSel(m.id); } }});
  if (S.selecting) el.append(h("span",{class:"selck"}, sel? svg(ICF.check):""));
  if (!cont && !mine && ch.kind!=="dm") el.append(h("div",{class:"who"}, nameOf(m.by).replace(/^Example:\s*/,"")));
  const strip = h("div",{class:"strip", tabindex:"0", "aria-label":"Message. Hold for options, swipe right to reply, swipe left to forward or make a task", onkeydown:e=>{ if (e.key==="Enter"){ e.preventDefault(); holdMenu(m); } }});
  if (m.fwd) strip.append(h("div",{class:"fwdlabel"}, svg(m.fwd>=5? ICF.fwd2 : ICF.fwd), m.fwd>=5? "Forwarded many times" : "Forwarded"));
  if (m.replyTo) { const r=S.msgs.find(x=>x.id===m.replyTo); if (r) strip.append(h("div",{class:"quote", onclick:e=>{e.stopPropagation(); jumpToMessage(S.active, r.id);}}, h("b",{},nameOf(r.by)), (r.deleted?"Message deleted": msgText(r)).slice(0,140))); }
  if (m.statusQuote) strip.append(h("div",{class:"quote"}, h("b",{}, "Status · "+nameOf(m.statusQuote.by).replace(/^Example:\s*/,"")), String(m.statusQuote.text).slice(0,140)));
  if (m.deleted) strip.append(h("span",{class:"tx",style:"font-style:italic;color:var(--muted)"},"Message deleted"));
  else if (m.kind==="voice" && m.voice) { strip.classList.add("vstrip"); strip.append(renderVoice(m)); const cap=plain(m); if (cap) strip.append(h("span",{class:"tx vcap"}, richText(cap))); }
  else if (rich) {
    strip.classList.add("rstrip");
    if (pl===null) strip.append(h("span",{class:"tx locked"},"🔒 …")); else if (pl===false) strip.append(h("span",{class:"tx locked"}, LOCKED));
    else if (m.kind==="media") strip.append(renderMedia(m, pl)); else if (m.kind==="contact") strip.append(renderContactCard(pl)); else strip.append(renderLocation(pl));
    const cap=plain(m); if (cap) strip.append(h("span",{class:"tx mcap"}, richText(cap)));
  }
  else { const tx=shown(m); strip.append(h("span",{class:"tx"+(plain(m)===false?" locked":"")}, plain(m)? richText(tx) : tx)); }
  strip.append(h("span",{class:"mt"}, m.edited? "edited · ":"", fmtTime(m.at), ticks(m, ch)));
  el.append(h("span",{class:"swi swi-r","aria-hidden":"true"}, svg(IC.reply)));
  el.append(h("div",{class:"brow"}, strip,
    !m.deleted && !m.pending && !S.selecting && S.canWrite && plain(m)!==false? h("button",{class:"fwdbtn", title:"Forward", "aria-label":"Forward message", onclick:e=>{ e.stopPropagation(); forwardMenu(m); }}, svg(ICF.fwd)) : "",
    !m.deleted && !S.selecting && S.canWrite? h("button",{class:"mchev", title:"Options", "aria-label":"Message options", onclick:e=>{ e.stopPropagation(); holdMenu(m); }}, svg(ICF.chev)) : ""));
  if (!m.pending) attachGestures(el, strip, m);
  const rs = Object.entries(m.reactions||{}).filter(([,v])=>v&&v.length);
  if (rs.length) el.append(h("div",{class:"reacts"}, rs.map(([e,v])=>h("button",{class:"react"+(v.includes(S.me)?" on":""), title:v.map(nameOf).join(", "), disabled:!S.canWrite, onclick:()=>toggleReact(m,e)}, e, h("span",{class:"mono"},v.length)))));
  if (task && (task.fromMsg===m.id || !task.fromMsg) && ch.kind!=="dm" && ch.kind!=="task" && !S.selecting) el.append(h("div",{class:"tagrow"}, h("button",{class:"tasktag", style:`--st:${(STATUSES.find(x=>x.id===stOf(task))||STATUSES[0]).c}`, onclick:e=>{ e.stopPropagation(); openTask(task.id); }}, h("span",{class:"mono"},"CN-"+task.num), h("span",{class:"st"}, stName(stOf(task))), task.assignee? avatar(task.assignee,"sm"):""), h("button",{class:"tagthread"+(task.thread && S.channels.find(z=>z.id===task.thread)? " on":""), title:"Task conversation", "aria-label":"Open the task conversation", onclick:e=>{ e.stopPropagation(); openTaskChat(task); }}, svg(IC.thread), (()=>{ const th=task.thread && S.channels.find(z=>z.id===task.thread); return th && unread(th)? h("i",{class:"tdot"}) : ""; })())));
  else if (task && (task.fromMsg===m.id || !task.fromMsg)) el.append(h("button",{class:"tasktag", style:`--st:${(STATUSES.find(x=>x.id===stOf(task))||STATUSES[0]).c}`, onclick:e=>{ e.stopPropagation(); openTask(task.id); }}, h("span",{class:"mono"},"CN-"+task.num), h("span",{class:"st"}, stName(stOf(task))), task.assignee? avatar(task.assignee,"sm"):""));
  if (S.actFor===m.id && !m.deleted && S.canWrite) {
    const mine_r=(m.reactions||{});
    el.append(h("div",{class:"holdmenu", onclick:e=>e.stopPropagation()},
      h("div",{class:"emojis"+(S.emojiMore?" more":"")}, (S.emojiMore? MORE_EMOJI : quickEmojis()).map(e=>h("button",{class:(mine_r[e]||[]).includes(S.me)?"on":"", onclick:()=>toggleReact(m,e), "aria-label":"React "+e}, e)),
        S.emojiMore? "" : h("button",{class:"emore","aria-label":"More emojis", title:"More", onclick:()=>{ S.emojiMore=true; render(true); }}, svg(IC.plus))),
      h("div",{class:"acts"},
        h("button",{title:"Reply", "aria-label":"Reply", onclick:()=>{ S.replyTo=m.id; S.actFor=null; render(true); setTimeout(()=>{ const c=$("#composer"); if (c) c.focus(); }); }}, svg(IC.reply)),
        plain(m)!==false? h("button",{title:"Forward", "aria-label":"Forward", onclick:()=>forwardMenu(m)}, svg(ICF.fwd)) : "",
        task && canThread(task)? h("button",{title:"Task conversation", "aria-label":"Task conversation", onclick:()=>{ S.actFor=null; openTaskChat(task); }}, svg(IC.thread)) : "",
        task? h("button",{class:"tie", title:"Open task", "aria-label":"Open task", onclick:()=>openTask(task.id)}, svg(IC.knot)) : h("button",{class:"tie", title:"Make task", "aria-label":"Make task", onclick:()=>quickTask([m], {open:(S.prefs.swipeTask||"open")!=="silent"})}, svg(IC.knot)),
        h("button",{title:"Select", "aria-label":"Select messages", onclick:e=>{ e.stopPropagation(); S.selecting=true; S.sel=[m.id]; S.actFor=null; render(true); }}, svg(ICF.selm)),
        plain(m)? h("button",{title:"Copy", "aria-label":"Copy", onclick:()=>copyMsg(m)}, svg(ICF.copy)) : "",
        mine && !m.kind && plain(m)!==false? h("button",{title:"Edit", onclick:()=>{S.editing=m.id; S.actFor=null; render(true);}, "aria-label":"Edit"}, svg(IC.edit)):"",
        mine? h("button",{title:"Delete", onclick:()=>deleteMsg(m), "aria-label":"Delete message"}, svg(IC.trash)) : h("button",{title:"Report", "aria-label":"Report message", onclick:()=>{ S.actFor=null; render(true); openReport({title:"Report message", user:m.by, channel:S.active, message:m.id, text:msgText(m)}); }}, svg(ICF.flag2)))));
  }
  return el;
}

function renderComposer(c){
  const box = h("div",{class:"compose"}); const inner=h("div",{class:"inner"}); box.append(inner);
  if (!S.canWrite) { inner.append(h("div",{class:"hint",style:"text-align:center"},"View only")); return box; }
  const bp=dmPeer(c); if (bp && isBlocked(bp)) { inner.append(h("button",{class:"blockedbar", onclick:()=>setBlocked(bp,false)}, "You blocked this contact. ", h("b",{},"Tap to unblock."))); return box; }
  if (S.replyTo || S.editing) {
    const r = S.msgs.find(x=>x.id===(S.replyTo||S.editing));
    inner.append(h("div",{class:"replybar"}, svg(S.editing?IC.edit:IC.reply), h("b",{}, S.editing? "Editing" : "Replying to "+nameOf(r&&r.by)), h("span",{}, r? (r.kind==="voice"?"🎤 Voice note":shown(r)):""), h("button",{class:"iconbtn","aria-label":"Cancel", onclick:()=>{S.replyTo=null; S.editing=null; const t=$("#composer"); if(t) t.value=""; render(true);}}, svg(IC.x))));
  }
  if (S.rec && S.recFor!=="task") {
    inner.append(h("div",{class:"recbar"},
      h("button",{class:"rectrash", "aria-label":"Cancel recording", title:"Delete", onclick:()=>stopRec(true)}, svg(IC.trash)),
      h("span",{class:"recdot"}), h("span",{class:"rectime mono", id:"recTime"}, fmtDur(REC? (now()-REC.t0)/1000 : 0)),
      h("div",{class:"recbars", id:"recBars", "aria-hidden":"true"}, Array.from({length:40},()=>h("i"))),
      h("button",{class:"reckeep", "aria-label":"Stop and add a message", title:"Add a message", onclick:()=>stopRec(false, true)}, svg(IC.edit)),
      h("button",{class:"micbtn sending", "aria-label":"Send voice note", title:"Send", onclick:()=>stopRec(false)}, svg(IC.send))
    ));
    return box;
  }
  inner.append(renderVoiceDraft());
  if (S.statusReply) inner.append(h("div",{class:"replybar"}, svg(IC.reply), h("b",{},"Status"), h("span",{}, S.statusReply.text), h("button",{class:"iconbtn","aria-label":"Cancel", onclick:()=>{S.statusReply=null; render(true);}}, svg(IC.x))));
  const ta = h("textarea",{id:"composer", rows:"1", placeholder: S.asTask? "Task" : "Message", "aria-label":"Message",
    onfocus:()=>{ if (S.emojiOpen) { S.emojiOpen=false; const p=$(".emojipanel"); if (p) p.remove(); const b=$(".emobtn"); if (b) b.replaceChildren(svg(ICF.smile)); } },
    oninput:e=>{ autoGrow(e.target); e.target.closest(".crow").classList.toggle("has-text", !!e.target.value.trim() || !!(S.vdraft&&S.vdraft.cid===S.active)); if (!S.editing) { ls.set("draft:"+S.active, e.target.value); onComposerTyping(e.target.value); } updateMention(e.target, c); },
    onkeydown:e=>{ if (e.key==="Enter" && !e.shiftKey && !e.isComposing && S.prefs.enterSends!==false) { e.preventDefault(); const v=e.target.value; e.target.value=""; autoGrow(e.target); e.target.closest(".crow").classList.toggle("has-text", !!(S.vdraft&&S.vdraft.cid===S.active)); ls.set("draft:"+S.active,""); sendMessage(v); } if (e.key==="Escape") { S.replyTo=null; S.editing=null; render(true);} }});
  inner.append(h("div",{class:"mentionbox", id:"mentionbox", hidden:true}));
  inner.append(h("div",{class:"crow"+(S.vdraft&&S.vdraft.cid===S.active?" has-text":"")+(S.editing?" editing":"")},
    S.editing? "" : h("button",{class:"plusbtn", "aria-label":"Attach", title:"Attach", onclick:e=>openAttach(e.currentTarget)}, svg(IC.plus)),
    h("div",{class:"inbox"},
      ta,
      h("button",{class:"inbtn emobtn", "aria-label":S.emojiOpen?"Keyboard":"Emoji", title:"Emoji", onmousedown:e=>e.preventDefault(), onclick:()=>{ S.emojiOpen=!S.emojiOpen; if (S.emojiOpen) { const t=$("#composer"); if (t) t.blur(); } render(true); if (!S.emojiOpen) setTimeout(()=>{ const t=$("#composer"); if (t) t.focus(); }); }}, svg(S.emojiOpen? ICF.kbd : ICF.smile)),
      S.editing? "" : h("button",{class:"inbtn knotbtn","aria-pressed":String(S.asTask), title:"Send this message and turn it into a task", onclick:()=>{S.asTask=!S.asTask; render(true); $("#composer").focus();}}, svg(IC.knot))),
    h("button",{class:"sendbtn", "aria-label":S.editing?"Save edit":"Send", onmousedown:e=>e.preventDefault(), onclick:()=>{ const t=$("#composer"); const v=t.value; t.value=""; autoGrow(t); t.closest(".crow").classList.remove("has-text"); ls.set("draft:"+S.active,""); sendMessage(v); }}, svg(S.editing?IC.edit:IC.send)),
    S.editing? "" : h("button",{class:"micbtn", "aria-label":"Hold to record a voice note", title:"Hold to record", onpointerdown:micDown, oncontextmenu:e=>e.preventDefault(), onclick:e=>{ if (e.detail===0) startRec(); }}, svg(IC.mic))
  ));
  if (S.emojiOpen) inner.append(renderEmojiPanel());
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
const ICF = { bellx:'<path d="M6 16V11a6 6 0 0 1 9.4-4.9M18 10.5V16l1.5 2H9"/><path d="M10 20.5h4M4.5 4.5l15 15"/>', music:'<path d="M9 18V5.8l10-2.3V16"/><circle cx="6.6" cy="18" r="2.4"/><circle cx="16.6" cy="16" r="2.4"/>', speaker:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', banner:'<rect x="3.5" y="4" width="17" height="7" rx="2.5"/><path d="M6.5 15h11M6.5 19h7"/>', dotchat:'<path d="M13 5H5.5A1.5 1.5 0 0 0 4 6.5v8A1.5 1.5 0 0 0 5.5 16H7v3.5l4.5-3.5h7a1.5 1.5 0 0 0 1.5-1.5V11"/><circle cx="18.5" cy="5.5" r="2.5" fill="currentColor"/>', block:'<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', flag2:'<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>', camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', doc:'<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>', pin2:'<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>', contact:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="10" r="2.8"/><path d="M6.8 18c1.1-2.3 3-3.4 5.2-3.4s4.1 1.1 5.2 3.4"/>', smile:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.4 2.1 2.1 3.5 2.1s2.6-.7 3.5-2.1"/><circle cx="9.2" cy="10" r="1" fill="currentColor"/><circle cx="14.8" cy="10" r="1" fill="currentColor"/>', kbd:'<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13.5h10"/>', fwd2:'<path d="M11 5l6 6-6 6"/><path d="M16 5l6 6-6 6"/><path d="M17 11H9a6 6 0 0 0-6 6v2"/>', clip:'<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>', image:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20 16l-5-5-8 8"/>', fwd:'<path d="M14 5l6 6-6 6"/><path d="M20 11h-9a6 6 0 0 0-6 6v2"/>', copy:'<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', chev:'<path d="M7 10l5 5 5-5"/>', lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>', book:'<path d="M5 4.5h12.5a1.5 1.5 0 0 1 1.5 1.5v13.5H6.5A1.5 1.5 0 0 1 5 18z"/><circle cx="12" cy="10.5" r="2.4"/><path d="M8.5 16c.5-1.6 1.8-2.5 3.5-2.5s3 .9 3.5 2.5M19 8h1.5M19 12h1.5"/>', more:'<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>', selm:'<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>', list:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>', stage:'<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>', listv:'<path d="M8.5 6H20M8.5 12H20M8.5 18H20"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>', info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', drop:'<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>', bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>', vib:'<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 9v6M20 9v6"/>', grid:'<circle cx="6" cy="6" r="1.4"/><circle cx="12" cy="6" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/><circle cx="6" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/>', cell:'<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>', media:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10 9.5v5l4.2-2.5z" fill="currentColor"/>', all:'<circle cx="8" cy="9" r="2.6"/><circle cx="16" cy="9" r="2.6"/><path d="M3 18c.5-2.6 2.4-4 5-4s4.5 1.4 5 4M11 18c.5-2.6 2.4-4 5-4s4.5 1.4 5 4"/>', none:'<circle cx="12" cy="9" r="3.2" stroke-dasharray="2.5 2"/><path d="M5.5 19c.7-3 3.2-4.6 6.5-4.6s5.8 1.6 6.5 4.6" stroke-dasharray="2.5 2"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>', flag:'<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>', cal:'<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>', check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', personplus:'<circle cx="10" cy="8" r="3.4"/><path d="M3.5 20c.6-3.6 3.2-5.4 6.5-5.4 1.4 0 2.6.3 3.6.9M18 14v6M15 17h6"/>', goto:'<path d="M7 17L17 7M9 7h8v8"/>' };

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
          (()=>{ const v=(t.files||[]).filter(f=>f.kind==="voice"); return v.length? h("span",{class:"cchip vchip", title:"Voice note"}, svg(IC.mic), fmtDur(v[0].voice&&v[0].voice.dur)) : ""; })(),
          (()=>{ const p=(t.files||[]).filter(f=>f.kind==="image").length; return p? h("span",{class:"cchip", title:"Photos"}, svg(ICF.image), String(p)) : ""; })(),
          t.thread? h("span",{class:"cchat", title:"Has a conversation"}, svg(IC.chat)):"",
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
        id!==S.me && phone? h("a",{class:"ib", title:"Call phone "+phone, "aria-label":"Call phone", href:"tel:"+phone.replace(/[^\d+]/g,"")}, svg('<path d="M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2"/>')):"",
        h("button",{class:"ib", title:"Their tasks", "aria-label":"Their tasks", onclick:()=>{S.view="board"; S.filter=id===S.me?"me":id; ls.set("view","board"); render();}}, svg(IC.knot)),
        tm.owner===S.me && id!==S.me? h("button",{class:"ib danger", title:"Remove from team", "aria-label":"Remove from team", onclick:()=>removeMember(id)}, svg(IC.x)):"")
    ));
  }
  w.append(g, invitesSection(tm));
  if (S.canWrite && (tm.members||[]).includes(S.me)) w.append(h("button",{class:"fab vfab", "aria-label":"Add people to the team", title:"Add people", onclick:openAddMembers}, svg(ICF.personplus)));
  return w;
}
function peoplePicker(title, candidates, onDone, opts={}){
  const sel=new Set(opts.pre||[]); let name=opts.name||"";
  const scrim=h("div",{class:"scrim", onclick:e=>{ if (e.target===scrim) scrim.remove(); }});
  const draw=()=>{ scrim.replaceChildren(h("div",{class:"modal", role:"dialog", "aria-label":title, onkeydown:e=>{ if(e.key==="Escape") scrim.remove(); }},
    h("h3",{},title),
    opts.askName? h("input",{class:"inp", id:"pp-name", placeholder:"Team name", value:name, oninput:e=>name=e.target.value}) : "",
    candidates.length? h("div",{class:"picklist"}, candidates.map(id=>h("button",{class:"pick contact","aria-pressed":String(sel.has(id)), onclick:()=>{ sel.has(id)?sel.delete(id):sel.add(id); draw(); }}, h("span",{class:"cav"}, avatar(id), sel.has(id)? h("span",{class:"tick"}, svg(ICF.check)):""), fullName(id).replace(/^Example:\s*/,""))))
      : h("p",{class:"note",style:"margin:0"},"Everyone on Task Message is already here. Share Task Message from the Share menu to invite more people."),
    h("div",{class:"modalacts"}, h("button",{class:"iconbtn","aria-label":"Cancel", title:"Cancel", onclick:()=>scrim.remove()}, svg(IC.x)), h("button",{class:"roundgo","aria-label":"Done", title:"Done", onclick:()=>{ if (opts.askName && !name.trim()) { toast("Give the team a name."); return; } scrim.remove(); onDone([...sel], name.trim()); }}, svg(ICF.check)))));
    const n=$("#pp-name"); if (n && document.activeElement!==n && opts.askName && !name) n.focus(); };
  draw(); document.body.append(scrim);
}
function openTeamCreate(){ peoplePicker("New team", S.team.filter(id=>id!==S.me), async (ids, name)=>{ const id="tm"+now().toString(36)+uidShort().slice(0,3); await guarded(store.set("teams/"+id, {name, owner:S.me, members:[S.me, ...ids], visibility:"all", at:now()})); S.teamId=id; ls.set("teamId",id); toast("Team created"); render(); }, {askName:true}); }
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
let LAST_DRAWER=null;
function renderDrawer(){
  const isNew = S.openTask==="new"; const t = isNew? null : S.tasks.find(x=>x.id===S.openTask);
  if (!isNew && !t) { S.openTask=null; return h("span"); }
  const d=S.draftTask; const ro=!S.canWrite; if (!STATUSES.some(s=>s.id===d.status)) d.status=STATUSES[0].id; const stc=(STATUSES.find(s=>s.id===d.status)||STATUSES[0]).c;
  const close=()=>{ const el=$("#drawer"); const done=()=>{ S.openTask=null; S.draftTask=null; render(); }; if (el && window.innerWidth<=860) { el.classList.add("leaving"); setTimeout(done, 200); } else done(); };
  const opening=LAST_DRAWER!==S.openTask; LAST_DRAWER=S.openTask;
  const dr=h("aside",{class:"drawer td2"+(opening?" enter":""), id:"drawer", style:`--c:${stc}`, "aria-label":"Task", onkeydown:e=>{ if (e.key==="Escape") close(); }});
  const has = t && t.thread && S.channels.find(c=>c.id===t.thread);
  const src = d.fromMsg && d.channel && S.channels.find(c=>c.id===d.channel);
  // ---- top bar: close · task number · actions · Save
  dr.append(h("div",{class:"dhead td2head"},
    h("button",{class:"td2x","aria-label":"Close", title:"Close", onclick:close}, svg(IC.x)),
    h("span",{class:"td2num"}, isNew? "New task" : "CN-"+t.num),
    h("span",{class:"grow"}),
    t && (has || (S.canWrite && canThread(t)))? h("button",{class:"td2ic", title: has? "Open conversation":"Start a conversation about this task", "aria-label": has? "Open conversation":"Start conversation", onclick:()=>openTaskChat(t)}, svg(IC.thread)) : "",
    src? h("button",{class:"td2ic", title:"Go to the original message", "aria-label":"Go to message", onclick:()=>jumpToMessage(d.channel, d.fromMsg)}, svg(ICF.goto)) : "",
    !ro && !isNew? h("button",{class:"td2ic del", title:"Delete task", "aria-label":"Delete task", onclick:()=>confirmDeleteTask(t)}, svg(IC.trash)) : "",
    ro? "" : h("button",{class:"td2save", "aria-label":isNew?"Create task":"Save", title:isNew?"Create":"Save", onclick:saveTask}, svg(ICF.check))));
  const body=h("div",{class:"dbody td2body"});
  // ---- title
  body.append(h("textarea",{class:"td2title", id:"t-title", rows:"1", placeholder:"Task title", disabled:ro, oninput:e=>{ d.title=e.target.value; e.target.style.height="auto"; e.target.style.height=e.target.scrollHeight+"px"; }, onkeydown:e=>{ if(e.key==="Enter"){ e.preventDefault(); saveTask(); } }}, d.title));
  // ---- status: segmented control
  body.append(h("div",{class:"td2seg", role:"group", "aria-label":"Status"}, STATUSES.map(s=>h("button",{class:"td2segb","aria-pressed":String(d.status===s.id), style:`--c:${s.c}`, disabled:ro, onclick:()=>{ d.status=s.id; render(); }}, h("i"), s.name))));
  // ---- compact symbol chips: who · when · priority
  const who=d.assignee;
  const dueTxt = d.due? new Date(d.due+"T12:00:00").toLocaleDateString([], {month:"short", day:"numeric"}) : "";
  const overdue = d.due && d.status!=="done" && d.due < new Date().toISOString().slice(0,10);
  const PRI=[["low","Low priority"],["normal","Medium priority"],["high","High priority"]];
  const pi=Math.max(0, PRI.findIndex(p=>p[0]===d.priority));
  body.append(h("div",{class:"td2chips"},
    h("button",{class:"td2chip"+(who?" set":""), title: who? "Assigned to "+fullName(who) : "Assign", "aria-label": who? "Assigned to "+fullName(who)+". Change" : "Assign to someone", disabled:ro, onclick:()=>pickAssignee(d, t)},
      who? avatar(who,"td2av") : svg(ICF.personplus)),
    h("label",{class:"td2chip"+(d.due?" set":"")+(overdue?" late":""), title: d.due? "Due "+dueTxt : "Add due date"},
      svg(ICF.cal),
      h("input",{type:"date", id:"t-due", class:"td2date", value:d.due, disabled:ro, "aria-label":"Due date", onchange:e=>{ d.due=e.target.value; render(); }})),
    d.due? h("span",{class:"td2due"+(overdue?" late":"")}, dueTxt, ro? "" : h("button",{class:"td2chx", "aria-label":"Remove due date", onclick:()=>{ d.due=""; render(); }}, svg(IC.x))) : "",
    h("button",{class:"td2chip pri p-"+PRI[pi][0], title:PRI[pi][1]+" (tap to change)", "aria-label":PRI[pi][1]+". Tap to change", disabled:ro, onclick:()=>{ d.priority=PRI[(pi+1)%3][0]; render(); }},
      svg(ICF.flag))));
  // ---- subtasks + photos + voice memos
  body.append(h("div",{class:"td2card td2subs"}, renderTaskFiles(d, ro, renderSubtasks(d, t, isNew, ro))));
  // ---- notes
  body.append(h("div",{class:"td2card"}, h("textarea",{class:"td2notes", id:"t-notes", disabled:ro, placeholder:"Add notes…", oninput:e=>{ d.notes=e.target.value; e.target.style.height="auto"; e.target.style.height=Math.max(88,e.target.scrollHeight)+"px"; }}, d.notes)));
  // ---- where it came from (with the voice note playable right here)
  if (d.fromText || d.fromMsg) {
    const ch=S.channels.find(c=>c.id===d.channel);
    const srcVoices=(d.files||[]).filter(f=>f.kind==="voice" && f.fromMsg);
    let voiceEls=srcVoices.map(f=>renderVoice({id:"tv-"+f.id, by:f.by, voice:f.voice}));
    if (!voiceEls.length && d.fromMsg) { const pool=[...(S.msgCache[d.channel]||[]), ...(LOCAL.older[d.channel]||[]), ...(d.channel===S.active? S.msgs : [])]; const m=pool.find(x=>x.id===d.fromMsg); if (m && m.kind==="voice" && m.voice) voiceEls=[renderVoice(m)]; }
    const txt=(d.fromText||"").replace(/^🎤 Voice note \([^)]*\)\s*·?\s*/,"");
    body.append(h("div",{class:"td2card td2src"},
      h("div",{class:"td2srch"}, avatar(d.fromBy||S.me,"td2av"), h("b",{}, nameOf(d.fromBy).replace(/^Example:\s*/,"")), ch? h("span",{}, " in "+chanTitle(ch)) : "", h("span",{class:"grow"})),
      voiceEls.length? h("div",{class:"td2voice"}, voiceEls) : "",
      txt && !(voiceEls.length && /^🎤/.test(d.fromText||""))? h("p",{}, txt) : ""));
  }
  // ---- activity
  if (t && t.log && t.log.length) body.append(h("div",{class:"td2label"}, "Activity"), h("div",{class:"td2card td2log"}, [...t.log].reverse().slice(0,6).map(l=>h("div",{class:"td2logr"}, avatar(l.by,"td2av sm"), h("span",{}, h("b",{}, nameOf(l.by).replace(/^Example:\s*/,"").split(" ")[0]), " "+l.what), h("em",{}, fmtShort(l.at))))));
  dr.append(body);
  setTimeout(()=>{ const ti=$("#t-title"); if (ti){ ti.style.height="auto"; ti.style.height=ti.scrollHeight+"px"; } const n=$("#t-notes"); if (n){ n.style.height="auto"; n.style.height=Math.max(88,n.scrollHeight)+"px"; } });
  return dr;
}
const CHEV_R='<path d="M9.5 6l6 6-6 6"/>';
function confirmDeleteTask(t){
  sheet("Delete task?", (draw, close)=>[h("p",{class:"note", style:"margin:0 4px"}, "CN-"+t.num+" will be deleted for everyone. This can't be undone."),
    h("button",{class:"primary wide danger", onclick:()=>{ close(); deleteTask(t.id); }}, svg(IC.trash), "Delete"), h("button",{class:"ghost wide", onclick:close}, "Cancel")]);
}
// Choose who the task is for — only people on your team.
function pickAssignee(d, t){
  const team=peopleForTasks(t||d);
  sheet("Assign to", (draw, close)=>[
    h("div",{class:"ulist sgroup"},
      h("button",{class:"srow pick1"+(!d.assignee?" on":""), onclick:()=>{ d.assignee=""; close(); render(); }}, h("span",{class:"cav"}, h("span",{class:"av td2none"}, svg(ICF.none))), h("span",{class:"stx"}, h("b",{}, "No one")), !d.assignee? svg(ICF.check) : ""),
      team.map(id=>h("button",{class:"srow pick1"+(d.assignee===id?" on":""), onclick:()=>{ d.assignee=id; close(); render(); }}, h("span",{class:"cav"}, avatar(id)), h("span",{class:"stx"}, h("b",{}, id===S.me? "Me" : fullName(id).replace(/^Example:\s*/,"")), h("span",{}, (S.teamDocs[id]||{}).about||"")), d.assignee===id? svg(ICF.check) : ""))),
    team.length<=1? h("p",{class:"note", style:"margin:0 4px"}, "You can assign tasks to people on your team. Add people to your team first.") : h("p",{class:"note", style:"margin:0 4px"}, "Only people on your team are shown."),
    team.length<=1 && curTeam()? h("button",{class:"primary wide", onclick:()=>{ close(); openAddMembers(); }}, svg(ICF.personplus), "Add people to my team") : ""
  ]);
}

// new conversation modal
function openNewChat(){ S.newFlow={step:"pick", sel:[], name:"", icon:"", q:""}; S.inThread=false; S.view="chats"; render(); setTimeout(()=>{ const i=$("#nf-q"); if (i) i.focus(); },30); }
function closeFlow(){ S.newFlow=null; render(); }
const GROUP_ICONS=["💬","🚀","📣","🛠️","🎯","📦","🎨","📈","☕","🏠","⚽","🎉"];
// Start a chat with any phone number — laid out like the iPhone's own "New Contact" screen.
function openChatByNumber(){
  if (document.getElementById("ncview")) return;
  let cc=ls.get("cc","+1"), num=(S.newFlow&&/^[+\d\s()-]{6,}$/.test(S.newFlow.q||"")? S.newFlow.q : ""), first="", last="", busy=false, notOn=null;
  const o=h("div",{class:"ncwrap", id:"ncview", role:"dialog", "aria-label":"New contact"});
  const close=()=>{ o.classList.add("out"); setTimeout(()=>o.remove(), 220); };
  const valid=()=>dgt(toE164(num, cc)).length>=8;
  const go=async()=>{
    if (!valid() || busy) return; const phone=toE164(num, cc);
    busy=true; notOn=null; draw();
    const uid=userByPhone(phone) || await lookupPhone(phone); busy=false;
    if (uid===S.me) { draw(); toast("That's your own number."); return; }
    if (uid) { o.remove(); S.newFlow=null; await setContact(uid, true).catch(()=>{}); createChannel("", [S.me, uid], "dm"); return; }
    notOn=phone; draw();
  };
  const field=(id, ph, val, set, extra={})=>h("input",{class:"ncin", id, placeholder:ph, value:val, autocomplete:"off", oninput:e=>{ set(e.target.value); if (id==="nc-num") { notOn=null; const b=$("#nc-go"); if (b) b.disabled=!valid(); } }, ...extra});
  const ccName=()=>(COUNTRIES.find(c=>c[0]===cc)||[cc,""])[1];
  function draw(){
    swapKids(o, [h("div",{class:"ncsheet"},
      h("div",{class:"nchead"},
        h("button",{class:"nctxt", onclick:close}, "Cancel"),
        h("b",{}, "New Contact"),
        h("button",{class:"nctxt strong", id:"nc-go", disabled:!valid() || busy, onclick:go}, busy? "…" : "Chat")),
      h("div",{class:"ncbody"},
        h("div",{class:"ncav"}, svg(PERSON_SIL)),
        h("div",{class:"ncgroup"},
          field("nc-first", "First name", first, v=>first=v, {autocapitalize:"words"}),
          field("nc-last", "Last name", last, v=>last=v, {autocapitalize:"words"})),
        h("div",{class:"ncgroup"},
          h("div",{class:"ncphone"},
            h("label",{class:"nccc"}, h("span",{}, ccName()), h("b",{}, cc), svg(CHEV_R),
              h("select",{"aria-label":"Country code", onchange:e=>{ cc=e.target.value; ls.set("cc",cc); draw(); }}, COUNTRIES.map(([c,n])=>h("option",{value:c, selected:c===cc}, n+" "+c)))),
            field("nc-num", "Phone", num, v=>num=v, {type:"tel", inputmode:"tel", autocomplete:"tel", onkeydown:e=>{ if (e.key==="Enter") go(); }}))),
        notOn? [h("p",{class:"ncfoot"}, (first||"This number").trim()+" isn't on Task Message yet."),
          h("div",{class:"ncgroup"}, h("button",{class:"ncrow", onclick:()=>{ openSms(notOn, `Join me on Task Message — chat and turn messages into tasks. ${siteLink("")||location.origin}`); close(); }}, "Invite to Task Message"))]
        : h("p",{class:"ncfoot"}, "If they use Task Message, a chat opens right away.")))]);
  }
  draw(); document.body.append(o);
  setTimeout(()=>{ const i=$("#nc-num"); if (i && !num) { const f=$("#nc-first"); if (f) f.focus(); } else if (i) i.focus(); }, 80);
}
function flowRedraw(){ const old=document.querySelector("section.flow"); if (!old) { render(); return; } const nw=renderFlow(); const l=old.querySelector(".list"), st=l? l.scrollTop : 0; old.className=nw.className.replace(" enter",""); swapKids(old, [...nw.childNodes]); }
function renderFlow(){
  const F=S.newFlow; const others=S.team.filter(id=>id!==S.me).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
  const q=F.q.toLowerCase(); const match=others.filter(id=>!q || nameOf(id).toLowerCase().includes(q));
  const firstFlow=!F._shown; F._shown=true;
  const pane=h("section",{class:"lines flow"+(firstFlow?" enter":""),"aria-label":"New chat", onkeydown:e=>{ if (e.key!=="Escape") return; if (F.step==="pick") closeFlow(); else { F.step = F.step==="members"? "pick" : "members"; render(); } }});
  const head=(title, sub, back)=>h("div",{class:"flowhead"}, h("button",{class:"iconbtn","aria-label":"Back", onclick:back}, svg(IC.back)), h("div",{class:"fht"}, h("b",{},title), sub? h("span",{},sub):""));
  const searchBox=()=>h("label",{class:"search"}, svg(IC.search), h("input",{id:"nf-q", placeholder:"Search name", value:F.q, oninput:e=>{F.q=e.target.value; flowRedraw(); }}));
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
    if (!q) list.append(h("button",{class:"action", onclick:openChatByNumber}, h("span",{class:"actic"}, svg(ICF.personplus)), h("b",{},"New contact")));
    if (!q) list.append(h("button",{class:"action", onclick:importContacts}, h("span",{class:"actic"}, svg(ICF.book)), h("b",{}, S.addr.length? "Update phone contacts" : "Import phone contacts")));
    const saved=match.filter(id=>S.contacts.includes(id)).sort((a,b)=>nameOf(a).localeCompare(nameOf(b))), more=match.filter(id=>!S.contacts.includes(id));
    const go=id=>()=>{ S.newFlow=null; createChannel("", [S.me,id], "dm"); };
    const invites=(S.addr||[]).filter(c=>!c.on && (!q || c.n.toLowerCase().includes(q) || c.p.some(p=>p.includes(q))));
    if (!match.length && !invites.length) list.append(empty());
    if (saved.length) list.append(h("div",{class:"seg-label"},"Contacts on Task Message"), ...saved.map(id=>person(id,{onclick:go(id)})));
    if (more.length) list.append(h("div",{class:"seg-label"},"Others on Task Message"), ...more.map(id=>person(id,{onclick:go(id), add:true})));
    if (invites.length) list.append(h("div",{class:"seg-label"},"Invite to Task Message"), lazyRows(invites, inviteRow));
    if (NATIVE && !q && S.addr && S.addr.length) list.append(h("p",{class:"note contactsnote"}, IOS? "Missing someone? On your iPhone open Settings, tap Apps, tap Task Message, tap Contacts and choose Full Access. Then tap Update phone contacts." : "Missing someone? Tap Update phone contacts."));
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
    body.append(h("label",{class:"gname"}, h("input",{id:"nf-name", maxlength:"60", placeholder:"Group name (required)", value:F.name, oninput:e=>{F.name=e.target.value; flowRedraw(); }, onkeydown:e=>{ if (e.key==="Enter") finishGroup(); }}), h("span",{class:"count mono"}, 60-F.name.length)));
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

if (/[?&]test=1/.test(location.search)) window.__concept={openLogin, openProfileSetup, openFindContacts, demoTyping, S, msgBanner, playTone, noticeIncoming, LOCAL, loadLocalCopy, localMessages, kvGet, buildBackup, readBackup, restoreBackup, mergeById, peaksFromBlob, peaksFromLevels, quickTask};
boot();
})();
