// Prüft den Schienenplaner-Rechenkern gegen das Planungsbeispiel im EUTRAC-Katalog 06/2022, S. 88.
// Aufruf: node tests/schiene-engine.test.js
global.window={};require('../schiene-engine.js');const E=window.SchienenEngine;
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('✗',m)}else console.log('✓',m)};
const L=(nodes,pairs)=>({nodes,edges:pairs.map(([a,b])=>({a,b,len:1000}))});
// Katalogbeispiel: Rahmen mit T oben, X unten Mitte, drei Einspeisern
const ex=E.solve(L([
 {id:"TL",type:"L",x:0,y:0},{id:"Ttop",type:"T",x:10,y:0},{id:"Fo",type:"feed",x:20,y:0},
 {id:"BL",type:"L",x:0,y:10},{id:"X",type:"X",x:10,y:10},{id:"BR",type:"L",x:20,y:10},{id:"Fr",type:"feed",x:20,y:4},{id:"Fu",type:"feed",x:10,y:20}],
 [["TL","Ttop"],["Ttop","Fo"],["TL","BL"],["Ttop","X"],["BL","X"],["X","BR"],["BR","Fr"],["X","Fu"]]));
const want={TL:"Lin",BL:"Lin",Ttop:"TinR",Fo:"feedL",Fr:"feedL",BR:"Lout",Fu:"feedR",X:"X"};
ok(ex.ok,"Katalogbeispiel lösbar");
Object.entries(want).forEach(([id,p])=>ok(ex.nodes.find(n=>n.id===id).part===p,`Katalogbeispiel ${id} = ${E.PARTS[p].e}`));
// Schleife, die genau einmal gerade durch ein X läuft: nicht lösbar
const bad=E.solve(L([{id:"A",type:"L",x:0,y:0},{id:"X",type:"X",x:10,y:0},{id:"B",type:"L",x:20,y:0},{id:"C",type:"L",x:0,y:10},{id:"D",type:"L",x:20,y:10},{id:"Eo",type:"end",x:10,y:-5},{id:"Eu",type:"feed",x:10,y:5}],
 [["A","X"],["X","B"],["A","C"],["B","D"],["C","D"],["X","Eo"],["X","Eu"]]));
ok(!bad.ok,"Schleife einmal gerade durch X wird als Widerspruch erkannt");
// Gerade Schiene: Einspeiser-Variante folgt der Seite des Schutzleiters
ok(E.solve(E.straight(3000,"left"),{firstSide:"S"}).nodes[0].part==="feedR","gerade, links eingespeist, SL Süd → Einspeiser rechts");
ok(E.solve(E.straight(3000,"left"),{firstSide:"N"}).nodes[0].part==="feedL","gerade, links eingespeist, SL Nord → Einspeiser links");
// Zuschnitt
const c=E.cut(5200,3);ok(c.pieces.join()==="3000,3000"&&c.cutTo===2200,"5,20 m aus 2 × 3 m, eine auf 2,20 m gekürzt");
// Gezeichnete Form (Raster) → Knoten und Schienen
const segsOf=lines=>{const s=new Set();lines.forEach(([a,b,x,y])=>{if(b===y)for(let i=Math.min(a,x);i<Math.max(a,x);i++)s.add(`${i},${b},h`);else for(let j=Math.min(b,y);j<Math.max(b,y);j++)s.add(`${a},${j},v`)});return s};
const g1=E.fromSegments(segsOf([[0,0,6,0]]),new Set(["0,0"]),new Set(),500);
ok(g1.nodes.length===2&&g1.edges.length===1&&g1.edges[0].axis===3000&&g1.edges[0].len===3000-72-6.5,"gezeichnet 3 m gerade: Schiene = Achse − Einspeiser − Endkappe");
const hx=E.fromSegments(segsOf([[0,0,0,6],[8,0,8,6],[0,3,8,3],[4,0,4,6]]),new Set(["0,0"]),new Set(),500);
ok(hx.nodes.filter(n=>n.type==="T").length===2&&hx.nodes.filter(n=>n.type==="X").length===1&&hx.edges.length===8,"H mit X: 2 T, 1 X, 8 Schienen");
ok(E.solve(JSON.parse(JSON.stringify(hx))).ok,"H mit X lösbar");
const ring=E.fromSegments(segsOf([[0,1,8,1],[8,1,8,6],[8,6,0,6],[0,6,0,1],[4,0,4,3]]),new Set(["4,3"]),new Set(),500);
ok(!E.solve(JSON.parse(JSON.stringify(ring))).ok,"gezeichneter Rahmen mit X-Stummel: Widerspruch");
const fr=E.fromSegments(segsOf([[0,0,8,0],[8,0,8,6],[8,6,0,6],[0,6,0,0]]),new Set(),new Set(["4,0,h"]),500);
ok(fr.edges.some(e=>e.midFeed)&&fr.nodes.every(n=>n.type==="L"),"Rahmen mit Mitteneinspeiser: 4 L");
// Widerspruch: Ursache ist das X, nicht ein L im Ring
const rs=E.solve(JSON.parse(JSON.stringify(ring)));
ok(rs.conflicts.length===1&&ring.nodes.find(n=>n.id===rs.conflicts[0].node).type==="X","Widerspruch wird am X-Verbinder markiert");
// Flex-Verbinder und schräge Schienen
const tr=E.fromSegments(segsOf([[0,0,4,0],[8,4,12,4]]),new Set(["0,0"]),new Set(),500,{diags:new Set(["4,0,8,4"])});
const trs=E.solve(JSON.parse(JSON.stringify(tr)));
ok(trs.ok&&trs.nodes.filter(n=>n.part==="flex").length===2&&trs.nodes.filter(n=>n.part==="flex").every(n=>n.angle===135),"Schräge zwischen zwei Waagrechten: 2 Flex-Verbinder à 135°");
const dg=tr.edges.find(e=>e.units[0].split(",").length===4);
ok(Math.abs(dg.axis-Math.round(Math.hypot(4,4)*500))<1&&dg.len===dg.axis-120,"Schräge: Achse = Diagonale, Schiene = Achse − 2 × 6 cm");
const hs=trs.edges.filter(e=>!e.diag).map(e=>e.side);ok(hs[0]===hs[1],"Flex: Schutzleiter bleibt in Laufrichtung auf derselben Seite");
const lf=E.solve(JSON.parse(JSON.stringify(E.fromSegments(segsOf([[0,0,6,0],[6,0,6,4]]),new Set(["0,0"]),new Set(),500,{flex:new Set(["6,0"])})))),
      ll=E.solve(JSON.parse(JSON.stringify(E.fromSegments(segsOf([[0,0,6,0],[6,0,6,4]]),new Set(["0,0"]),new Set(),500))));
