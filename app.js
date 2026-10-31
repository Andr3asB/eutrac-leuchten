// Leuchtendaten kommen aus leuchten.json, die Merkliste aus einem Sitzungs-Cookie (merkliste-store.js).
(async()=>{
let rows;
try{ rows=await (await fetch("leuchten.json?v=20261031e",{cache:"no-cache"})).json() }
catch(e){ document.getElementById("count").textContent="Leuchtendaten (leuchten.json) konnten nicht geladen werden."; return }
rows.forEach(r=>{r.type=r.type||"Spot";r.lamp=r.lamp||"LED integriert";r.key=r.brand.replace(/\W/g,"")+"_"+r.art;r.lmw=(r.lm&&r.w&&!r.lmText)?Math.round(r.lm/r.w):null;r.cctSort=r.ccts.length?Math.min(...r.ccts):null});

const byKey=Object.fromEntries(rows.map(r=>[r.key,r]));
const ANGLE_BUCKETS=[["eng","≤ 24°",(r)=>r.aMin!=null&&r.aMin<=24],["mittel","25–40°",(r)=>r.aMin!=null&&r.aMin<=40&&r.aMax>=25],["breit","≥ 50°",(r)=>r.aMax!=null&&r.aMax>=50],["zoom","Zoom/wählbar",(r)=>r.aMin!=null&&r.aMin!==r.aMax]];
const MAIN_COLORS=["schwarz","weiß","grau"]; const colorKey=c=>MAIN_COLORS.includes(c)?c:"andere";
const lampKey=l=>l==="LED integriert"?"LED integriert":"wechselbar";
const COLS=[
  {k:"pick",t:"Merken",nosort:1},{k:"model",t:"Leuchte"},{k:"type",t:"Typ"},{k:"cctSort",t:"Farbtemp."},{k:"aMin",t:"Winkel"},{k:"color",t:"Gehäuse"},
  {k:"w",t:"Watt",n:1},{k:"lm",t:"Lumen",n:1},{k:"lmw",t:"lm/W",n:1},{k:"cri",t:"CRI",n:1},{k:"dim",t:"Dimmung"},{k:"ugr",t:"UGR ≤",n:1},
  {k:"dims",t:"Maße cm"},{k:"price",t:"Preis ab €",n:1},{k:"art",t:"Art.-Nr."},{k:"links",t:"Details",nosort:1}
];
const CCT_COLOR={2700:"#ffb45c",3000:"#ffcf86",4000:"#fff1d6"};
const state={type:new Set(),lamp:new Set(),brand:new Set(),cct:new Set(),angle:new Set(),color:new Set(),dim:new Set(),sort:"lm",dir:1};
let rooms=[]; let assigns=[]; let db=null; let canWrite=true; let dbReady=false;

function chipGroup(id,key,values,label=v=>v){
  const el=document.getElementById(id);
  values.forEach(v=>{const b=document.createElement("button");b.type="button";b.textContent=label(v);b.setAttribute("aria-pressed","false");
    b.onclick=()=>{state[key].has(v)?state[key].delete(v):state[key].add(v);b.setAttribute("aria-pressed",state[key].has(v));render()};el.appendChild(b)});
}
chipGroup("fBrand","brand",[...new Set(rows.map(r=>r.brand))]);
chipGroup("fCct","cct",[2700,3000,4000],v=>v+" K");
chipGroup("fAngle","angle",ANGLE_BUCKETS.map(b=>b[0]),v=>ANGLE_BUCKETS.find(b=>b[0]===v)[1]);
chipGroup("fType","type",["Spot","Pendel","Linear/Fläche"]);
chipGroup("fLamp","lamp",["LED integriert","wechselbar"],v=>v==="wechselbar"?"wechselbar (GU10/E27)":v);
chipGroup("fColor","color",["schwarz","weiß","grau","andere"]);
chipGroup("fDim","dim",["Abschnitt","An-/Abschnitt","Anschnitt","Abschnitt (Dim‑to‑Warm)","je Leuchtmittel","k. A."],v=>v==="Abschnitt (Dim‑to‑Warm)"?"Dim‑to‑Warm":v);

const head=document.getElementById("head");
COLS.forEach(c=>{const th=document.createElement("th");if(c.n)th.className="n";
  if(c.nosort){th.textContent=c.t}else{const b=document.createElement("button");b.textContent=c.t;b.dataset.k=c.k;
    b.onclick=()=>{state.dir=state.sort===c.k?-state.dir:1;state.sort=c.k;render()};th.appendChild(b)}
  head.appendChild(th)});
["minLm","maxW","minCri","onlyPicked"].forEach(id=>document.getElementById(id).addEventListener("input",render));
document.getElementById("reset").onclick=()=>{["type","lamp","brand","cct","angle","color","dim"].forEach(k=>state[k].clear());
  document.querySelectorAll(".chips button").forEach(b=>b.setAttribute("aria-pressed","false"));
  ["minLm","maxW"].forEach(id=>document.getElementById(id).value="");document.getElementById("minCri").value="0";document.getElementById("onlyPicked").value="all";render()};

const fmt=n=>n==null?"–":n.toLocaleString("de-DE");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const roomById=id=>rooms.find(r=>r.id===id);
const short=r=>`${r.model} · ${r.cctLabel.split(" ")[0]} K · ${r.angleLabel} · ${r.color}`;
function status(t){document.getElementById("pickStatus").textContent=t}
const writable=()=>db&&canWrite&&dbReady;

// Anzeige-Filter: „alle“, „nur gemerkte“ und je Raum eine Option; Auswahl bleibt erhalten, solange der Raum existiert
function syncViewOptions(){
  const sel=document.getElementById("onlyPicked"), cur=sel.value;
  const opts=[["all","alle Leuchten"],["picked","nur gemerkte"],...rooms.map(rm=>["room:"+rm.id,"nur Raum: "+rm.name])];
  const sig=opts.map(o=>o.join("\u0001")).join("\u0002");
  if(sel.dataset.sig!==sig){
    sel.innerHTML=opts.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join("");
    sel.dataset.sig=sig; sel.value=opts.some(o=>o[0]===cur)?cur:"all";
  }
  return sel.value;
}
function render(){
  const minLm=+document.getElementById("minLm").value||0, maxW=+document.getElementById("maxW").value||Infinity,
    minCri=+document.getElementById("minCri").value||0, view=syncViewOptions(), only=view==="picked", onlyRoom=view.startsWith("room:")?view.slice(5):null;
  const usedBy={}; assigns.forEach(a=>{(usedBy[a.leuchte]=usedBy[a.leuchte]||[]).push(a)});
  let list=rows.filter(r=>(!state.brand.size||state.brand.has(r.brand))&&(!state.cct.size||r.ccts.some(c=>state.cct.has(c)))&&
    (!state.angle.size||ANGLE_BUCKETS.some(b=>state.angle.has(b[0])&&b[2](r)))&&(!state.color.size||state.color.has(colorKey(r.color)))&&(!state.type.size||state.type.has(r.type))&&(!state.lamp.size||state.lamp.has(lampKey(r.lamp)))&&
    (!state.dim.size||state.dim.has(r.dim))&&(!minCri||(r.cri!=null&&r.cri>=minCri))&&(!minLm||(r.lm||0)>=minLm)&&(maxW===Infinity||(r.w!=null&&r.w<=maxW))&&(!only||usedBy[r.key])&&(!onlyRoom||(usedBy[r.key]||[]).some(a=>a.raum===onlyRoom)));
  const k=state.sort;
  list.sort((a,b)=>{const x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x>y?1:x<y?-1:0)*state.dir});
  head.querySelectorAll("button").forEach(b=>b.dataset.dir=b.dataset.k===k?(state.dir>0?"↑":"↓"):"");
  document.getElementById("count").textContent=list.length+" von "+rows.length+" Leuchten";
  document.getElementById("rows").innerHTML=list.map(r=>{
    const u=usedBy[r.key]||[];
    const usedTxt=u.map(a=>{const rm=roomById(a.raum);return `${a.stueck}× ${esc(rm?rm.name:"?")}${a.gruppe?" / "+esc(a.gruppe):""}`}).join(", ");
    return `<tr class="${u.length?"picked":""}">
    <td><button class="btn${u.length?"":" primary"}" type="button" data-pick="${r.key}"${writable()?"":" disabled"}>Merken</button>${u.length?`<span class="used">${usedTxt}</span>`:""}</td>
    <td style="white-space:normal;min-width:240px"><span class="brand">${r.brand}</span><span class="model">${esc(r.model)}</span>${r.hinweis?`<span class="hint">⚠ ${esc(r.hinweis)}</span>`:""}</td><td>${r.type}<span class="brand">${esc(r.lamp)}</span></td>
    <td><span class="cct">${r.ccts.map(c=>`<span class="dot" style="background:${CCT_COLOR[c]}"></span>`).join("")}${r.cctLabel}</span></td>
    <td>${r.angleLabel}</td><td>${r.color}</td>
    <td class="n">${fmt(r.w)}</td><td class="n">${r.lmText||fmt(r.lm)}</td><td class="n">${fmt(r.lmw)}</td><td class="n">${fmt(r.cri)}</td><td>${r.dim}</td><td class="n">${fmt(r.ugr)}</td>
    <td class="mono">${r.dims}</td><td class="n">${fmt(r.price)}${r.priceSrc?`<a class="psrc" href="${esc(r.priceUrl||r.ds)}" target="_blank" rel="noopener" title="Preis von ${esc(r.priceSrc)}, Stand ${esc(r.priceDate||"?")}">${esc(r.priceSrc)}${r.priceDate?" · "+esc(r.priceDate.split("-").reverse().join("/")):""}</a>`:""}</td><td class="mono">${r.art}</td>
    <td><span class="links"><a href="${r.ds}" target="_blank" rel="noopener">${r.dsLabel||"Datenblatt"}</a>${r.img!==r.ds?`<a href="${r.img}" target="_blank" rel="noopener">${r.imgLabel||"Bilder"}</a>`:""}${r.shop?`<a href="${r.shop}" target="_blank" rel="noopener">Shop</a>`:""}</span></td></tr>`}).join("");
}

let editing=null, confirmDel=null;
function renderRooms(){
  const el=document.getElementById("rooms");
  if(el.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return; // nicht beim Tippen neu zeichnen
  if(!rooms.length){el.innerHTML=`<div class="empty">Noch keine Räume angelegt. Oben einen Raum hinzufügen.</div>`;return}
  const dis=writable()?"":" disabled";
  el.innerHTML=rooms.map(rm=>{
    const items=assigns.filter(a=>a.raum===rm.id&&byKey[a.leuchte]);
    const groups=[...(rm.gruppen||[])]; items.forEach(a=>{if(a.gruppe&&!groups.includes(a.gruppe))groups.push(a.gruppe)});
    const ungrouped=items.filter(a=>!a.gruppe);
    const itemHtml=a=>{const r=byKey[a.leuchte];return `<div class="item"><input type="number" min="1" max="50" value="${a.stueck}" data-qty="${a.id}" aria-label="Stückzahl ${esc(r.model)}"${dis}><span>${esc(short(r))}</span><span class="p">${r.price!=null?fmt(r.price*a.stueck)+" €":"–"}</span><button class="btn x" type="button" data-del-assign="${a.id}" aria-label="Entfernen"${dis}>×</button></div>`};
    const gHtml=g=>{const its=items.filter(a=>a.gruppe===g);return `<div class="group"><h4><span>${esc(g)}</span>${its.length?"":`<button class="btn x" type="button" data-del-group="${rm.id}" data-g="${esc(g)}" aria-label="Verwendung ${esc(g)} entfernen"${dis}>×</button>`}</h4>${its.map(itemHtml).join("")||`<div class="empty">noch leer</div>`}</div>`};
    const n=items.reduce((s,a)=>s+a.stueck,0), w=items.reduce((s,a)=>s+byKey[a.leuchte].w*a.stueck,0), lm=items.reduce((s,a)=>s+(byKey[a.leuchte].lm||0)*a.stueck,0);
    const eur=items.reduce((s,a)=>s+(byKey[a.leuchte].price||0)*a.stueck,0), noPrice=items.filter(a=>byKey[a.leuchte].price==null).reduce((s,a)=>s+a.stueck,0);
    const nameHtml=editing===rm.id?`<input type="text" id="ren-${rm.id}" value="${esc(rm.name)}" aria-label="Raumname">`:`<strong>${esc(rm.name)}</strong>`;
    const del=confirmDel===rm.id?`<button class="btn danger" type="button" data-del-room="${rm.id}"${dis}>Wirklich löschen?</button>`:`<button class="btn link" type="button" data-ask-del="${rm.id}"${dis}>Löschen</button>`;
    return `<div class="room"><div class="roomhead">${nameHtml}<span class="tools"><button class="btn link" type="button" data-rename="${rm.id}"${dis}>${editing===rm.id?"Fertig":"Umbenennen"}</button>${del}</span></div>
      ${groups.map(gHtml).join("")}${ungrouped.length?`<div class="group"><h4><span>ohne Verwendung</span></h4>${ungrouped.map(itemHtml).join("")}</div>`:""}
      <div class="tools"><input type="text" placeholder="Neue Verwendung" id="ng-${rm.id}" aria-label="Neue Verwendung für ${esc(rm.name)}"${dis}><button class="btn" type="button" data-add-group="${rm.id}"${dis}>+ Verwendung</button></div>
      <div class="sum">${n?`<b>ab ca. ${eur.toLocaleString("de-DE")} €</b><span>${n} Stk. · ${w} W · ${lm.toLocaleString("de-DE")} lm${noPrice?` · ${noPrice} Stk. ohne Preis`:""}</span>`:`<span>Noch keine Leuchten gemerkt.</span>`}</div></div>`}).join("");
  if(editing){const i=document.getElementById("ren-"+editing);if(i){i.focus();i.select()}}
}

async function safe(fn,msg){try{await fn()}catch(err){if(err&&err.code==="invalid_argument"){canWrite=false;status("Nur Ansicht: Du kannst die Merkliste nicht ändern. Bitte Bearbeitungsrecht beim Besitzer anfragen.");render();renderRooms()}else status(err&&["too_large","conflict","forbidden","not_found","network"].includes(err.code)?err.message:msg)}}
const slug=s=>s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"raum";

document.getElementById("addRoom").onclick=async()=>{
  const inp=document.getElementById("newRoom"), name=inp.value.trim(); if(!name||!writable())return;
  const id=slug(name)+"-"+Date.now().toString(36);
  inp.value=""; await safe(()=>db.doc("raeume/"+id).set({name,gruppen:["Decke"],pos:Date.now()}),"Raum konnte nicht angelegt werden.");
};
document.getElementById("newRoom").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("addRoom").click()});

