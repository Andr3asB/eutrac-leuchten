// Kurze Einführungstour. Startet automatisch beim ersten Besuch (noch keine Merkliste im Browser)
// und lässt sich über „Tour“ in der Fußzeile jederzeit erneut starten. Keine externen Bibliotheken.
(function(){
  const STEPS=[
    {title:"Willkommen!",text:"Hier findest du phasendimmbare Leuchten für EUTRAC-3-Phasen-Schienen. Du kannst filtern, die Unterschiede vergleichen, pro Raum merken und die Liste teilen. Die Tour dauert etwa eine Minute."},
    {sel:".filters|#filterBtn",title:"Filter",text:"Grenze die Auswahl ein, nach Lichtfarbe, Abstrahlwinkel, Dimmung, Hersteller, Gehäuse, Lumen und Watt."},
    {sel:"#diffPanel",title:"Worin sich die Treffer unterscheiden",text:"Hier steht, worin sich die aktuellen Treffer noch unterscheiden, mit der Anzahl je Wert. Ein Klick auf einen Wert filtert danach. Was bei allen gleich ist, steht darunter."},
    {sel:"#cards .specs|#tableBox",title:"Technische Daten",text:"Jede Leuchte zeigt alle technischen Daten. Werte, in denen sich die Treffer unterscheiden, sind fett und mit einem Balken markiert. So siehst du sofort, was zwei Leuchten trennt."},
    {sel:"#cards .beam",title:"Lichtkegel",text:"Der Kegel ist im echten Abstrahlwinkel gezeichnet und in der Lichtfarbe eingefärbt: 2700 K bernstein, 4000 K fast weiß. Bei Zoom-Strahlern zeigt der hellere Bereich den größten Winkel."},
    {sel:"#viewTools .tools",title:"Sortieren und Tabelle",text:"Sortier nach Lumen, Preis oder Effizienz. Mit „Tabelle“ vergleichst du alle Werte Spalte für Spalte. Spalten, die bei allen Treffern gleich sind, treten zurück."},
    {sel:"#cards [data-pick]|#rows [data-pick]",title:"Merken",text:"Damit ordnest du eine Leuchte einem Raum, einer Verwendung und einer Stückzahl zu. Gibt es den Raum noch nicht, legst du ihn im selben Schritt an."},
    {sel:"#mlPanel|#mbar",title:"Lichtplan",text:"Hier sammeln sich deine gemerkten Leuchten nach Raum und Verwendung, mit Stückzahl und Gesamtsumme. Über „Drucken oder als PDF speichern“ entsteht eine Bestellliste für den Elektriker."},
    {sel:"#shareBar button",title:"Gemeinsam bearbeiten",text:"Damit wird aus deinem Lichtplan eine gemeinsame Liste, die du per Link mit Familie oder Elektriker teilst. Auf Wunsch schützt ein Passwort die Liste."},
    {sel:".notes",title:"Hinweise",text:"Hier steht, was „Abschnitt“ und „An-/Abschnitt“ bei der Dimmung bedeuten und woher die Daten stammen. Teste vor dem Kauf eine Leuchte am eigenen Dimmer oder KNX-Aktor."},
    {sel:"#tourBtn",title:"Fertig!",text:"Über „Tour“ oben rechts startest du die Einführung jederzeit erneut. Viel Erfolg bei der Planung!"}
  ];
  const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect();if(!(r.width>0&&r.height>0)||getComputedStyle(el).visibility==="hidden")return false;
    // Elemente in ausgeblendeten Schubladen (fest positioniert, aus dem Bild geschoben) zählen nicht
    const box=el.closest(".plan,.filters");if(box&&getComputedStyle(box).position==="fixed"){const b=box.getBoundingClientRect();if(b.top>=innerHeight||b.left>=innerWidth||b.bottom<=0||b.right<=0)return false}
    return true};
  // sel darf mehrere Alternativen enthalten („a|b“); genommen wird die erste sichtbare
  const find=sel=>{if(!sel)return null;for(const s of sel.split("|")){const el=document.querySelector(s);if(visible(el))return el}return null};
  let i=0, steps=[], root, hole, card, onDone=null, prevFocus=null;

  function build(){
    root=document.createElement("div");root.className="tour";root.innerHTML=
      `<div class="tour-catch"></div><div class="tour-hole"></div>
       <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
         <div class="tour-top"><span class="tour-count" id="tourCount"></span><button type="button" class="tour-x" data-t="close" aria-label="Tour beenden">×</button></div>
         <h3 id="tourTitle"></h3><p id="tourText"></p>
         <div class="tour-nav"><button type="button" class="btn link" data-t="skip">Überspringen</button><span class="tour-sp"></span>
           <button type="button" class="btn" data-t="prev">Zurück</button><button type="button" class="btn primary" data-t="next">Weiter</button></div>
         <div class="tour-dots" aria-hidden="true"></div>
       </div>`;
    document.body.appendChild(root);hole=root.querySelector(".tour-hole");card=root.querySelector(".tour-card");
    root.addEventListener("click",e=>{const b=e.target.closest("[data-t]");if(!b)return;const a=b.dataset.t;
      if(a==="next")go(i+1);else if(a==="prev")go(i-1);else end()});
  }
  function onKey(e){if(e.key==="Escape"){e.preventDefault();end()}else if(e.key==="ArrowRight")go(i+1);else if(e.key==="ArrowLeft")go(i-1)
    else if(e.key==="Tab"){const f=[...card.querySelectorAll("button")].filter(b=>!b.hidden);const k=f.indexOf(document.activeElement);
      if(e.shiftKey&&k<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&k===f.length-1){e.preventDefault();f[0].focus()}}}
  function place(){
    const s=steps[i], el=s.el;
    const vw=innerWidth, vh=innerHeight, pad=6, mobile=vw<600;
    card.classList.toggle("sheet",mobile);
    if(!el){hole.style.cssText="left:50%;top:50%;width:0;height:0";card.classList.add("center");card.style.left=card.style.top="";return}
    card.classList.remove("center");
    const r=el.getBoundingClientRect();
    const L=Math.max(4,r.left-pad),T=Math.max(4,r.top-pad),W=Math.min(vw-8,r.right+pad)-L,H=Math.min(vh-8,r.bottom+pad)-T;
    hole.style.cssText=`left:${L}px;top:${T}px;width:${Math.max(0,W)}px;height:${Math.max(0,H)}px`;
    if(mobile){card.style.left=card.style.top="";return}
    const cw=card.offsetWidth,ch=card.offsetHeight,gap=12;
    let top=T+H+gap; if(top+ch>vh-8)top=T-ch-gap; if(top<8)top=Math.min(vh-ch-8,Math.max(8,T+H/2-ch/2));
    let left=Math.min(vw-cw-8,Math.max(8,L+W/2-cw/2));
    card.style.left=left+"px";card.style.top=top+"px";
  }
  function go(n){
    if(n<0)return; if(n>=steps.length){end();return}
    i=n;const s=steps[i],el=s.el;
    root.querySelector("#tourTitle").textContent=s.title;root.querySelector("#tourText").textContent=s.text;
    root.querySelector("#tourCount").textContent=`Schritt ${i+1} von ${steps.length}`;
    root.querySelector('[data-t="prev"]').hidden=i===0;
    root.querySelector('[data-t="skip"]').hidden=i===steps.length-1;
    root.querySelector('[data-t="next"]').textContent=i===steps.length-1?"Los geht’s":"Weiter";
    root.querySelector(".tour-dots").innerHTML=steps.map((_,k)=>`<i class="${k===i?"on":""}"></i>`).join("");
    if(el){const r=el.getBoundingClientRect();if(r.top<70||r.bottom>innerHeight-(innerWidth<600?260:120))el.scrollIntoView({block:"center",behavior:"instant"})}
    place();requestAnimationFrame(place);
    root.querySelector('[data-t="next"]').focus();
  }
  function end(){
    if(!root)return;
    removeEventListener("resize",place);removeEventListener("scroll",place,true);document.removeEventListener("keydown",onKey,true);
    root.remove();root=null;document.documentElement.classList.remove("touring");
    // Nach der Tour an den Seitenanfang, Fokus auf den Tour-Knopf (ohne erneut zu scrollen)
    window.scrollTo({top:0,behavior:"instant"});
    const tb=document.getElementById("tourBtn");
    if(tb)tb.focus({preventScroll:true});else if(prevFocus&&prevFocus.focus)prevFocus.focus({preventScroll:true});
    onDone&&onDone();
  }
  function start(done){
    if(root)return; onDone=done||null; prevFocus=document.activeElement;
    steps=STEPS.map(s=>({...s,el:find(s.sel)})).filter(s=>!s.sel||s.el);
    build();document.documentElement.classList.add("touring");
    addEventListener("resize",place);addEventListener("scroll",place,true);document.addEventListener("keydown",onKey,true);
    go(0);
  }
  window.Tour={start,isOpen:()=>!!root};
})();
