// Angriffstest (Playwright): präparierte, echt verschlüsselte gemeinsame Liste gegen die Seite.
// Aufruf: lokalen Server auf Port 8765 starten (python3 -m http.server 8765), optional alte Version auf 8766, dann node tests/xss-shared-list.poc.js
// Erwartung für die aktuelle Version: „ausgeführt=[]“ und „eingeschleuste <img>=0“ – mit und ohne CSP.
// Angriffstest: präparierte gemeinsame Liste (echt verschlüsselt) gegen alte und neue Version
const {chromium}=require('playwright');
const SB='https://yvpnuitixodicbgfteei.supabase.co';
(async()=>{const b=await chromium.launch();
async function mockSupabase(ctx,store){
  await ctx.route(SB+'/rest/v1/rpc/**',async route=>{const fn=route.request().url().split('/rpc/')[1].split('?')[0];const a=JSON.parse(route.request().postData()||'{}');
    if(fn==='merkliste_create'){store[a.p_id]={salt:a.p_salt,has_pw:a.p_has_pw,ct:a.p_ct,version:1};return route.fulfill({status:200,contentType:'application/json',body:'1'})}
    if(fn==='merkliste_get'){const r=store[a.p_id];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r?[r]:[])})}
    return route.fulfill({status:200,contentType:'application/json',body:'1'})});
  await ctx.route(SB+'/realtime/**',r=>r.abort());
}
const mark=t=>`<img src=x onerror="(window.__xss=window.__xss||[]).push('${t}')">`;
const evil={raeume:{['wz"><'+'img src=x onerror="(window.__xss=window.__xss||[]).push(\'raumid\')">']:{name:"Böser Raum",gruppen:["Decke"],pos:1},ok:{name:"Wohnzimmer",gruppen:["Decke"],pos:2}},
  zuordnung:{a:{leuchte:"SLV_1004074",raum:"ok",gruppe:"Decke",stueck:'2"><'+mark('stueck').slice(1),t:1},
             ["b\"><"+mark('zuordnungid').slice(1)]:{leuchte:"SLV_1004074",raum:"ok",gruppe:"Decke",stueck:1,t:2}},
  schienen:{s2:{raum:"ok",name:"Galerie",t:1,plan:{m:"d",st:500,l:[[0,0,8,0]],fd:[[0,0]],a:[1e7,1e7]},platz:[["SLV_1004074",1000,0,'1"><'+mark('kreis').slice(1)]],kreise:[{n:mark('kreisname'),m:"dim",a:'x" onmouseover="alert(1)',v:"ab",ch:mark('kanal')}]}}};
async function run(label,port,stripCsp){
  const store={};
  const att=await b.newContext();await mockSupabase(att,store);const ap=await att.newPage();
  await ap.goto(`http://localhost:${port}/impressum.html`);await ap.addScriptTag({url:`http://localhost:${port}/config.js`});await ap.addScriptTag({url:`http://localhost:${port}/vendor/supabase-2.117.3.js`});await ap.addScriptTag({url:`http://localhost:${port}/merkliste-store.js`});
  const res=await ap.evaluate(async d=>MerklisteStore.createShared(d,""),evil);await att.close();
  const vic=await b.newContext({viewport:{width:1300,height:900}});await mockSupabase(vic,store);
  await vic.addCookies([{name:'merkliste_tour',value:'lsb',url:`http://localhost:${port}/`}]);
  if(stripCsp)await vic.route(`http://localhost:${port}/*.html*`,async r=>{const resp=await r.fetch();const body=(await resp.text()).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');r.fulfill({response:resp,body})});
  const out=[];
  for(const page of ['index.html','belegung.html?plan=s2']){
    const p=await vic.newPage();const dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());d.dismiss()});let csp=0;p.on('console',m=>{if(/Content Security Policy/i.test(m.text()))csp++});
    await p.goto(`http://localhost:${port}/${page}${res.hash}`);await p.waitForTimeout(3500);
    if(page.startsWith('index'))await p.evaluate(()=>{window.dispatchEvent(new Event('beforeprint'))});await p.waitForTimeout(300);
    const r=await p.evaluate(()=>({xss:window.__xss||[],imgs:document.querySelectorAll('img[src="x"]').length,svgOk:!!document.getElementById('blSvg'),g:document.querySelectorAll('rect,line').length}));
    out.push(`${page.split('?')[0]}: ausgeführt=[${r.xss.join(',')}] eingeschleuste <img>=${r.imgs} CSP-Blockaden=${csp} dialoge=${dialogs.length}${page.startsWith('bel')?` grafik=${r.svgOk?'ok':'fehlt'}`:''}`);
    await p.close()}
  console.log(`${label}:\n  `+out.join('\n  '));await vic.close();
}
await run('ALT (vor der Korrektur)',8766,false);
await run('NEU mit CSP',8765,false);
await run('NEU ohne CSP (nur Maskierung + Prüfung)',8765,true);
await b.close()})();
