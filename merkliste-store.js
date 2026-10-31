// Speicher für die Merkliste. Zwei Betriebsarten mit derselben kleinen API, die app.js nutzt
// (doc().set/update/delete, collection().add/onSnapshot):
//
// 1. Lokal: Sitzungs-Cookies in diesem Browser (ohne Ablaufdatum, gelöscht beim Beenden des Browsers).
// 2. Gemeinsam: Ende-zu-Ende-verschlüsselt in Supabase. Der Link enthält Listen-ID und einen zufälligen
//    Schlüssel im #-Teil (wird nie an einen Server geschickt). Aus Schlüssel + optionalem Passwort leitet
//    der Browser per PBKDF2 einen AES-GCM-Schlüssel und ein Schreib-Token ab. Supabase sieht nur Chiffretext.
(function(){
  // ---------- Hilfsfunktionen ----------
  const enc=new TextEncoder(), dec=new TextDecoder();
  const b64u=bytes=>{let s="";new Uint8Array(bytes).forEach(x=>s+=String.fromCharCode(x));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")};
  const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)),c=>c.charCodeAt(0));
  const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const rand=n=>crypto.getRandomValues(new Uint8Array(n));
  const clone=o=>JSON.parse(JSON.stringify(o));
  const empty=()=>({raeume:{},zuordnung:{},schienen:{}});
  const err=(code,msg)=>{const e=new Error(msg||code);e.code=code;return e};

  // ---------- Cookie-Speicher (lokal) ----------
  // Höchstens 2 × 3500 Zeichen: Cookies werden bei jedem Seitenaufruf mitgeschickt und Server begrenzen die Header-Größe.
  const NAME="merkliste", CHUNK=3500, MAX_CHUNKS=2;
  const PATH=location.pathname.replace(/[^/]*$/,"")||"/";
  const SECURE=location.protocol==="https:"?"; Secure":"";
  function readCookies(){const all={};document.cookie.split(/;\s*/).forEach(p=>{const i=p.indexOf("=");if(i>0)all[p.slice(0,i)]=p.slice(i+1)});return all}
  function setCookie(k,v){document.cookie=k+"="+v+"; path="+PATH+"; SameSite=Lax"+SECURE}
  function delCookie(k){document.cookie=k+"=; path="+PATH+"; max-age=0; SameSite=Lax"+SECURE}
  // Kompaktes Format: {r:[[name,[gruppen]]…], z:[[leuchte,raumIndex,gruppe,stueck]…], s:[[raumIndex,name,plan]…]} (s = Schienenpläne)
  function pack(data){
    const ids=Object.entries(data.raeume).sort((a,b)=>(a[1].pos||0)-(b[1].pos||0));
    const idx=Object.fromEntries(ids.map(([id],i)=>[id,i]));
    const z=Object.values(data.zuordnung).filter(a=>a.raum in idx).sort((a,b)=>(a.t||0)-(b.t||0)).map(a=>[a.leuchte,idx[a.raum],a.gruppe||"",a.stueck]);
    const sp=Object.entries(data.schienen||{}).filter(([,a])=>a.raum in idx).sort((a,b)=>(a[1].t||0)-(b[1].t||0)).map(([id,a])=>[idx[a.raum],a.name||"",a.plan||{},id]);
    // Raum-IDs mitspeichern, damit Links wie schiene.html?raum=… nach dem Neuladen gültig bleiben
    const out={r:ids.map(([id,v])=>[v.name,v.gruppen||[],id]),z};if(sp.length)out.s=sp;return out;
  }
  function unpack(p){
    const data=empty();
    const rid=(p.r||[]).map(([,,id],i)=>id||"r"+i);
    (p.r||[]).forEach(([name,gruppen],i)=>data.raeume[rid[i]]={name,gruppen,pos:i});
    (p.z||[]).forEach(([leuchte,ri,gruppe,stueck],i)=>data.zuordnung["z"+i]={leuchte,raum:rid[ri],gruppe,stueck,t:i});
    (p.s||[]).forEach(([ri,name,plan,id],i)=>data.schienen[id||"s"+i]={raum:rid[ri],name,plan,t:i});
    return data;
  }
  const toB64=str=>b64u(enc.encode(str)), fromB64=s=>dec.decode(unb64u(s));
  const cookieStore={
    works(){try{setCookie(NAME+"_test","1");const ok=readCookies()[NAME+"_test"]==="1";delCookie(NAME+"_test");return ok}catch(e){return false}},
    load(){try{const c=readCookies(),n=+c[NAME+"_n"]||0;let s="";for(let i=0;i<n;i++){if(c[NAME+"_"+i]==null)return null;s+=c[NAME+"_"+i]}return n?unpack(JSON.parse(fromB64(s))):null}catch(e){return null}},
    save(data){
      const s=toB64(JSON.stringify(pack(data))),parts=[];
      for(let i=0;i<s.length;i+=CHUNK)parts.push(s.slice(i,i+CHUNK));
      if(parts.length>MAX_CHUNKS)throw err("too_large","Die Merkliste ist zu groß für den Cookie-Speicher. Bitte nicht mehr benötigte Einträge entfernen oder eine gemeinsame Liste anlegen.");
      const old=+readCookies()[NAME+"_n"]||0;
      parts.forEach((p,i)=>setCookie(NAME+"_"+i,p));for(let i=parts.length;i<old;i++)delCookie(NAME+"_"+i);setCookie(NAME+"_n",parts.length);
    },
    // Merkt sich die zuletzt geöffnete gemeinsame Liste im Sitzungsspeicher des Tabs.
    // Bewusst KEIN Cookie: Der Link enthält den Schlüssel, und Cookies gehen bei jedem Aufruf an den Server.
    getShared(){try{return sessionStorage.getItem("ml_shared")||""}catch(e){return ""}},
    setShared(v){try{v?sessionStorage.setItem("ml_shared",v):sessionStorage.removeItem("ml_shared")}catch(e){}}
  };

  // Altes Cookie aus früheren Versionen entfernen (enthielt den Link samt Schlüssel)
  try{if(readCookies()[NAME+"_shared"]!=null)delCookie(NAME+"_shared")}catch(e){}

  // ---------- Kryptografie ----------
  const ITER=310000;
  async function deriveKeys(secret,password,salt,id){
    const material=new Uint8Array([...secret,...enc.encode(password||"")]);
    const base=await crypto.subtle.importKey("raw",material,"PBKDF2",false,["deriveBits"]);
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITER},base,512));
    return keysFromBits(bits,id);
  }
  async function keysFromBits(bits,id){
    const key=await crypto.subtle.importKey("raw",bits.slice(0,32),"AES-GCM",false,["encrypt","decrypt"]);
    const writeToken=hex(bits.slice(32));
    const writeHash=hex(await crypto.subtle.digest("SHA-256",enc.encode(writeToken)));
    return {key,writeToken,writeHash,bits,aad:enc.encode("merkliste:"+id)};
  }
  async function encryptData(k,data){
    const iv=rand(12);
    const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:k.aad},k.key,enc.encode(JSON.stringify(data)));
    return b64u(new Uint8Array([...iv,...new Uint8Array(ct)]));
  }
  async function decryptData(k,s){
    const raw=unb64u(s);
    try{const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:raw.slice(0,12),additionalData:k.aad},k.key,raw.slice(12));return JSON.parse(dec.decode(pt))}
    catch(e){throw err("bad_key","Passwort falsch oder Link unvollständig.")}
  }
  // Abgeleitete Schlüssel pro Tab merken, damit das Passwort beim Neuladen nicht erneut nötig ist
  const keyCache={
    get(id){try{const v=sessionStorage.getItem("ml_key_"+id);return v?unb64u(v):null}catch(e){return null}},
    set(id,bits){try{sessionStorage.setItem("ml_key_"+id,b64u(bits))}catch(e){}},
    del(id){try{sessionStorage.removeItem("ml_key_"+id)}catch(e){}}
  };

  // ---------- Link ----------
  // #liste=<uuid>.<schlüssel>
  function parseLink(hash){
    const m=/(?:^#|&)liste=([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})/.exec(hash||"");
    return m?{id:m[1],secret:unb64u(m[2]),hash:"#liste="+m[1]+"."+m[2]}:null;
  }
  const linkFor=(id,secret)=>location.origin+location.pathname+"#liste="+id+"."+b64u(secret);

  // ---------- Supabase ----------
  let sbClient=null;
  function sb(){
    const c=window.MERKLISTE_CONFIG||{};
    if(!c.supabaseUrl||!c.supabaseAnonKey)throw err("not_configured","Gemeinsame Listen sind noch nicht eingerichtet (config.js).");
    if(!window.supabase)throw err("offline","Die Verbindung zum Speicherdienst konnte nicht geladen werden.");
    return sbClient||(sbClient=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}}));
  }
  async function rpc(fn,args){
    const {data,error}=await sb().rpc(fn,args);
    if(error){ if(error.code==="42501")throw err("forbidden","Keine Schreibberechtigung für diese Liste."); throw err("network",error.message) }
    return data;
  }
  async function fetchRow(id){
    const rows=await rpc("merkliste_get",{p_id:id});
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row)throw err("not_found","Diese gemeinsame Liste gibt es nicht (mehr).");
    return row;
  }
  const configured=()=>{const c=window.MERKLISTE_CONFIG||{};return !!(c.supabaseUrl&&c.supabaseAnonKey)};

  // ---------- Kern: Daten + Beobachter, unabhängig vom Speicher ----------
  function makeStore(backend,initial){
    let data=initial||empty();
    const listeners={raeume:[],zuordnung:[]};
    const snap=col=>({docs:Object.entries(data[col]||{}).map(([id,v])=>({id,exists:true,data:()=>({...v})}))});
    const emit=col=>(listeners[col]||[]).forEach(cb=>{try{cb(snap(col))}catch(e){console.error(e)}});
    const emitAll=()=>Object.keys(listeners).forEach(emit);
    const split=path=>{const i=path.indexOf("/");return [path.slice(0,i),path.slice(i+1)]};
    const col=(d,c)=>d[c]||(d[c]={});
    let queue=Promise.resolve();
    // fn verändert eine Kopie der Daten; bei gleichzeitigen Änderungen wendet das Backend fn erneut auf den neuesten Stand an
    const mutate=fn=>{const p=queue.then(async()=>{data=await backend.write(data,fn);emitAll()});queue=p.catch(()=>{});return p};
    const api={
      mode:backend.mode, persistent:backend.persistent!==false,
      doc(path){const [c,id]=split(path);return{
        set:v=>mutate(d=>{col(d,c)[id]={...v}}),
        update:v=>mutate(d=>{const x=col(d,c);if(!x[id])throw err("not_found","Eintrag wurde inzwischen gelöscht.");x[id]={...x[id],...v}}),
        delete:()=>mutate(d=>{delete col(d,c)[id]})}},
      collection(c){return{
        async add(v){const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);await mutate(d=>{col(d,c)[id]={...v}});return{id}},
        onSnapshot(cb){(listeners[c]||(listeners[c]=[])).push(cb);setTimeout(()=>cb(snap(c)),0);return()=>{listeners[c]=listeners[c].filter(f=>f!==cb)}}}},
      _replace(d){data=d;emitAll()}, _data:()=>clone(data)
    };
    return api;
  }

  // ---------- Lokale Liste ----------
  function openLocal(){
    const persistent=cookieStore.works();
    let store;
    const backend={mode:"local",persistent,
      async write(cur,fn){const next=clone(cur);fn(next);if(persistent)cookieStore.save(next);return next}};
    store=makeStore(backend,(persistent&&cookieStore.load())||empty());
    // Änderungen aus anderen Tabs übernehmen (Sitzungs-Cookies gelten für alle Tabs desselben Browsers)
    let last=JSON.stringify(store._data());
    const resync=()=>{if(!persistent)return;const d=cookieStore.load()||empty(),s=JSON.stringify(d);if(s!==last){last=s;store._replace(d)}};
    window.addEventListener("focus",resync);document.addEventListener("visibilitychange",()=>{if(!document.hidden)resync()});
    const origWrite=backend.write;backend.write=async(c,f)=>{const n=await origWrite(c,f);last=JSON.stringify(n);return n};
    return store;
  }

  // ---------- Gemeinsame Liste ----------
  async function connectShared(link,keys,row){
    let version=row.version;
    const first=await decryptData(keys,row.ct);
    let store, channel=null, onRemote=()=>{}, closed=false;
    const refresh=async()=>{
      if(closed)return;
      try{const r=await fetchRow(link.id);if(r.version>version){const d=await decryptData(keys,r.ct);version=r.version;store._replace(d);onRemote()}}
      catch(e){if(e.code==="not_found")onRemote(e)}
    };
    const backend={mode:"shared",
      async write(cur,fn){
        let base=cur;
        for(let attempt=0;attempt<6;attempt++){
          const next=clone(base);fn(next);
          const ct=await encryptData(keys,next);
          const v=await rpc("merkliste_update",{p_id:link.id,p_write_token:keys.writeToken,p_ct:ct,p_expected:version});
          if(v>0){version=v;channel&&channel.send({type:"broadcast",event:"v",payload:{v}});return next}
          // Jemand anderes hat gespeichert: neuesten Stand holen und Änderung darauf erneut anwenden
          const r=await fetchRow(link.id);base=await decryptData(keys,r.ct);version=r.version;
        }
        throw err("conflict","Die Liste wird gerade von mehreren Personen geändert. Bitte erneut versuchen.");
      }};
    store=makeStore(backend,first);
    try{
      channel=sb().channel("merkliste-"+link.id,{config:{broadcast:{self:false}}});
      channel.on("broadcast",{event:"v"},({payload})=>{if(payload&&payload.v>version)refresh()}).subscribe();
    }catch(e){channel=null}
    // Rückfallebene ohne Live-Kanal: beim Zurückkehren zum Tab und alle 20 s nachsehen
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
    setInterval(()=>{if(!document.hidden)refresh()},20000);
    Object.assign(store,{
      link:linkFor(link.id,link.secret), id:link.id, hasPassword:!!row.has_pw,
      onRemoteChange(cb){onRemote=cb},
      close(){closed=true;try{channel&&sb().removeChannel(channel)}catch(e){}},
      async destroy(){const ok=await rpc("merkliste_delete",{p_id:link.id,p_write_token:keys.writeToken});keyCache.del(link.id);return ok}
    });
    cookieStore.setShared(link.hash);
    return store;
  }

  // Öffnet die gemeinsame Liste aus dem Link. askPassword(wrongBefore) liefert das Passwort oder null (Abbruch).
  async function openShared(link,askPassword){
    const row=await fetchRow(link.id);
    const cached=keyCache.get(link.id);
    if(cached){try{const k=await keysFromBits(cached,link.id);await decryptData(k,row.ct);return await connectShared(link,k,row)}catch(e){keyCache.del(link.id)}}
    const salt=unb64u(row.salt);
    let wrong=false;
    for(;;){
      let pw="";
      if(row.has_pw){pw=await askPassword(wrong);if(pw==null)throw err("cancelled","Abgebrochen.")}
      const k=await deriveKeys(link.secret,pw,salt,link.id);
      try{await decryptData(k,row.ct);keyCache.set(link.id,k.bits);return await connectShared(link,k,row)}
      catch(e){if(e.code!=="bad_key"||!row.has_pw)throw e;wrong=true}
    }
  }

  // Legt aus den übergebenen Daten eine neue gemeinsame Liste an
  async function createShared(data,password){
    const id=crypto.randomUUID(), secret=rand(16), salt=rand(16);
    const k=await deriveKeys(secret,password||"",salt,id);
    const ct=await encryptData(k,data);
    await rpc("merkliste_create",{p_id:id,p_salt:b64u(salt),p_has_pw:!!password,p_ct:ct,p_write_hash:k.writeHash});
    keyCache.set(id,k.bits);
    return {id,secret,hash:"#liste="+id+"."+b64u(secret),url:linkFor(id,secret)};
  }

  function leaveShared(){cookieStore.setShared("")}

  window.MerklisteStore={openLocal,openShared,createShared,leaveShared,parseLink,configured,
    rememberedShared:()=>cookieStore.getShared(), open:openLocal};
})();
