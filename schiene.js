// Oberfläche des Schienenplaners: gerade Schiene (Länge eingeben) oder Form zeichnen. Rechnet mit schiene-engine.js.
(function(){
  const E=window.SchienenEngine, $=id=>document.getElementById(id);
  const st={shape:"straight",feed:"left",side:"S",view:"top",have:{},tool:"draw",
    segs:new Set(),feeds:new Set(),mids:new Set(),undo:[]};
  const fmtM=mm=>(mm/1000).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" m";
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const num=v=>parseFloat(String(v).replace(",","."));
  const RED="#D7262E";

  // ---------- Bedienelemente ----------
  function radio(sel,attr,cb){document.querySelectorAll(sel).forEach(b=>b.addEventListener("click",()=>{if(b.disabled)return;
    document.querySelectorAll(sel).forEach(x=>x.setAttribute("aria-checked",x===b));cb(b.dataset[attr]);render()}))}
  radio("[data-feed]","feed",v=>{st.feed=v;applyHave()});
  radio("[data-shape]","shape",v=>{st.shape=v;if(v==="draw"&&!st.segs.size)loadPreset("H mit X statt Mittelsteg")});
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{st.view=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{st.tool=b.dataset.tool;document.querySelectorAll("[data-tool]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  ["len","maxLen","color","mount","spacing"].forEach(id=>$(id).addEventListener("input",render));
  ["areaW","areaH"].forEach(id=>$(id).addEventListener("change",render));
  $("gridStep").addEventListener("change",()=>{const old=st.step||500,nw=+$("gridStep").value;rescale(old,nw);render()});
  $("flip").onclick=()=>{st.side=st.side==="N"?"S":"N";$("haveFeed").value="";render()};
  $("haveFeed").addEventListener("input",()=>{applyHave();render()});
  $("printBtn").onclick=()=>window.print();
  $("undo").onclick=()=>{const s=st.undo.pop();if(s){restore(s);render()}};
  $("clearAll").onclick=()=>{snapshot();st.segs.clear();st.feeds.clear();st.mids.clear();render()};
  $("bom").addEventListener("change",e=>{const k=e.target.dataset.have;if(k){st.have[k]=e.target.checked;render()}});

  function applyHave(){
    const v=$("haveFeed").value;if(!v||st.feed==="mid")return;
    const dir=st.feed==="left"?"E":"W", right=E.RIGHT[dir];
    st.side=v==="rechts"?right:(right==="S"?"N":"S");
  }
  const snapshot=()=>{st.undo.push({segs:[...st.segs],feeds:[...st.feeds],mids:[...st.mids]});if(st.undo.length>60)st.undo.shift()};
  const restore=s=>{st.segs=new Set(s.segs);st.feeds=new Set(s.feeds);st.mids=new Set(s.mids)};

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
    "Gegenbeispiel: Rahmen mit X-Stummel":{lines:[[0,0.5,4,0.5],[4,0.5,4,3],[4,3,0,3],[0,3,0,0.5],[2,0,2,1.5]],feeds:[[2,1.5]]}
  };
  const psel=$("preset");Object.keys(PRESETS).forEach(n=>{const o=document.createElement("option");o.textContent=n;psel.appendChild(o)});
  psel.addEventListener("change",()=>{if(psel.value){loadPreset(psel.value);psel.value="";render()}});
  function loadPreset(name){
    const p=PRESETS[name];snapshot();
    const all=[...p.lines.flat(),...(p.feeds||[]).flat(),...(p.mids||[]).flat()];
    const step=[1000,500,250,100].find(s=>all.every(v=>Math.abs(v*1000/s-Math.round(v*1000/s))<1e-6));
    $("gridStep").value=String(step);st.step=step;
    st.segs=new Set();st.feeds=new Set();st.mids=new Set();
    const c=v=>Math.round(v*1000/step);
    p.lines.forEach(([a,b,x,y])=>addLine(c(a),c(b),c(x),c(y)));
    (p.feeds||[]).forEach(([x,y])=>st.feeds.add(c(x)+","+c(y)));
    (p.mids||[]).forEach(([x,y])=>st.mids.add(c(x)+","+c(y)+",h"));
    const mx=Math.max(...p.lines.flatMap(l=>[l[0],l[2]])),my=Math.max(...p.lines.flatMap(l=>[l[1],l[3]]));
    $("areaW").value=String(Math.max(num($("areaW").value)||0,Math.ceil(mx+1)));$("areaH").value=String(Math.max(num($("areaH").value)||0,Math.ceil(my+1)));
  }
  function addLine(x0,y0,x1,y1){
    if(y0===y1)for(let x=Math.min(x0,x1);x<Math.max(x0,x1);x++)st.segs.add(`${x},${y0},h`);
    else if(x0===x1)for(let y=Math.min(y0,y1);y<Math.max(y0,y1);y++)st.segs.add(`${x0},${y},v`);
  }
  // Rasterwechsel: Form maßstabsgetreu umrechnen, soweit sie auf das neue Raster passt
  function rescale(old,nw){
    if(!st.segs.size){st.step=nw;return}
    const f=old/nw, okInt=v=>Math.abs(v*f-Math.round(v*f))<1e-6;
    const L=E.fromSegments(st.segs,st.feeds,st.mids,old);
    const pts=[...L.nodes.flatMap(n=>[n.x,n.y]),...[...st.mids].map(m=>+m.split(",")[m.endsWith("h")?0:1])];
    if(!pts.every(okInt)){$("gridStep").value=String(old);alert("Die Form passt nicht auf dieses Raster. Bitte ein feineres Raster wählen.");return}
    snapshot();const segs=new Set();
    for(const s of st.segs){const [x,y,o]=s.split(",");const X=Math.round(+x*f),Y=Math.round(+y*f);
      if(f>=1){for(let i=0;i<f;i++)segs.add(o==="h"?`${X+i},${Y},h`:`${X},${Y+i},v`)} else if(okInt(o==="h"?+x:+y))segs.add(o==="h"?`${X},${Y},h`:`${X},${Y},v`)}
    st.segs=segs;
    st.feeds=new Set([...st.feeds].map(p=>{const [x,y]=p.split(",");return Math.round(+x*f)+","+Math.round(+y*f)}));
    st.mids=new Set([...st.mids].map(p=>{const [x,y,o]=p.split(",");return Math.round(+x*f)+","+Math.round(+y*f)+","+o}).filter(m=>segs.has(m)));
    st.step=nw;
  }

  // ---------- Hauptberechnung ----------
  function render(){
    const draw=st.shape==="draw";
    document.querySelectorAll(".straightonly").forEach(el=>el.hidden=draw);
    document.querySelectorAll(".drawonly").forEach(el=>el.hidden=!draw);
    $("shapeHint").textContent=draw?"Ziehe Schienen auf dem Raster (Maus oder Finger). Verbinder, Endkappen und Varianten setzt der Planer automatisch.":"Für eine einzelne gerade Schiene. Für L, T, U, H, X, Rahmen und andere Formen: „Form zeichnen“.";
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
      st.step=+$("gridStep").value;
      $("toolHint").textContent={draw:"Auf einen Rasterpunkt drücken und waagrecht oder senkrecht ziehen. Wo Schienen sich treffen, entstehen automatisch L-, T- oder X-Verbinder.",
        feed:"Auf ein freies Schienenende tippen: Einspeiser an/aus. Auf eine Schiene tippen: Mitteneinspeiser an/aus.",
        erase:"Auf eine Schiene tippen, um sie bis zum nächsten Verbinder zu löschen."}[st.tool];
      if(!st.segs.size){drawGrid(null,null);clearOut();err.innerHTML=`<p class="fine">Noch keine Schiene gezeichnet. Ziehe eine Linie auf dem Raster oder wähle eine Vorlage.</p>`;return}
      layout=E.fromSegments(st.segs,st.feeds,st.mids,st.step);
      const short=layout.edges.filter(e=>e.len<100);
      solved=E.solve(JSON.parse(JSON.stringify(layout)));
      if(!solved.ok){drawGrid(layout,solved);clearOut();err.innerHTML=solved.errors.map(e=>`<p class="err">${esc(e)}</p>`).join("");return}
      solved.edges.forEach((e,i)=>{e.axis=layout.edges[i].axis;e.units=layout.edges[i].units});
      outputs(layout,solved,opts,short);drawGrid(layout,solved);edgeList(solved);
    }
  }
  function clearOut(){$("checks").innerHTML="";$("bom").querySelector("tbody").innerHTML="";$("missing").innerHTML="";$("notes").innerHTML="";if(st.shape==="draw")$("edgeList").innerHTML=""}

  function outputs(layout,solved,opts,short=[]){
    const b=E.bill(layout,solved,opts);
    const extra=short.map(e=>({ok:false,text:`Schiene zwischen ${e.a} und ${e.b} ist kürzer als 10 cm (Achsmaß ${fmtM(e.axis)}). Abstand vergrößern.`}));
    $("checks").innerHTML=[...b.checks,...extra].map(c=>`<li class="${c.ok?"ok":c.warn?"warn":"bad"}"><span aria-hidden="true">${c.ok?"✓":"!"}</span> ${esc(c.text)}</li>`).join("")+solved.warnings.map(w=>`<li class="warn"><span aria-hidden="true">!</span> ${esc(w)}</li>`).join("");
    $("bom").querySelector("tbody").innerHTML=b.items.map(it=>`<tr class="${st.have[it.key]?"have":""}">
      <td><input type="checkbox" data-have="${it.key}" ${st.have[it.key]?"checked":""} aria-label="${esc(it.name)} schon vorhanden"></td>
      <td class="n"><b>${it.qty}×</b></td><td>${esc(it.name)}${it.why.length?`<span class="why">${esc([...new Set(it.why)].join("; "))}</span>`:""}</td>
      <td class="mono">${esc(it.eutrac)}</td><td class="mono">${it.slv?esc(it.slv):'<span class="na">nicht bei SLV</span>'}</td></tr>`).join("");
    const miss=b.items.filter(it=>!st.have[it.key]);
    $("missing").innerHTML=Object.keys(st.have).some(k=>st.have[k])?(miss.length?`<b>Es fehlen noch:</b> ${miss.map(it=>`${it.qty}× ${esc(it.name)}`).join(", ")}`:`<b>Vollständig.</b> Du hast alle Teile beisammen.`):"";
    const ded=st.shape==="draw"?[`Zuschnitt: Gezeichnet wird die Achse. Die Schienenlänge ergibt sich abzüglich Platzbedarf der Verbinder laut Katalog (L, T, X je 6 cm ab Mitte, Einspeiser 7,2 cm, Endkappe 0,65 cm).`]:[];
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
    const step=st.step, aw=Math.max(1,num($("areaW").value)||6), ah=Math.max(1,num($("areaH").value)||4);
    const cols=Math.round(aw*1000/step), rows=Math.round(ah*1000/step);
    const pad=34, avail=Math.min(900,($("svgBox").clientWidth||900)-pad*2), cw=Math.max(8,Math.min(60,Math.floor(avail/cols))), W=cols*cw+pad*2, H=rows*cw+pad*2, flip=st.view==="below";
    const PX=gx=>flip?W-(pad+gx*cw):pad+gx*cw, PY=gy=>pad+gy*cw;
    G={cw,pad,W,H,cols,rows,flip};
    let s=`<svg viewBox="0 0 ${W} ${H}" id="edSvg" class="editor tool-${st.tool}" role="application" aria-label="Zeichenfläche für die Schienenform, Raster ${fmtM(step)}">`;
    s+=`<rect x="0" y="0" width="${W}" height="${H}" class="edbg"/>`;
    // Raster: Linien je Meter, Punkte je Rasterschritt
    const perM=1000/step;
    for(let i=0;i<=cols;i++){const x=PX(i);if(i%perM===0){s+=`<line x1="${x}" y1="${PY(0)}" x2="${x}" y2="${PY(rows)}" class="gm"/><text x="${x}" y="${PY(rows)+20}" text-anchor="middle" class="tG">${i/perM} m</text>`}}
    for(let j=0;j<=rows;j++){const y=PY(j);if(j%perM===0){s+=`<line x1="${Math.min(PX(0),PX(cols))}" y1="${y}" x2="${Math.max(PX(0),PX(cols))}" y2="${y}" class="gm"/><text x="${flip?W-pad+8:pad-8}" y="${y+4}" text-anchor="${flip?"start":"end"}" class="tG">${j/perM}</text>`}}
    if(cw>=10){for(let i=0;i<=cols;i++)for(let j=0;j<=rows;j++)s+=`<circle cx="${PX(i)}" cy="${PY(j)}" r="1.2" class="gd"/>`}
    // Schienen (Ketten zwischen Knoten), Schutzleiter
    if(layout){
      const sideByUnit={}; if(solved&&solved.edges)solved.edges.forEach(e=>e.units&&e.units.forEach(u=>sideByUnit[u]=e.side));
      for(const u of st.segs){const [x,y,o]=u.split(",").map((v,i)=>i<2?+v:v);
        const x1=PX(x),y1=PY(y),x2=o==="h"?PX(x+1):PX(x),y2=o==="h"?PY(y):PY(y+1);
        s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edrail"/>`;
        const sd=sideByUnit[u];if(sd){let dx=0,dy=0;if(sd==="N")dy=-5;if(sd==="S")dy=5;if(sd==="E")dx=flip?-5:5;if(sd==="W")dx=flip?5:-5;
          s+=`<line x1="${x1+dx}" y1="${y1+dy}" x2="${x2+dx}" y2="${y2+dy}" class="sl2"/>`}
        if(st.mids.has(u))s+=`<rect x="${(x1+x2)/2-9}" y="${(y1+y2)/2-9}" width="18" height="18" class="feed"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-14}" text-anchor="middle" class="tLabS">Mitteneinspeiser</text>`;
      }
      // Längen je Schiene
      layout.edges.forEach(e=>{const a=layout.nodes.find(n=>n.id===e.a),b=layout.nodes.find(n=>n.id===e.b);
        const mx=(PX(a.x)+PX(b.x))/2,my=(PY(a.y)+PY(b.y))/2, horiz=a.y===b.y;
        s+=`<text x="${mx+(horiz?0:12)}" y="${my+(horiz?-12:4)}" text-anchor="${horiz?"middle":"start"}" class="tLen">${fmtM(e.axis)}</text>`});
      // Knoten
      const conflictIds=new Set((solved&&solved.conflicts||[]).map(c=>c.node));
      const sn=solved&&solved.nodes?Object.fromEntries(solved.nodes.map(n=>[n.id,n])):{};
      layout.nodes.forEach(n=>{const x=PX(n.x),y=PY(n.y),v=sn[n.id],bad=conflictIds.has(n.id);
        const lab={feed:"Einspeiser",end:"",L:"L",T:"T",X:"X"}[n.type]+(v&&v.variant&&n.type!=="end"?" "+short(v.variant,n.type):"");
        if(n.type==="end")s+=`<circle cx="${x}" cy="${y}" r="5" class="ednode end${bad?" bad":""}"/>`;
        else if(n.type==="feed")s+=`<rect x="${x-9}" y="${y-9}" width="18" height="18" class="feed${bad?" bad":""}"/>`;
        else s+=`<rect x="${x-8}" y="${y-8}" width="16" height="16" class="ednode${bad?" bad":""}"/>`;
        if(lab.trim())s+=`<text x="${x+12}" y="${y-10}" class="tNode${bad?" bad":""}">${esc(lab)}</text>`;});
    }
    s+=`<line id="edPrev" x1="0" y1="0" x2="0" y2="0" class="edprev" visibility="hidden"/></svg>`;
    $("svgBox").innerHTML=s;
    $("drawNote").innerHTML=`<span class="leg"><i class="lr"></i>Schiene</span><span class="leg"><i class="ls"></i>Schutzleiter</span><span class="leg"><i class="lf"></i>Einspeiser</span><span class="leg"><i class="le"></i>Endkappe</span>`+(st.view==="below"?" Ansicht von unten (gespiegelt); die Teilenamen bleiben die des Katalogs.":"");
    bindEditor();
  }
  function short(v,t){if(t==="feed")return "SL "+v;if(t==="L")return v;return v.replace("innen, ","innen ").replace("außen, ","außen ").replace("rechts","re").replace("links","li")}

  function edgeList(solved){
    $("edgeList").innerHTML=`<details><summary>Schienen und Verbinder im Einzelnen (${solved.edges.length} Schienen)</summary><ul>${solved.edges.map(e=>{
      const a=solved.nodes.find(n=>n.id===e.a),b=solved.nodes.find(n=>n.id===e.b);
      return `<li><b>${e.a} → ${e.b}</b>: Achse ${fmtM(e.axis)}, Schiene ${fmtM(e.len)}${e.pieces.length>1?` (aus ${e.pieces.map(p=>p/1000+" m").join(" + ")})`:e.cutTo?` (aus ${e.pieces[0]/1000} m)`:""}, Schutzleiter ${({N:"oben",S:"unten",E:"rechts",W:"links"})[e.side]} im Grundriss</li>`}).join("")}</ul>
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
      if(st.tool==="draw"){start=p;svg.setPointerCapture(ev.pointerId)}
      else if(st.tool==="feed")toggleFeed(p);
      else eraseAt(p)};
    svg.onpointermove=ev=>{if(!start)return;const p=toGrid(ev);let x=p.x,y=p.y;if(Math.abs(x-start.x)>=Math.abs(y-start.y))y=start.y;else x=start.x;
      const a=pxOf(start.x,start.y),b=pxOf(x,y),l=$("edPrev");l.setAttribute("x1",a.X);l.setAttribute("y1",a.Y);l.setAttribute("x2",b.X);l.setAttribute("y2",b.Y);l.setAttribute("visibility","visible")};
    svg.onpointerup=ev=>{if(!start)return;const p=toGrid(ev);let x=p.x,y=p.y;if(Math.abs(x-start.x)>=Math.abs(y-start.y))y=start.y;else x=start.x;
      if(x!==start.x||y!==start.y){snapshot();addLine(start.x,start.y,x,y);
        // Schiene an freies Ende ohne Einspeisung? Erste Schiene bekommt automatisch einen Einspeiser am Startpunkt
        if(st.feeds.size===0&&st.mids.size===0)st.feeds.add(start.x+","+start.y)}
      start=null;render()};
    svg.onpointercancel=()=>{start=null;render()};
  }
  const nearestSeg=p=>{const fx=Math.floor(p.gx),fy=Math.floor(p.gy);
    const cands=[`${fx},${Math.round(p.gy)},h`,`${Math.round(p.gx)},${fy},v`];
    let best=null,bd=0.35;cands.forEach(c=>{if(!st.segs.has(c))return;const [x,y,o]=c.split(",");const d=o==="h"?Math.abs(p.gy-(+y)):Math.abs(p.gx-(+x));if(d<bd){bd=d;best=c}});return best};
  function degree(pt){const [x,y]=pt.split(",").map(Number);return [`${x},${y},h`,`${x-1},${y},h`,`${x},${y},v`,`${x},${y-1},v`].filter(s=>st.segs.has(s)).length}
  function toggleFeed(p){
    const pt=p.x+","+p.y, near=Math.hypot(p.gx-p.x,p.gy-p.y)<0.35;
    if(near&&degree(pt)===1){snapshot();st.feeds.has(pt)?st.feeds.delete(pt):st.feeds.add(pt);render();return}
    const sg=nearestSeg(p);if(sg){snapshot();st.mids.has(sg)?st.mids.delete(sg):st.mids.add(sg);render()}
  }
  function eraseAt(p){
    const sg=nearestSeg(p);if(!sg)return;snapshot();
    // ganze Kette bis zu den nächsten Knoten löschen
    const L=E.fromSegments(st.segs,st.feeds,st.mids,st.step);const e=L.edges.find(e=>e.units.includes(sg));
    (e?e.units:[sg]).forEach(u=>{st.segs.delete(u);st.mids.delete(u)});
    // Einspeiser an Punkten, die kein freies Ende mehr sind, entfernen
    [...st.feeds].forEach(f=>{if(degree(f)!==1)st.feeds.delete(f)});
    render();
  }

  let rz;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(st.shape==="draw")render()},150)});
  render();
})();
