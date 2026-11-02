// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC, siehe LICENSE und NOTICE
// Kurze Einführungstouren je Bereich (Leuchten, Schienen, Belegung). Starten beim ersten Besuch des Bereichs
// automatisch und lassen sich über „? Tour“ jederzeit erneut starten. Keine externen Bibliotheken.
(function(){
  // Schritte je Seite (body[data-tour]); sel darf Alternativen enthalten („a|b“), fehlende Ziele werden übersprungen
  const SETS={
    leuchten:[
      {title:"Willkommen!",text:"Der Lichtplaner hat drei Bereiche: Leuchten auswählen, Schienen planen und die Leuchten auf den Schienen belegen. Alles landet im selben Lichtplan je Raum. Diese Tour zeigt den Bereich „Leuchten“ und dauert etwa eine Minute."},
      {sel:".apptabs",title:"Bereiche umschalten",text:"Über diese Reiter wechselst du zwischen „Leuchten“, „Schienen“ und „Belegung“. Jeder Bereich hat seine eigene kurze Tour über „? Tour“."},
      {sel:"#quick",title:"Schnellstart",text:"Weißt du noch nicht, wonach du suchst? Wähl hier, was du beleuchten willst – die passenden Filter werden gesetzt. Unter „Begriffe kurz erklärt“ steht, was Kelvin, Lumen oder CRI bedeuten."},
      {sel:".filters|#filterBtn",title:"Filter",text:"Grenze die Auswahl ein, nach Lichtfarbe, Abstrahlwinkel, Dimmung, Hersteller, Gehäuse, Lumen und Watt."},
      {sel:"#diffPanel",title:"Worin sich die Treffer unterscheiden",text:"Hier steht, worin sich die aktuellen Treffer noch unterscheiden, mit der Anzahl je Wert. Ein Klick auf einen Wert filtert danach. Was bei allen gleich ist, steht darunter."},
      {sel:"#cards .specs|#tableBox",title:"Technische Daten",text:"Jede Leuchte zeigt alle technischen Daten. Werte, in denen sich die Treffer unterscheiden, sind fett und mit einem Balken markiert. So siehst du sofort, was zwei Leuchten trennt."},
      {sel:"#cards .beam",title:"Lichtkegel",text:"Der Kegel ist im echten Abstrahlwinkel gezeichnet und in der Lichtfarbe eingefärbt: 2700 K bernstein, 4000 K fast weiß. Bei Zoom-Strahlern zeigt der hellere Bereich den größten Winkel."},
      {sel:"#viewTools .tools",title:"Sortieren und Tabelle",text:"Sortier nach Lumen, Preis oder Effizienz. Mit „Tabelle“ vergleichst du alle Werte Spalte für Spalte. Spalten, die bei allen Treffern gleich sind, treten zurück."},
      {sel:"#cards [data-pick]|#rows [data-pick]",title:"Merken",text:"Damit ordnest du eine Leuchte einem Raum, einer Verwendung und einer Stückzahl zu. Gibt es den Raum noch nicht, legst du ihn im selben Schritt an."},
      {sel:"#mlPanel .nextstep:not([hidden])",title:"Nächster Schritt",text:"Hier steht immer, was als Nächstes sinnvoll ist – zum Beispiel die Schiene für einen Raum planen. Die Zahlen an den Reitern zeigen, wie weit du bist."},
      {sel:"#mlPanel|#mbar",title:"Lichtplan",text:"Hier sammeln sich je Raum die gemerkten Leuchten und die geplanten Schienen, mit Stückzahl und Gesamtsumme. Über „Drucken oder als PDF speichern“ entsteht eine Bestellliste für den Elektriker."},
      {sel:"#shareBar",title:"Teilen",text:"Oben auf jeder Seite: Damit wird aus deinem Lichtplan eine gemeinsame Liste, die du per Link mit Familie oder Elektriker teilst – Leuchten, Schienen und Belegung. Auf Wunsch schützt ein Passwort die Liste."},
      {sel:".notes",title:"Hinweise",text:"Hier steht, was „Abschnitt“ und „An-/Abschnitt“ bei der Dimmung bedeuten und woher die Daten stammen. Teste vor dem Kauf eine Leuchte am eigenen Dimmer oder KNX-Aktor."},
      {sel:"#tourBtn",title:"Fertig!",text:"Über „? Tour“ startest du diese Einführung jederzeit erneut. Kennst du dich aus, blendest du unten in der Fußzeile die Hilfetexte aus. Weiter geht es im Reiter „Schienen“."}
    ],
    schienen:[
      {title:"Schienen planen",text:"Hier planst du die EUTRAC‑3‑Phasen‑Aufbauschiene und bekommst die Stückliste mit den richtigen Varianten für den Schutzleiter. Die Tour dauert etwa eine Minute."},
      {sel:".apptabs",title:"Bereiche umschalten",text:"Über die Reiter wechselst du zurück zu den Leuchten oder weiter zur Belegung."},
      {sel:"#shareBar",title:"Teilen",text:"Über „Teilen …“ machst du den ganzen Lichtplan zur gemeinsamen Liste. Der Link führt direkt auf diese Seite."},
      {sel:".modebar",title:"Einfach oder frei zeichnen",text:"„Einfach“ reicht für die meisten Räume: Form wählen, Maße eintragen, fertig. „Frei zeichnen“ ist für besondere Formen, auch schräg oder mit mehreren Anschlüssen."},
      {sel:"#shapeBox:not([hidden])",title:"1 · Form",text:"Gerade, L, U, T, Rechteck, Kreuz oder H – tipp die Form an, die deiner Schiene am nächsten kommt."},
      {sel:"#dimBox:not([hidden])",title:"2 · Maße und Stromanschluss",text:"Trag die Längen in Metern ein und wähl, wo das Stromkabel aus der Decke kommt. Dort sitzt der Einspeiser."},
      {sel:".edtools:not([hidden])",title:"Werkzeuge",text:"Schiene ziehen (waagrecht/senkrecht), Schräg ziehen, Einspeisung setzen, Flex-Ecke und Löschen. Dazu Raster, Fläche, Vorlagen und Rückgängig."},
      {sel:"#svgBox",title:"So sieht deine Schiene aus",text:"Hier zeichnest du mit Maus oder Finger. Verbinder und Endkappen setzt der Planer selbst. Die rote Linie zeigt die Lage des Schutzleiters, an jedem Verbinder steht die passende Ausführung."},
      {sel:"[data-view]",title:"Von oben oder von unten",text:"Der Katalog zeigt den Grundriss von oben. „Von unten“ zeigt die Schiene so, wie du sie an der Decke siehst."},
      {sel:"#checks",title:"Passt alles?",text:"Hier steht, ob Einspeisung, Abschlüsse und Schutzleiter passen. Widersprüche werden in der Zeichnung rot markiert, mit Vorschlag zur Abhilfe."},
      {sel:"#bom",title:"Einkaufsliste",text:"Alle Teile mit EUTRAC- und SLV-Nummer. Hake an, was du schon hast; darunter steht, was noch fehlt."},
      {sel:"#saveBox",title:"Speichern",text:"Ordne die Schiene einem Raum zu. Danach wird jede Änderung automatisch gespeichert, und du kannst im Reiter „Belegung“ die Leuchten daraufsetzen."},
      {sel:"#tabRails",title:"Fertig!",text:"Über „? Tour“ startest du diese Einführung jederzeit erneut. Im Reiter „Belegung“ setzt du anschließend die Leuchten auf die Schiene."}
    ],
    belegung:[
      {title:"Leuchten setzen und schalten",text:"Hier setzt du die gemerkten Leuchten eines Raums auf die geplante Schiene, verteilst sie auf die drei Stromkreise und ordnest jedem Kreis einen Kanal am KNX-Aktor zu."},
      {sel:".apptabs",title:"Bereiche umschalten",text:"Leuchten und Schienen planst du in den anderen beiden Reitern; hier kommen beide zusammen."},
      {sel:".bl-next:not([hidden])",title:"Nächster Schritt",text:"Hier steht, was als Nächstes zu tun ist – etwa wenn für einen Raum noch die Schiene fehlt."},
      {sel:"#blPick",title:"Raum und Schiene",text:"Wähle den Raum und den Schienenplan, den du belegen willst."},
      {sel:"#blLamps",title:"Leuchten setzen",text:"Tippe eine Leuchte an und dann auf die Schiene. Die Zahl zeigt, wie viele von den gemerkten schon sitzen. „Gleichmäßig verteilen“ setzt die übrigen in gleichen Abständen."},
      {sel:"#blSvg",title:"Leuchten auf der Schiene",text:"Gesetzte Leuchten kannst du verschieben. Ein Tipp auf eine Leuchte wählt sie aus: dann Stromkreis 1, 2 oder 3 wählen oder entfernen. Die Farbe zeigt den Stromkreis (L1 braun, L2 schwarz, L3 grau)."},
      {sel:"#blCircuits",title:"Stromkreise",text:"Jeder der drei Stromkreise bekommt einen Namen und wird gedimmt oder nur geschaltet – per KNX-Aktor, Wanddimmer oder normalem Schalter. Geprüft werden Last, Mindestlast und ob Dimmer und Leuchten zusammenpassen."},
      {sel:"#shareBar",title:"Teilen",text:"Über „Teilen …“ schickst du den Lichtplan samt Belegung per Link, z. B. an den Elektriker. Der Link öffnet direkt diese Seite."},
      {sel:"#blList",title:"Schaltliste",text:"Die Übersicht über alle Räume und Schienen: Stromkreis, Leuchten, Watt, Aktor und Kanal – zum Drucken für den Elektriker."},
      {sel:"#tourBtn",title:"Fertig!",text:"Über „? Tour“ startest du diese Einführung jederzeit erneut."}
    ]
  };
  const PAGE=document.body.dataset.tour||"leuchten", KEY={leuchten:"l",schienen:"s",belegung:"b"}[PAGE]||"l";
  // Gesehene Touren im Sitzungs-Cookie „merkliste_tour“ (z. B. „lsb“); alter Wert „1“ = Leuchten-Tour gesehen
  const TPATH=location.pathname.replace(/[^/]*$/,"")||"/";
  const seenStr=()=>{const m=/(?:^|;\s*)merkliste_tour=([^;]*)/.exec(document.cookie);return m?m[1].replace("1","l"):""};
  const seen=()=>seenStr().includes(KEY);
  const markSeen=()=>{try{const v=[...new Set((seenStr()+KEY).split(""))].join("");document.cookie="merkliste_tour="+v+"; path="+TPATH+"; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}};
  const STEPS=SETS[PAGE];
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
    if(root)return; onDone=()=>{markSeen();done&&done()}; prevFocus=document.activeElement;
    steps=STEPS.map(s=>({...s,el:find(s.sel)})).filter(s=>!s.sel||s.el);
    build();document.documentElement.classList.add("touring");
    addEventListener("resize",place);addEventListener("scroll",place,true);document.addEventListener("keydown",onKey,true);
    go(0);
  }
  // Automatisch beim ersten Besuch der Seite (wartet, bis kein Dialog offen ist)
  function auto(){if(seen())return;const t=()=>{if(document.querySelector("dialog[open]")){setTimeout(t,800);return}start()};setTimeout(t,700)}
  window.Tour={start,auto,seen,isOpen:()=>!!root};
})();