document.getElementById("rooms").addEventListener("click",async e=>{
  const t=e.target.closest("button"); if(!t||!writable())return;
  if(t.dataset.rename){const id=t.dataset.rename;
    if(editing===id){const v=(document.getElementById("ren-"+id)||{}).value?.trim();editing=null;
      if(v&&v!==roomById(id).name)await safe(()=>db.doc("raeume/"+id).update({name:v}),"Umbenennen fehlgeschlagen.");renderRooms()}
    else{editing=id;renderRooms()}}
  else if(t.dataset.askDel){confirmDel=t.dataset.askDel;renderRooms();setTimeout(()=>{if(confirmDel){confirmDel=null;renderRooms()}},4000)}
  else if(t.dataset.delRoom){const id=t.dataset.delRoom;confirmDel=null;
    await safe(async()=>{for(const a of assigns.filter(a=>a.raum===id))await db.doc("zuordnung/"+a.id).delete();await db.doc("raeume/"+id).delete()},"Löschen fehlgeschlagen.")}
  else if(t.dataset.delAssign){await safe(()=>db.doc("zuordnung/"+t.dataset.delAssign).delete(),"Entfernen fehlgeschlagen.")}
  else if(t.dataset.addGroup){const id=t.dataset.addGroup,inp=document.getElementById("ng-"+id),g=inp.value.trim();if(!g)return;
    const rm=roomById(id);inp.value="";if((rm.gruppen||[]).includes(g))return;
    await safe(()=>db.doc("raeume/"+id).update({gruppen:[...(rm.gruppen||[]),g]}),"Verwendung konnte nicht angelegt werden.")}
  else if(t.dataset.delGroup){const id=t.dataset.delGroup,g=t.dataset.g,rm=roomById(id);
    await safe(()=>db.doc("raeume/"+id).update({gruppen:(rm.gruppen||[]).filter(x=>x!==g)}),"Entfernen fehlgeschlagen.")}
});
document.getElementById("rooms").addEventListener("keydown",e=>{
  if(e.key!=="Enter")return; const id=e.target.id||"";
  if(id.startsWith("ren-")){const b=document.querySelector(`[data-rename="${id.slice(4)}"]`);e.target.blur();b&&b.click()}
  if(id.startsWith("ng-")){const b=document.querySelector(`[data-add-group="${id.slice(3)}"]`);b&&b.click()}
});
document.getElementById("rooms").addEventListener("change",async e=>{
  const id=e.target.dataset.qty; if(!id||!writable())return;
  const v=Math.max(1,Math.min(50,+e.target.value||1));
  await safe(()=>db.doc("zuordnung/"+id).update({stueck:v}),"Stückzahl konnte nicht gespeichert werden.");
});
document.getElementById("rooms").addEventListener("focusout",()=>setTimeout(()=>{if(!document.getElementById("rooms").contains(document.activeElement))renderRooms()},0));

