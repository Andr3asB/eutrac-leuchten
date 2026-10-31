// Merkliste im Sitzungs-Cookie.
// Bietet dieselbe kleine API, die app.js nutzt (doc().set/update/delete, collection().add/onSnapshot),
// speichert aber alles als JSON in Cookies ohne Ablaufdatum. Solche Sitzungs-Cookies löscht der Browser beim Beenden.
// Ein Cookie fasst etwa 4 KB. Der Inhalt wird kompakt kodiert (Base64) und bei Bedarf auf merkliste_0, merkliste_1 verteilt.
(function(){
  // Höchstens 2 × 3500 Zeichen: Cookies werden bei jedem Seitenaufruf mitgeschickt und Server begrenzen die Header-Größe.
  const NAME="merkliste", CHUNK=3500, MAX_CHUNKS=2;
  // Pfad = Ordner der Seite (z. B. /eutrac-leuchten/), damit andere Projekte auf derselben github.io-Domain nicht kollidieren.
  const PATH=location.pathname.replace(/[^/]*$/,"")||"/";
  const SECURE=location.protocol==="https:"?"; Secure":"";

  function readCookies(){
    const all={};
    document.cookie.split(/;\s*/).forEach(p=>{const i=p.indexOf("=");if(i>0)all[p.slice(0,i)]=p.slice(i+1)});
    return all;
  }
  // Kompaktes Format: {r:[[name,[gruppen]]…], z:[[leuchte,raumIndex,gruppe,stueck]…]}
  function pack(data){
    const ids=Object.entries(data.raeume).sort((a,b)=>(a[1].pos||0)-(b[1].pos||0));
    const idx=Object.fromEntries(ids.map(([id],i)=>[id,i]));
    const z=Object.values(data.zuordnung).filter(a=>a.raum in idx).sort((a,b)=>(a.t||0)-(b.t||0))
      .map(a=>[a.leuchte,idx[a.raum],a.gruppe||"",a.stueck]);
    return {r:ids.map(([,v])=>[v.name,v.gruppen||[]]),z};
  }
  function unpack(p){
    const data={raeume:{},zuordnung:{}};
    (p.r||[]).forEach(([name,gruppen],i)=>data.raeume["r"+i]={name,gruppen,pos:i});
    (p.z||[]).forEach(([leuchte,ri,gruppe,stueck],i)=>data.zuordnung["z"+i]={leuchte,raum:"r"+ri,gruppe,stueck,t:i});
    return data;
  }
  const toB64=str=>{const b=new TextEncoder().encode(str);let s="";b.forEach(x=>s+=String.fromCharCode(x));return btoa(s)};
  const fromB64=b64=>new TextDecoder().decode(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)));

  function load(){
    try{
      const c=readCookies(), n=+c[NAME+"_n"]||0; let s="";
      for(let i=0;i<n;i++){ if(c[NAME+"_"+i]==null) return null; s+=c[NAME+"_"+i] }
      return n?unpack(JSON.parse(fromB64(s))):null;
    }catch(e){ return null }
  }
  function setCookie(k,v){ document.cookie=k+"="+v+"; path="+PATH+"; SameSite=Lax"+SECURE }
  function delCookie(k){ document.cookie=k+"=; path="+PATH+"; max-age=0; SameSite=Lax"+SECURE }
  function save(data){
    const s=toB64(JSON.stringify(pack(data))), parts=[];
    for(let i=0;i<s.length;i+=CHUNK) parts.push(s.slice(i,i+CHUNK));
    if(parts.length>MAX_CHUNKS){ const e=new Error("Die Merkliste ist zu groß für den Cookie-Speicher. Bitte nicht mehr benötigte Einträge entfernen."); e.code="too_large"; throw e }
    const old=+readCookies()[NAME+"_n"]||0;
    parts.forEach((p,i)=>setCookie(NAME+"_"+i,p));
    for(let i=parts.length;i<old;i++) delCookie(NAME+"_"+i);
    setCookie(NAME+"_n",parts.length);
  }

  function cookiesWork(){
    try{ setCookie(NAME+"_test","1"); const ok=readCookies()[NAME+"_test"]==="1"; delCookie(NAME+"_test"); return ok }
    catch(e){ return false }
  }

  function open(){
    const persistent=cookiesWork();
    let data=(persistent&&load())||{raeume:{},zuordnung:{}};
    let last=JSON.stringify(data);
    const listeners={raeume:[],zuordnung:[]};

    const snap=col=>({docs:Object.entries(data[col]||{}).map(([id,v])=>({id,exists:true,data:()=>({...v})}))});
    const emit=col=>listeners[col].forEach(cb=>{try{cb(snap(col))}catch(e){console.error(e)}});
    let before=null;
    const begin=()=>{ before=JSON.stringify(data) };
    const commit=cols=>{
      if(persistent){ try{ save(data) }catch(e){ data=JSON.parse(before); throw e } }
      last=JSON.stringify(data); cols.forEach(emit);
    };
    const split=path=>{const i=path.indexOf("/");return [path.slice(0,i),path.slice(i+1)]};
    const ensure=col=>{ if(!data[col]) data[col]={}; if(!listeners[col]) listeners[col]=[]; return data[col] };

    // Änderungen aus anderen Tabs übernehmen (Sitzungs-Cookies gelten für alle Tabs desselben Browsers)
    const resync=()=>{ if(!persistent) return; const d=load()||{raeume:{},zuordnung:{}}, s=JSON.stringify(d);
      if(s!==last){ data=d; last=s; Object.keys(listeners).forEach(emit) } };
    window.addEventListener("focus",resync);
    document.addEventListener("visibilitychange",()=>{ if(!document.hidden) resync() });

    return {
      persistent,
      doc(path){
        const [col,id]=split(path);
        return {
          async set(v){ begin(); ensure(col)[id]={...v}; commit([col]) },
          async update(v){ begin(); const c=ensure(col); if(!c[id]){const e=new Error("not found");e.code="not_found";throw e}
            c[id]={...c[id],...v}; commit([col]) },
          async delete(){ begin(); delete ensure(col)[id]; commit([col]) }
        };
      },
      collection(col){
        return {
          async add(v){ begin(); const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6); ensure(col)[id]={...v}; commit([col]); return {id} },
          onSnapshot(cb){ ensure(col); listeners[col].push(cb); setTimeout(()=>cb(snap(col)),0); return ()=>{listeners[col]=listeners[col].filter(f=>f!==cb)} }
        };
      }
    };
  }

  window.MerklisteStore={open};
})();
