// Leuchtendaten kommen aus leuchten.json, die Merkliste aus einem Sitzungs-Cookie (merkliste-store.js).
(async()=>{
let rows;
try{ rows=await (await fetch("leuchten.json?v=20261101h",{cache:"no-cache"})).json() }
catch(e){ document.getElementById("count").textContent="Leuchtendaten (leuchten.json) konnten nicht geladen werden."; return }
rows.forEach(r=>{r.type=r.type||"Spot";r.lamp=r.lamp||"LED integriert";r.key=r.key||(r.brand.replace(/\W/g,"")+"_"+r.art);r.lmw=(r.lm&&r.w&&!r.lmText)?Math.round(r.lm/r.w):null;r.cctSort=r.ccts.length?Math.min(...r.ccts):null});

const byKey=Object.fromEntries(rows.map(r=>[r.key,r]));
const ANGLE_BUCKETS=[["eng","≤ 24°",(r)=>r.aMin!=null&&r.aMin<=24],["mittel","25–40°",(r)=>r.aMin!=null&&r.aMin<=40&&r.aMax>=25],["breit","≥ 50°",(r)=>r.aMax!=null&&r.aMax>=50],["zoom","Zoom/wählbar",(r)=>r.aMin!=null&&r.aMin!==r.aMax]];
const MAIN_COLORS=["schwarz","weiß","grau"]; const colorKey=c=>MAIN_COLORS.includes(c)?c:"andere";
const lampKey=l=>l==="LED integriert"?"LED integriert":"wechselbar";
const COLS=[
  {k:"pick",t:"Merken",nosort:1},{k:"model",t:"Leuchte"},{k:"type",t:"Typ"},{k:"cctSort",t:"Farbtemp."},{k:"aMin",t:"Winkel"},{k:"color",t:"Gehäuse"},
  {k:"w",t:"Watt",n:1},{k:"lm",t:"Lumen",n:1},{k:"lmw",t:"lm/W",n:1},{k:"cri",t:"CRI",n:1},{k:"dim",t:"Dimmung"},{k:"ugr",t:"UGR ≤",n:1},
  {k:"dims",t:"Maße cm"},{k:"price",t:"Preis ab €",n:1},{k:"art",t:"Art.-Nr."},{k:"links",t:"Details",nosort:1}
];
const CCT_COLOR={2700:"#FFB04A",3000:"#FFD385",4000:"#FFF1D2"};
const state={type:new Set(),lamp:new Set(),brand:new Set(),cct:new Set(),angle:new Set(),color:new Set(),dim:new Set(),ex:{},sort:"lm",dir:-1,view:"cards"};
let rooms=[]; let assigns=[]; let db=null; let canWrite=true; let dbReady=false;

const CHIPS=[];  // alle Filterknöpfe der Seitenleiste, damit sie mit dem Vergleichsfeld synchron bleiben
function syncChips(){CHIPS.forEach(([b,key,v])=>b.setAttribute("aria-pressed",state[key].has(v)))}
function chipGroup(id,key,values,label=v=>v,swatch=null){
  const el=document.getElementById(id);
  values.forEach(v=>{const b=document.createElement("button");b.type="button";b.textContent=label(v);b.setAttribute("aria-pressed","false");CHIPS.push([b,key,v]);
    if(swatch){const i=document.createElement("i");i.className="sw";i.style.background=swatch(v);b.prepend(i)}
    b.onclick=()=>{state[key].has(v)?state[key].delete(v):state[key].add(v);b.setAttribute("aria-pressed",state[key].has(v));render()};el.appendChild(b)});
}
chipGroup("fBrand","brand",[...new Set(rows.map(r=>r.brand))]);
chipGroup("fCct","cct",[2700,3000,4000],v=>v+" K",v=>CCT_COLOR[v]);
chipGroup("fAngle","angle",ANGLE_BUCKETS.map(b=>b[0]),v=>ANGLE_BUCKETS.find(b=>b[0]===v)[1]);
chipGroup("fType","type",["Spot","Pendel","Linear/Fläche"]);
chipGroup("fLamp","lamp",["LED integriert","wechselbar"],v=>v==="wechselbar"?"wechselbar (GU10/E27)":v);
chipGroup("fColor","color",["schwarz","weiß","grau","andere"]);
chipGroup("fDim","dim",["Abschnitt","An-/Abschnitt","Anschnitt","Abschnitt (Dim‑to‑Warm)","dimmbar, Art k. A.","je Leuchtmittel","k. A."],v=>v==="Abschnitt (Dim‑to‑Warm)"?"Dim‑to‑Warm":v==="dimmbar, Art k. A."?"dimmbar, Art unbekannt":v);

const head=document.getElementById("head");
COLS.forEach(c=>{const th=document.createElement("th");if(c.n)th.className="n";
  if(c.nosort){th.textContent=c.t}else{const b=document.createElement("button");b.textContent=c.t;b.dataset.k=c.k;
    b.onclick=()=>{state.dir=state.sort===c.k?-state.dir:1;state.sort=c.k;render()};th.appendChild(b)}
  head.appendChild(th)});
["minCri","onlyPicked"].forEach(id=>document.getElementById(id).addEventListener("input",render));
// Doppel-Schieberegler für Lichtstrom und Leistung. Die Regler rasten auf den tatsächlich vorkommenden Werten ein,
// damit man auch dort fein einstellen kann, wo viele Leuchten dicht beieinander liegen.
const RANGES={};
function makeRange(id,key,unit){
  const box=document.getElementById(id), [lo,hi]=box.querySelectorAll("input[type=range]"), out=document.getElementById(id+"Out"), fill=box.querySelector(".fill");
  const vals=[...new Set(rows.map(r=>r[key]).filter(v=>v!=null))].sort((x,y)=>x-y), N=vals.length-1;
  const show=v=>v.toLocaleString("de-DE")+" "+unit;
  [lo,hi].forEach(i=>{i.max=N});lo.value=0;hi.value=N;
  function paint(){
    const a=+lo.value,b=+hi.value;
    fill.style.left=(a/N*100)+"%";fill.style.right=(100-b/N*100)+"%";
    lo.setAttribute("aria-valuetext",show(vals[a]));hi.setAttribute("aria-valuetext",show(vals[b]));
    out.textContent=a===0&&b===N?`alle (${show(vals[0])} bis ${show(vals[N])})`:`${show(vals[a])} bis ${show(vals[b])}`;
    lo.style.zIndex=a>N/2?3:2;  // liegen beide Griffe rechts, muss der untere greifbar bleiben
  }
  function upd(e){
    let a=+lo.value,b=+hi.value;
    if(a>b){if(e&&e.target===lo){lo.value=b;a=b}else{hi.value=a;b=a}}
    state[key+"Range"]=a===0&&b===N?null:[vals[a],vals[b]];
    paint();render();
  }
  lo.addEventListener("input",upd);hi.addEventListener("input",upd);
  RANGES[key]={reset(){lo.value=0;hi.value=N;state[key+"Range"]=null;paint()},active:()=>!!state[key+"Range"]};
  paint();
}
makeRange("lmRange","lm","lm");
makeRange("wRange","w","W");
document.getElementById("reset").onclick=()=>{["type","lamp","brand","cct","angle","color","dim"].forEach(k=>state[k].clear());state.ex={};
  document.querySelectorAll(".chips button").forEach(b=>b.setAttribute("aria-pressed","false"));
  Object.values(RANGES).forEach(r=>r.reset());document.getElementById("minCri").value="0";document.getElementById("onlyPicked").value="all";render()};

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
// Eigenschaften für Vergleich, Karten und Unterschiede (feste Reihenfolge, damit Karten untereinander vergleichbar sind)
const ATTRS=[
  {k:"lm",t:"Lichtstrom",num:1,u:"lm",v:r=>r.lm,show:r=>r.lmText?r.lmText.replace(/\d{4,}/g,d=>fmt(+d)).replace(/\s*\/\s*/g," / ").replace(/–/g," bis ")+" lm":r.lm==null?"–":fmt(r.lm)+" lm"},
  {k:"w",t:"Leistung",num:1,u:"W",v:r=>r.w,show:r=>r.w==null?"–":fmt(r.w)+" W"},
  {k:"lmw",t:"Effizienz",num:1,u:"lm/W",v:r=>r.lmw,show:r=>r.lmw==null?"–":fmt(r.lmw)+" lm/W"},
  {k:"cct",t:"Lichtfarbe",v:r=>!r.cctLabel||r.cctLabel==="–"?"k. A.":r.cctLabel},
  {k:"angle",t:"Winkel",v:r=>!r.angleLabel||r.angleLabel==="–"?"k. A.":r.angleLabel},
  {k:"cri",t:"CRI",v:r=>r.cri==null?"k. A.":String(r.cri)},
  {k:"ugr",t:"UGR",v:r=>r.ugr==null?"k. A.":"≤ "+r.ugr},
  {k:"dim",t:"Dimmung",v:r=>r.dim},
  {k:"color",t:"Gehäuse",v:r=>r.color},
  {k:"type",t:"Typ",v:r=>r.type},
  {k:"lamp",t:"Leuchtmittel",v:r=>r.lamp},
  {k:"brand",t:"Hersteller",v:r=>r.brand},
  {k:"price",t:"Preis ab",num:1,u:"€",v:r=>r.price},
  {k:"dims",t:"Maße (cm)",v:r=>r.dims,wide:1}
];
const ATTR=Object.fromEntries(ATTRS.map(x=>[x.k,x]));
const CARD_SPECS=["lm","w","lmw","cct","angle","cri","ugr","dim","color","type","lamp","dims"];
const exPass=r=>Object.entries(state.ex).every(([k,set])=>!set.size||set.has(ATTR[k].v(r)));
// Ein Wert aus dem Vergleichsfeld: gibt es dafür einen Filter in der Seitenleiste, wird genau dieser gesetzt.
// Nur feinere Werte (genauer Winkel, UGR, CRI, Sockel, Sonderfarben …) landen in der Zusatzauswahl state.ex.
function facetTarget(k,v){
  if(k==="brand"||k==="type"||k==="dim")return state[k] instanceof Set&&[...CHIPS].some(([,key,val])=>key===k&&val===v)?[k,v]:null;
  if(k==="color"&&MAIN_COLORS.includes(v))return ["color",v];
  if(k==="cct"){const m=/^(\d{4}) K$/.exec(v);if(m&&[2700,3000,4000].includes(+m[1]))return ["cct",+m[1]]}
  return null;
}
function facetOn(k,v){const t=facetTarget(k,v);return t?state[t[0]].has(t[1]):!!(state.ex[k]&&state.ex[k].has(v))}
function facetToggle(k,v){const t=facetTarget(k,v);
  if(t){const s=state[t[0]];s.has(t[1])?s.delete(t[1]):s.add(t[1])}
  else{const s=state.ex[k]||(state.ex[k]=new Set());s.has(v)?s.delete(v):s.add(v);if(!s.size)delete state.ex[k]}
  render()}

function filtered(){
  const lmR=state.lmRange, wR=state.wRange,
    minCri=+document.getElementById("minCri").value||0, view=syncViewOptions(), only=view==="picked", onlyRoom=view.startsWith("room:")?view.slice(5):null;
  const usedBy={}; assigns.forEach(a=>{(usedBy[a.leuchte]=usedBy[a.leuchte]||[]).push(a)});
  const list=rows.filter(r=>(!state.brand.size||state.brand.has(r.brand))&&(!state.cct.size||r.ccts.some(c=>state.cct.has(c)))&&
    (!state.angle.size||ANGLE_BUCKETS.some(b=>state.angle.has(b[0])&&b[2](r)))&&(!state.color.size||state.color.has(colorKey(r.color)))&&(!state.type.size||state.type.has(r.type))&&(!state.lamp.size||state.lamp.has(lampKey(r.lamp)))&&
    (!state.dim.size||state.dim.has(r.dim))&&(!minCri||(r.cri!=null&&r.cri>=minCri))&&(!lmR||(r.lm!=null&&r.lm>=lmR[0]&&r.lm<=lmR[1]))&&(!wR||(r.w!=null&&r.w>=wR[0]&&r.w<=wR[1]))&&(!only||usedBy[r.key])&&(!onlyRoom||(usedBy[r.key]||[]).some(a=>a.raum===onlyRoom))&&exPass(r));
  const k=state.sort;
  list.sort((a,b)=>{const x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x>y?1:x<y?-1:0)*state.dir});
  return {list,usedBy,only,onlyRoom};
}
// Welche Eigenschaften unterscheiden sich innerhalb der Treffer?
function analyse(list){
  const out={};
  ATTRS.forEach(at=>{
    if(at.num){const vals=list.map(at.v).filter(v=>v!=null);const mn=Math.min(...vals),mx=Math.max(...vals);
      out[at.k]={vary:vals.length>1&&mn!==mx,min:mn,max:mx,missing:list.length-vals.length,n:vals.length};}
    else{const m=new Map();list.forEach(r=>{const v=at.v(r);m.set(v,(m.get(v)||0)+1)});
      out[at.k]={vary:m.size>1,values:[...m.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),"de",{numeric:true}))};}
  });
  return out;
}
const numShow=(at,x)=>at.k==="price"?fmt(Math.round(x))+" €":fmt(x)+" "+at.u;
function renderDiff(list,an){
  const panel=document.getElementById("diffPanel"), body=document.getElementById("diffBody");
  const activeEx=Object.entries(state.ex).filter(([k,s])=>s.size);
  if(list.length<2&&!activeEx.length){panel.hidden=true;return}
  panel.hidden=false;
  const varying=ATTRS.filter(at=>an[at.k].vary&&at.k!=="dims");
  const cats=varying.filter(at=>!at.num).sort((x,y)=>an[x.k].values.length-an[y.k].values.length);
  const nums=varying.filter(at=>at.num);
  const common=ATTRS.filter(at=>!at.num&&at.k!=="dims"&&!an[at.k].vary&&an[at.k].values.length&&an[at.k].values[0][0]!=="k. A.").map(at=>`<span class="cm"><i>${at.t}</i> ${esc(an[at.k].values[0][0])}</span>`);
  document.getElementById("diffSum").textContent=list.length<2?"Gewählte Eigenschaften":`Worin sich die ${list.length} Treffer unterscheiden`;
  const chip=(at,v,n)=>{const on=facetOn(at.k,v);return `<button type="button" class="fchip" data-ex="${at.k}" data-v="${esc(v)}" aria-pressed="${on}">${at.k==="cct"&&CCT_COLOR[parseInt(v)]?`<i class="sw" style="background:${CCT_COLOR[parseInt(v)]}"></i>`:""}${esc(v)}<small>${n}</small></button>`};
  let html="";
  if(cats.length||nums.length){
    const maxChips=diffOpenAll?99:6, maxRows=diffOpenAll?99:(innerWidth<760?4:6);
    const rowsHtml=cats.map(at=>{const vals=an[at.k].values;const shown=vals.slice(0,maxChips);
      return `<div class="drow"><span class="dl">${at.t}</span><div class="dv">${shown.map(([v,n])=>chip(at,v,n)).join("")}${vals.length>maxChips?`<button type="button" class="morebtn" data-diff-all>+ ${vals.length-maxChips} weitere</button>`:""}</div></div>`})
      .concat(nums.map(at=>{const s=an[at.k];return `<div class="drow"><span class="dl">${at.t}</span><div class="dv range">${numShow(at,s.min)} bis ${numShow(at,s.max)}${s.missing?` <span class="more">(${s.missing}× ohne Angabe)</span>`:""}</div></div>`}));
    html+=`<div class="drows">${rowsHtml.slice(0,maxRows).join("")}</div>`;
    if(rowsHtml.length>maxRows)html+=`<button type="button" class="morebtn" data-diff-all>Alle ${rowsHtml.length} Unterschiede zeigen</button>`;
    else if(diffOpenAll&&rowsHtml.length>(innerWidth<760?4:6))html+=`<button type="button" class="morebtn" data-diff-less>Weniger zeigen</button>`;
  } else html+=`<p class="dnone">Die Treffer unterscheiden sich nur noch in Artikelnummer und Maßen.</p>`;
  if(common.length)html+=`<p class="dcommon"><b>Bei allen gleich:</b> ${common.join("")}</p>`;
  body.innerHTML=html;
}
let diffOpenAll=false;
document.getElementById("diffBody").addEventListener("click",e=>{
  if(e.target.closest("[data-diff-all]")){diffOpenAll=true;render();return}
  if(e.target.closest("[data-diff-less]")){diffOpenAll=false;render();return}
  const b=e.target.closest("[data-ex]");if(!b)return;facetToggle(b.dataset.ex,b.dataset.v);
});
// Lichtkegel: im echten Abstrahlwinkel, in der Lichtfarbe der Leuchte
function beam(r){
  const cc=CCT_COLOR[r.ccts[0]]||"#FFE2A8", id="b"+r.key.replace(/\W/g,"");
  const cone=(a,op)=>{const ang=Math.max(6,Math.min(a,110)),h=150,w=Math.tan(ang/2*Math.PI/180)*h;return `<path d="M-6 24 L6 24 L${w.toFixed(1)} ${h} L${(-w).toFixed(1)} ${h} Z" fill="url(#${id})" opacity="${op}"/>`};
  const a1=r.aMin??40,a2=r.aMax??a1;
  return `<svg viewBox="-60 0 120 170" preserveAspectRatio="xMidYMin meet" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cc}" stop-opacity=".95"/><stop offset="1" stop-color="${cc}" stop-opacity="0"/></linearGradient></defs>
    <rect x="-9" y="6" width="18" height="18" rx="3" class="lamp"/>${a2!==a1?cone(a2,.45):""}${cone(a1,1)}</svg>`;
}
const priceSrc=r=>r.priceSrc?`<a class="psrc" href="${esc(r.priceUrl||r.ds)}" target="_blank" rel="noopener" title="Preis von ${esc(r.priceSrc)}, Stand ${esc(r.priceDate||"?")}">${esc(r.priceSrc)}${r.priceDate?", "+esc(r.priceDate.split("-").reverse().join("/")):""}</a>`:"";
const isImg=u=>/\.(jpe?g|png|webp)(\?|$)/i.test(u||"");
// Direkte Produktbilder öffnen als Vorschaufenster auf der Seite, Bildersuchen weiterhin in neuem Tab
const linksHtml=r=>`<span class="links"><a href="${r.ds}" target="_blank" rel="noopener">${r.dsLabel||"Datenblatt"}</a>${r.img&&r.img!==r.ds?(isImg(r.img)?`<button type="button" class="imglink" data-img="${esc(r.key)}" aria-haspopup="dialog">${r.imgLabel||"Bild"}</button>`:`<a href="${r.img}" target="_blank" rel="noopener">${r.imgLabel||"Bilder"}</a>`):""}${r.shop?`<a href="${r.shop}" target="_blank" rel="noopener">Shop</a>`:""}</span>`;
const usedText=(u)=>u.map(a=>{const rm=roomById(a.raum);return `${a.stueck}× ${esc(rm?rm.name:"?")}${a.gruppe?", "+esc(a.gruppe):""}`}).join("; ");