// Merken-Dialog
const dlg=document.getElementById("pickDlg"); let pickKey=null;
function fillGroups(){const rm=roomById(document.getElementById("pRoom").value);
  document.getElementById("pGroup").innerHTML=`<option value="">– keine –</option>`+(rm?(rm.gruppen||[]).map(g=>`<option>${esc(g)}</option>`).join(""):"")}
document.getElementById("pRoom").addEventListener("change",fillGroups);
document.getElementById("rows").addEventListener("click",e=>{
  const b=e.target.closest("[data-pick]"); if(!b||!writable())return;
  if(!rooms.length){status("Bitte zuerst oben einen Raum anlegen.");return}
  pickKey=b.dataset.pick; const r=byKey[pickKey];
  document.getElementById("pickSub").textContent=r.brand+" · "+short(r)+" · Art.-Nr. "+r.art;
  document.getElementById("pRoom").innerHTML=rooms.map(rm=>`<option value="${rm.id}">${esc(rm.name)}</option>`).join("");
  fillGroups(); document.getElementById("pNewGroup").value=""; document.getElementById("pQty").value="1"; document.getElementById("pickErr").hidden=true;
  dlg.showModal();
});
document.getElementById("pickCancel").onclick=()=>dlg.close();
document.getElementById("pickForm").addEventListener("submit",async e=>{
  e.preventDefault(); const roomId=document.getElementById("pRoom").value, rm=roomById(roomId); if(!rm)return;
  const ng=document.getElementById("pNewGroup").value.trim(); const g=ng||document.getElementById("pGroup").value;
  const qty=Math.max(1,Math.min(50,+document.getElementById("pQty").value||1));
  const btn=document.getElementById("pickSave"); btn.disabled=true;
  try{
    if(ng&&!(rm.gruppen||[]).includes(ng))await db.doc("raeume/"+roomId).update({gruppen:[...(rm.gruppen||[]),ng]});
    const existing=assigns.find(a=>a.leuchte===pickKey&&a.raum===roomId&&(a.gruppe||"")===g);
    if(existing)await db.doc("zuordnung/"+existing.id).update({stueck:existing.stueck+qty});
    else await db.collection("zuordnung").add({leuchte:pickKey,raum:roomId,gruppe:g,stueck:qty,t:Date.now()});
    dlg.close();
  }catch(err){const p=document.getElementById("pickErr");p.hidden=false;p.textContent=err&&["too_large","conflict","forbidden","not_found","network"].includes(err.code)?err.message:err&&err.code==="invalid_argument"?"Keine Berechtigung zum Ändern der Merkliste.":"Speichern fehlgeschlagen. Bitte erneut versuchen."}
  finally{btn.disabled=false}
});

