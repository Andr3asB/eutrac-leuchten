// Schienenplaner: Teiledaten und Rechenkern für die EUTRAC 3~ Aufbauschiene (5-Leiter, Typ 25-…)
//
// Quellen: EUTRAC Katalog 06/2022 (S. 61–65 Systemkomponenten, S. 88 Planungshinweise Schutzleiter,
// S. 91 mechanische Belastbarkeit, S. 92 Anschlussdaten) und SLV-Konformitätserklärung mit der
// Zuordnung SLV-Artikel ↔ EUTRAC-Artikel (product-assets.slv.com/slv_145100_ce_eutrac.pdf).
//
// Regeln für den Schutzleiter (SL), Grundriss von oben, Öffnung der Schiene nach unten:
//  • Der SL liegt innen auf einer Seite des Profils und muss durchgängig geführt werden.
//  • Gerade Schienen und elektrische Längsverbinder behalten die Seite bei.
//  • L-Verbinder: SL bleibt innen bzw. außen in der Ecke (Varianten „SL innen“ / „SL außen“).
//  • T-Verbinder: die durchgehende Linie behält ihre Seite; Varianten nach Lage des SL der
//    durchgehenden Linie (innen = zur Abzweigung hin) und des Abzweigs (rechts/links, vom Knoten aus gesehen).
//  • X-Verbinder: nur eine Ausführung; der SL läuft in zwei Winkeln (z. B. oben+links, unten+rechts),
//    d. h. eine geradeaus durch das X laufende Linie wechselt die Seite. Das X kann um 90° gedreht werden.
//  • Einspeiser: „SL rechts/links“ in Blickrichtung vom Einspeiser in die Schiene.
//  • Flex-Verbinder (555 1 1211, 30°–330°): nur eine Ausführung, Gelenk in der Deckenebene. Der SL bleibt
//    deshalb in Laufrichtung auf derselben Seite (wie bei einer geraden Schiene). Einzige Möglichkeit für schräge Schienen.
(function(){
  // Farben: EUTRAC-Endziffer und SLV-Artikel je Teil
  const COLORS={weiss:{label:"weiß (RAL 9016)",e:"6"},schwarz:{label:"schwarz",e:"2"},silber:{label:"silbergrau",e:"3"}};
  // slv: {weiss, schwarz, silber} – nur wo die SLV-Zuordnung dieselbe EUTRAC-Farbe hat
  const PARTS={
    rail1:{name:"Aufbauschiene 1 m",e:"25-10",fmt:"rail",slv:{weiss:"145101",schwarz:"145100",silber:"145102"}},
    rail2:{name:"Aufbauschiene 2 m",e:"25-20",fmt:"rail",slv:{weiss:"145201",schwarz:"145200",silber:"145202"}},
    rail3:{name:"Aufbauschiene 3 m",e:"25-30",fmt:"rail",slv:{weiss:"145301",schwarz:"145300",silber:"145302"}},
    rail4:{name:"Aufbauschiene 4 m",e:"25-40",fmt:"rail",slv:{weiss:"145401",schwarz:"145400",silber:"145402"}},
    feedR:{name:"Einspeiser, Schutzleiter rechts",e:"555 1 1201",slv:{weiss:"145521",schwarz:"145520",silber:"145524"}},
    feedL:{name:"Einspeiser, Schutzleiter links",e:"555 1 1202",slv:{weiss:"145511",schwarz:"145510",silber:"145514"}},
    feedMid:{name:"Mitteneinspeiser (an beliebiger Stelle, ohne Teilung der Schiene)",e:"555 1 5203",slv:{weiss:"145531",schwarz:"145530",silber:"145534"}},
    joint:{name:"Elektrischer Längsverbinder (innenliegend)",e:"555 1 1206",slv:{weiss:"145561",schwarz:"145560"}},
    jointFeed:{name:"I-Verbinder mit Einspeisemöglichkeit",e:"555 1 1208",slv:{weiss:"145661",schwarz:"145660",silber:"145664"}},
    endcap:{name:"Endkappe",e:"555 0 1217",slv:{weiss:"145591",schwarz:"145590",silber:"145594"}},
    Lout:{name:"L-Verbinder, Schutzleiter außen",e:"555 1 1209",slv:{weiss:"145671",schwarz:"145670",silber:"145674"}},
    Lin:{name:"L-Verbinder, Schutzleiter innen",e:"555 1 1210",slv:{weiss:"145681",schwarz:"145680",silber:"145684"}},
    TinR:{name:"T-Verbinder, Schutzleiter innen, rechts",e:"555 1 1212",slv:{weiss:"145641",schwarz:"145640",silber:"145644"}},
    TinL:{name:"T-Verbinder, Schutzleiter innen, links",e:"555 1 1213",slv:{weiss:"145631",schwarz:"145630",silber:"145634"}},
    ToutR:{name:"T-Verbinder, Schutzleiter außen, rechts",e:"555 1 1214",slv:{}},
    ToutL:{name:"T-Verbinder, Schutzleiter außen, links",e:"555 1 1215",slv:{}},
    X:{name:"X-Verbinder",e:"555 1 1216",slv:{weiss:"145691",schwarz:"145690",silber:"145694"}},
    flex:{name:"Flex-Verbinder, 30° bis 330°",e:"555 1 1211",slv:{}},
    stoss:{name:"Stoßstellenverbinder (für Abhängung an jedem Schienenstoß)",e:"99-123",fmt:"acc",slv:{weiss:"145601",schwarz:"145600",silber:"145604"}},
    pendelclip:{name:"Pendelclip (für Seil oder Pendelrohr)",e:"99-075",fmt:"acc",slv:{weiss:"145731",schwarz:"145730",silber:"145734"}},
    rod60:{name:"Pendelaufhängung starr, 60 cm (bauseits kürzbar)",e:"99-905",fmt:"acc",slv:{weiss:"145721",schwarz:"145720",silber:"145724"}},
    rod120:{name:"Pendelaufhängung starr, 120 cm (bauseits kürzbar)",e:"99-906",fmt:"acc",slv:{weiss:"145711",schwarz:"145710",silber:"145714"}},
    rope150:{name:"Seilaufhängung 1,5 m, höhenverstellbar",e:"99-318-0",fmt:"fixed",slv:{all:"145800"}},
    rope300:{name:"Seilaufhängung 3 m, höhenverstellbar",e:"99-319-0",fmt:"fixed",slv:{all:"145810"}},
    rope620:{name:"Seilaufhängung 6,2 m, höhenverstellbar",e:"88-620-0",fmt:"fixed",slv:{all:"145820"}},
    deckenclip:{name:"Deckenclip (Ausgleich von Deckenunebenheiten)",e:"99-018",fmt:"acc",slv:{}}
  };
  function partNo(key,color){
    const p=PARTS[key],c=COLORS[color].e;
    const eut=p.fmt==="rail"?p.e+c:p.fmt==="acc"?p.e+"-"+c:p.fmt==="fixed"?p.e:p.e+"-"+c;
    const slv=p.slv.all||p.slv[color]||null;
    return {eutrac:eut,slv};
  }

  // ---------- Geometrie ----------
  const RIGHT={E:"S",S:"W",W:"N",N:"E"};       // rechte Hand in Laufrichtung
  const OPP={E:"W",W:"E",N:"S",S:"N"};
  const isH=d=>d==="E"||d==="W";
  // Bit einer Kante: waagrecht 1 = Nord, 0 = Süd; senkrecht 1 = Ost, 0 = West
  const sideOf=(edgeHoriz,bit)=>edgeHoriz?(bit?"N":"S"):(bit?"E":"W");
  const bitFor=(edgeHoriz,side)=>edgeHoriz?(side==="N"?1:0):(side==="E"?1:0);

  // ---------- Union-Find mit Parität: bit(a) XOR bit(b) = d ----------
  function UF(n){const p=[...Array(n).keys()],x=Array(n).fill(0);
    const find=a=>{if(p[a]===a)return [a,0];const [r,px]=find(p[a]);p[a]=r;x[a]^=px;return [r,x[a]]};
    return {find,union(a,b,d){const [ra,pa]=find(a),[rb,pb]=find(b);if(ra===rb)return ((pa^pb)===d);p[rb]=ra;x[rb]=pa^pb^d;return true}};
  }

  // layout: {nodes:[{id,type:'feed'|'end'|'L'|'T'|'X'|'flex', x, y}], edges:[{a,b,len, midFeed?}]}
  // Schräge Schienen sind erlaubt; sie lassen sich nur über Flex-Verbinder, Einspeiser oder Endkappen anschließen.
  // Bit einer Kante: SL auf der Seite ihrer Bezugsnormalen (waagrecht: Nord, senkrecht: Ost, schräg: links von a→b).
  function solve(layout,prefs={}){
    const N=layout.nodes, E=layout.edges, byId=Object.fromEntries(N.map(n=>[n.id,n]));
    const errors=[], warnings=[];
    E.forEach((e,i)=>{const A=byId[e.a],B=byId[e.b];
      if(!A||!B){errors.push(`Schiene ${i+1}: Knoten fehlt.`);return}
      e.horiz=A.y===B.y; e.vert=A.x===B.x; e.diag=!e.horiz&&!e.vert; e.i=i;
      const dx=B.x-A.x,dy=B.y-A.y,l=Math.hypot(dx,dy)||1; e.ux=dx/l; e.uy=dy/l;
      e.nx=e.horiz?0:e.vert?1:e.uy; e.ny=e.horiz?-1:e.vert?0:-e.ux;});
    // Arme je Knoten: Richtung nach außen
    const arms={},vec={};N.forEach(n=>{arms[n.id]={};vec[n.id]={}});
    const key=(ux,uy)=>Math.abs(uy)<1e-9?(ux>0?"E":"W"):Math.abs(ux)<1e-9?(uy>0?"S":"N"):"D"+Math.round(Math.atan2(uy,ux)*1800/Math.PI);
    E.forEach(e=>{const A=byId[e.a],B=byId[e.b];if(!A||!B)return;
      const dA=key(e.ux,e.uy), dB=key(-e.ux,-e.uy);
      if(arms[A.id][dA]!=null)errors.push(`${label(A)}: zwei Schienen in derselben Richtung.`);
      if(arms[B.id][dB]!=null)errors.push(`${label(B)}: zwei Schienen in derselben Richtung.`);
      arms[A.id][dA]=e.i;arms[B.id][dB]=e.i;vec[A.id][dA]=[e.ux,e.uy];vec[B.id][dB]=[-e.ux,-e.uy];});
    // c: liegt der SL links in Blickrichtung nach außen, wenn bit=1? leftOut = bit XOR c
    const cOf=(n,d)=>{const e=E[arms[n.id][d]],[vx,vy]=vec[n.id][d];return (vy*e.nx-vx*e.ny)<0?1:0};
    const need={feed:1,end:1,L:2,T:3,X:4,flex:2,I:2};
    N.forEach(n=>{const d=Object.keys(arms[n.id]),k=d.length;
      if(need[n.type]!==k){errors.push(`${label(n)} hat ${k} statt ${need[n.type]} Anschlüsse.`);return}
      if(["L","T","X"].includes(n.type)&&d.some(x=>x[0]==="D")){errors.push(`${label(n)}: Eine schräge Schiene lässt sich nicht an einen ${n.type}-Verbinder anschließen, nur über Flex-Verbinder, Einspeiser oder Endkappe.`);return}
      if(n.type==="L"&&isH(d[0])===isH(d[1]))errors.push(`${label(n)}: Die beiden Schienen müssen einen rechten Winkel bilden.`);
      if((n.type==="T"||n.type==="I")&&!((d.includes("E")&&d.includes("W"))||(d.includes("N")&&d.includes("S"))))errors.push(`${label(n)}: keine durchgehende Linie.`);
      if(n.type==="I"&&d.some(x=>x[0]==="D"))errors.push(`${label(n)}: Einspeisung in einer schrägen Schiene nur mit Mitteneinspeiser.`);
      if(n.type==="flex"){const [a,b]=d.map(x=>vec[n.id][x]);const ang=Math.round(Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI);
        n.angle=ang; if(ang<30)errors.push(`${label(n)}: Winkel ${ang}° ist zu spitz. Der Flex-Verbinder reicht von 30° bis 330°.`);
        if(ang===180)warnings.push(`${label(n)} ist gestreckt (180°). Dort genügt ein elektrischer Längsverbinder.`)}});
    if(errors.length)return {ok:false,errors,warnings};

    // Bedingungen aufstellen (skip: Knoten weglassen, um die Ursache eines Widerspruchs zu finden)
    const build=skip=>{const uf=UF(E.length), conflicts=[];
      const add=(a,b,d,n,why)=>{if(!uf.union(a,b,d))conflicts.push({node:n.id,why})};
      N.forEach(n=>{if(n.id===skip)return;const a=arms[n.id];
        if(n.type==="T"||n.type==="I"){ if(a.E!=null&&a.W!=null)add(a.E,a.W,0,n,"durchgehende Linie"); else add(a.N,a.S,0,n,"durchgehende Linie") }
        if(n.type==="L"){ const h=a.E!=null?"E":"W", v=a.N!=null?"N":"S";
          add(a[h],a[v],(v==="N"?1:0)^(h==="E"?1:0),n,"Schutzleiter innen/außen im L") }
        if(n.type==="X"){ add(a.S,a.N,1,n,"X-Verbinder"); add(a.E,a.N,0,n,"X-Verbinder"); add(a.W,a.N,1,n,"X-Verbinder") }
        // Flex: Gelenk in der Deckenebene, nur eine Ausführung → SL bleibt in Laufrichtung auf derselben Seite
        if(n.type==="flex"){ const [d1,d2]=Object.keys(a); add(a[d1],a[d2],1^cOf(n,d1)^cOf(n,d2),n,"Flex-Verbinder") }
      });
      return {uf,conflicts}};
    const {uf,conflicts}=build(null);
    if(conflicts.length){
      // Ursache suchen: welche X-Verbinder (sonst welche Knoten) lösen den Widerspruch, wenn man sie weglässt?
      const xs=N.filter(n=>n.type==="X").filter(n=>!build(n.id).conflicts.length);
      const cause=xs.length?xs:N.filter(n=>n.type!=="feed"&&n.type!=="end").filter(n=>!build(n.id).conflicts.length);
      const marked=cause.length?cause.map(n=>({node:n.id})):conflicts;
      const names=[...new Set(marked.map(c=>label(byId[c.node])))].join(", ");
      const fix=xs.length?`Ein gerade durch ${xs.length>1?"ein X":"das X"} laufender Ring wechselt dort die Seite des Schutzleiters und kommt nicht passend zurück. Abhilfe: den X-Verbinder durch zwei T-Verbinder ersetzen, oder den Ring an einer Stelle auftrennen (zwei Endkappen) und getrennt einspeisen.`:`Abhilfe: die Form an dieser Stelle auftrennen (zwei Endkappen) und getrennt einspeisen, oder einen Verbinder durch einen Flex-Verbinder ersetzen.`;
      return {ok:false,conflicts:marked,errors:[`Der Schutzleiter lässt sich in dieser Form nicht durchgängig führen. Ursache: ${names}. ${fix}`],warnings};
    }
    // Freie Wahl je zusammenhängendem Bauteil: Varianten bevorzugen, die es auch bei SLV gibt (T „innen“),
    // danach die vom Nutzer gewünschte Seite an der ersten Kante.
    const roots=[...new Set(E.map(e=>uf.find(e.i)[0]))];
    const evalAssign=assign=>{
      const bit=i=>{const [r,p]=uf.find(i);return assign[r]^p};
      let score=0;
      N.forEach(n=>{if(n.type==="T"){const v=variantT(n,arms[n.id],bit,E);if(v.startsWith("Tin"))score+=10}});
      if(prefs.firstSide&&E.length){const e=E[0];if(!e.diag&&sideOf(e.horiz,bit(0))===prefs.firstSide)score+=1}
      return {score,bit};
    };
    let best=null;
    if(roots.length<=12){
      for(let m=0;m<(1<<roots.length);m++){const asg={};roots.forEach((r,k)=>asg[r]=(m>>k)&1);const r=evalAssign(asg);if(!best||r.score>best.score)best=r}
    }else{const asg={};roots.forEach(r=>asg[r]=0);best=evalAssign(asg)}
    const bit=best.bit;
    // Ergebnis: Seiten je Kante (side für Achsen, sl = Richtung zum Schutzleiter), Varianten je Knoten
    const edges=E.map(e=>{const b=bit(e.i),sg=b?1:-1;return {...e,bit:b,side:e.diag?(b?"links":"rechts"):sideOf(e.horiz,b),sl:[e.nx*sg,e.ny*sg]}});
    const nodes=N.map(n=>{const a=arms[n.id];let part=null,variant=null,extra={};
      if(n.type==="end"){part="endcap"}
      if(n.type==="feed"){const d=Object.keys(a)[0],left=edges[a[d]].bit^cOf(n,d);variant=left?"links":"rechts";part=left?"feedL":"feedR";extra.dir=d}
      if(n.type==="L"){const h=a.E!=null?"E":"W",v=a.N!=null?"N":"S";const inner=edges[a[h]].side===v;variant=inner?"innen":"außen";part=inner?"Lin":"Lout"}
      if(n.type==="T"){part=variantT(n,a,bit,E);variant=PARTS[part].name.replace(/^T-Verbinder, Schutzleiter /,"")}
      if(n.type==="X"){part="X";extra.orient=edges[a.N].side==="W"?0:1}
      if(n.type==="flex"){part="flex";variant=n.angle+"°"}
      if(n.type==="I"){part="jointFeed"}
      return {...n,part,variant,arms:a,...extra};});
    if(nodes.some(n=>n.part&&(n.part==="ToutR"||n.part==="ToutL")))warnings.push("T-Verbinder „Schutzleiter außen“ gibt es nicht unter SLV-Nummer, nur direkt als EUTRAC-Artikel.");
    return {ok:true,edges,nodes,warnings,errors:[]};
  }
  function variantT(n,a,bit,E){
    const through=a.E!=null&&a.W!=null?["E","W"]:["N","S"];const b=["N","S","E","W"].find(d=>a[d]!=null&&!through.includes(d));
    const tEdge=a[through[0]], tH=isH(through[0]);const tSide=sideOf(tH,bit(tEdge));
    const inner=tSide===b; const bSide=sideOf(isH(b),bit(a[b])); const right=bSide===RIGHT[b];
    return (inner?"Tin":"Tout")+(right?"R":"L");
  }
  function label(n){const t={feed:"Einspeiser",end:"Endkappe",L:"L-Verbinder",T:"T-Verbinder",X:"X-Verbinder",flex:"Flex-Verbinder",I:"I-Verbinder"}[n.type]||n.type;return `${t} ${n.id}`}

  // ---------- Schienen zuschneiden ----------
  // Weniger Stücke zuerst, dann weniger Verschnitt; das letzte Stück wird bei Bedarf gekürzt.
  function cut(lenMM,maxM){
    const sizes=[4,3,2,1].filter(s=>s<=maxM).map(s=>s*1000);
    let best=null;
    const rec=(rest,pieces,start)=>{
      if(rest<=0){const waste=-rest;const c={pieces:[...pieces],waste};if(!best||c.pieces.length<best.pieces.length||(c.pieces.length===best.pieces.length&&c.waste<best.waste))best=c;return}
      if(best&&pieces.length>=best.pieces.length&&best.waste===0)return;
      if(pieces.length>12)return;
      for(let k=start;k<sizes.length;k++){pieces.push(sizes[k]);rec(rest-sizes[k],pieces,k);pieces.pop()}
    };
    rec(Math.round(lenMM),[],0);
    const pieces=best.pieces.sort((a,b)=>b-a);
    const lastCut=best.waste?pieces[pieces.length-1]-best.waste:null;
    return {pieces,waste:best.waste,cutTo:lastCut};
  }

  // ---------- Stückliste ----------
  // opts: {color, maxM, mount:'direct'|'clip'|'rod60'|'rod120'|'rope150'|'rope300'|'rope620', spacing (mm)}
  function bill(layout,solved,opts){
    const items={}, notes=[], checks=[];
    const add=(k,q,why)=>{if(!q)return;(items[k]=items[k]||{key:k,qty:0,why:[]}).qty+=q;if(why)items[k].why.push(why)};
    let joints=0, totalLen=0, cuts=[];
    solved.edges.forEach((e,i)=>{const c=cut(e.len,opts.maxM);totalLen+=e.len;
      c.pieces.forEach(p=>add("rail"+(p/1000),1));
      if(c.cutTo)cuts.push({edge:i,piece:c.pieces[c.pieces.length-1],to:c.cutTo});
      joints+=c.pieces.length-1;
      if(e.midFeed)add("feedMid",1,"Einspeisung in der Mitte");
      e.pieces=c.pieces;e.cutTo=c.cutTo;});
    add("joint",joints,"je Schienenstoß");
    solved.nodes.forEach(n=>{if(n.part)add(n.part,1)});
    // Befestigung
    const nNodes=solved.nodes.length;
    const pointsFor=sp=>solved.edges.reduce((s,e)=>s+Math.max(1,Math.ceil(e.len/sp))-1,0)+nNodes;
    if(opts.mount==="direct"||opts.mount==="clip"){
      const pts=pointsFor(333);
      if(opts.mount==="clip")add("deckenclip",pts,"je Befestigungspunkt");
      notes.push(`Befestigung: ca. ${pts} Schrauben mit Dübeln (nicht im EUTRAC-Lieferumfang), in die vorgestanzten Langlöcher, etwa alle 33 cm. So trägt die Schiene bis 10 kg je Last im Abstand von 33 cm.`);
    }else{
      const sp=opts.spacing||1000, pts=pointsFor(sp);
      add("stoss",joints,"an jedem Schienenstoß (statisch erforderlich)");
      add("pendelclip",Math.max(0,pts-joints),"an den übrigen Abhängepunkten");
      add(opts.mount,pts,"eine je Abhängepunkt");
      notes.push(`Abhängung: ${pts} Abhängepunkte im Abstand von höchstens ${sp/1000} m. Belastbarkeit laut EUTRAC: ${sp>=1000?"3 kg":"5 kg"} je Last bei Lasten im Abstand von 33 cm.`);
    }
    // Prüfungen
    const viaNode=solved.nodes.filter(n=>n.feedIn);
    const feeds=solved.nodes.filter(n=>n.type==="feed").length+solved.edges.filter(e=>e.midFeed).length+viaNode.length;
    if(viaNode.length)notes.push(`Einspeisung über ${viaNode.map(n=>label(n)).join(", ")}: Die Zuleitung wird direkt am Verbinder angeschlossen (Ausführung „mit Einspeisemöglichkeit“, kein eigener Einspeiser nötig).`);
    const ends=solved.nodes.filter(n=>n.type==="end").length;
    checks.push({ok:feeds>=1,text:feeds?`Einspeisung vorhanden (${feeds}×)`:"Keine Einspeisung – die Schiene bekommt keinen Strom."});
    if(feeds>1)checks.push({ok:false,warn:true,text:"Mehr als eine Einspeisung in einem zusammenhängenden System: nur zulässig, wenn die Stromkreise getrennt sind (z. B. Stromkreistrenner). Fachplaner fragen."});
    const free=solved.nodes.filter(n=>n.type==="end"||n.type==="feed").length;
    checks.push({ok:true,text:`Jedes freie Schienenende ist abgeschlossen: ${ends}× Endkappe, ${solved.nodes.filter(n=>n.type==="feed").length}× Einspeiser am Ende`});
    checks.push({ok:true,text:joints?`${joints} ${joints===1?"Schienenstoß":"Schienenstöße"} mit elektrischem Längsverbinder`:"Kein Schienenstoß – eine durchgehende Schiene"});
    checks.push({ok:true,text:"Schutzleiter durchgängig geführt; Einspeiser- und Verbindervarianten passend gewählt"});
    if(cuts.length)cuts.forEach(c=>notes.push(`Zuschnitt: eine ${c.piece/1000}-m-Schiene auf ${(c.to/1000).toLocaleString("de-DE",{minimumFractionDigits:2})} m kürzen (Absägen am Schienenende, Leiter müssen nicht nachbearbeitet werden).`));
    const list=Object.values(items).map(it=>({...it,...PARTS[it.key],...partNo(it.key,opts.color)}));
    const order=["rail4","rail3","rail2","rail1","feedR","feedL","feedMid","jointFeed","joint","Lin","Lout","TinR","TinL","ToutR","ToutL","X","flex","endcap","stoss","pendelclip","rod60","rod120","rope150","rope300","rope620","deckenclip"];
    list.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
    return {items:list,notes,checks,totalLen};
  }

  // ---------- Vorlage: gerade Schiene ----------
  // feed: 'left'|'right'|'mid'
  function straight(lenMM,feed){
    if(feed==="mid")return {nodes:[{id:"A",type:"end",x:0,y:0},{id:"B",type:"end",x:1,y:0}],edges:[{a:"A",b:"B",len:lenMM,midFeed:true}]};
    const L={id:"A",type:feed==="left"?"feed":"end",x:0,y:0},R={id:"B",type:feed==="right"?"feed":"end",x:1,y:0};
    return {nodes:[L,R],edges:[{a:"A",b:"B",len:lenMM}]};
  }

  // ---------- Gezeichnete Form (Raster) → Knoten und Schienen ----------
  // segs: Set von Einheitsstrecken "x,y,h" (waagrecht von x,y nach x+1,y) bzw. "x,y,v" (senkrecht nach x,y+1)
  // feeds: Set von Punkten "x,y" (nur an freien Enden wirksam), mids: Set von Einheitsstrecken mit Mitteneinspeiser
  // Platzbedarf der Verbinder ab Achsmitte laut Katalog: T/X 120 mm → 60 je Arm, L-Schenkel 78 mm außen → 60 ab Ecke,
  // Einspeiser 72 mm, Endkappe 6,5 mm. Die Schienenlänge ist die gezeichnete Achslänge minus diese Anteile.
  const DEDUCT={L:60,T:60,X:60,flex:60,I:60,feed:72,end:6.5};
  // opts.diags: Set schräger Schienen "x0,y0,x1,y1"; opts.flex: Set von Ecken "x,y", an denen statt L ein Flex-Verbinder sitzt
  function fromSegments(segs,feeds,mids,stepMM,opts={}){
    const diags=opts.diags||new Set(), flexPts=opts.flex||new Set();
    const adj={}, ulen={}; const k=(x,y)=>x+","+y;
    const link=(a,b,s)=>{(adj[a]=adj[a]||{})[b]=s};
    for(const s of segs){const [x,y,o]=s.split(",");const X=+x,Y=+y;ulen[s]=1;
      if(o==="h"){link(k(X,Y),k(X+1,Y),s);link(k(X+1,Y),k(X,Y),s)} else {link(k(X,Y),k(X,Y+1),s);link(k(X,Y+1),k(X,Y),s)}}
    for(const d of diags){const [x0,y0,x1,y1]=d.split(",").map(Number);ulen[d]=Math.hypot(x1-x0,y1-y0);link(k(x0,y0),k(x1,y1),d);link(k(x1,y1),k(x0,y0),d)}
    const P=Object.keys(adj); const isDiag=s=>s.split(",").length===4;
    const dirOf=(a,b)=>{const [ax,ay]=a.split(",").map(Number),[bx,by]=b.split(",").map(Number);return bx>ax?"E":bx<ax?"W":by>ay?"S":"N"};
    const hasDiag=p=>Object.values(adj[p]).some(isDiag);
    const isNode=p=>{const n=Object.keys(adj[p]);if(n.length!==2||hasDiag(p)||flexPts.has(p)||feeds.has(p))return true;const d=n.map(q=>dirOf(p,q));return !(OPP[d[0]]===d[1])};
    const nodes=[],edges=[],seen=new Set(),idOf={};
    P.filter(isNode).forEach((p,i)=>{const deg=Object.keys(adj[p]).length;const [x,y]=p.split(",").map(Number);
      const nb=Object.keys(adj[p]),straightThrough=deg===2&&OPP[dirOf(p,nb[0])]===dirOf(p,nb[1]);
      const type=deg===1?(feeds.has(p)?"feed":"end"):deg===2?(hasDiag(p)||flexPts.has(p)?"flex":straightThrough?"I":"L"):deg===3?"T":"X";
      // Einspeisung über einen Verbinder „mit Einspeisemöglichkeit“ (L, T, X, I, Flex laut Katalog)
      const feedIn=deg>=2&&feeds.has(p);
      const id=(type==="flex"?"F":type==="feed"?"E":type[0].toUpperCase())+(i+1);idOf[p]=id;nodes.push({id,type,x,y,key:p,...(feedIn?{feedIn:true}:{})})});
    // Ringe ohne Knoten gibt es nicht (gerade Ringe sind unmöglich); jede Kette läuft von Knoten zu Knoten
    nodes.forEach(n=>{Object.keys(adj[n.key]).forEach(q=>{
      const first=adj[n.key][q]; if(seen.has(first))return;
      let prev=n.key,cur=q,units=[first],mid=mids.has(first);seen.add(first);
      while(!idOf[cur]){const nx=Object.keys(adj[cur]).find(r=>r!==prev);const s=adj[cur][nx];seen.add(s);units.push(s);if(mids.has(s))mid=true;prev=cur;cur=nx}
      const axis=Math.round(units.reduce((t,u)=>t+ulen[u],0)*stepMM);const b=nodes.find(m=>m.key===cur);
      const rail=axis-DEDUCT[n.type]-DEDUCT[b.type];
      edges.push({a:n.id,b:b.id,len:rail,axis,midFeed:mid,units});
    })});
    // Kreuzungen ohne Verbinder (schräge Schiene über eine andere Schiene)
    const crossings=[];
    const lines=[...segs].map(s=>{const [x,y,o]=s.split(",");return [+x,+y,o==="h"?+x+1:+x,o==="h"?+y:+y+1,s]}).concat([...diags].map(d=>[...d.split(",").map(Number),d]));
    const cr=(ax,ay,bx,by,cx,cy)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    for(const d of diags){const [x0,y0,x1,y1]=d.split(",").map(Number);
      // Rasterpunkte im Inneren der Schrägen, an denen schon Schienen liegen
      const g=(a,b)=>b?g(b,a%b):Math.abs(a), n=g(x1-x0,y1-y0);
      for(let i=1;i<n;i++){const p=k(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n);if(adj[p]&&Object.keys(adj[p]).length>0){crossings.push(p);break}}
      for(const L of lines){if(L[4]===d)continue;const [a,b,c,e]=L;
        const d1=cr(x0,y0,x1,y1,a,b),d2=cr(x0,y0,x1,y1,c,e),d3=cr(a,b,c,e,x0,y0),d4=cr(a,b,c,e,x1,y1);
        if(d1*d2<0&&d3*d4<0){crossings.push(`${(x0+x1)/2},${(y0+y1)/2}`);break}}}
    return {nodes,edges,crossings};
  }
  // ---------- Gespeicherter Plan (kompakt, für Merkliste und Link) ----------
  // {m:"s"|"d", len, feed, side, st:Raster mm, l:[[x0,y0,x1,y1]…], fx:[[x,y]], fd:[[x,y]], md:[["x,y,h"|"x0,y0,x1,y1"]], a:[w,h], o:{maxLen,color,mount,spacing}, hv:[teil…]}
  function planSegs(plan){
    const segs=new Set(),diags=new Set();
    (plan.l||[]).forEach(([x0,y0,x1,y1])=>{
      if(y0===y1)for(let x=Math.min(x0,x1);x<Math.max(x0,x1);x++)segs.add(`${x},${y0},h`);
      else if(x0===x1)for(let y=Math.min(y0,y1);y<Math.max(y0,y1);y++)segs.add(`${x0},${y},v`);
      else diags.add(x0<x1?`${x0},${y0},${x1},${y1}`:`${x1},${y1},${x0},${y0}`)});
    const S=a=>new Set((a||[]).map(v=>Array.isArray(v)?v.join(","):String(v)));
    return {segs,diags,flex:S(plan.fx),feeds:S(plan.fd),mids:S(plan.md)};
  }
  // Einheitsstrecken zu möglichst langen Linien zusammenfassen
  function segsToLines(segs,diags){
    const H={},V={},out=[];
    for(const s of segs){const [x,y,o]=s.split(",");(o==="h"?(H[y]=H[y]||[]):(V[x]=V[x]||[])).push(o==="h"?+x:+y)}
    const runs=(arr,f)=>{arr.sort((a,b)=>a-b);let st=arr[0],pr=arr[0];for(let i=1;i<=arr.length;i++){if(arr[i]===pr+1){pr=arr[i];continue}f(st,pr+1);st=pr=arr[i]}};
    Object.entries(H).forEach(([y,xs])=>runs(xs,(a,b)=>out.push([a,+y,b,+y])));
    Object.entries(V).forEach(([x,ys])=>runs(ys,(a,b)=>out.push([+x,a,+x,b])));
    for(const d of diags||[])out.push(d.split(",").map(Number));
    return out;
  }
  function optsOf(plan){const o=plan.o||{};return {color:o.color||"weiss",maxM:+o.maxLen||3,mount:o.mount||"direct",spacing:+o.spacing||1000}}
  // Plan auswerten: Stückliste und Gesamtlänge, oder Fehler
  function evaluate(plan){
    let layout,solved;
    if(plan.m==="s"){if(!(plan.len>=300))return {ok:false,errors:["Keine gültige Länge."]};layout=straight(plan.len,plan.feed||"left");solved=solve(layout,{firstSide:plan.side})}
    else{const g=planSegs(plan);if(!g.segs.size&&!g.diags.size)return {ok:false,errors:["Noch nichts gezeichnet."]};
      layout=fromSegments(g.segs,g.feeds,g.mids,plan.st||500,{diags:g.diags,flex:g.flex});
      if(layout.crossings.length)return {ok:false,errors:["Eine schräge Schiene kreuzt eine andere Schiene."]};
      solved=solve(JSON.parse(JSON.stringify(layout)))}
    if(!solved.ok)return {ok:false,errors:solved.errors};
    const b=bill(layout,solved,optsOf(plan));
    return {ok:true,bill:b,totalLen:b.totalLen,feeds:solved.nodes.filter(n=>n.type==="feed").length+solved.edges.filter(e=>e.midFeed).length};
  }
  window.SchienenEngine={COLORS,PARTS,partNo,solve,bill,cut,straight,sideOf,RIGHT,fromSegments,DEDUCT,planSegs,segsToLines,evaluate};
})();