function cardHtml(r,u,an,dis){
  const specs=CARD_SPECS.map(k=>{const at=ATTR[k];const val=at.show?at.show(r):esc(at.v(r));const d=an[k].vary;
    return `<div class="spec${d?" d":""}${at.wide?" wide":""}"><dt>${at.t}</dt><dd>${val}</dd></div>`}).join("");
  return `<article class="card${u.length?" on":""}">
    <div class="beam">${beam(r)}<span class="deg">${esc(r.angleLabel)}</span></div>
    <div class="body">
      <div class="ctop"><span class="brand">${esc(r.brand)}</span><span class="art">${/\d/.test(r.art)?"Art.-Nr. "+esc(r.art):"Konfigurationsprodukt, ohne Art.-Nr."}</span></div>
      <h3 class="name"${r.modelOrig?` title="Im Shop: ${esc(r.modelOrig)}"`:""}>${esc(r.model)}</h3>
      ${r.hinweis?`<p class="hint">${esc(r.hinweis)}</p>`:""}
      <dl class="specs">${specs}</dl>
      ${u.length?`<p class="used">Gemerkt: ${usedText(u)}</p>`:""}
      <div class="cfoot"><div class="price">${r.price!=null?`<small>ab</small> ${fmt(r.price)} €`:`<small>Preis unbekannt</small>`}${priceSrc(r)}</div>
        <button class="pick" type="button" data-pick="${r.key}"${dis}>${u.length?"Nochmal merken":"Merken"}</button></div>
      ${linksHtml(r)}
    </div></article>`;
}
function tableRowHtml(r,u,dis){
  return `<tr class="${u.length?"picked":""}">
    <td><button class="pick sm" type="button" data-pick="${r.key}"${dis}>Merken</button>${u.length?`<span class="used">${usedText(u)}</span>`:""}</td>
    <td class="namecell"><span class="brand">${esc(r.brand)}</span><span class="model"${r.modelOrig?` title="Im Shop: ${esc(r.modelOrig)}"`:""}>${esc(r.model)}</span>${r.hinweis?`<span class="hint">${esc(r.hinweis)}</span>`:""}</td><td>${r.type}<span class="brand">${esc(r.lamp)}</span></td>
    <td><span class="cct">${r.ccts.map(c=>`<span class="dot" style="background:${CCT_COLOR[c]}"></span>`).join("")}${esc(r.cctLabel)}</span></td>
    <td>${esc(r.angleLabel)}</td><td>${esc(r.color)}</td>
    <td class="n">${fmt(r.w)}</td><td class="n">${r.lmText||fmt(r.lm)}</td><td class="n">${fmt(r.lmw)}</td><td class="n">${fmt(r.cri)}</td><td>${esc(r.dim)}</td><td class="n">${fmt(r.ugr)}</td>
    <td>${esc(r.dims)}</td><td class="n">${fmt(r.price)}${priceSrc(r)}</td><td>${esc(r.art)}</td><td>${linksHtml(r)}</td></tr>`;
}
const COL_ATTR={type:"type",cctSort:"cct",aMin:"angle",color:"color",w:"w",lm:"lm",lmw:"lmw",cri:"cri",dim:"dim",ugr:"ugr",dims:"dims",price:"price"};