ok(lf.nodes.some(n=>n.part==="flex"&&n.angle===90)&&lf.edges.map(e=>e.side).join()===ll.edges.map(e=>e.side).join(),"Flex an 90°-Ecke statt L, gleiche Schutzleiterlage");
const dt=E.fromSegments(segsOf([[0,0,8,0]]),new Set(["0,0"]),new Set(),500,{diags:new Set(["4,0,7,3"])});
ok(!E.solve(JSON.parse(JSON.stringify(dt))).ok,"Schräge an T-Knoten wird abgelehnt");
const cx=E.fromSegments(segsOf([[2,0,2,4]]),new Set(),new Set(),500,{diags:new Set(["0,1,4,3"])});
ok(cx.crossings.length===1,"Schräge über eine andere Schiene: Kreuzung erkannt");
// Einspeisung über Verbinder
const fi=E.fromSegments(segsOf([[0,0,6,0],[6,0,6,4]]),new Set(["6,0"]),new Set(),500);
const fis=E.solve(JSON.parse(JSON.stringify(fi))),fib=E.bill(fi,fis,{color:"weiss",maxM:3,mount:"direct"});
ok(fis.ok&&fis.nodes.find(n=>n.type==="L").feedIn&&!fib.items.some(i=>/^feed[RL]$/.test(i.key))&&fib.checks[0].ok,"Einspeisung am L-Verbinder: kein Einspeiser nötig, Einspeisung erkannt");
const ii=E.fromSegments(segsOf([[0,0,8,0]]),new Set(["4,0"]),new Set(),500);
const iis=E.solve(JSON.parse(JSON.stringify(ii)));
ok(iis.ok&&iis.nodes.some(n=>n.part==="jointFeed")&&ii.edges.length===2&&ii.edges[0].len===2000-60-6.5,"Einspeisung mitten in gerader Linie → I-Verbinder mit Einspeisemöglichkeit");
// Gedrehte Verbinder: nur die Winkel zwischen den Armen zählen
const rx=E.fromSegments(new Set(),new Set(["0,0"]),new Set(),500,{diags:new Set(["0,0,2,2","2,2,4,4","0,4,2,2","2,2,4,0"])});
const rxs=E.solve(JSON.parse(JSON.stringify(rx)));
ok(rxs.ok&&rxs.nodes.filter(n=>n.part==="X").length===1,"X-Verbinder um 45° gedreht: lösbar");
// H mit X um 45° gedreht → dieselben Verbinder wie ungedreht
const rot=([a,b,c,d])=>[a-b+10,a+b,c-d+10,c+d];
const hxLines=[[0,0,0,6],[8,0,8,6],[0,3,8,3],[4,0,4,6]];
const toSets=(lines,feed)=>{const segs=new Set(),diags=new Set();lines.forEach(l=>{const [x0,y0,x1,y1]=l;if(y0===y1||x0===x1){segsOf([l]).forEach(u=>segs.add(u))}else{
  // in Teilstücke an Rasterpunkten der anderen Linien zerlegen: an jedem Punkt mit ganzzahligem Parameter teilen, wo andere Linien enden/kreuzen
  diags.add(x0<x1?`${x0},${y0},${x1},${y1}`:`${x1},${y1},${x0},${y0}`)}});return {segs,diags,feed}};
// gedrehte Linien an Knotenpunkten teilen (Knoten des ungedrehten H: Enden, T bei y=3, X bei (4,3))
const split=[[0,0,0,3],[0,3,0,6],[8,0,8,3],[8,3,8,6],[0,3,4,3],[4,3,8,3],[4,0,4,3],[4,3,4,6]];
const R=toSets(split.map(rot));
const rh=E.fromSegments(R.segs,new Set([rot([0,0,0,0]).slice(0,2).join(",")]),new Set(),500,{diags:R.diags});
const rhs=E.solve(JSON.parse(JSON.stringify(rh)));
const parts=sol=>sol.nodes.map(n=>n.part).sort().join();
ok(rhs.ok&&parts(rhs)===parts(E.solve(JSON.parse(JSON.stringify(hx)))),"H mit X um 45° gedreht: dieselben Verbinder wie ungedreht ("+(rhs.ok?parts(rhs):rhs.errors)+")");
const di=E.fromSegments(new Set(),new Set(),new Set(["2,0,4,2"]),500,{diags:new Set(["2,0,4,2","2,4,4,2","0,2,2,4","0,2,2,0"])});
ok(E.solve(JSON.parse(JSON.stringify(di))).nodes.every(n=>n.type==="L"),"Raute mit rechten Winkeln: vier L-Verbinder (gedreht)");
process.exit(fail?1:0);
