// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC, siehe LICENSE und NOTICE
// Orientierung für Einsteiger auf allen Seiten:
//  • Zähler an den Reitern (gemerkte Leuchten, Schienenpläne, gesetzte Leuchten)
//  • „Nächster Schritt“ – was als Nächstes sinnvoll ist, mit Link
//  • Hilfetexte ein-/ausblenden (Kompaktansicht für Wiederkehrer, gemerkt im Browser)
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const PAGE=document.body.dataset.tour||"leuchten";
  const KEY="lp_hilfe";

  // ---------- Hilfetexte ----------
  const getPro=()=>{try{return localStorage.getItem(KEY)==="aus"}catch(e){return false}};
  function applyPro(){
    const pro=getPro();document.body.classList.toggle("pro",pro);
    document.querySelectorAll("[data-help-toggle]").forEach(b=>{b.textContent=pro?"Hilfetexte einblenden":"Hilfetexte ausblenden";b.setAttribute("aria-pressed",String(pro))});
    document.dispatchEvent(new CustomEvent("lp:pro",{detail:pro}));
  }
  function setPro(v){try{v?localStorage.setItem(KEY,"aus"):localStorage.removeItem(KEY)}catch(e){}applyPro()}
  document.addEventListener("click",e=>{const b=e.target.closest("[data-help-toggle]");if(b)setPro(!getPro())});
  applyPro();

  // ---------- Fortschritt ----------
  // data: {rooms:[{id,name}], assigns:[{raum,leuchte,stueck}], rails:[{id,raum,name,platz}], hash:"#liste=…" }
  let last=null;
  function update(data){
    last=data;const {rooms=[],assigns=[],rails=[]}=data,h=data.hash||"";
    const lampN=assigns.reduce((s,a)=>s+(+a.stueck||1),0);
    // gesetzte Leuchten nur in Räumen mit Schiene zählen
    const railRooms=new Set(rails.map(p=>p.raum));
    const want=assigns.filter(a=>railRooms.has(a.raum)).reduce((s,a)=>s+(+a.stueck||1),0);
    const placed=rails.reduce((s,p)=>s+((p.platz||[]).length),0);
    badge("tabLamps",lampN?String(lampN):"",lampN?`${lampN} Leuchten gemerkt`:"");
    badge("tabRails",rails.length?String(rails.length):"",rails.length?`${rails.length} Schienenpläne`:"");
    badge("tabPlace",want?`${Math.min(placed,want)}/${want}`:"",want?`${Math.min(placed,want)} von ${want} Leuchten auf Schienen gesetzt`:"");
    renderNext(data,h);
  }
  function badge(id,txt,label){
    const t=$(id);if(!t)return;let b=t.querySelector(".tabn");
    if(!txt){if(b)b.remove();return}
    if(!b){b=document.createElement("span");b.className="tabn";t.appendChild(b)}
    b.textContent=txt;b.title=label;
  }
  function nextStep({rooms=[],assigns=[],rails=[]},h){
    const name=id=>(rooms.find(r=>r.id===id)||{}).name||"Raum";
    const lampsIn=id=>assigns.filter(a=>a.raum===id).reduce((s,a)=>s+(+a.stueck||1),0);
    const placedIn=id=>rails.filter(p=>p.raum===id).reduce((s,p)=>s+(p.platz||[]).length,0);
    if(!assigns.length&&!rails.length)return {page:"leuchten",text:"Starte mit den Leuchten: Such dir passende Strahler aus und merk sie dir für einen Raum. Oder plan zuerst die Schiene.",href:"./"+h,label:"Leuchten auswählen",alt:{href:"schiene.html"+h,label:"Schiene planen"}};
    const noRail=rooms.find(r=>lampsIn(r.id)&&!rails.some(p=>p.raum===r.id));
    if(noRail)return {page:"schienen",text:`Für „${name(noRail.id)}“ sind Leuchten gemerkt. Als Nächstes planst du die Schiene dafür.`,href:`schiene.html?raum=${encodeURIComponent(noRail.id)}${h}`,label:"Schiene planen"};
    const open=rooms.find(r=>rails.some(p=>p.raum===r.id)&&lampsIn(r.id)>placedIn(r.id));
    if(open)return {page:"belegung",text:`In „${name(open.id)}“ ${lampsIn(open.id)-placedIn(open.id)===1?"ist 1 Leuchte":`sind ${lampsIn(open.id)-placedIn(open.id)} Leuchten`} noch nicht auf der Schiene. Setz sie und verteil sie auf die Stromkreise.`,href:`belegung.html?raum=${encodeURIComponent(open.id)}${h}`,label:"Leuchten setzen"};
    const empty=rooms.find(r=>rails.some(p=>p.raum===r.id)&&!lampsIn(r.id));
    if(empty)return {page:"leuchten",text:`Für die Schiene in „${name(empty.id)}“ sind noch keine Leuchten gemerkt.`,href:"./"+h,label:"Leuchten auswählen"};
    return {page:"done",text:"Alle gemerkten Leuchten sitzen auf ihrer Schiene. Prüf noch die Stromkreise (Dimmer oder Schalter je Kreis), dann Schaltliste und Einkaufsliste drucken oder den Plan mit dem Elektriker teilen.",href:`belegung.html${h}#blList`,label:"Schaltliste ansehen"};
  }
  function renderNext(data,h){
    const els=document.querySelectorAll(".nextstep");if(!els.length)return;
    const n=nextStep(data,h);
    const here=n.page===PAGE&&!/raum=/.test(n.href);
    const html=`<div class="ns-body"><b>${n.page==="done"?"Fertig":"Nächster Schritt"}</b><span>${esc(n.text)}</span></div>`+
      (here?"":`<a class="primary ns-go" href="${esc(n.href)}">${esc(n.label)} →</a>`)+(n.alt&&PAGE!=="schienen"?`<a class="ghost ns-alt" href="${esc(n.alt.href)}">${esc(n.alt.label)}</a>`:"");
    els.forEach(el=>{el.innerHTML=html;el.hidden=false;el.classList.toggle("done",n.page==="done")});
  }
  window.Guide={update,nextStep,isPro:getPro,setPro};
})();