function render(){
  const {list,usedBy,only,onlyRoom}=filtered();
  const an=analyse(list), dis=writable()?"":" disabled";
  const nf=activeFilterCount();
  document.getElementById("count").textContent=list.length===rows.length?`Alle ${rows.length} Leuchten`:`${list.length} von ${rows.length} Leuchten`;
  document.getElementById("filterBtn").textContent=nf?`Filter (${nf})`:"Filter";
  document.getElementById("showRes").textContent=`${list.length} Treffer anzeigen`;
  const ss=document.getElementById("sortSel"),sv=state.sort+":"+state.dir;
  if([...ss.options].some(o=>o.value===sv))ss.value=sv;
  syncChips(); renderExtra(); renderDiff(list,an);
  const cards=document.getElementById("cards"), tb=document.getElementById("tableBox");
  cards.hidden=state.view!=="cards"; tb.hidden=state.view!=="table";
  if(state.view==="cards"){
    cards.innerHTML=list.map(r=>cardHtml(r,usedBy[r.key]||[],an,dis)).join("");
  }else{
    head.querySelectorAll("th").forEach((th,i)=>{const c=COLS[i],ak=COL_ATTR[c.k];th.classList.toggle("same",!!ak&&list.length>1&&!an[ak].vary);th.classList.toggle("d",!!ak&&an[ak].vary)});
    head.querySelectorAll("button").forEach(b=>b.dataset.dir=b.dataset.k===state.sort?(state.dir>0?"↑":"↓"):"");
    document.getElementById("rows").innerHTML=list.map(r=>tableRowHtml(r,usedBy[r.key]||[],dis)).join("");
    const same=[...head.querySelectorAll("th")].map(th=>th.classList.contains("same"));
    document.querySelectorAll("#rows tr").forEach(tr=>[...tr.children].forEach((td,i)=>td.classList.toggle("same",same[i])));
  }
  if(!list.length){
    const noPicks=(only||onlyRoom)&&!assigns.length;
    const box=`<div class="emptybox"><b>${noPicks?"Noch nichts gemerkt.":"Keine Leuchte passt zu diesen Filtern."}</b>
      <span>${noPicks?"Klick bei einer Leuchte auf „Merken“, um sie einem Raum zuzuordnen.":"Lockere einzelne Filter oder setz alle zurück."}</span>
      <button class="primary" type="button" data-empty-reset>${noPicks?"Alle Leuchten anzeigen":"Filter zurücksetzen"}</button></div>`;
    if(state.view==="cards")cards.innerHTML=box; else document.getElementById("rows").innerHTML=`<tr class="emptyrow"><td colspan="${COLS.length}">${box}</td></tr>`;
  }
}
// Zusatzauswahl aus dem Vergleichsfeld, in der Seitenleiste sichtbar und entfernbar
function renderExtra(){
  const box=document.getElementById("fExtraGroup"), el=document.getElementById("fExtra");
  const items=Object.entries(state.ex).flatMap(([k,s])=>[...s].map(v=>[k,v]));
  box.hidden=!items.length;
  el.innerHTML=items.map(([k,v])=>`<button type="button" aria-pressed="true" data-ex="${k}" data-v="${esc(v)}">${ATTR[k].t}: ${esc(v)} <span aria-hidden="true">×</span><span class="sr">entfernen</span></button>`).join("");
}
document.getElementById("fExtra").addEventListener("click",e=>{const b=e.target.closest("[data-ex]");if(b)facetToggle(b.dataset.ex,b.dataset.v)});
function activeFilterCount(){
  let n=["type","lamp","brand","cct","angle","color","dim"].reduce((s,k)=>s+state[k].size,0)+Object.values(state.ex).reduce((s,x)=>s+x.size,0);
  Object.values(RANGES).forEach(r=>{if(r.active())n++}); if(+document.getElementById("minCri").value)n++; if(document.getElementById("onlyPicked").value!=="all")n++;
  return n;
}
document.getElementById("sortSel").addEventListener("change",e=>{const [k,d]=e.target.value.split(":");state.sort=k;state.dir=+d;render()});
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
document.getElementById("cards").addEventListener("click",e=>{
  if(e.target.closest("[data-empty-reset]")){document.getElementById("reset").click();return}
  const b=e.target.closest("[data-pick]");if(b)openPick(b);
});

