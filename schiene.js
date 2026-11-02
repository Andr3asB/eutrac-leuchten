// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC, siehe LICENSE und NOTICE
// Oberfläche des Schienenplaners: gerade Schiene (Länge eingeben) oder Form zeichnen. Rechnet mit schiene-engine.js.
(function(){
  const E=window.SchienenEngine, $=id=>document.getElementById(id);
  const st={mode:"simple",sshape:"gerade",shape:"straight",feed:"left",side:"S",view:"top",have:{},tool:"draw",
    dims:{},sfeed:{},sArea:[6,4],
    segs:new Set(),diags:new Set(),flex:new Set(),feeds:new Set(),mids:new Set(),undo:[]};
  const fmtM=mm=>(mm/1000).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" m";
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=v=>parseFloat(String(v).replace(",","."));
  const RED="#D7262E";

  // ---------- Bedienelemente ----------
  function radio(sel,attr,cb){document.querySelectorAll(sel).forEach(b=>b.addEventListener("click",()=>{if(b.disabled)return;
    document.querySelectorAll(sel).forEach(x=>x.setAttribute("aria-checked",x===b));cb(b.dataset[attr]);render()}))}
  radio("[data-feed]","feed",v=>{st.feed=v;applyHave()});
  radio("[data-mode]","mode",v=>setMode(v));
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{st.view=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{st.tool=b.dataset.tool;document.querySelectorAll("[data-tool]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  ["len","maxLen","color","mount","spacing"].forEach(id=>$(id).addEventListener("input",render));
  ["areaW","areaH"].forEach(id=>$(id).addEventListener("change",render));
  $("gridStep").addEventListener("change",()=>{const old=st.step||500,nw=+$("gridStep").value;rescale(old,nw);render()});
  $("flip").onclick=()=>{st.side=st.side==="N"?"S":"N";$("haveFeed").value="";render()};
  $("haveFeed").addEventListener("input",()=>{applyHave();render()});
  $("printBtn").onclick=()=>window.print();
  $("planForm").addEventListener("submit",e=>e.preventDefault());   // Enter in einem Feld lädt die Seite nicht neu
  $("undo").onclick=()=>{const s=st.undo.pop();if(s){restore(s);render()}};
  $("clearAll").onclick=()=>{snapshot();st.autoFeed=null;st.segs.clear();st.diags.clear();st.flex.clear();st.feeds.clear();st.mids.clear();render()};
  $("bom").addEventListener("change",e=>{const k=e.target.dataset.have;if(k){st.have[k]=e.target.checked;render()}});

  function applyHave(){
    const v=$("haveFeed").value;if(!v||st.feed==="mid")return;
    const dir=st.feed==="left"?"E":"W", right=E.RIGHT[dir];
    st.side=v==="rechts"?right:(right==="S"?"N":"S");
  }
  const snapshot=()=>{st.undo.push({segs:[...st.segs],diags:[...st.diags],flex:[...st.flex],feeds:[...st.feeds],mids:[...st.mids]});if(st.undo.length>60)st.undo.shift()};
  const restore=s=>{st.segs=new Set(s.segs);st.diags=new Set(s.diags||[]);st.flex=new Set(s.flex||[]);st.feeds=new Set(s.feeds);st.mids=new Set(s.mids)};

  // ---------- Einfacher Modus: Form wählen, Maße eintragen ----------
  // Maße in mm; Linien als [x0,y0,x1,y1]; Einspeiseoptionen: p = Punkt (Ende oder Verbinder), m = Mitteneinspeiser auf dieser Linie
  const SHAPES={
    gerade:{name:"Gerade",icon:[[2,8,22,8]]},
    L:{name:"L-Form",dims:[["A","Länge oben (waagrecht)",3],["B","Länge rechts (senkrecht)",2]],icon:[[3,3,21,3],[21,3,21,14]],
      lines:(A,B)=>[[0,0,A,0],[A,0,A,B]],feeds:(A,B)=>[["e1","am linken Ende",{p:[0,0]}],["e2","am unteren Ende",{p:[A,B]}],["c","an der Ecke",{p:[A,0]}],["m","irgendwo auf der langen Seite",{m:A>=B?[0,0,A,0]:[A,0,A,B]}]]},
    U:{name:"U-Form",dims:[["A","Breite",3],["B","Länge der Seiten",1.5]],icon:[[3,14,3,3],[3,3,21,3],[21,3,21,14]],
      lines:(A,B)=>[[0,B,0,0],[0,0,A,0],[A,0,A,B]],feeds:(A,B)=>[["e1","am linken Ende",{p:[0,B]}],["e2","am rechten Ende",{p:[A,B]}],["m","irgendwo in der Mitte",{m:[0,0,A,0]}]]},
    T:{name:"T-Form",dims:[["A","Länge oben (durchgehend)",4],["B","Länge des Abzweigs",2]],icon:[[2,3,22,3],[12,3,12,14]],
      lines:(A,B)=>[[0,0,A,0],[A/2,0,A/2,B]],feeds:(A,B)=>[["e1","am linken Ende",{p:[0,0]}],["e3","am Ende des Abzweigs",{p:[A/2,B]}],["n","am Abzweig (T-Verbinder)",{p:[A/2,0]}]]},
    rect:{name:"Rechteck",dims:[["A","Breite",4],["B","Tiefe",3]],icon:[[3,3,21,3],[21,3,21,14],[21,14,3,14],[3,14,3,3]],
      lines:(A,B)=>[[0,0,A,0],[A,0,A,B],[A,B,0,B],[0,B,0,0]],feeds:(A,B)=>[["m","irgendwo auf einer Seite",{m:[0,0,A,0]}],["c","an einer Ecke",{p:[0,0]}]]},
    plus:{name:"Kreuz",dims:[["A","Länge waagrecht",3],["B","Länge senkrecht",3]],icon:[[2,8.5,22,8.5],[12,2,12,15]],
      lines:(A,B)=>[[0,B/2,A,B/2],[A/2,0,A/2,B]],feeds:(A,B)=>[["e1","am linken Ende",{p:[0,B/2]}],["e2","am oberen Ende",{p:[A/2,0]}],["n","in der Mitte (X-Verbinder)",{p:[A/2,B/2]}]]},
    H:{name:"H-Form",dims:[["A","Abstand der Seiten",3],["B","Länge der Seiten",3]],icon:[[3,2,3,15],[21,2,21,15],[3,8.5,21,8.5]],
      lines:(A,B)=>[[0,0,0,B],[A,0,A,B],[0,B/2,A,B/2]],feeds:(A,B)=>[["e1","oben links",{p:[0,0]}],["m","in der Mitte des Querstegs",{m:[0,B/2,A,B/2]}]]}
  };
  Object.entries(SHAPES).forEach(([k,v])=>{if(v.dims){st.dims[k]={};v.dims.forEach(([d,,def])=>st.dims[k][d]=String(def).replace(".",","))}});
  const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a);
  function renderShapeCards(){
    $("shapeCards").innerHTML=Object.entries(SHAPES).map(([k,v])=>`<button type="button" role="radio" aria-checked="${st.sshape===k}" data-sshape="${k}" class="shapecard">
      <svg viewBox="0 0 24 17" aria-hidden="true">${v.icon.map(([a,b,c,d])=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("")}</svg><span>${v.name}</span></button>`).join("");
  }
  function renderDimFields(){
    const S=SHAPES[st.sshape];if(!S.dims){$("dimFields").innerHTML="";$("sfeedChips").innerHTML="";return}
    $("dimFields").innerHTML=S.dims.map(([d,label])=>`<div class="f"><label for="dim${d}">${label}</label><div class="unit"><input type="text" id="dim${d}" data-dim="${d}" value="${esc(st.dims[st.sshape][d])}" inputmode="decimal" autocomplete="off"><span>m</span></div></div>`).join("");
    const opts=S.feeds(1,1);if(!opts.some(o=>o[0]===st.sfeed[st.sshape]))st.sfeed[st.sshape]=opts[0][0];
    $("sfeedChips").innerHTML=opts.map(([k,l])=>`<button type="button" role="radio" aria-checked="${st.sfeed[st.sshape]===k}" data-sfeed="${k}">${l}</button>`).join("");
  }
  $("shapeCards").addEventListener("click",e=>{const b=e.target.closest("[data-sshape]");if(!b)return;st.sshape=b.dataset.sshape;st.simpleTouched=true;
    renderShapeCards();renderDimFields();render()});
  $("dimFields").addEventListener("input",e=>{const d=e.target.dataset.dim;if(!d)return;st.dims[st.sshape][d]=e.target.value;st.simpleTouched=true;render()});
  $("sfeedChips").addEventListener("click",e=>{const b=e.target.closest("[data-sfeed]");if(!b)return;st.sfeed[st.sshape]=b.dataset.sfeed;st.simpleTouched=true;
    $("sfeedChips").querySelectorAll("[data-sfeed]").forEach(x=>x.setAttribute("aria-checked",x===b));render()});
  // Baut die Form aus den Maßen: Rasterschritt = größter gemeinsamer Teiler aller Koordinaten (mm)
  function buildSimple(){
    const S=SHAPES[st.sshape],d=st.dims[st.sshape];
    const A=Math.round((num(d.A)||0)*100)*10,B=Math.round((num(d.B)||0)*100)*10;
    if(A<300||B<300)return "Bitte alle Maße ab 0,30 m eingeben.";
    if(A>30000||B>30000)return "Bitte Maße bis 30 m eingeben.";
    const lines=S.lines(A,B),f=(S.feeds(A,B).find(o=>o[0]===st.sfeed[st.sshape])||S.feeds(A,B)[0])[2];
    let g=0;lines.flat().forEach(v=>g=gcd(g,Math.round(v)));if(f.p)f.p.forEach(v=>g=gcd(g,v));g=Math.max(g,5);
    st.segs=new Set();st.diags=new Set();st.flex=new Set();st.feeds=new Set();st.mids=new Set();st.autoFeed=null;
    lines.forEach(([a,b,c,e])=>addLine(a/g,b/g,c/g,e/g));
    if(f.p)st.feeds.add(f.p[0]/g+","+f.p[1]/g);
    if(f.m){const [a,b,c,e]=f.m.map(v=>v/g);if(b===e){const x=Math.min(Math.floor((a+c)/2),Math.max(a,c)-1);st.mids.add(`${x},${b},h`)}else{const y=Math.min(Math.floor((b+e)/2),Math.max(b,e)-1);st.mids.add(`${a},${y},v`)}}
    st.step=g;const xs=lines.flatMap(l=>[l[0],l[2]]),ys=lines.flatMap(l=>[l[1],l[3]]);
    st.sArea=[Math.max(...xs)/1000+0.4,Math.max(...ys)/1000+0.4];st.simple={s:st.sshape,A,B,f:st.sfeed[st.sshape]};
    return null;
  }
  // Moduswechsel. Einfach → frei: die aktuelle Form wird übernommen (die vorige Zeichnung bleibt über „Rückgängig“ erreichbar).
  function setMode(m){
    if(m===st.mode)return;
    if(m==="draw"){
      const prev=st.drawStash;
      if(prev&&!st.simpleTouched){restore(prev);st.step=prev.step;$("gridStep").value=String(prev.step)}
      else{if(prev)st.undo.push(prev);toDrawFromSimple()}
    }else{st.drawStash={segs:[...st.segs],diags:[...st.diags],flex:[...st.flex],feeds:[...st.feeds],mids:[...st.mids],step:st.step};st.simpleTouched=false}
    st.mode=m;document.querySelectorAll("[data-mode]").forEach(x=>x.setAttribute("aria-checked",x.dataset.mode===m));
  }
  function toDrawFromSimple(){
    if(st.sshape==="gerade"){const L=Math.round((num($("len").value)||3)*100)*10;st.sshape="L";const keep=st.dims;
      st.segs=new Set();st.diags=new Set();st.flex=new Set();st.feeds=new Set();st.mids=new Set();
      const g=Math.max(gcd(L,1000),5);addLine(0,0,L/g,0);if(st.feed==="left")st.feeds.add("0,0");else if(st.feed==="right")st.feeds.add(L/g+",0");else st.mids.add(Math.floor(L/g/2)+",0,h");
      st.step=g;st.sArea=[L/1000+0.4,1];st.sshape="gerade";st.dims=keep}
    else buildSimple();
    // Zum Weiterzeichnen ein handliches Raster (50/25/10 cm), wenn die Form darauf passt
    {const d=[500,250,100].find(x=>st.step%x===0);if(d&&d<st.step){const f=st.step/d,seg=new Set();
      for(const u of st.segs){const [x,y,o]=u.split(",");for(let i=0;i<f;i++)seg.add(o==="h"?`${+x*f+i},${+y*f},h`:`${+x*f},${+y*f+i},v`)}
      st.segs=seg;st.feeds=new Set([...st.feeds].map(q=>q.split(",").map(v=>+v*f).join(",")));
      st.mids=new Set([...st.mids].map(q=>{const [x,y,o]=q.split(",");return `${+x*f+(o==="h"?Math.floor(f/2):0)},${+y*f+(o==="v"?Math.floor(f/2):0)},${o}`}));st.step=d}}
    // Raster des Zeichenmodus: vorhandene Stufe nehmen oder die nötige ergänzen
    const sel=$("gridStep");if(![...sel.options].some(o=>+o.value===st.step)){const o=document.createElement("option");o.value=String(st.step);o.textContent=(st.step/10).toLocaleString("de-DE")+" cm";sel.appendChild(o)}
    sel.value=String(st.step);$("areaW").value=String(Math.ceil(st.sArea[0]+0.6));$("areaH").value=String(Math.ceil(st.sArea[1]+0.6));
  }
  $("toDraw").onclick=()=>{setMode("draw");render();$("svgBox").scrollIntoView({block:"nearest"})};

  // ---------- Vorlagen (Maße in Metern, Linien als [x0,y0,x1,y1]) ----------
  const PRESETS={
    "gerade 3 m":{lines:[[0,1,3,1]],feeds:[[0,1]]},
    "L":{lines:[[0,0,3,0],[3,0,3,2]],feeds:[[0,0]]},
    "U":{lines:[[0,2,0,0],[0,0,3,0],[3,0,3,2]],feeds:[[0,2]]},
    "T":{lines:[[0,0,4,0],[2,0,2,2]],feeds:[[0,0]]},
    "Rahmen":{lines:[[0,0,4,0],[4,0,4,3],[4,3,0,3],[0,3,0,0]],mids:[[2,0]]},
    "H":{lines:[[0,0,0,3],[3,0,3,3],[0,1.5,3,1.5]],feeds:[[0,0]]},
    "8 (zwei Rahmen)":{lines:[[0,0,3,0],[3,0,3,4],[3,4,0,4],[0,4,0,0],[0,2,3,2]],mids:[[1.5,0]]},
    "Kreuz (X)":{lines:[[0,1.5,3,1.5],[1.5,0,1.5,3]],feeds:[[0,1.5]]},
    "H mit X statt Mittelsteg":{lines:[[0,0,0,3],[4,0,4,3],[0,1.5,4,1.5],[2,0,2,3]],feeds:[[0,0]]},
    "Katalogbeispiel EUTRAC":{lines:[[0,0,3,0],[0,0,0,2],[1.5,0,1.5,3],[0,2,3,2],[3,2,3,1]],feeds:[[3,0],[3,1],[1.5,3]]},
    "Schräge mit zwei Flex-Verbindern":{lines:[[0,0,2,0],[2,0,4,2],[4,2,6,2]],feeds:[[0,0]]},
    "Raute (gedreht, vier L-Verbinder)":{lines:[[2,0,4,2],[4,2,2,4],[2,4,0,2],[0,2,2,0]],mids:[[1,1]]},
    "H mit X, um 45° gedreht":{lines:[[1.5,0,0,1.5],[3.5,2,2,3.5],[0.75,0.75,2.75,2.75],[2.5,1,1,2.5]],feeds:[[1.5,0]]},
    "Achteck (acht Flex-Verbinder)":{lines:[[1,0,3,0],[3,0,4,1],[4,1,4,3],[4,3,3,4],[3,4,1,4],[1,4,0,3],[0,3,0,1],[0,1,1,0]],mids:[[2,0]]},
    "Rahmen mit abgeschrägter Ecke":{lines:[[0,0,3,0],[3,0,4,1],[4,1,4,3],[4,3,0,3],[0,3,0,0]],mids:[[1.5,3]]},
    "Gegenbeispiel: Rahmen mit X-Stummel":{lines:[[0,0.5,4,0.5],[4,0.5,4,3],[4,3,0,3],[0,3,0,0.5],[2,0,2,1.5]],feeds:[[2,1.5]]}
  };
  const psel=$("preset");Object.keys(PRESETS).forEach(n=>{const o=document.createElement("option");o.textContent=n;psel.appendChild(o)});
  psel.addEventListener("change",()=>{if(psel.value){loadPreset(psel.value);psel.value="";render()}});
  function loadPreset(name){
    const p=PRESETS[name];snapshot();
    const all=[...p.lines.flat(),...(p.feeds||[]).flat(),...(p.mids||[]).flat()];
    const step=[1000,500,250,100].find(s=>all.every(v=>Math.abs(v*1000/s-Math.round(v*1000/s))<1e-6));
    $("gridStep").value=String(step);st.step=step;
    st.segs=new Set();st.diags=new Set();st.flex=new Set();st.feeds=new Set();st.mids=new Set();st.autoFeed=null;
    const c=v=>Math.round(v*1000/step);
    p.lines.forEach(([a,b,x,y])=>addLine(c(a),c(b),c(x),c(y)));normalizeDiags();
    (p.feeds||[]).forEach(([x,y])=>st.feeds.add(c(x)+","+c(y)));
    (p.mids||[]).forEach(([x,y])=>{const h=`${c(x)},${c(y)},h`;if(st.segs.has(h))st.mids.add(h);else{const d=[...st.diags].find(d=>{const [a,b,e,f]=d.split(",").map(Number);return Math.abs((a+e)/2-c(x))<1e-6&&Math.abs((b+f)/2-c(y))<1e-6});if(d)st.mids.add(d)}});
    (p.flex||[]).forEach(([x,y])=>st.flex.add(c(x)+","+c(y)));
    const mx=Math.max(...p.lines.flatMap(l=>[l[0],l[2]])),my=Math.max(...p.lines.flatMap(l=>[l[1],l[3]]));
    $("areaW").value=String(Math.max(num($("areaW").value)||0,Math.ceil(mx+1)));$("areaH").value=String(Math.max(num($("areaH").value)||0,Math.ceil(my+1)));
  }
  function addLine(x0,y0,x1,y1){
    if(y0===y1)for(let x=Math.min(x0,x1);x<Math.max(x0,x1);x++)st.segs.add(`${x},${y0},h`);
    else if(x0===x1)for(let y=Math.min(y0,y1);y<Math.max(y0,y1);y++)st.segs.add(`${x0},${y},v`);
    else addDiag(x0,y0,x1,y1);
  }
  // Rasterwechsel: Form maßstabsgetreu umrechnen, soweit sie auf das neue Raster passt
  function rescale(old,nw){
    if(!st.segs.size&&!st.diags.size){st.step=nw;return}
    const f=old/nw, okInt=v=>Math.abs(v*f-Math.round(v*f))<1e-6;
    const L=layoutNow(old);
    const pts=[...L.nodes.flatMap(n=>[n.x,n.y]),...[...st.mids].map(m=>+m.split(",")[m.endsWith("h")?0:1])];
    if(!pts.every(okInt)){$("gridStep").value=String(old);alert("Die Form passt nicht auf dieses Raster. Bitte ein feineres Raster wählen.");return}
    snapshot();const segs=new Set();
    for(const s of st.segs){const [x,y,o]=s.split(",");const X=Math.round(+x*f),Y=Math.round(+y*f);
      if(f>=1){for(let i=0;i<f;i++)segs.add(o==="h"?`${X+i},${Y},h`:`${X},${Y+i},v`)} else if(okInt(o==="h"?+x:+y))segs.add(o==="h"?`${X},${Y},h`:`${X},${Y},v`)}
    st.segs=segs;
    st.diags=new Set([...st.diags].map(d=>d.split(",").map(v=>Math.round(+v*f)).join(",")));
    st.flex=new Set([...st.flex].map(p=>p.split(",").map(v=>Math.round(+v*f)).join(",")));
    st.feeds=new Set([...st.feeds].map(p=>{const [x,y]=p.split(",");return Math.round(+x*f)+","+Math.round(+y*f)}));
    st.mids=new Set([...st.mids].map(p=>{const [x,y,o]=p.split(",");return Math.round(+x*f)+","+Math.round(+y*f)+","+o}).filter(m=>m.split(",").length===4||segs.has(m)));
    st.step=nw;
  }

  // ---------- Hauptberechnung ----------
  function render(){renderCore();scheduleSave()}
  function renderCore(){
    st.shape=st.mode==="draw"?"draw":st.sshape==="gerade"?"straight":"simple";
    const draw=st.shape!=="straight", simple=st.shape==="simple";
    document.querySelectorAll(".simpleonly").forEach(el=>el.hidden=st.mode!=="simple");
    document.querySelectorAll(".straightonly").forEach(el=>el.hidden=st.shape!=="straight");
    document.querySelectorAll(".shapeonly").forEach(el=>el.hidden=!simple);
    document.querySelectorAll(".drawonly").forEach(el=>el.hidden=st.shape!=="draw");
    $("spacingRow").hidden=!/^(rod|rope)/.test($("mount").value);
    $("haveFeedRow").hidden=$("sideRow").hidden=st.feed==="mid";
    const err=$("errors");err.innerHTML="";
    const opts={color:$("color").value,maxM:+$("maxLen").value,mount:$("mount").value,spacing:+$("spacing").value};
    let layout,solved;
    if(!draw){
      const len=Math.round((num($("len").value)||0)*1000);
      if(len<300){err.innerHTML=`<p class="err">Bitte eine Schienenlänge ab 0,30 m eingeben.</p>`;clearOut();return}
      layout=E.straight(len,st.feed);solved=E.solve(layout,{firstSide:st.side});
      if(!solved.ok){err.innerHTML=solved.errors.map(e=>`<p class="err">${esc(e)}</p>`).join("");clearOut();return}
      outputs(layout,solved,opts);drawStraight(solved,len);
    }else{
      if(simple){const e=buildSimple();if(e){drawGrid(null,null);clearOut();err.innerHTML=`<p class="err">${esc(e)}</p>`;return}}
      else st.step=+$("gridStep").value;
      $("toolHint").textContent={draw:"Auf einen Rasterpunkt drücken und waagrecht oder senkrecht ziehen. Wo Schienen sich treffen, entstehen automatisch L-, T- oder X-Verbinder.",
        diag:"Von einem Rasterpunkt zu einem beliebigen anderen ziehen. Schräge Schienen werden über Flex-Verbinder (30° bis 330°) angeschlossen; die setzt der Planer automatisch.",
        flex:"Auf eine rechtwinklige Ecke tippen: Flex-Verbinder statt L-Verbinder (und zurück).",
        feed:"Auf einen Punkt der Schiene tippen: Einspeisung an/aus – am Ende als Einspeiser, an einem Verbinder über dessen Einspeisemöglichkeit. Zwischen zwei Rasterpunkten tippen: Mitteneinspeiser.",
        erase:"Auf eine Schiene tippen, um sie bis zum nächsten Verbinder zu löschen."}[st.tool];
      if(st.msg){$("toolHint").textContent=st.msg;st.msg=""}
      if(!st.segs.size&&!st.diags.size){drawGrid(null,null);clearOut();err.innerHTML=`<p class="fine">Noch keine Schiene gezeichnet. Ziehe eine Linie auf dem Raster oder wähle eine Vorlage.</p>`;return}
      layout=layoutNow(st.step);
      if(layout.crossings.length){drawGrid(layout,null);clearOut();err.innerHTML=`<p class="err">Eine schräge Schiene kreuzt eine andere Schiene ohne Verbinder (rot markiert). Schienen dürfen sich nur an Verbindern treffen; schräg geht das nur an freien Enden über Flex-Verbinder.</p>`;return}
      const short=layout.edges.filter(e=>e.len<100);
      solved=E.solve(JSON.parse(JSON.stringify(layout)));
      if(!solved.ok){drawGrid(layout,solved);clearOut();err.innerHTML=solved.errors.map(e=>`<p class="err">${esc(e)}</p>`).join("");return}
      solved.edges.forEach((e,i)=>{e.axis=layout.edges[i].axis;e.units=layout.edges[i].units});
      solved.hasFlex=solved.nodes.some(n=>n.type==="flex");
      outputs(layout,solved,opts,short);drawGrid(layout,solved);edgeList(solved);
    }
  }
  function clearOut(){$("checks").innerHTML="";$("bom").querySelector("tbody").innerHTML="";$("missing").innerHTML="";$("notes").innerHTML="";if(st.shape!=="straight")$("edgeList").innerHTML=""}

  function outputs(layout,solved,opts,short=[]){
    const b=E.bill(layout,solved,opts);
    const extra=short.map(e=>({ok:false,text:`Schiene zwischen ${e.a} und ${e.b} ist kürzer als 10 cm (Achsmaß ${fmtM(e.axis)}). Abstand vergrößern.`}));
    $("checks").innerHTML=[...b.checks,...extra].map(c=>`<li class="${c.ok?"ok":c.warn?"warn":"bad"}"><span aria-hidden="true">${c.ok?"✓":"!"}</span> ${esc(c.text)}</li>`).join("")+solved.warnings.map(w=>`<li class="warn"><span aria-hidden="true">!</span> ${esc(w)}</li>`).join("");
    $("bom").querySelector("tbody").innerHTML=b.items.map(it=>`<tr class="${st.have[it.key]?"have":""}">
      <td><input type="checkbox" data-have="${esc(it.key)}" ${st.have[it.key]?"checked":""} aria-label="${esc(it.name)} schon vorhanden"></td>
      <td class="n"><b>${it.qty}×</b></td><td>${esc(it.name)}${it.why.length?`<span class="why">${esc([...new Set(it.why)].join("; "))}</span>`:""}</td>
      <td class="mono">${esc(it.eutrac)}</td><td class="mono">${it.slv?esc(it.slv):'<span class="na">nicht bei SLV</span>'}</td></tr>`).join("");
    const miss=b.items.filter(it=>!st.have[it.key]);
    $("missing").innerHTML=Object.keys(st.have).some(k=>st.have[k])?(miss.length?`<b>Es fehlen noch:</b> ${miss.map(it=>`${it.qty}× ${esc(it.name)}`).join(", ")}`:`<b>Vollständig.</b> Du hast alle Teile beisammen.`):"";
    const ded=st.shape!=="straight"?[`Zuschnitt: Gezeichnet wird die Achse. Die Schienenlänge ergibt sich abzüglich Platzbedarf der Verbinder laut Katalog (L, T, X je 6 cm ab Mitte, Einspeiser 7,2 cm, Endkappe 0,65 cm).`]:[];
    if(solved.hasFlex)ded.push("Flex-Verbinder: Baulänge laut Katalog 80 bis 120 mm je nach Winkel; gerechnet ist mit 6 cm je Seite. Bei spitzen Winkeln wird er kürzer – schräge Schienen vor dem Zuschnitt am Bau nachmessen.");
    $("notes").innerHTML=[...ded,...b.notes,"Anschluss: 3 Stromkreise, je Stromkreis bis 3.600 W; am Drehstromnetz Einzelabsicherung 3 × 16 A, Zuleitung 5 × 1,5 mm² bis 5 × 2,5 mm². Anschluss nur durch eine Elektrofachkraft."].map(n=>`<li>${esc(n)}</li>`).join("");
  }

  // ---------- Zeichnung: gerade Schiene ----------
  function drawStraight(solved,len){
    const e=solved.edges[0], pieces=e.pieces, W=760, H=230, x0=70, x1=W-70, y=110, scale=(x1-x0)/len, flip=st.view==="below";
    const X=v=>flip?W-v:v, red=e.side==="N"?-7:7;
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grundriss der Schiene ${fmtM(len)}">`;
    s+=`<text x="${W/2}" y="22" class="tN" text-anchor="middle">${flip?"Blick von unten an die Decke":"Grundriss von oben, Öffnung der Schiene nach unten"}</text>`;
    let pos=0;
    pieces.forEach((p,i)=>{const isLast=i===pieces.length-1, real=isLast&&e.cutTo?e.cutTo:p;
      const a=X(x0+pos*scale), b=X(x0+(pos+real)*scale);
      s+=`<rect x="${Math.min(a,b)}" y="${y-14}" width="${Math.abs(b-a)}" height="28" class="rail"/>`;
      s+=`<text x="${(a+b)/2}" y="${y+4}" text-anchor="middle" class="tRail">${real===p?p/1000+" m":fmtM(real)+" (aus "+p/1000+" m)"}</text>`;
      pos+=real; if(!isLast){const j=X(x0+pos*scale);s+=`<line x1="${j}" y1="${y-20}" x2="${j}" y2="${y+20}" class="joint"/><text x="${j}" y="${y+36}" text-anchor="middle" class="tSmall">Längsverbinder</text>`}});
    s+=`<line x1="${X(x0)}" y1="${y+red}" x2="${X(x1)}" y2="${y+red}" class="sl"/>`;
    s+=`<text x="${X(x0+(x1-x0)*0.3)}" y="${y+(red<0?-24:34)}" text-anchor="middle" class="tSL">Schutzleiter</text>`;
    const endBox=(nx,node,isLeft)=>{const ox=X(nx), w=26, left=isLeft!==flip, bx=left?ox-w:ox;
      if(node.type==="feed"){s+=`<rect x="${bx}" y="${y-18}" width="${w}" height="36" class="feed"/>`;
        s+=`<text x="${ox+(left?-w/2:w/2)}" y="${y-28}" text-anchor="middle" class="tLab">Einspeiser</text><text x="${ox+(left?-w/2:w/2)}" y="${y+52}" text-anchor="middle" class="tSmall">SL ${node.variant}</text>`}
      else{s+=`<rect x="${left?ox-5:ox}" y="${y-15}" width="5" height="30" class="cap"/><text x="${ox+(left?-14:14)}" y="${y-24}" text-anchor="middle" class="tLab">Endkappe</text>`}};
    endBox(x0,solved.nodes.find(n=>n.id==="A"),true); endBox(x1,solved.nodes.find(n=>n.id==="B"),false);
    if(e.midFeed){const mx=X((x0+x1)/2);s+=`<rect x="${mx-12}" y="${y-18}" width="24" height="36" class="feed"/><text x="${mx}" y="${y-28}" text-anchor="middle" class="tLab">Mitteneinspeiser</text>`}
    s+=`<line x1="${X(x0)}" y1="${H-30}" x2="${X(x1)}" y2="${H-30}" class="dim"/><line x1="${X(x0)}" y1="${H-36}" x2="${X(x0)}" y2="${H-24}" class="dim"/><line x1="${X(x1)}" y1="${H-36}" x2="${X(x1)}" y2="${H-24}" class="dim"/>`;
    s+=`<text x="${W/2}" y="${H-12}" text-anchor="middle" class="tDim">Schiene ${fmtM(len)} (mit Einspeiser und Endkappe ca. ${fmtM(len+(e.midFeed?13:79))})</text></svg>`;
    $("svgBox").innerHTML=s;
    const fd=solved.nodes.find(n=>n.type==="feed");
    $("drawNote").textContent=e.midFeed?"Mitteneinspeiser: kann an beliebiger Stelle eingesetzt werden, die Schiene muss nicht geteilt werden. Beide Enden bekommen eine Endkappe.":
      `Rote Linie: Lage des Schutzleiters. Bei einer geraden Schiene kannst du die Seite frei wählen – sie bestimmt nur, ob du den Einspeiser „Schutzleiter rechts“ oder „links“ brauchst (hier: ${fd?fd.variant:"–"}). Wichtig ist, dass Schiene und Einspeiser beim Montieren zusammenpassen.`;
  }

  // ---------- Zeichnung: Editor ----------
  let G=null; // aktuelle Geometrie für die Zeigerauswertung
  function drawGrid(layout,solved){
    const ro=st.shape==="simple", step=st.step, aw=ro?st.sArea[0]:Math.max(1,num($("areaW").value)||6), ah=ro?st.sArea[1]:Math.max(1,num($("areaH").value)||4);
    const cols=Math.round(aw*1000/step), rows=Math.round(ah*1000/step);
    const pad=34, avail=Math.min(900,($("svgBox").clientWidth||900)-pad*2), cw=Math.max(0.2,Math.min(ro?120:60,ro?avail/cols:Math.floor(avail/cols)||avail/cols)), W=cols*cw+pad*2, H=rows*cw+pad*2, flip=st.view==="below";
    const PX=gx=>flip?W-(pad+gx*cw):pad+gx*cw, PY=gy=>pad+gy*cw;
    G={cw,pad,W,H,cols,rows,flip};
    let s=ro?`<svg viewBox="0 0 ${W} ${H}" id="edSvg" class="editor ro" role="img" aria-label="Grundriss der Schiene">`:`<svg viewBox="0 0 ${W} ${H}" id="edSvg" class="editor tool-${st.tool}" role="application" aria-label="Zeichenfläche für die Schienenform, Raster ${fmtM(step)}">`;
    s+=`<rect x="0" y="0" width="${W}" height="${H}" class="edbg"/>`;
    // Raster: Linien je Meter, Punkte je Rasterschritt
    const perM=1000/step;
    for(let m=0;m*perM<=cols+1e-9;m++){const x=PX(m*perM);s+=`<line x1="${x}" y1="${PY(0)}" x2="${x}" y2="${PY(rows)}" class="gm"/><text x="${x}" y="${PY(rows)+20}" text-anchor="middle" class="tG">${m} m</text>`}
    for(let m=0;m*perM<=rows+1e-9;m++){const y=PY(m*perM);s+=`<line x1="${Math.min(PX(0),PX(cols))}" y1="${y}" x2="${Math.max(PX(0),PX(cols))}" y2="${y}" class="gm"/><text x="${flip?W-pad+8:pad-8}" y="${y+4}" text-anchor="${flip?"start":"end"}" class="tG">${m}</text>`}
    if(cw>=10&&!ro){for(let i=0;i<=cols;i++)for(let j=0;j<=rows;j++)s+=`<circle cx="${PX(i)}" cy="${PY(j)}" r="1.2" class="gd"/>`}
    // Schienen (Ketten zwischen Knoten), Schutzleiter
    if(layout){
      const sideByUnit={}; if(solved&&solved.edges)solved.edges.forEach(e=>e.units&&e.units.forEach(u=>sideByUnit[u]=e.sl));
      for(const u of [...st.segs,...st.diags]){const q=u.split(",");let x1,y1,x2,y2;
        if(q.length===4){x1=PX(+q[0]);y1=PY(+q[1]);x2=PX(+q[2]);y2=PY(+q[3])}
        else{const x=+q[0],y=+q[1],o=q[2];x1=PX(x);y1=PY(y);x2=o==="h"?PX(x+1):PX(x);y2=o==="h"?PY(y):PY(y+1)}
        s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edrail"/>`;
        const sd=sideByUnit[u];if(sd){const dx=sd[0]*5*(flip?-1:1),dy=sd[1]*5;
          s+=`<line x1="${x1+dx}" y1="${y1+dy}" x2="${x2+dx}" y2="${y2+dy}" class="sl2"/>`}
        if(st.mids.has(u))s+=`<rect x="${(x1+x2)/2-9}" y="${(y1+y2)/2-9}" width="18" height="18" class="feed"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2+24}" text-anchor="middle" class="tLabS">Mitteneinspeiser</text>`;
      }
      // Längen je Schiene
      layout.edges.forEach(e=>{const a=layout.nodes.find(n=>n.id===e.a),b=layout.nodes.find(n=>n.id===e.b);
        const mx=(PX(a.x)+PX(b.x))/2,my=(PY(a.y)+PY(b.y))/2, horiz=a.y===b.y, vert=a.x===b.x;
        if(horiz||vert)s+=`<text x="${mx+(horiz?0:12)}" y="${my+(horiz?-12:4)}" text-anchor="${horiz?"middle":"start"}" class="tLen">${fmtM(e.axis)}</text>`;
        else{const dx=PX(b.x)-PX(a.x),dy=PY(b.y)-PY(a.y),l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l,sg=ny>0?-1:1;
          const ox=nx*12*sg,oy=ny*12*sg;s+=`<text x="${mx+ox}" y="${my+oy+4}" text-anchor="${ox>2?"start":ox<-2?"end":"middle"}" class="tLen">${fmtM(e.axis)}</text>`}});
      (layout.crossings||[]).forEach(c=>{const [x,y]=c.split(",").map(Number);s+=`<circle cx="${PX(x)}" cy="${PY(y)}" r="11" class="cross"/>`});
      // Knoten
      const conflictIds=new Set((solved&&solved.conflicts||[]).map(c=>c.node));
      const sn=solved&&solved.nodes?Object.fromEntries(solved.nodes.map(n=>[n.id,n])):{};
      layout.nodes.forEach(n=>{const x=PX(n.x),y=PY(n.y),v=sn[n.id],bad=conflictIds.has(n.id);
        const lab={feed:"Einspeiser",end:"",L:"L",T:"T",X:"X",flex:"Flex",I:"I"}[n.type]+(v&&v.variant&&n.type!=="end"?" "+short(v.variant,n.type):"")+(n.feedIn?" + Einspeisung":"");
        if(n.type==="end")s+=`<circle cx="${x}" cy="${y}" r="5" class="ednode end${bad?" bad":""}"/>`;
        else if(n.type==="feed")s+=`<rect x="${x-9}" y="${y-9}" width="18" height="18" class="feed${bad?" bad":""}"/>`;
        else if(n.type==="flex")s+=`<circle cx="${x}" cy="${y}" r="8.5" class="ednode${bad?" bad":""}"/>`;
        else s+=`<rect x="${x-8}" y="${y-8}" width="16" height="16" class="ednode${bad?" bad":""}"/>`;
        if(n.feedIn)s+=`<rect x="${x+5}" y="${y+5}" width="11" height="11" class="feed"/>`;
        if(lab.trim())s+=`<text x="${x+12}" y="${y-10}" class="tNode${bad?" bad":""}">${esc(lab)}</text>`;});
    }
    s+=`<line id="edPrev" x1="0" y1="0" x2="0" y2="0" class="edprev" visibility="hidden"/></svg>`;
    $("svgBox").innerHTML=s;
    $("drawNote").innerHTML=`<span class="leg"><i class="lr"></i>Schiene</span><span class="leg"><i class="ls"></i>Schutzleiter</span><span class="leg"><i class="lf"></i>Einspeiser</span><span class="leg"><i class="le"></i>Endkappe</span><span class="leg"><i class="lx"></i>Flex-Verbinder</span>`+(st.view==="below"?" Ansicht von unten (gespiegelt); die Teilenamen bleiben die des Katalogs.":"");
    if(!ro)bindEditor();
  }
  function short(v,t){if(t==="feed")return "SL "+v;if(t==="L"||t==="flex")return v;return v.replace("innen, ","innen ").replace("außen, ","außen ").replace("rechts","re").replace("links","li")}

  function edgeList(solved){
    $("edgeList").innerHTML=`<details><summary>Schienen und Verbinder im Einzelnen (${solved.edges.length} Schienen)</summary><ul>${solved.edges.map(e=>{
      const a=solved.nodes.find(n=>n.id===e.a),b=solved.nodes.find(n=>n.id===e.b);
      return `<li><b>${e.a} → ${e.b}</b>: Achse ${fmtM(e.axis)}, Schiene ${fmtM(e.len)}${e.pieces.length>1?` (aus ${e.pieces.map(p=>p/1000+" m").join(" + ")})`:e.cutTo?` (aus ${e.pieces[0]/1000} m)`:""}, Schutzleiter ${e.diag?`${e.side} in Richtung ${e.a} → ${e.b}`:({N:"oben",S:"unten",E:"rechts",W:"links"})[e.side]+" im Grundriss"}</li>`}).join("")}</ul>
      <ul>${solved.nodes.filter(n=>n.part).map(n=>`<li><b>${n.id}</b>: ${esc(E.PARTS[n.part].name)}</li>`).join("")}</ul></details>`;
  }

  // ---------- Zeiger: Zeichnen, Einspeisen, Löschen ----------
  function bindEditor(){
    const svg=$("edSvg");if(!svg)return;
    const toGrid=ev=>{const r=svg.getBoundingClientRect(),sx=G.W/r.width;let px=(ev.clientX-r.left)*sx,py=(ev.clientY-r.top)*sx;
      if(G.flip)px=G.W-px;const gx=(px-G.pad)/G.cw,gy=(py-G.pad)/G.cw;return {gx,gy,x:Math.max(0,Math.min(G.cols,Math.round(gx))),y:Math.max(0,Math.min(G.rows,Math.round(gy)))}};
    const pxOf=(x,y)=>({X:G.flip?G.W-(G.pad+x*G.cw):G.pad+x*G.cw,Y:G.pad+y*G.cw});
    let start=null;
    svg.onpointerdown=ev=>{ev.preventDefault();const p=toGrid(ev);
      if(st.tool==="draw"||st.tool==="diag"){start=p;svg.setPointerCapture(ev.pointerId)}
      else if(st.tool==="feed")toggleFeed(p);
      else if(st.tool==="flex")toggleFlex(p);
      else eraseAt(p)};
    const snapEnd=p=>{let x=p.x,y=p.y;if(st.tool==='draw'){if(Math.abs(x-start.x)>=Math.abs(y-start.y))y=start.y;else x=start.x}return {x,y}};
    svg.onpointermove=ev=>{if(!start)return;const {x,y}=snapEnd(toGrid(ev));
      const a=pxOf(start.x,start.y),b=pxOf(x,y),l=$("edPrev");l.setAttribute("x1",a.X);l.setAttribute("y1",a.Y);l.setAttribute("x2",b.X);l.setAttribute("y2",b.Y);l.setAttribute("visibility","visible")};
    svg.onpointerup=ev=>{if(!start)return;const {x,y}=snapEnd(toGrid(ev));
      if(x!==start.x||y!==start.y){snapshot();addLine(start.x,start.y,x,y);normalizeDiags();
        // Schiene an freies Ende ohne Einspeisung? Erste Schiene bekommt automatisch einen Einspeiser am Startpunkt
        const a=start.x+","+start.y,b=x+","+y;
        if(st.feeds.size===0&&st.mids.size===0){st.feeds.add(a);st.autoFeed=a}
        // Verlängert am Einspeiser? Einspeiser wandert ans neue freie Ende
        else for(const [from,to] of [[a,b],[b,a]])if(st.feeds.has(from)&&degree(from)===2&&degree(to)===1){
          st.feeds.delete(from);st.feeds.add(to);if(st.autoFeed===from)st.autoFeed=to;
          st.msg="Der Einspeiser ist ans neue Schienenende gewandert. Soll er am Verbinder bleiben: mit „Einspeisung“ auf den Verbinder tippen (Verbinder mit Einspeisemöglichkeit).";break}}
      start=null;render()};
    svg.onpointercancel=()=>{start=null;render()};
  }
  const nearestSeg=p=>{const fx=Math.floor(p.gx),fy=Math.floor(p.gy);
    const cands=[`${fx},${Math.round(p.gy)},h`,`${Math.round(p.gx)},${fy},v`];
    let best=null,bd=0.35;cands.forEach(c=>{if(!st.segs.has(c))return;const [x,y,o]=c.split(",");const d=o==="h"?Math.abs(p.gy-(+y)):Math.abs(p.gx-(+x));if(d<bd){bd=d;best=c}});
    // schräge Schienen: Abstand Punkt–Strecke
    for(const dg of st.diags){const [a,b,c,e]=dg.split(",").map(Number),vx=c-a,vy=e-b,t=Math.max(0,Math.min(1,((p.gx-a)*vx+(p.gy-b)*vy)/(vx*vx+vy*vy)));
      const d=Math.hypot(p.gx-(a+t*vx),p.gy-(b+t*vy));if(d<bd&&t>0.05&&t<0.95){bd=d;best=dg}}
    return best};
  function degree(pt){const [x,y]=pt.split(",").map(Number);let n=[`${x},${y},h`,`${x-1},${y},h`,`${x},${y},v`,`${x},${y-1},v`].filter(s=>st.segs.has(s)).length;
    for(const d of st.diags){const q=d.split(",");if(q[0]+","+q[1]===pt||q[2]+","+q[3]===pt)n++}return n}
  function toggleFlex(p){
    const pt=p.x+","+p.y;if(Math.hypot(p.gx-p.x,p.gy-p.y)>=0.4)return;
    const n=layoutNow(st.step).nodes.find(n=>n.key===pt);
    if(!n||(n.type!=="L"&&!(n.type==="flex"&&st.flex.has(pt)))){$("toolHint").textContent=n&&n.type==="flex"?"Hier sitzt schon ein Flex-Verbinder, weil eine schräge Schiene anschließt.":"Ein Flex-Verbinder ersetzt nur einen L-Verbinder an einer rechtwinkligen Ecke. Für schräge Schienen das Werkzeug „Schräg ziehen“ nehmen.";return}
    snapshot();st.flex.has(pt)?st.flex.delete(pt):st.flex.add(pt);render()}
  // Einspeisung setzen/entfernen: an jedem Schienenpunkt (Ende → Einspeiser, Verbinder → mit Einspeisemöglichkeit,
  // mitten in gerader Linie → I-Verbinder), zwischen Rasterpunkten → Mitteneinspeiser.
  // Der beim ersten Strich automatisch gesetzte Einspeiser fällt weg, sobald man selbst eine Einspeisung setzt.
  function dropAuto(except){if(st.autoFeed&&st.autoFeed!==except){st.feeds.delete(st.autoFeed);st.msg="Der automatisch gesetzte Einspeiser wurde entfernt."}st.autoFeed=null}
  function toggleFeed(p){
    const pt=p.x+","+p.y, near=Math.hypot(p.gx-p.x,p.gy-p.y)<0.3;
    if(near&&degree(pt)>=1){snapshot();if(st.feeds.has(pt)){st.feeds.delete(pt);if(st.autoFeed===pt)st.autoFeed=null}else{dropAuto(pt);st.feeds.add(pt)}render();return}
    const sg=nearestSeg(p);if(sg){snapshot();if(st.mids.has(sg))st.mids.delete(sg);else{dropAuto();st.mids.add(sg)}render()}
  }
  function eraseAt(p){
    const sg=nearestSeg(p);if(!sg)return;snapshot();
    // ganze Kette bis zu den nächsten Knoten löschen
    const L=layoutNow(st.step);const e=L.edges.find(e=>e.units.includes(sg));
    (e?e.units:[sg]).forEach(u=>{st.segs.delete(u);st.diags.delete(u);st.mids.delete(u)});
    // Einspeiser an Punkten, die kein freies Ende mehr sind, entfernen
    [...st.feeds].forEach(f=>{if(degree(f)===0)st.feeds.delete(f)});
    render();
  }


  // ---------- Speichern im Lichtplan (Merkliste: lokal im Browser oder gemeinsame Liste per Link) ----------
  const S=window.MerklisteStore, qs=new URLSearchParams(location.search);
  let db=null, rooms=[], plans=[], assigns=[], cur=null, lastSaved="", saveT=null, initDone=false, applying=false, wantRoom=qs.get("raum")||"";
  const setStatus=(t,cls="")=>{const el=$("saveStatus");el.textContent=t;el.className="fine"+(cls?" "+cls:"")};
  const where=()=>db&&db.mode==="shared"?"in der gemeinsamen Liste":"in der Merkliste dieses Browsers";
  function toPlan(){
    const o={maxLen:$("maxLen").value,color:$("color").value,mount:$("mount").value,spacing:$("spacing").value};
    const hv=Object.keys(st.have).filter(k=>st.have[k]);
    if(st.shape==="straight")return {m:"s",len:Math.round((num($("len").value)||0)*1000),feed:st.feed,side:st.side,o,hv};
    if(st.shape==="simple"){buildSimple();return {m:"d",st:st.step,l:E.segsToLines(st.segs,st.diags),fx:[],fd:[...st.feeds].map(p=>p.split(",").map(Number)),md:[...st.mids],a:st.sArea,simple:st.simple,o,hv}}
    return {m:"d",st:+$("gridStep").value,l:E.segsToLines(st.segs,st.diags),fx:[...st.flex].map(p=>p.split(",").map(Number)),
      fd:[...st.feeds].map(p=>p.split(",").map(Number)),md:[...st.mids],a:[num($("areaW").value)||6,num($("areaH").value)||4],o,hv};
  }
  const keyNow=()=>JSON.stringify([toPlan(),$("planName").value.trim(),$("planRoom").value]);
  function applyPlan(p){
    applying=true;
    const o=p.o||{};["maxLen","color","mount","spacing"].forEach(k=>{if(o[k]!=null)$(k).value=String(o[k])});
    st.have={};(p.hv||[]).forEach(k=>st.have[k]=true);
    st.mode=p.m==="s"||p.simple?"simple":"draw";st.drawStash=null;
    if(p.m==="s")st.sshape="gerade";
    if(p.simple&&SHAPES[p.simple.s]){st.sshape=p.simple.s;st.dims[st.sshape]={A:String(p.simple.A/1000).replace(".",","),B:String(p.simple.B/1000).replace(".",",")};st.sfeed[st.sshape]=p.simple.f}
    document.querySelectorAll("[data-mode]").forEach(x=>x.setAttribute("aria-checked",x.dataset.mode===st.mode));renderShapeCards();renderDimFields();
    if(p.m==="s"){$("len").value=String((p.len||3000)/1000).replace(".",",");st.feed=p.feed||"left";st.side=p.side||"S";$("haveFeed").value="";
      document.querySelectorAll("[data-feed]").forEach(x=>x.setAttribute("aria-checked",x.dataset.feed===st.feed))}
    else if(!p.simple){const g=E.planSegs(p);st.segs=g.segs;st.diags=g.diags;st.flex=g.flex;st.feeds=g.feeds;st.mids=g.mids;st.step=p.st||500;$("gridStep").value=String(st.step);
      if(p.a){$("areaW").value=String(p.a[0]).replace(".",",");$("areaH").value=String(p.a[1]).replace(".",",")}}
    st.undo=[];st.autoFeed=null;applying=false;
  }
  function openPlan(id){
    const p=plans.find(x=>x.id===id);if(!p)return false;
    cur=id;wantRoom=p.raum;applyPlan(p.plan||{});$("planName").value=p.name||"Schiene";renderSaveBox();
    lastSaved=keyNow();renderCore();
    history.replaceState(null,"","?plan="+encodeURIComponent(id)+location.hash);
    setStatus(`Gespeichert ${where()}, Raum „${(rooms.find(r=>r.id===p.raum)||{}).name||"?"}“. Änderungen werden automatisch gespeichert.`,"ok");
    return true;
  }
  function scheduleSave(){
    if(!cur||applying||!db)return;
    const key=keyNow();if(key===lastSaved)return;
    clearTimeout(saveT);saveT=setTimeout(async()=>{saveT=null;const [plan,name,raum]=JSON.parse(key),prev=lastSaved;
      if(!raum){setStatus("Bitte einen Raum wählen.","bad");return}
      lastSaved=key;
      try{await db.doc("schienen/"+cur).update({plan,name:name||"Schiene",raum});
        setStatus(`Gespeichert ${where()} um ${new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}.`,"ok")}
      catch(e){lastSaved=prev;setStatus(e&&e.message&&["too_large","conflict","forbidden","not_found","network"].includes(e.code)?e.message:"Speichern fehlgeschlagen.","bad")}},600);
  }
  function renderSaveBox(){
    const sel=$("planRoom"),val=cur?(plans.find(p=>p.id===cur)||{}).raum||sel.value:(wantRoom||sel.value);
    sel.innerHTML=`<option value="">Raum wählen …</option>`+rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")+`<option value="__new">+ Neuer Raum …</option>`;
    sel.value=rooms.some(r=>r.id===val)?val:"";
    $("planSave").hidden=!!cur;$("planNew").hidden=$("planDel").hidden=!cur;
    const op=$("planOpen");$("planOpenRow").hidden=!plans.length;
    op.innerHTML=`<option value="">${plans.length} ${plans.length===1?"Plan":"Pläne"} – öffnen …</option>`+rooms.map(r=>{const ps=plans.filter(p=>p.raum===r.id);
      return ps.length?`<optgroup label="${esc(r.name)}">${ps.map(p=>`<option value="${esc(p.id)}"${p.id===cur?" disabled":""}>${esc(p.name||"Schiene")}${p.id===cur?" (geöffnet)":""}</option>`).join("")}</optgroup>`:""}).join("");
  }
  const slug=s=>s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"raum";
  $("planRoom").addEventListener("change",async e=>{
    if(e.target.value==="__new"){const name=(prompt("Name des neuen Raums")||"").trim();
      if(!name){renderSaveBox();return}
      const id=slug(name)+"-"+Date.now().toString(36);
      try{await db.doc("raeume/"+id).set({name,gruppen:["Decke"],pos:Date.now()});wantRoom=id;renderSaveBox();$("planRoom").value=id}
      catch(err){setStatus(err.message||"Raum konnte nicht angelegt werden.","bad");renderSaveBox();return}}
    wantRoom=$("planRoom").value;scheduleSave()});
  $("planName").addEventListener("input",scheduleSave);
  $("planSave").onclick=async()=>{
    const raum=$("planRoom").value;if(!raum){setStatus("Bitte zuerst einen Raum wählen oder anlegen.","bad");$("planRoom").focus();return}
    const id="s"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),plan=toPlan(),name=$("planName").value.trim()||"Schiene";
    try{await db.doc("schienen/"+id).set({raum,name,plan,t:Date.now()});cur=id;lastSaved=keyNow();renderSaveBox();
      history.replaceState(null,"","?plan="+id+location.hash);
      setStatus(`Gespeichert ${where()}, Raum „${rooms.find(r=>r.id===raum).name}“. Ab jetzt wird jede Änderung automatisch gespeichert.`,"ok")}
    catch(e){setStatus(e.message||"Speichern fehlgeschlagen.","bad")}};
  $("planNew").onclick=()=>{cur=null;lastSaved="";history.replaceState(null,"",location.pathname+location.hash);
    const n=plans.filter(p=>p.raum===$("planRoom").value).length+1;$("planName").value="Schiene "+n;
    snapshot();st.segs.clear();st.diags.clear();st.flex.clear();st.feeds.clear();st.mids.clear();st.have={};
    renderSaveBox();render();setStatus("Neuer Plan – noch nicht gespeichert.")};
  $("planDel").onclick=async()=>{if(!cur||!confirm(`Plan „${$("planName").value}“ aus dem Lichtplan löschen? Die Zeichnung bleibt hier stehen, bis du die Seite verlässt.`))return;
    try{await db.doc("schienen/"+cur).delete();cur=null;lastSaved="";history.replaceState(null,"",location.pathname+location.hash);renderSaveBox();setStatus("Plan gelöscht.")}
    catch(e){setStatus(e.message||"Löschen fehlgeschlagen.","bad")}};
  $("planOpen").addEventListener("change",e=>{const id=e.target.value;if(id){clearTimeout(saveT);openPlan(id);render()}});

  function askPassword(wrong){return new Promise(resolve=>{
    const dlg=$("pwDlg"),inp=$("pwInput"),f=$("pwForm");inp.value="";$("pwErr").hidden=!wrong;
    const finish=v=>{f.onsubmit=null;$("pwCancel").onclick=null;dlg.close();resolve(v)};
    f.onsubmit=e=>{e.preventDefault();finish(inp.value)};$("pwCancel").onclick=()=>finish(null);
    dlg.oncancel=e=>{e.preventDefault();finish(null)};dlg.showModal();inp.focus()})}
  async function openStore(){
    if(!S){$("saveBox").hidden=true;return}
    let link=S.parseLink(location.hash);if(!link){const rem=S.rememberedShared();link=rem&&S.parseLink(rem)}
    if(link&&S.configured()){setStatus("Gemeinsame Liste wird geöffnet …");
      try{db=await S.openShared(link,askPassword)}
      catch(e){db=S.openLocal();setStatus("Die gemeinsame Liste konnte nicht geöffnet werden. Gespeichert wird in der Merkliste dieses Browsers.","bad")}}
    else db=S.openLocal();
    if(db.mode==="shared"&&$("saveStatus").textContent.endsWith("…"))setStatus("Gemeinsame Liste geöffnet. Gespeicherte Pläne sehen alle, die den Link haben.");
    if(db.mode==="shared"&&db.link){const h=new URL(db.link).hash;$("tabLamps").href="./"+h;$("tabRails").href="schiene.html"+h;$("tabPlace").href="belegung.html"+h}
    if(window.ShareUI)ShareUI.mount({getDb:()=>db,status:t=>setStatus(t),
      beforeSwitch:()=>cur||!(st.segs.size||st.diags.size)||confirm("Die Zeichnung ist noch keinem Raum zugeordnet und geht beim Wechsel der Liste verloren. Trotzdem fortfahren?")});
    if(db.mode==="local"&&!db.persistent)setStatus("Cookies sind blockiert: Pläne bleiben nur bis zum Neuladen erhalten.","bad");
    const guide=()=>{if(window.Guide)Guide.update({rooms,assigns,rails:plans,hash:db.mode==="shared"&&db.link?new URL(db.link).hash:""})};
    db.collection("raeume").onSnapshot(sn=>{rooms=sn.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.pos||0)-(b.pos||0));renderSaveBox();guide()});
    db.collection("zuordnung").onSnapshot(sn=>{assigns=sn.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.leuchte&&a.raum);guide()});
    db.collection("schienen").onSnapshot(sn=>{plans=sn.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.t||0)-(b.t||0));
      if(!initDone){initDone=true;const id=qs.get("plan");
        if(id&&!openPlan(id))setStatus("Dieser Schienenplan ist in der geöffneten Merkliste nicht (mehr) vorhanden.","bad");
        else if(!id&&wantRoom){const n=plans.filter(p=>p.raum===wantRoom).length+1;$("planName").value="Schiene "+n;
          renderCore()}}
      else if(cur){const p=plans.find(x=>x.id===cur);
        if(!p){cur=null;lastSaved="";history.replaceState(null,"",location.pathname+location.hash);setStatus("Dieser Plan wurde inzwischen gelöscht. Die Zeichnung bleibt hier, ist aber nicht mehr gespeichert.","bad")}
        else{const k=JSON.stringify([p.plan,p.name,p.raum]);
          if(k!==lastSaved&&!saveT){applyPlan(p.plan||{});$("planName").value=p.name||"Schiene";wantRoom=p.raum;renderSaveBox();lastSaved=keyNow();renderCore();
            setStatus("Von jemand anderem geändert – Ansicht aktualisiert.","ok")}}}
      renderSaveBox();guide()});
    if(db.onRemoteChange)db.onRemoteChange(e=>{if(e&&e.code==="not_found")setStatus("Die gemeinsame Liste wurde gelöscht.","bad")});
  }
  // Schräge Linien an Rasterpunkten teilen, an denen andere Schienen enden oder kreuzen → dort entsteht ein Verbinder
  function addDiag(x0,y0,x1,y1){st.diags.add(x0<x1||(x0===x1&&y0<y1)?`${x0},${y0},${x1},${y1}`:`${x1},${y1},${x0},${y0}`)}
  function normalizeDiags(){
    const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a);
    const lat=d=>{const [a,b,c,e]=d.split(",").map(Number),g=gcd(c-a,e-b),r=[];for(let i=1;i<g;i++)r.push((a+(c-a)*i/g)+","+(b+(e-b)*i/g));return r};
    for(let guard=0;guard<500;guard++){
      const pts=new Set();for(const u of st.segs){const [x,y,o]=u.split(",");pts.add(x+","+y);pts.add(o==="h"?(+x+1)+","+y:x+","+(+y+1))}
      for(const d of st.diags){const q=d.split(",");pts.add(q[0]+","+q[1]);pts.add(q[2]+","+q[3])}
      const cnt={};for(const d of st.diags)lat(d).forEach(k=>cnt[k]=(cnt[k]||0)+1);
      let hit=null,cut=null;
      for(const d of st.diags){cut=lat(d).find(k=>pts.has(k)||cnt[k]>1);if(cut){hit=d;break}}
      if(!hit)return;
      const [a,b,c,e]=hit.split(",").map(Number),[mx,my]=cut.split(",").map(Number);
      st.diags.delete(hit);addDiag(a,b,mx,my);addDiag(mx,my,c,e);
      if(st.mids.has(hit)){st.mids.delete(hit);st.mids.add(a<mx||(a===mx&&b<my)?`${a},${b},${mx},${my}`:`${mx},${my},${a},${b}`)}
    }
  }
  function layoutNow(step){return E.fromSegments(st.segs,st.feeds,st.mids,step,{diags:st.diags,flex:st.flex})}
  let rz;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(st.shape!=="straight")render()},150)});
  renderShapeCards();renderDimFields();
  render();
  openStore();
  ["tourBtn","tourLink"].forEach(id=>{const el=$(id);if(el)el.onclick=()=>window.Tour&&window.Tour.start()});
  if(window.Tour)window.Tour.auto();
})();