render(); renderRooms();

// ---------- Merkliste: lokal oder gemeinsam ----------
const S=window.MerklisteStore;
let unsub=[], notice="";
const KNOWN=["too_large","conflict","forbidden","not_found","network","not_configured","offline"];
function readyText(){
  if(db.mode==="shared")return "Gemeinsame Liste"+(db.hasPassword?" (mit Passwort)":"")+": Alle mit dem Link sehen Änderungen sofort. Die Daten werden im Browser verschlüsselt gespeichert.";
  return db.persistent?"Auf „Merken“ klicken, um eine Leuchte einem Raum und einer Verwendung zuzuordnen. Die Merkliste liegt in einem Sitzungs-Cookie in diesem Browser und wird beim Schließen des Browsers gelöscht."
    :"Cookies sind blockiert: Die Merkliste funktioniert, geht aber beim Neuladen der Seite verloren.";
}
function attach(store){
  unsub.forEach(f=>f());unsub=[];if(db&&db.close&&db!==store)db.close();
  db=store;dbReady=false;rooms=[];assigns=[];editing=null;confirmDel=null;
  let gotRooms=false,gotAssigns=false;
  const done=()=>{if(gotRooms&&gotAssigns&&!dbReady){dbReady=true;status((notice?notice+" ":"")+readyText());notice="";render();renderRooms();maybeTour()}};
  unsub.push(db.collection("raeume").onSnapshot(s=>{rooms=s.docs.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.pos||0)-(b.pos||0));gotRooms=true;done();render();renderRooms()}));
  unsub.push(db.collection("zuordnung").onSnapshot(s=>{assigns=s.docs.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})).filter(a=>a.leuchte&&a.raum).map(a=>({...a,stueck:+a.stueck||1}));gotAssigns=true;done();render();renderRooms()}));
  if(db.onRemoteChange)db.onRemoteChange(e=>{if(e&&e.code==="not_found"){goLocal("Die gemeinsame Liste wurde gelöscht.")}else if(dbReady)status("Aktualisiert: "+new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" · "+readyText())});
  renderShareBar();render();renderRooms();
}
function goLocal(msg){S.leaveShared();history.replaceState(null,"",location.pathname+location.search);notice=msg||"";attach(S.openLocal())}