// Bildvorschau
const imgDlg=document.getElementById("imgDlg");
function openImg(key){
  const r=byKey[key];if(!r)return;
  const im=document.getElementById("imgView"), fig=imgDlg.querySelector("figure");
  fig.classList.add("loading");fig.classList.remove("failed");
  im.onload=()=>fig.classList.remove("loading");
  im.onerror=()=>{fig.classList.remove("loading");fig.classList.add("failed")};
  im.alt=`Produktbild ${r.brand} ${r.model}`;im.src=r.img;
  document.getElementById("imgCap").innerHTML=`<b>${esc(r.brand)} ${esc(r.model)}</b><span>Art.-Nr. ${esc(r.art)} · ${esc(r.cctLabel)} · ${esc(r.angleLabel)} · ${esc(r.color)}</span>`;
  document.getElementById("imgSrc").href=r.img;
  document.getElementById("imgDs").href=r.ds;
  imgDlg.showModal();
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-img]");if(b){e.preventDefault();openImg(b.dataset.img)}});
document.getElementById("imgClose").onclick=()=>imgDlg.close();
imgDlg.addEventListener("click",e=>{if(e.target===imgDlg)imgDlg.close()});   // Klick neben das Bild schließt
imgDlg.addEventListener("close",()=>{document.getElementById("imgView").removeAttribute("src")});

