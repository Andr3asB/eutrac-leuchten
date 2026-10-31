// Oberfläche des Schienenplaners (zunächst gerade Schiene). Rechnet mit schiene-engine.js.
(function(){
  const E=window.SchienenEngine, $=id=>document.getElementById(id);
  const st={shape:"straight",feed:"left",side:"S",view:"top",have:{}};
  const fmtM=mm=>(mm/1000).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" m";
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function radio(sel,attr,cb){document.querySelectorAll(sel).forEach(b=>b.addEventListener("click",()=>{if(b.disabled)return;
    document.querySelectorAll(sel).forEach(x=>x.setAttribute("aria-checked",x===b));cb(b.dataset[attr]);render()}))}
  radio("[data-feed]","feed",v=>{st.feed=v;applyHave()});
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{st.view=b.dataset.view;document.querySelectorAll("[data-view]").forEach(x=>x.setAttribute("aria-pressed",x===b));render()});
  ["len","maxLen","color","mount","spacing"].forEach(id=>$(id).addEventListener("input",render));
  $("flip").onclick=()=>{st.side=st.side==="N"?"S":"N";$("haveFeed").value="";render()};
  $("haveFeed").addEventListener("input",()=>{applyHave();render()});
  $("printBtn").onclick=()=>window.print();

  // Gekaufter Einspeiser legt die Seite des Schutzleiters fest
  function applyHave(){
    const v=$("haveFeed").value;if(!v||st.feed==="mid")return;
    const dir=st.feed==="left"?"E":"W";              // Blick vom Einspeiser in die Schiene
    const right=E.RIGHT[dir];                          // rechte Hand: E→S, W→N
    st.side=v==="rechts"?right:(right==="S"?"N":"S");
  }

  function render(){
    const len=Math.round((parseFloat(String($("len").value).replace(",","."))||0)*1000);
    $("spacingRow").hidden=!/^(rod|rope)/.test($("mount").value);
    $("haveFeedRow").hidden=$("sideRow").hidden=st.feed==="mid";
    const err=$("errors");err.innerHTML="";
    if(len<300){err.innerHTML=`<p class="err">Bitte eine Schienenlänge ab 0,30 m eingeben.</p>`;return}
    const layout=E.straight(len,st.feed);
    const solved=E.solve(layout,{firstSide:st.side});
    if(!solved.ok){err.innerHTML=solved.errors.map(e=>`<p class="err">${esc(e)}</p>`).join("");return}
    const opts={color:$("color").value,maxM:+$("maxLen").value,mount:$("mount").value,spacing:+$("spacing").value};
    const b=E.bill(layout,solved,opts);
    drawStraight(solved,len);
    // Prüfliste
    $("checks").innerHTML=b.checks.map(c=>`<li class="${c.ok?"ok":c.warn?"warn":"bad"}"><span aria-hidden="true">${c.ok?"✓":"!"}</span> ${esc(c.text)}</li>`).join("")+solved.warnings.map(w=>`<li class="warn"><span aria-hidden="true">!</span> ${esc(w)}</li>`).join("");
    // Stückliste
    $("bom").querySelector("tbody").innerHTML=b.items.map(it=>`<tr class="${st.have[it.key]?"have":""}">
      <td><input type="checkbox" data-have="${it.key}" ${st.have[it.key]?"checked":""} aria-label="${esc(it.name)} schon vorhanden"></td>
      <td class="n"><b>${it.qty}×</b></td><td>${esc(it.name)}${it.why.length?`<span class="why">${esc([...new Set(it.why)].join("; "))}</span>`:""}</td>
      <td class="mono">${esc(it.eutrac)}</td><td class="mono">${it.slv?esc(it.slv):'<span class="na">nicht bei SLV</span>'}</td></tr>`).join("");
    const miss=b.items.filter(it=>!st.have[it.key]);
    $("missing").innerHTML=Object.keys(st.have).some(k=>st.have[k])?(miss.length?`<b>Es fehlen noch:</b> ${miss.map(it=>`${it.qty}× ${esc(it.name)}`).join(", ")}`:`<b>Vollständig.</b> Du hast alle Teile beisammen.`):"";
    $("notes").innerHTML=b.notes.map(n=>`<li>${esc(n)}</li>`).join("")+`<li>Anschluss: 3 Stromkreise, je Stromkreis bis 3.600 W; am Drehstromnetz Einzelabsicherung 3 × 16 A, Zuleitung 5 × 1,5 mm² bis 5 × 2,5 mm². Anschluss nur durch eine Elektrofachkraft.</li>`;
  }
  $("bom").addEventListener("change",e=>{const k=e.target.dataset.have;if(k){st.have[k]=e.target.checked;render()}});

  // Zeichnung der geraden Schiene (Grundriss); „von unten“ = horizontal gespiegelt
  function drawStraight(solved,len){
    const e=solved.edges[0], pieces=e.pieces, W=760, H=230, x0=70, x1=W-70, y=110, scale=(x1-x0)/len;
    const flip=st.view==="below";
    const X=v=>flip?W-v:v;
    const red=e.side==="N"?-7:7;                     // Schutzleiter oben (Nord) oder unten (Süd)
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grundriss der Schiene ${fmtM(len)}">`;
    s+=`<text x="${W/2}" y="22" class="tN" text-anchor="middle">${flip?"Blick von unten an die Decke":"Grundriss von oben, Öffnung der Schiene nach unten"}</text>`;
    // Schienenstücke
    let pos=0;
    pieces.forEach((p,i)=>{const isLast=i===pieces.length-1, real=isLast&&e.cutTo?e.cutTo:p;
      const a=X(x0+pos*scale), b=X(x0+(pos+real)*scale);
      s+=`<rect x="${Math.min(a,b)}" y="${y-14}" width="${Math.abs(b-a)}" height="28" class="rail"/>`;
      s+=`<text x="${(a+b)/2}" y="${y+4}" text-anchor="middle" class="tRail">${real===p?p/1000+" m":fmtM(real)+" (aus "+p/1000+" m)"}</text>`;
      pos+=real; if(!isLast){const j=X(x0+pos*scale);s+=`<line x1="${j}" y1="${y-20}" x2="${j}" y2="${y+20}" class="joint"/><text x="${j}" y="${y+36}" text-anchor="middle" class="tSmall">Längsverbinder</text>`}});
    // Schutzleiter
    s+=`<line x1="${X(x0)}" y1="${y+red}" x2="${X(x1)}" y2="${y+red}" class="sl"/>`;
    s+=`<text x="${X(x0+(x1-x0)*0.3)}" y="${y+(red<0?-24:34)}" text-anchor="middle" class="tSL">Schutzleiter</text>`;
    // Enden
    const endBox=(nx,node,isLeft)=>{const ox=X(nx), w=26, left=isLeft!==flip;
      const bx=left?ox-w:ox;
      if(node.type==="feed"){s+=`<rect x="${bx}" y="${y-18}" width="${w}" height="36" class="feed"/>`;
        s+=`<text x="${ox+(left?-w/2:w/2)}" y="${y-28}" text-anchor="middle" class="tLab">Einspeiser</text><text x="${ox+(left?-w/2:w/2)}" y="${y+52}" text-anchor="middle" class="tSmall">SL ${node.variant}</text>`}
      else{s+=`<rect x="${left?ox-5:ox}" y="${y-15}" width="5" height="30" class="cap"/><text x="${ox+(left?-14:14)}" y="${y-24}" text-anchor="middle" class="tLab">Endkappe</text>`}};
    const nA=solved.nodes.find(n=>n.id==="A"), nB=solved.nodes.find(n=>n.id==="B");
    endBox(x0,nA,true); endBox(x1,nB,false);
    if(e.midFeed){const mx=X((x0+x1)/2);s+=`<rect x="${mx-12}" y="${y-18}" width="24" height="36" class="feed"/><text x="${mx}" y="${y-28}" text-anchor="middle" class="tLab">Mitteneinspeiser</text>`}
    // Bemaßung
    s+=`<line x1="${X(x0)}" y1="${H-30}" x2="${X(x1)}" y2="${H-30}" class="dim"/><line x1="${X(x0)}" y1="${H-36}" x2="${X(x0)}" y2="${H-24}" class="dim"/><line x1="${X(x1)}" y1="${H-36}" x2="${X(x1)}" y2="${H-24}" class="dim"/>`;
    s+=`<text x="${W/2}" y="${H-12}" text-anchor="middle" class="tDim">Schiene ${fmtM(len)} (mit Einspeiser und Endkappe ca. ${fmtM(len+(e.midFeed?13:79))})</text></svg>`;
    $("svgBox").innerHTML=s;
    const fd=solved.nodes.find(n=>n.type==="feed");
    $("drawNote").textContent=e.midFeed?"Mitteneinspeiser: kann an beliebiger Stelle eingesetzt werden, die Schiene muss nicht geteilt werden. Beide Enden bekommen eine Endkappe.":
      `Rote Linie: Lage des Schutzleiters. Bei einer geraden Schiene kannst du die Seite frei wählen – sie bestimmt nur, ob du den Einspeiser „Schutzleiter rechts“ oder „links“ brauchst (hier: ${fd?fd.variant:"–"}). Wichtig ist, dass Schiene und Einspeiser beim Montieren zusammenpassen.`;
  }
  render();
})();