const shareBar=document.getElementById("shareBar");
function renderShareBar(){
  if(db&&db.mode==="shared"){
    shareBar.innerHTML=`<span class="badge">Gemeinsam${db.hasPassword?" · 🔒":""}</span><button class="btn" type="button" data-share="copy">Link kopieren</button><button class="btn link" type="button" data-share="local">Zur lokalen Liste</button><button class="btn link" type="button" data-share="delete">Löschen</button>`;
  }else{
    shareBar.innerHTML=S.configured()?`<button class="btn" type="button" data-share="create">Gemeinsam bearbeiten …</button>`:"";
  }
}
async function copyText(t){try{await navigator.clipboard.writeText(t);return true}catch(e){return false}}
shareBar.addEventListener("click",async e=>{
  const b=e.target.closest("[data-share]");if(!b)return;const act=b.dataset.share;
  if(act==="create")openShareDlg();
  else if(act==="copy"){const ok=await copyText(db.link);status(ok?"Link kopiert. Wer ihn hat, kann die Liste ansehen und ändern"+(db.hasPassword?" – zusätzlich ist das Passwort nötig.":"."):"Link: "+db.link)}
  else if(act==="local")goLocal("Lokale Merkliste. Die gemeinsame Liste bleibt über ihren Link erreichbar.");
  else if(act==="delete"){if(!confirm("Gemeinsame Liste endgültig löschen? Alle mit dem Link verlieren den Zugriff."))return;
    try{await db.destroy();goLocal("Gemeinsame Liste gelöscht.")}catch(err){status(KNOWN.includes(err.code)?err.message:"Löschen fehlgeschlagen.")}}
});