// Schubladen am Handy: Filter und Lichtplan
function openSheet(which){document.body.classList.add("sheet-"+which);const el=document.getElementById(which==="filter"?"filterPanel":"mlPanel");el.setAttribute("tabindex","-1");el.focus({preventScroll:true})}
function closeSheets(){const was=document.body.classList.contains("sheet-filter")?"filterBtn":document.body.classList.contains("sheet-plan")?"mbar":null;document.body.classList.remove("sheet-filter","sheet-plan");if(was)document.getElementById(was).focus({preventScroll:true})}
document.getElementById("filterBtn").onclick=()=>openSheet("filter");
document.getElementById("mbar").onclick=()=>openSheet("plan");
document.querySelectorAll("[data-close-sheet]").forEach(b=>b.addEventListener("click",()=>{closeSheets();if(b.id==="showRes")document.getElementById("count").focus({preventScroll:false})}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&/sheet-/.test(document.body.className)&&!document.querySelector("dialog[open]"))closeSheets()});

let editing=null, confirmDel=null;
// Gesamtsumme im Lichtplan und in der Leiste unten (Handy)
function updatePlanSummary(){
  const items=assigns.filter(a=>byKey[a.leuchte]&&roomById(a.raum));
  const n=items.reduce((s,a)=>s+a.stueck,0), w=items.reduce((s,a)=>s+(byKey[a.leuchte].w||0)*a.stueck,0);
  const eur=items.reduce((s,a)=>s+(byKey[a.leuchte].price||0)*a.stueck,0), noPrice=items.filter(a=>byKey[a.leuchte].price==null).length;
  const tot=document.getElementById("planTotal");
  tot.hidden=!n; document.getElementById("printBtn").hidden=!n;
  tot.innerHTML=n?`<span>${n} ${n===1?"Leuchte":"Leuchten"}, ${w.toLocaleString("de-DE",{maximumFractionDigits:1})} W${noPrice?`, ${noPrice}× ohne Preis`:""}</span><b>ab ${Math.round(eur).toLocaleString("de-DE")} €</b>`:"";
  document.getElementById("mbarTitle").textContent=n?`Lichtplan: ${n} ${n===1?"Leuchte":"Leuchten"}`:"Lichtplan";
  document.getElementById("mbarSub").textContent=n?`${rooms.length} ${rooms.length===1?"Raum":"Räume"}, ab ${Math.round(eur).toLocaleString("de-DE")} €`:rooms.length?`${rooms.length} ${rooms.length===1?"Raum":"Räume"}, noch nichts gemerkt`:"noch leer";
}
// Druckansicht: Bestellliste nach Artikel und Aufstellung nach Raum
function buildPrint(){
  const items=assigns.filter(a=>byKey[a.leuchte]&&roomById(a.raum));
  const el=document.getElementById("printPlan");
  if(!items.length){el.innerHTML="";return}
  const eur=v=>v==null?"–":v.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
  const byArt=new Map();items.forEach(a=>{const e=byArt.get(a.leuchte)||{r:byKey[a.leuchte],n:0};e.n+=a.stueck;byArt.set(a.leuchte,e)});
  const arts=[...byArt.values()].sort((x,y)=>x.r.brand.localeCompare(y.r.brand)||x.r.model.localeCompare(y.r.model,"de"));
  const total=arts.reduce((s,e)=>s+(e.r.price||0)*e.n,0), totalW=arts.reduce((s,e)=>s+(e.r.w||0)*e.n,0), nTot=arts.reduce((s,e)=>s+e.n,0), noPrice=arts.filter(e=>e.r.price==null).length;
  const today=new Date().toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
  let h=`<header><h1>Lichtplan</h1><p>Leuchten für EUTRAC-3-Phasen-Schienen · Stand ${today} · ${nTot} Leuchten in ${rooms.length} ${rooms.length===1?"Raum":"Räumen"}</p></header>
  <h2>Bestellliste</h2>
  <table><thead><tr><th class="n">Stück</th><th>Art.-Nr.</th><th>Leuchte</th><th>Lichtfarbe</th><th>Winkel</th><th class="n">Watt</th><th class="n">Lumen</th><th>Dimmung</th><th class="n">Einzelpreis ab</th><th class="n">Summe ab</th></tr></thead><tbody>
  ${arts.map(({r,n})=>`<tr><td class="n"><b>${n}</b></td><td>${esc(r.art)}</td><td><b>${esc(r.brand)}</b> ${esc(r.model)}</td><td>${esc(r.cctLabel)}</td><td>${esc(r.angleLabel)}</td><td class="n">${fmt(r.w)}</td><td class="n">${ATTR.lm.show(r).replace(/ lm$/,"")}</td><td>${esc(r.dim)}</td><td class="n">${eur(r.price)}</td><td class="n">${r.price==null?"–":eur(r.price*n)}</td></tr>`).join("")}
  </tbody><tfoot><tr><td class="n"><b>${nTot}</b></td><td colspan="4">Gesamt${noPrice?` (${noPrice} Artikel ohne Preis)`:""}</td><td class="n">${fmt(Math.round(totalW*10)/10)}</td><td colspan="3"></td><td class="n"><b>${eur(total)}</b></td></tr></tfoot></table>
  <h2>Nach Raum</h2>`;
  rooms.forEach(rm=>{const its=items.filter(a=>a.raum===rm.id);if(!its.length)return;
    const groups=[...new Set(its.map(a=>a.gruppe||""))];
    h+=`<section class="proom"><h3>${esc(rm.name)}</h3>`+groups.map(g=>`<h4>${g?esc(g):"ohne Verwendung"}</h4><ul>${its.filter(a=>(a.gruppe||"")===g).map(a=>{const r=byKey[a.leuchte];return `<li><b>${a.stueck}×</b> ${esc(r.brand)} ${esc(r.model)}, ${esc(r.cctLabel)}, ${esc(r.angleLabel)}, ${esc(r.color)} <span>Art.-Nr. ${esc(r.art)}</span></li>`}).join("")}</ul>`).join("")+`</section>`});
  h+=`<p class="pnote">„ab“-Preise aus Onlineshops, nicht tagesaktuell. Dimmung laut Datenblatt; vor dem Kauf eine Leuchte am eigenen Dimmer bzw. KNX-Aktor testen. Erstellt mit ${esc(location.origin+location.pathname)}</p>`;
  el.innerHTML=h;
}
document.getElementById("printBtn").onclick=()=>{buildPrint();window.print()};
window.addEventListener("beforeprint",buildPrint);
function renderRooms(){
  updatePlanSummary();
  const el=document.getElementById("rooms");
  if(el.contains(document.activeElement)&&document.activeElement.tagName==="INPUT")return; // nicht beim Tippen neu zeichnen
  if(!rooms.length){el.innerHTML=`<div class="empty">Noch keine Räume. Klick bei einer Leuchte auf „Merken“, dann legst du den Raum im selben Schritt an. Oder leg ihn oben direkt an.</div>`;return}
  const dis=writable()?"":" disabled";
  el.innerHTML=rooms.map(rm=>{
    const items=assigns.filter(a=>a.raum===rm.id&&byKey[a.leuchte]);
    const groups=[...(rm.gruppen||[])]; items.forEach(a=>{if(a.gruppe&&!groups.includes(a.gruppe))groups.push(a.gruppe)});
    const ungrouped=items.filter(a=>!a.gruppe);
    const itemHtml=a=>{const r=byKey[a.leuchte];return `<div class="item"><input type="number" min="1" max="50" value="${a.stueck}" data-qty="${a.id}" aria-label="Stückzahl ${esc(r.model)}"${dis}><span>${esc(short(r))}</span><span class="p">${r.price!=null?fmt(r.price*a.stueck)+" €":"–"}</span><button class="btn x" type="button" data-del-assign="${a.id}" aria-label="Entfernen"${dis}>×</button></div>`};
    const gHtml=g=>{const its=items.filter(a=>a.gruppe===g);return `<div class="group"><h4><span>${esc(g)}</span>${its.length?"":`<button class="btn x" type="button" data-del-group="${rm.id}" data-g="${esc(g)}" aria-label="Verwendung ${esc(g)} entfernen"${dis}>×</button>`}</h4>${its.map(itemHtml).join("")||`<div class="empty">noch leer</div>`}</div>`};
    const n=items.reduce((s,a)=>s+a.stueck,0), w=items.reduce((s,a)=>s+byKey[a.leuchte].w*a.stueck,0), lm=items.reduce((s,a)=>s+(byKey[a.leuchte].lm||0)*a.stueck,0);
    const eur=items.reduce((s,a)=>s+(byKey[a.leuchte].price||0)*a.stueck,0), noPrice=items.filter(a=>byKey[a.leuchte].price==null).reduce((s,a)=>s+a.stueck,0);
    const nameHtml=editing===rm.id?`<input type="text" id="ren-${rm.id}" value="${esc(rm.name)}" aria-label="Raumname">`:`<h3 class="roomname">${esc(rm.name)}</h3>`;
    const del=confirmDel===rm.id?`<button class="btn danger" type="button" data-del-room="${rm.id}"${dis}>Wirklich löschen?</button>`:`<button class="btn link" type="button" data-ask-del="${rm.id}"${dis}>Löschen</button>`;
    return `<div class="room"><div class="roomhead">${nameHtml}<span class="tools"><button class="btn link" type="button" data-rename="${rm.id}"${dis}>${editing===rm.id?"Fertig":"Umbenennen"}</button>${del}</span></div>
      ${groups.map(gHtml).join("")}${ungrouped.length?`<div class="group"><h4><span>ohne Verwendung</span></h4>${ungrouped.map(itemHtml).join("")}</div>`:""}
      <div class="tools"><input type="text" placeholder="Neue Verwendung" id="ng-${rm.id}" aria-label="Neue Verwendung für ${esc(rm.name)}"${dis}><button class="btn" type="button" data-add-group="${rm.id}"${dis}>+ Verwendung</button></div>
      <div class="sum">${n?`<b>ab ca. ${eur.toLocaleString("de-DE")} €</b><span>${n} Stk. · ${w.toLocaleString("de-DE",{maximumFractionDigits:1})} W · ${lm.toLocaleString("de-DE")} lm${noPrice?` · ${noPrice} Stk. ohne Preis`:""}</span>`:`<span>Noch keine Leuchten gemerkt.</span>`}</div></div>`}).join("");
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
const NEW_ROOM="__neu__"; let lastRoom=null;
function fillGroups(){
  const v=document.getElementById("pRoom").value, rm=roomById(v), isNew=v===NEW_ROOM;
  const groups=isNew?["Decke"]:rm?(rm.gruppen||[]):[];
  const sel=document.getElementById("pGroup");
  sel.innerHTML=`<option value="">– keine –</option>`+groups.map(g=>`<option>${esc(g)}</option>`).join("");
  sel.value=groups[0]||"";   // erste Verwendung vorauswählen, sonst landet alles unter „ohne Verwendung“
  document.getElementById("pNewRoomRow").hidden=!isNew;
}
document.getElementById("pRoom").addEventListener("change",fillGroups);
document.getElementById("rows").addEventListener("click",e=>{
  if(e.target.closest("[data-empty-reset]")){document.getElementById("reset").click();return}
  const b=e.target.closest("[data-pick]"); if(b)openPick(b);
});
function openPick(b){
  if(!writable())return;
  pickKey=b.dataset.pick; const r=byKey[pickKey];
  document.getElementById("pickSub").textContent=r.brand+" · "+short(r)+" · Art.-Nr. "+r.art;
  const pr=document.getElementById("pRoom");
  pr.innerHTML=rooms.map(rm=>`<option value="${rm.id}">${esc(rm.name)}</option>`).join("")+`<option value="${NEW_ROOM}">+ Neuer Raum …</option>`;
  pr.value=rooms.length?(roomById(lastRoom)?lastRoom:rooms[0].id):NEW_ROOM;
  document.getElementById("pNewRoom").value="";
  fillGroups(); document.getElementById("pNewGroup").value=""; document.getElementById("pQty").value="1"; document.getElementById("pickErr").hidden=true;
  dlg.showModal();
  if(pr.value===NEW_ROOM)document.getElementById("pNewRoom").focus();
}
document.getElementById("pickCancel").onclick=()=>dlg.close();
document.getElementById("pickForm").addEventListener("submit",async e=>{
  e.preventDefault(); let roomId=document.getElementById("pRoom").value, rm=roomById(roomId);
  const errEl=document.getElementById("pickErr");
  if(roomId===NEW_ROOM){
    const name=document.getElementById("pNewRoom").value.trim();
    if(!name){errEl.hidden=false;errEl.textContent="Bitte einen Namen für den neuen Raum eingeben.";document.getElementById("pNewRoom").focus();return}
    rm={id:slug(name)+"-"+Date.now().toString(36),name,gruppen:["Decke"],pos:Date.now(),isNew:true};roomId=rm.id;
  }
  if(!rm)return;
  const ng=document.getElementById("pNewGroup").value.trim(); const g=ng||document.getElementById("pGroup").value;
  const qty=Math.max(1,Math.min(50,+document.getElementById("pQty").value||1));
  const btn=document.getElementById("pickSave"); btn.disabled=true;
  try{
    if(rm.isNew){const gr=ng&&!rm.gruppen.includes(ng)?[...rm.gruppen,ng]:rm.gruppen;await db.doc("raeume/"+roomId).set({name:rm.name,gruppen:gr,pos:rm.pos});rm.gruppen=gr}
    else if(ng&&!(rm.gruppen||[]).includes(ng))await db.doc("raeume/"+roomId).update({gruppen:[...(rm.gruppen||[]),ng]});
    const existing=assigns.find(a=>a.leuchte===pickKey&&a.raum===roomId&&(a.gruppe||"")===g);
    if(existing)await db.doc("zuordnung/"+existing.id).update({stueck:existing.stueck+qty});
    else await db.collection("zuordnung").add({leuchte:pickKey,raum:roomId,gruppe:g,stueck:qty,t:Date.now()});
    lastRoom=roomId; dlg.close();
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
  return db.persistent?"Gespeichert nur in diesem Browser, bis er geschlossen wird. Zum Aufheben oder Teilen: „Gemeinsam bearbeiten“."
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
