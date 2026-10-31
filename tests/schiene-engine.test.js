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
process.exit(fail?1:0);
