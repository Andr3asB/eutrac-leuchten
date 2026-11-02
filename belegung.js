// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC, siehe LICENSE und NOTICE
// Belegung: gemerkte Leuchten eines Raums auf den Schienenplan setzen, auf die drei Stromkreise verteilen
// und KNX-Aktoren zuordnen. Gespeichert im Schienenplan-Eintrag der Merkliste (Felder platz und kreise).
(function(){
  const E=window.SchienenEngine, S=window.MerklisteStore, $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=v=>{const n=parseFloat(String(v??"").replace(",","."));return isFinite(n)?n:null};
  const fW=w=>(Math.round(w*10)/10).toLocaleString("de-DE")+" W";
  const fM=mm=>(mm/1000).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" m";
  const qs=new URLSearchParams(location.search);

  // Stromkreise der Schiene, Farben wie die Aderfarben L1/L2/L3
  const KC=[null,{n:"L1",c:"#8B5A2B",t:"braun"},{n:"L2",c:"#1F2633",t:"schwarz"},{n:"L3",c:"#7D848E",t:"grau"}];
  const RAIL_MAX_W=3600;
  // Aktoren. Werte laut Herstellerangaben (Datenblatt/Händler), Stand 11/2026 – vor der Installation prüfen.
  const AKT={
    "mdt-akd-0401.02":{name:"MDT AKD-0401.02 (Dimmaktor 4-fach)",typ:"dim",ab:200,an:50,min:2,maxLamps:20,
      note:"4 × 250 W, Kanäle zusammenschaltbar (2 × 500 W). LED/ECO im Phasenabschnitt bis 200 W je Kanal; Phasenanschnitt deutlich weniger (Forenangabe ca. 50 W – Datenblatt prüfen). Mindestlast ca. 2 W. Laut MDT meist bis zu 20 LED-Leuchtmittel je Kanal."},
    "dim-custom":{name:"anderer Dimmaktor (Werte eingeben)",typ:"dim",custom:true,ab:300,an:150,min:3},
    "mdt-aks-2016.03":{name:"MDT AKS-2016.03 (Schaltaktor 20-fach, 16 A)",typ:"sw",maxA:16,
      note:"16 A je Kanal, C-Last bis 140 µF, Einschaltstrom bis 600 A/150 µs. Bei vielen LED-Treibern auf einem Kanal deren Einschaltstrom beachten."},
    "sw-custom":{name:"anderer Schaltaktor (Werte eingeben)",typ:"sw",custom:true,maxA:16},
    "wall-dim":{name:"Wand-/Unterputzdimmer für LED (ohne KNX, Werte eingeben)",typ:"dim",custom:true,ab:150,an:100,min:5},
    "wall-sw":{name:"normaler Lichtschalter (ohne KNX)",typ:"sw",maxA:10,note:"Alle Leuchten dieses Stromkreises gehen gemeinsam an und aus."}
  };
  const defKreise=()=>[1,2,3].map(i=>({n:"Stromkreis "+i,m:"dim",a:"mdt-akd-0401.02",v:"ab",ch:""}));

  let db=null, rooms=[], assigns=[], rails=[], byKey={}, room="", planId="", tool=null, selM=-1, cur=null, saveT=null, drag=null, G=null;

  // ---------- Daten ----------
  async function loadLamps(){
    try{const rows=await (await fetch("leuchten.json?v=20261102f",{cache:"no-cache"})).json();
      rows.forEach(r=>{r.key=r.key||(r.brand.replace(/\W/g,"")+"_"+r.art);byKey[r.key]=r})}catch(e){status("Leuchtendaten konnten nicht geladen werden.","bad")}
  }
  const status=(t,cls="")=>{const el=$("blStatus");el.textContent=t;el.className="fine"+(cls?" "+cls:"")};
  const plan=()=>rails.find(p=>p.id===planId)||null;
  const lampName=r=>r?`${r.brand} ${r.model}`:"unbekannte Leuchte";
  const lampShort=r=>r?`${r.model} · ${(r.cctLabel||"").split(" ")[0]} K · ${r.angleLabel||""}`:"unbekannte Leuchte";
  // Gemerkte Leuchten im Raum (Summe der Stückzahlen je Leuchte)
  function roomLamps(){const m=new Map();assigns.filter(a=>a.raum===room&&byKey[a.leuchte]).forEach(a=>m.set(a.leuchte,(m.get(a.leuchte)||0)+(+a.stueck||1)));return m}
  function placedInRoom(key){return rails.filter(p=>p.raum===room).reduce((s,p)=>s+(p.id===planId&&cur?cur.platz:(p.platz||[])).filter(x=>x[0]===key).length,0)}

  // ---------- Geometrie des Plans in mm ----------
  function geo(pl){
    if(!pl)return null;
    if(pl.m==="s"){const L=pl.len||3000;return {lines:[[0,0,L,0]],nodes:[{x:0,y:0,type:pl.feed==="left"?"feed":"end"},{x:L,y:0,type:pl.feed==="right"?"feed":"end"}],mids:pl.feed==="mid"?[[L/2,0]]:[]}}
    const st=pl.st||500, lines=(pl.l||[]).map(l=>l.map(v=>v*st));let nodes=[];
    try{const g=E.planSegs(pl);nodes=E.fromSegments(g.segs,g.feeds,g.mids,st,{diags:g.diags,flex:g.flex}).nodes.map(n=>({x:n.x*st,y:n.y*st,type:n.type,feedIn:n.feedIn}))}catch(e){}
    const mids=(pl.md||[]).map(m=>{const q=String(m).split(",");return q.length===4?[(+q[0]+ +q[2])/2*st,(+q[1]+ +q[3])/2*st]:q[2]==="h"?[(+q[0]+.5)*st,+q[1]*st]:[+q[0]*st,(+q[1]+.5)*st]});
    // Linien an Verbindern teilen, damit Leuchten nicht auf einem Verbinder landen
    const split=[];lines.forEach(([a,b,c,d])=>{const L=Math.hypot(c-a,d-b);const ts=nodes.map(n=>{const t=((n.x-a)*(c-a)+(n.y-b)*(d-b))/(L*L);const px=a+(c-a)*t,py=b+(d-b)*t;return Math.hypot(n.x-px,n.y-py)<1&&t>1e-6&&t<1-1e-6?t:null}).filter(t=>t!=null).sort((x,y)=>x-y);
      let t0=0;[...ts,1].forEach(t=>{split.push([a+(c-a)*t0,b+(d-b)*t0,a+(c-a)*t,b+(d-b)*t]);t0=t})});
    return {lines,parts:split,nodes,mids};
  }
  // Nächster Punkt auf der Schiene, entlang der Schiene auf 5 cm gerastet
  const GAP=100; // Abstand zu Verbindern und Schienenenden (mm)
  function project(g,x,y){
    let best=null;
    (g.parts||g.lines).forEach(([a,b,c,d])=>{const vx=c-a,vy=d-b,L=Math.hypot(vx,vy);if(!L)return;const gap=Math.min(GAP,L/2);
      let t=((x-a)*vx+(y-b)*vy)/(L*L);t=Math.max(0,Math.min(1,t));let s=Math.round(t*L/50)*50;s=Math.max(gap,Math.min(L-gap,s));
      const px=a+vx*s/L,py=b+vy*s/L,dd=Math.hypot(x-px,y-py);if(!best||dd<best.d)best={x:Math.round(px),y:Math.round(py),d:dd}});
    return best;
  }

  // ---------- Darstellung ----------
  function render(){
    renderPick();
    const pl=plan();
    guide();
    $("blSvgBox").closest(".bl-card").hidden=$("blCircuits").hidden=!pl;
    $("blPick").hidden=!rooms.length;document.querySelector(".bl-layout").classList.toggle("nopl",!pl);
    if(!pl){$("blSvgBox").innerHTML="";$("blCircuits").innerHTML="";$("blLamps").innerHTML=emptyLamps();$("blSel").hidden=true;$("blHint").textContent="";$("blLegend").textContent="";renderList();return}
    if(!cur||cur.id!==pl.id)cur={id:pl.id,platz:JSON.parse(JSON.stringify(pl.platz||[])),kreise:JSON.parse(JSON.stringify(pl.kreise||defKreise()))};
    renderLamps();renderSvg();renderSel();renderCircuits();renderList();
  }
  // Anleitung, solange für den Raum noch etwas fehlt
  function guide(){if(window.Guide)Guide.update({rooms,assigns,rails:rails.map(p=>p.id===planId&&cur?{...p,platz:cur.platz}:p),hash:shareHash()})}
  function emptyLamps(){
    const h=shareHash(),r=rooms.find(x=>x.id===room),hasLamps=room?assigns.some(a=>a.raum===room):assigns.length>0,hasRail=rails.some(p=>p.raum===room);
    const li=(ok,txt,link)=>`<li class="${ok?"ok":""}"><span aria-hidden="true">${ok?"✓":""}</span><div>${txt}${!ok&&link?`<br>${link}`:""}</div></li>`;
    return `<h2>So geht’s</h2><p class="fine">${r?`Für „${esc(r.name)}“ fehlt noch etwas:`:"Für die Belegung brauchst du zwei Dinge:"}</p><ol class="bl-steps">
      ${li(hasLamps,"Leuchten für den Raum merken",`<a class="ghost" href="./${h}">Leuchten auswählen</a>`)}
      ${li(hasRail,"Schiene für den Raum planen und speichern",`<a class="ghost" href="schiene.html${room?"?raum="+encodeURIComponent(room):""}${h}">Schiene planen</a>`)}
      ${li(false,"Hier die Leuchten auf die Schiene setzen und auf die drei Stromkreise verteilen","")}</ol>`;
  }
  function renderPick(){
    const rs=$("blRoom"),ps=$("blPlan");
    rs.innerHTML=rooms.length?rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}${rails.some(p=>p.raum===r.id)?"":" (ohne Schiene)"}</option>`).join(""):`<option value="">keine Räume</option>`;
    rs.value=room;
    const mine=rails.filter(p=>p.raum===room);
    ps.innerHTML=mine.length?mine.map(p=>`<option value="${esc(p.id)}">${esc(p.name||"Schiene")}</option>`).join(""):`<option value="">keine Schiene</option>`;
    ps.value=planId;ps.disabled=!mine.length;
  }
  function renderLamps(){
    const m=roomLamps(),r=rooms.find(x=>x.id===room);
    let h=`<h2>Leuchten im Raum</h2>`;
    if(!m.size)h+=`<p class="fine">In „${esc(r?r.name:"")}“ sind noch keine Leuchten gemerkt. <a href="./${shareHash()}">Leuchten auswählen</a></p>`;
    else{
      h+=`<p class="fine">Leuchte antippen, dann auf die Schiene tippen.</p><div class="bl-lamps">`+[...m.entries()].map(([k,n])=>{const L=byKey[k],p=placedInRoom(k);
        return `<button type="button" class="bl-lamp${p>=n?" full":""}" data-lamp="${esc(k)}" aria-pressed="${tool===k}"><span><b>${esc(L.model)}</b><small>${esc(lampShort(L).split(" · ").slice(1).join(" · "))} · ${L.w!=null?fW(L.w):"W k. A."}</small></span><em>${p}/${n}</em></button>`}).join("")+`</div>`;
      if(tool&&m.has(tool)){const rest=m.get(tool)-placedInRoom(tool);h+=`<button type="button" class="ghost" id="blSpread"${rest>0?"":" disabled"}>Gleichmäßig verteilen (${Math.max(0,rest)}×)</button>`}
      const sumW=cur.platz.reduce((s,x)=>s+((byKey[x[0]]||{}).w||0),0);
      h+=`<p class="fine">Auf dieser Schiene: ${cur.platz.length} ${cur.platz.length===1?"Leuchte":"Leuchten"}, ${fW(sumW)}</p>`;
    }
    $("blLamps").innerHTML=h;
  }
  function renderSvg(){
    const pl=plan(),g=geo(pl&&pl.plan);G=null;
    if(!g||!g.lines.length){$("blSvgBox").innerHTML=`<p class="fine">Der Schienenplan ist noch leer.</p>`;return}
    const xs=g.lines.flatMap(l=>[l[0],l[2]]),ys=g.lines.flatMap(l=>[l[1],l[3]]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const box=$("blSvgBox").clientWidth||900,pad=44,spanX=Math.max(maxX-minX,1000),spanY=Math.max(maxY-minY,1);
    let k=Math.min((Math.min(box,1000)-pad*2)/spanX,420/Math.max(spanY,1));k=Math.max(k,0.02);
    const W=Math.max(320,Math.min(box,1000)),H=Math.max(150,spanY*k+pad*2+20);
    const ox=(W-(maxX-minX)*k)/2-minX*k, oy=pad-minY*k+(spanY<2?40:0);
    const X=x=>ox+x*k,Y=y=>oy+y*k;G={k,ox,oy,g,W,H};
    let s=`<svg viewBox="0 0 ${W} ${H}" id="blSvg" class="bl-svg${tool?" placing":""}" role="application" aria-label="Schiene mit gesetzten Leuchten">`;
    s+=`<rect x="0" y="0" width="${W}" height="${H}" class="edbg"/>`;
    g.lines.forEach(([a,b,c,d])=>{s+=`<line x1="${X(a)}" y1="${Y(b)}" x2="${X(c)}" y2="${Y(d)}" class="edrail"/>`});
    g.nodes.forEach(n=>{const x=X(n.x),y=Y(n.y);
      if(n.type==="feed"||n.feedIn)s+=`<rect x="${x-7}" y="${y-7}" width="14" height="14" class="feed"><title>Einspeisung</title></rect>`;
      else if(n.type==="end")s+=`<circle cx="${x}" cy="${y}" r="4" class="ednode end"/>`;
      else s+=`<rect x="${x-6}" y="${y-6}" width="12" height="12" class="ednode"/>`});
    g.mids.forEach(([x,y])=>s+=`<rect x="${X(x)-7}" y="${Y(y)-7}" width="14" height="14" class="feed"><title>Mitteneinspeiser</title></rect>`);
    const total=g.lines.reduce((t,[a,b,c,d])=>t+Math.hypot(c-a,d-b),0);
    s+=`<text x="${W-10}" y="${H-10}" text-anchor="end" class="tG">Schienenachse ${fM(total)}</text>`;
    cur.platz.forEach((p,i)=>{const L=byKey[p[0]],kc=KC[p[3]]||KC[1],inRoom=roomLamps().has(p[0]);
      s+=`<g class="bl-m${i===selM?" sel":""}${inRoom?"":" stale"}" data-i="${i}" transform="translate(${X(p[1])},${Y(p[2])})"><circle r="13" fill="${kc.c}"/><text y="4.5" text-anchor="middle">${esc(p[3]||1)}</text><title>${esc(lampName(L))} – Stromkreis ${esc(p[3])} (${kc.n})</title></g>`});
    s+=`</svg>`;
    $("blSvgBox").innerHTML=s;
    $("blHint").textContent=tool?`Setzen: ${lampShort(byKey[tool])} – auf die Schiene tippen.`:"Leuchte in der Liste wählen oder eine gesetzte Leuchte antippen.";
    $("blLegend").innerHTML=[1,2,3].map(i=>`<span class="leg"><i style="background:${KC[i].c};width:12px;height:12px;border-radius:50%"></i>Stromkreis ${i} (${KC[i].n}, ${KC[i].t})</span>`).join("")+`<span class="leg"><i class="lf"></i>Einspeisung</span>`;
    bindSvg();
  }
  function renderSel(){
    const el=$("blSel"),p=cur.platz[selM];
    if(!p){el.hidden=true;return}
    const L=byKey[p[0]];el.hidden=false;
    el.innerHTML=`<h2>Ausgewählte Leuchte</h2><p><b>${esc(lampName(L))}</b><br><span class="fine">${esc(lampShort(L))} · ${L&&L.w!=null?fW(L.w):"W k. A."} · Dimmung: ${esc(L?L.dim:"–")}</span></p>
      <div class="chips" role="radiogroup" aria-label="Stromkreis">${[1,2,3].map(i=>`<button type="button" role="radio" aria-checked="${p[3]===i}" data-kreis="${i}"><i class="kdot" style="background:${KC[i].c}"></i>Kreis ${i} · ${esc(cur.kreise[i-1].n)}</button>`).join("")}</div>
      <p class="fine">Am Adapter der Leuchte den Phasenwahlschalter auf ${KC[p[3]].n} stellen.</p>
      <div class="savebtns"><button type="button" class="ghost" id="blAllSame">Alle ${esc(L?L.model:"")} auf Kreis ${esc(p[3])}</button><button type="button" class="ghost" id="blDel">Entfernen</button></div>`;
  }
  // ---------- Stromkreise und Prüfung ----------
  function dimClass(d){d=String(d||"");if(/^An-\/Abschnitt/.test(d))return "both";if(/^Abschnitt/.test(d))return "ab";if(/^Anschnitt/.test(d))return "an";return "unk"}
  function check(k,lamps,extraW=0){
    const out=[],n=lamps.length,W=lamps.reduce((s,L)=>s+(L&&L.w||0),0)+extraW,unkW=lamps.filter(L=>!L||L.w==null).length,a=AKT[k.a]||AKT["dim-custom"];
    if(!n)return {W,out:[{c:"info",t:"Noch keine Leuchte auf diesem Stromkreis."}]};
    if(W>RAIL_MAX_W)out.push({c:"bad",t:`${fW(W)} – mehr als 3.600 W je Stromkreis der Schiene.`});
    if(unkW)out.push({c:"warn",t:`${unkW}× ohne Watt-Angabe (z. B. „je Leuchtmittel“) – Last bitte ergänzen.`});
    if(k.m==="dim"){
      const max=a.custom?(num(k.maxW)??a[k.v==="an"?"an":"ab"]):a[k.v==="an"?"an":"ab"], min=a.custom?(num(k.minW)??a.min):a.min;
      if(W>max)out.push({c:"bad",t:`Last ${fW(W)} über ${fW(max)} je Kanal (${k.v==="an"?"Phasenanschnitt":"Phasenabschnitt"}). ${/^wall/.test(k.a)?"Leuchten auf einen anderen Kreis legen oder einen stärkeren Dimmer wählen.":"Leuchten auf einen anderen Kreis legen oder Kanäle zusammenschalten."}`});
      else out.push({c:"ok",t:`Last ${fW(W)} von ${fW(max)} je Kanal (${Math.round(W/max*100)} %).`});
      if(W<min)out.push({c:"warn",t:`Unter der Mindestlast von ${fW(min)} – der Aktor erkennt die Last evtl. nicht.`});
      if(a.maxLamps&&n>a.maxLamps)out.push({c:"warn",t:`${n} Leuchten auf einem Kanal – laut Hersteller meist höchstens ${a.maxLamps} LED-Leuchtmittel je Kanal.`});
      const cls=lamps.map(L=>dimClass(L&&L.dim));
      if(k.v==="an"&&cls.includes("ab"))out.push({c:"bad",t:`${cls.filter(c=>c==="ab").length}× nur für Phasenabschnitt geeignet, Kanal steht auf Phasenanschnitt.`});
      if(k.v!=="an"&&cls.includes("an"))out.push({c:"bad",t:`${cls.filter(c=>c==="an").length}× nur für Phasenanschnitt geeignet, Kanal steht auf Phasenabschnitt.`});
      if(cls.includes("ab")&&cls.includes("an"))out.push({c:"bad",t:"Gemischte Dimmverfahren auf einem Kreis (Anschnitt- und Abschnitt-Leuchten) – auf getrennte Kreise legen."});
      const unk=cls.filter(c=>c==="unk").length;if(unk)out.push({c:"warn",t:`${unk}× Dimmart unbekannt (k. A. oder je Leuchtmittel) – vor dem Kauf am Dimmer testen.`});
    }else{
      const maxA=a.custom?(num(k.maxA)??16):a.maxA,A=W/230;
      out.push({c:A>maxA?"bad":"ok",t:`Schalten: ${fW(W)} ≈ ${A.toLocaleString("de-DE",{maximumFractionDigits:1})} A von ${maxA} A.`});
      const dimOnly=lamps.filter(L=>L&&/dimm|schnitt/i.test(L.dim)).length;if(dimOnly)out.push({c:"info",t:"Geschaltet statt gedimmt: Die Leuchten laufen dann immer mit voller Helligkeit."});
    }
    if(!String(k.ch||"").trim()&&!/^wall/.test(k.a))out.push({c:"info",t:"Aktor-Kanal noch nicht eingetragen."});
    return {W,out};
  }
  function circuitLamps(platz,i){return platz.filter(p=>(p[3]||1)===i).map(p=>byKey[p[0]])}
  function renderCircuits(){
    $("blCircuits").innerHTML=[1,2,3].map(i=>{const k=cur.kreise[i-1],a=AKT[k.a]||AKT["dim-custom"],lamps=circuitLamps(cur.platz,i),r=check(k,lamps);
      const opts=Object.entries(AKT).filter(([,v])=>v.typ===k.m).map(([id,v])=>`<option value="${id}"${id===k.a?" selected":""}>${esc(v.name)}</option>`).join("");
      const cnt=new Map();lamps.forEach(L=>{const nm=L?L.model:"?";cnt.set(nm,(cnt.get(nm)||0)+1)});
      return `<article class="bl-card bl-kreis" data-k="${i}">
        <h3><i class="kdot" style="background:${KC[i].c}"></i>Stromkreis ${i} <span class="fine">${KC[i].n} · Ader ${KC[i].t}</span></h3>
        <div class="f"><label>Name</label><input type="text" data-f="n" value="${esc(k.n)}" maxlength="40"></div>
        <div class="bl-row"><div class="f"><label>Licht wird …</label><select data-f="m"><option value="dim"${k.m==="dim"?" selected":""}>gedimmt</option><option value="sw"${k.m==="sw"?" selected":""}>nur an/aus geschaltet</option></select></div>
          ${k.m==="dim"?`<div class="f"><label>Dimmverfahren</label><select data-f="v"><option value="ab"${k.v!=="an"?" selected":""}>Phasenabschnitt</option><option value="an"${k.v==="an"?" selected":""}>Phasenanschnitt</option></select></div>`:""}</div>
        <div class="f"><label>Dimmer / Schalter</label><select data-f="a">${opts}</select></div>
        ${a.custom?(k.m==="dim"?`<div class="bl-row"><div class="f"><label>Max. W je Kanal</label><input type="text" inputmode="decimal" data-f="maxW" value="${esc(k.maxW??a[k.v==="an"?"an":"ab"])}"></div><div class="f"><label>Mindestlast W</label><input type="text" inputmode="decimal" data-f="minW" value="${esc(k.minW??a.min)}"></div></div>`
          :`<div class="f"><label>Max. A je Kanal</label><input type="text" inputmode="decimal" data-f="maxA" value="${esc(k.maxA??16)}"></div>`):`<p class="fine help">${esc(a.note||"")}</p>`}
        <div class="f"><label>Bezeichnung / Kanal</label><input type="text" data-f="ch" value="${esc(k.ch||"")}" placeholder="z. B. AKD 1 · Kanal A oder „Schalter Tür“" maxlength="40"></div>
        <p class="bl-sum"><b>${lamps.length} ${lamps.length===1?"Leuchte":"Leuchten"} · ${fW(r.W)}</b>${cnt.size?`<br><span class="fine">${[...cnt].map(([m,c])=>`${c}× ${esc(m)}`).join(", ")}</span>`:""}</p>
        <ul class="bl-checks">${r.out.map(c=>`<li class="${c.c}">${esc(c.t)}</li>`).join("")}</ul>
      </article>`}).join("");
  }
  // Schaltliste über alle Räume und Schienen; gleiche Aktor-Kanäle werden zusammengezählt
  function renderList(){
    const rows=[],chan=new Map();
    rooms.forEach(rm=>rails.filter(p=>p.raum===rm.id).forEach(p=>{const platz=p.id===planId&&cur?cur.platz:(p.platz||[]),kreise=p.id===planId&&cur?cur.kreise:(p.kreise||defKreise());
      if(!platz.length&&!p.kreise)return;
      [1,2,3].forEach(i=>{const k=kreise[i-1],lamps=circuitLamps(platz,i);if(!lamps.length)return;const r=check(k,lamps);
        const ck=k.ch&&k.ch.trim()?(k.a+"|"+k.ch.trim().toLowerCase()):null;if(ck){const c=chan.get(ck)||{W:0,n:0,k,lamps:[]};c.W+=r.W;c.n++;c.lamps.push(...lamps);chan.set(ck,c)}
        rows.push({rm,p,i,k,lamps,r,ck})})}));
    if(!rows.length){$("blListBody").innerHTML=`<p class="fine">Noch keine Leuchten auf Schienen gesetzt.</p>`;return}
    const shared=[...chan.values()].filter(c=>c.n>1);
    const worst=r=>r.out.some(c=>c.c==="bad")?"bad":r.out.some(c=>c.c==="warn")?"warn":"ok";
    let h=`<div class="tablewrap"><table class="bl-table"><thead><tr><th>Raum · Schiene</th><th>Kreis</th><th>Name</th><th>Aktor · Kanal</th><th>Betrieb</th><th>Leuchten</th><th class="n">Last</th><th>Prüfung</th></tr></thead><tbody>`+
      rows.map(({rm,p,i,k,lamps,r})=>{const cnt=new Map();lamps.forEach(L=>{const nm=L?`${L.brand} ${L.model}`:"?";cnt.set(nm,(cnt.get(nm)||0)+1)});const w=worst(r);
        return `<tr><td>${esc(rm.name)} · ${esc(p.name||"Schiene")}</td><td><i class="kdot" style="background:${KC[i].c}"></i>${i} (${KC[i].n})</td><td>${esc(k.n)}</td><td>${esc((AKT[k.a]||{}).name||"–")}${k.ch?`<br><b>${esc(k.ch)}</b>`:""}</td><td>${k.m==="dim"?(k.v==="an"?"Dimmen, Anschnitt":"Dimmen, Abschnitt"):"Schalten"}</td>
          <td>${[...cnt].map(([m,c])=>`${c}× ${esc(m)}`).join("<br>")}</td><td class="n">${fW(r.W)}</td><td class="st ${w}">${w==="ok"?"✓ passt":r.out.filter(c=>c.c===w).map(c=>esc(c.t)).join("<br>")}</td></tr>`}).join("")+`</tbody></table></div>`;
    if(shared.length)h+=`<ul class="bl-checks">${shared.map(c=>{const r=check(c.k,c.lamps);const bad=r.out.find(x=>x.c==="bad");return `<li class="${bad?"bad":"warn"}">Kanal „${esc(c.k.ch)}“ wird von ${c.n} Stromkreisen genutzt: zusammen ${fW(c.W)}.${bad?" "+esc(bad.t):""}</li>`}).join("")}</ul>`;
    // Noch nicht gesetzte Leuchten je Raum
    const miss=[];rooms.forEach(rm=>{const m=new Map();assigns.filter(a=>a.raum===rm.id&&byKey[a.leuchte]).forEach(a=>m.set(a.leuchte,(m.get(a.leuchte)||0)+(+a.stueck||1)));
      if(!rails.some(p=>p.raum===rm.id))return;
      m.forEach((n,k)=>{const placed=rails.filter(p=>p.raum===rm.id).reduce((s,p)=>s+(p.id===planId&&cur?cur.platz:(p.platz||[])).filter(x=>x[0]===k).length,0);if(placed<n)miss.push(`${esc(rm.name)}: ${n-placed}× ${esc(byKey[k].model)}`)})});
    if(miss.length)h+=`<p class="fine"><b>Noch nicht auf einer Schiene:</b> ${miss.join(" · ")}</p>`;
    $("blListBody").innerHTML=h;
  }

  // ---------- Bedienung ----------
  function save(){
    if(!cur||!db)return;clearTimeout(saveT);
    saveT=setTimeout(async()=>{saveT=null;const id=cur.id,data={platz:cur.platz,kreise:cur.kreise};
      try{await db.doc("schienen/"+id).update(data);status(`Gespeichert ${db.mode==="shared"?"in der gemeinsamen Liste":"in der Merkliste dieses Browsers"} um ${new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}.`,"ok")}
      catch(e){status(e&&e.message?e.message:"Speichern fehlgeschlagen.","bad")}},400);
  }
  $("blRoom").addEventListener("change",e=>{room=e.target.value;const p=rails.find(x=>x.raum===room);planId=p?p.id:"";cur=null;tool=null;selM=-1;setUrl();render()});
  $("blPlan").addEventListener("change",e=>{planId=e.target.value;cur=null;tool=null;selM=-1;setUrl();render()});
  const setUrl=()=>history.replaceState(null,"",(planId?"?plan="+encodeURIComponent(planId):room?"?raum="+encodeURIComponent(room):location.pathname)+location.hash);
  $("blLamps").addEventListener("click",e=>{
    const b=e.target.closest("[data-lamp]");if(b){tool=tool===b.dataset.lamp?null:b.dataset.lamp;selM=-1;render();return}
    if(e.target.id==="blSpread")spread();
  });
  function spread(){
    const g=geo((plan()||{}).plan),m=roomLamps();if(!tool||!g)return;const rest=m.get(tool)-placedInRoom(tool);if(rest<=0)return;
    // Gleichmäßig über die nutzbare Länge (ohne 10 cm an Verbindern und Enden) verteilen
    const segs=(g.parts||g.lines).map(([a,b,c,d])=>{const L0=Math.hypot(c-a,d-b),gap=Math.min(GAP,L0/2);return {a,b,c,d,L0,gap,L:Math.max(0,L0-2*gap)}}),tot=segs.reduce((s,x)=>s+x.L,0);
    const kreis=(cur.platz.find(p=>p[0]===tool)||[])[3]||1;
    for(let i=0;i<rest;i++){let at=(i+.5)/rest*tot;for(const s of segs){if(at<=s.L){const q=s.gap+Math.min(s.L,Math.round(at/50)*50);cur.platz.push([tool,Math.round(s.a+(s.c-s.a)*q/s.L0),Math.round(s.b+(s.d-s.b)*q/s.L0),kreis]);break}at-=s.L}}
    tool=null;save();render();
  }
  $("blSel").addEventListener("click",e=>{
    const p=cur.platz[selM];if(!p)return;
    const k=e.target.closest("[data-kreis]");if(k){p[3]=+k.dataset.kreis;save();render();return}
    if(e.target.id==="blDel"){cur.platz.splice(selM,1);selM=-1;save();render()}
    if(e.target.id==="blAllSame"){cur.platz.forEach(x=>{if(x[0]===p[0])x[3]=p[3]});save();render()}
  });
  $("blCircuits").addEventListener("input",e=>{const f=e.target.dataset.f;if(!f||e.target.tagName!=="INPUT")return;const i=+e.target.closest("[data-k]").dataset.k;
    cur.kreise[i-1][f]=e.target.value;save();
    // nur Prüfung/Liste neu, damit das Eingabefeld den Fokus behält
    const card=e.target.closest("[data-k]"),r=check(cur.kreise[i-1],circuitLamps(cur.platz,i));card.querySelector(".bl-checks").innerHTML=r.out.map(c=>`<li class="${c.c}">${esc(c.t)}</li>`).join("");renderList();if(f==="n")renderSel()});
  $("blCircuits").addEventListener("change",e=>{const f=e.target.dataset.f;if(!f||e.target.tagName!=="SELECT")return;const i=+e.target.closest("[data-k]").dataset.k,k=cur.kreise[i-1];
    k[f]=e.target.value;if(f==="m"){const wall=/^wall/.test(k.a);k.a=k.m==="dim"?(wall?"wall-dim":"mdt-akd-0401.02"):(wall?"wall-sw":"mdt-aks-2016.03")}save();render()});
  $("blPrint").onclick=()=>window.print();

  function bindSvg(){
    const svg=$("blSvg");if(!svg)return;
    const toMM=ev=>{const r=svg.getBoundingClientRect(),sx=G.W/r.width;return {x:((ev.clientX-r.left)*sx-G.ox)/G.k,y:((ev.clientY-r.top)*sx-G.oy)/G.k,px:sx}};
    svg.onpointerdown=ev=>{
      const m=ev.target.closest(".bl-m");
      if(m){ev.preventDefault();selM=+m.dataset.i;tool=null;drag={i:selM,moved:false,el:m};svg.setPointerCapture(ev.pointerId);renderLamps();renderSel();
        svg.querySelectorAll(".bl-m").forEach(x=>x.classList.toggle("sel",x===m));return}
      if(tool){const p=toMM(ev),q=project(G.g,p.x,p.y);
        if(!q||q.d*G.k>32){$("blHint").textContent="Bitte näher an die Schiene tippen.";return}
        const m=roomLamps();if(placedInRoom(tool)>=m.get(tool)){$("blHint").textContent="Alle gemerkten Leuchten dieser Art sind schon gesetzt. Stückzahl im Reiter Leuchten erhöhen.";return}
        const kreis=(cur.platz.find(x=>x[0]===tool)||[])[3]||1;
        cur.platz.push([tool,q.x,q.y,kreis]);selM=cur.platz.length-1;
        if(placedInRoom(tool)>=m.get(tool))tool=null;
        save();render();return}
      selM=-1;render();
    };
    svg.onpointermove=ev=>{if(!drag)return;const p=toMM(ev),q=project(G.g,p.x,p.y);if(!q)return;const pl=cur.platz[drag.i];
      if(q.x!==pl[1]||q.y!==pl[2]){pl[1]=q.x;pl[2]=q.y;drag.moved=true;drag.el.setAttribute("transform",`translate(${G.ox+q.x*G.k},${G.oy+q.y*G.k})`)}};
    svg.onpointerup=()=>{if(!drag)return;const mv=drag.moved,later=drag.later;drag=null;if(mv){save();renderCircuits();renderList()}if(later)render()};
    svg.onpointercancel=()=>{drag=null;render()};
  }

  // ---------- Speicher ----------
  const shareHash=()=>db&&db.mode==="shared"&&db.link?new URL(db.link).hash:"";
  function askPassword(wrong){return new Promise(resolve=>{
    const dlg=$("pwDlg"),inp=$("pwInput"),f=$("pwForm");inp.value="";$("pwErr").hidden=!wrong;
    const finish=v=>{f.onsubmit=null;$("pwCancel").onclick=null;dlg.close();resolve(v)};
    f.onsubmit=e=>{e.preventDefault();finish(inp.value)};$("pwCancel").onclick=()=>finish(null);
    dlg.oncancel=e=>{e.preventDefault();finish(null)};dlg.showModal();inp.focus()})}
  async function openStore(){
    let link=S.parseLink(location.hash);if(!link){const rem=S.rememberedShared();link=rem&&S.parseLink(rem)}
    if(link&&S.configured()){status("Gemeinsame Liste wird geöffnet …");
      try{db=await S.openShared(link,askPassword);status("Gemeinsame Liste geöffnet.")}
      catch(e){db=S.openLocal();status("Die gemeinsame Liste konnte nicht geöffnet werden. Angezeigt wird die Merkliste dieses Browsers.","bad")}}
    else db=S.openLocal();
    if(window.ShareUI)ShareUI.mount({getDb:()=>db,status:t=>status(t)});
    const h=shareHash();if(h){$("tabLamps").href="./"+h;$("tabRails").href="schiene.html"+h;$("tabPlace").href="belegung.html"+h}
    let got={r:0,a:0,s:0},first=true;
    const ready=()=>{if(!(got.r&&got.a&&got.s))return;
      if(first){first=false;const pq=qs.get("plan"),rq=qs.get("raum"),p=pq&&rails.find(x=>x.id===pq);
        if(p){room=p.raum;planId=p.id}else{room=(rq&&rooms.some(r=>r.id===rq))?rq:((rails[0]&&rails[0].raum)||(rooms[0]&&rooms[0].id)||"");const q=rails.find(x=>x.raum===room);planId=q?q.id:""}}
      if(room&&!rooms.some(r=>r.id===room)){room=rooms[0]?rooms[0].id:"";planId=""}
      if(planId&&!rails.some(p=>p.id===planId)){const q=rails.find(x=>x.raum===room);planId=q?q.id:"";cur=null}
      render()};
    db.collection("raeume").onSnapshot(sn=>{rooms=sn.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.pos||0)-(b.pos||0));got.r=1;ready()});
    db.collection("zuordnung").onSnapshot(sn=>{assigns=sn.docs.map(d=>({id:d.id,...d.data()}));got.a=1;ready()});
    db.collection("schienen").onSnapshot(sn=>{rails=sn.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.raum).sort((a,b)=>(a.t||0)-(b.t||0));got.s=1;
      // Änderungen anderer übernehmen, solange hier nichts ungespeichert ist
      if(drag){drag.later=true;return}   // erst nach dem Loslassen neu zeichnen
      if(cur&&!saveT){const p=rails.find(x=>x.id===cur.id);if(p&&JSON.stringify([p.platz||[],p.kreise||defKreise()])!==JSON.stringify([cur.platz,cur.kreise]))cur=null}
      ready()});
  }

  ["tourBtn","tourLink"].forEach(id=>{const el=$(id);if(el)el.onclick=()=>window.Tour&&window.Tour.start()});
  let rz;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(plan())renderSvg()},150)});
  (async()=>{await loadLamps();await openStore();if(window.Tour)window.Tour.auto()})();
})();