// Dialog: gemeinsame Liste anlegen
const shareDlg=document.getElementById("shareDlg");
function openShareDlg(){
  ["sPw","sPw2"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("shareErr").hidden=true;document.getElementById("shareForm").hidden=false;document.getElementById("shareDone").hidden=true;
  shareDlg.showModal();
}
document.getElementById("shareCancel").onclick=()=>shareDlg.close();
document.getElementById("shareClose").onclick=()=>shareDlg.close();
document.getElementById("shareForm").addEventListener("submit",async e=>{
  e.preventDefault();const pw=document.getElementById("sPw").value,pw2=document.getElementById("sPw2").value,er=document.getElementById("shareErr");
  if(pw!==pw2){er.hidden=false;er.textContent="Die Passwörter stimmen nicht überein.";return}
  if(pw&&pw.length<6){er.hidden=false;er.textContent="Bitte mindestens 6 Zeichen verwenden oder das Feld leer lassen.";return}
  const btn=document.getElementById("shareSave");btn.disabled=true;btn.textContent="Wird angelegt …";
  try{
    const res=await S.createShared(db._data(),pw);
    history.replaceState(null,"",res.hash);
    attach(await S.openShared(S.parseLink(res.hash),async()=>pw));
    document.getElementById("shareLink").value=res.url;
    document.getElementById("shareForm").hidden=true;document.getElementById("shareDone").hidden=false;
    document.getElementById("sharePwNote").hidden=!pw;
  }catch(err){er.hidden=false;er.textContent=KNOWN.includes(err.code)?err.message:"Anlegen fehlgeschlagen. Bitte erneut versuchen."}
  finally{btn.disabled=false;btn.textContent="Link erstellen"}
});
document.getElementById("shareCopy").onclick=async()=>{const i=document.getElementById("shareLink");const ok=await copyText(i.value);if(!ok){i.select()}document.getElementById("shareCopy").textContent=ok?"Kopiert ✓":"Markiert – bitte kopieren"};

// Dialog: Passwort abfragen
const pwDlg=document.getElementById("pwDlg");
function askPassword(wrong){return new Promise(resolve=>{
  const inp=document.getElementById("pwInput");inp.value="";document.getElementById("pwErr").hidden=!wrong;
  const f=document.getElementById("pwForm");
  const finish=v=>{f.onsubmit=null;document.getElementById("pwCancel").onclick=null;pwDlg.close();resolve(v)};
  f.onsubmit=e=>{e.preventDefault();finish(inp.value)};
  document.getElementById("pwCancel").onclick=()=>finish(null);
  pwDlg.oncancel=e=>{e.preventDefault();finish(null)};
  pwDlg.showModal();inp.focus();
})}

async function start(){
  let link=S.parseLink(location.hash);
  if(!link){const rem=S.rememberedShared();const l=rem&&S.parseLink(rem);if(l){link=l;history.replaceState(null,"",l.hash)}}
  if(!link){attach(S.openLocal());return}
  if(!S.configured()){notice="Gemeinsame Listen sind auf dieser Seite noch nicht eingerichtet.";attach(S.openLocal());return}
  status("Gemeinsame Liste wird geöffnet …");
  try{attach(await S.openShared(link,askPassword))}
  catch(err){goLocal((err.code==="cancelled"?"Ohne Passwort kann die gemeinsame Liste nicht geöffnet werden.":KNOWN.includes(err.code)||err.code==="bad_key"?err.message:"Die gemeinsame Liste konnte nicht geöffnet werden.")+" Angezeigt wird die lokale Merkliste.")}
}
// Einführungstour: beim ersten Besuch (noch keine Merkliste und Tour nicht gesehen) automatisch, sonst über „Tour“ in der Fußzeile
let tourChecked=false;
const TOUR_PATH=location.pathname.replace(/[^/]*$/,"")||"/";
const tourSeen=()=>/(?:^|;\s*)merkliste_(?:n|tour)=/.test(document.cookie);
const markTourSeen=()=>{try{document.cookie="merkliste_tour=1; path="+TOUR_PATH+"; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}};
["tourLink","tourBtn"].forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=()=>window.Tour&&window.Tour.start(markTourSeen)});
function maybeTour(){
  if(!window.Tour||tourSeen()||tourChecked)return; tourChecked=true;
  const tryStart=()=>{if(document.querySelector("dialog[open]")){setTimeout(tryStart,800);return}window.Tour.start(markTourSeen)};
  setTimeout(tryStart,600);
}
window.addEventListener("hashchange",()=>{const l=S.parseLink(location.hash);if(l&&(!db||db.id!==l.id))start()});
start();
})();
