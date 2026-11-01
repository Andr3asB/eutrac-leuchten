// Teilen in der Kopfzeile jeder Seite: gemeinsame Liste anlegen, Link kopieren, zur lokalen Liste, löschen.
// Jede Seite meldet sich mit ShareUI.mount({getDb, status, attach?, goLocal?, beforeSwitch?}) an.
// Ohne attach/goLocal lädt die Seite nach dem Wechsel neu (Planer und Belegung).
(function(){
  const Sx=()=>window.MerklisteStore;
  const KNOWN=["not_configured","offline","network","forbidden","not_found","conflict","too_large","bad_key"];
  let o=null;
  const $=id=>document.getElementById(id);
  const copyText=async t=>{try{await navigator.clipboard.writeText(t);return true}catch(e){return false}};
  // Link auf die aktuelle Seite (mit Raum/Plan) samt Schlüssel der gemeinsamen Liste
  const linkHere=db=>{const h=db&&db.link?new URL(db.link).hash:"";return location.origin+location.pathname+location.search+h};

  function ensureDlg(){
    if($("shareDlg"))return;
    const d=document.createElement("dialog");d.id="shareDlg";d.innerHTML=`
  <form id="shareForm">
    <h3>Lichtplan teilen</h3>
    <p>Dein ganzer Lichtplan – Leuchten, Schienen und Belegung – wird als gemeinsame Liste angelegt. Wer den Link hat, kann sie ansehen und ändern; Änderungen erscheinen bei allen sofort.</p>
    <p class="fine">Die Liste wird im Browser verschlüsselt, bevor sie gespeichert wird. Der Schlüssel steckt im Link und wird nie an den Server geschickt.</p>
    <div class="row">
      <div class="f"><label for="sPw">Passwort (optional)</label><input type="password" id="sPw" autocomplete="new-password" placeholder="leer = nur Link"></div>
      <div class="f"><label for="sPw2">Passwort wiederholen</label><input type="password" id="sPw2" autocomplete="new-password"></div>
    </div>
    <p class="fine">Mit Passwort braucht man Link <b>und</b> Passwort. Das Passwort lässt sich nicht wiederherstellen.</p>
    <p id="shareErr" class="err" hidden></p>
    <div class="actions"><button class="btn" type="button" id="shareCancel">Abbrechen</button><button class="btn primary" type="submit" id="shareSave">Link erstellen</button></div>
  </form>
  <div id="shareDone" hidden>
    <h3>Gemeinsame Liste angelegt</h3>
    <p>Diesen Link an Familie oder Elektriker schicken:</p>
    <div class="linkrow"><input type="text" id="shareLink" readonly aria-label="Link zur gemeinsamen Liste"><button class="btn primary" type="button" id="shareCopy">Kopieren</button></div>
    <p class="fine" id="sharePwNote">Das Passwort bitte getrennt mitteilen, zum Beispiel per Anruf oder SMS.</p>
    <div class="actions"><button class="btn" type="button" id="shareClose">Fertig</button></div>
  </div>`;
    document.body.appendChild(d);
    $("shareCancel").onclick=()=>d.close();
    $("shareClose").onclick=()=>d.close();
    $("shareCopy").onclick=async()=>{const i=$("shareLink");const ok=await copyText(i.value);if(!ok)i.select();$("shareCopy").textContent=ok?"Kopiert ✓":"Markiert – bitte kopieren"};
    $("shareForm").addEventListener("submit",async e=>{
      e.preventDefault();const pw=$("sPw").value,pw2=$("sPw2").value,er=$("shareErr");
      if(pw!==pw2){er.hidden=false;er.textContent="Die Passwörter stimmen nicht überein.";return}
      if(pw&&pw.length<6){er.hidden=false;er.textContent="Bitte mindestens 6 Zeichen verwenden oder das Feld leer lassen.";return}
      const btn=$("shareSave");btn.disabled=true;btn.textContent="Wird angelegt …";
      try{
        const res=await Sx().createShared(o.getDb()._data(),pw);
        history.replaceState(null,"",location.pathname+location.search+res.hash);
        if(o.attach)o.attach(await Sx().openShared(Sx().parseLink(res.hash),async()=>pw));
        else o.reloadAfter=true;   // Seite lädt nach „Fertig“ mit der gemeinsamen Liste neu
        $("shareLink").value=location.origin+location.pathname+location.search+res.hash;
        $("shareForm").hidden=true;$("shareDone").hidden=false;$("sharePwNote").hidden=!pw;$("shareCopy").textContent="Kopieren";
      }catch(err){er.hidden=false;er.textContent=err&&KNOWN.includes(err.code)?err.message:"Anlegen fehlgeschlagen. Bitte erneut versuchen."}
      finally{btn.disabled=false;btn.textContent="Link erstellen"}
    });
    d.addEventListener("close",()=>{if(o.reloadAfter){o.reloadAfter=false;location.reload()}});
  }
  function goLocal(msg){
    if(o.goLocal){o.goLocal(msg);return}
    Sx().leaveShared();location.replace(location.pathname+location.search);
  }
  function toast(t){let el=$("shareToast");if(!el){el=document.createElement("div");el.id="shareToast";el.className="sharetoast";el.setAttribute("role","status");document.body.appendChild(el)}
    el.textContent=t;el.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("on"),5000);if(o&&o.status)try{o.status(t)}catch(e){}}
  function render(){
    const el=$("shareBar");if(!el||!o)return;const db=o.getDb();
    if(db&&db.mode==="shared"){
      el.innerHTML=`<span class="badge" title="Gemeinsame Liste${db.hasPassword?" mit Passwort":""}">Gemeinsam${db.hasPassword?" · 🔒":""}</span><button class="ghost" type="button" data-share="copy">Link kopieren</button>
        <details class="sharemore"><summary class="ghost" aria-label="Weitere Optionen zur gemeinsamen Liste">⋯</summary><div class="sharemenu">
          <button type="button" data-share="local">Zur lokalen Liste wechseln</button><button type="button" data-share="delete" class="danger">Gemeinsame Liste löschen</button></div></details>`;
    }else el.innerHTML=Sx()&&Sx().configured()?`<button class="ghost" type="button" data-share="create">Teilen …</button>`:"";
  }
  async function onClick(e){
    const b=e.target.closest("[data-share]");if(!b)return;const act=b.dataset.share,db=o.getDb();
    const det=b.closest("details");if(det)det.open=false;
    if(act==="create"){if(o.beforeSwitch&&!o.beforeSwitch())return;ensureDlg();["sPw","sPw2"].forEach(id=>$(id).value="");$("shareErr").hidden=true;$("shareForm").hidden=false;$("shareDone").hidden=true;$("shareDlg").showModal()}
    else if(act==="copy"){const l=linkHere(db),ok=await copyText(l);toast(ok?"Link kopiert. Wer ihn hat, kann den Lichtplan ansehen und ändern"+(db.hasPassword?" – zusätzlich ist das Passwort nötig.":"."):"Link: "+l)}
    else if(act==="local"){if(o.beforeSwitch&&!o.beforeSwitch())return;goLocal("Lokale Merkliste. Die gemeinsame Liste bleibt über ihren Link erreichbar.")}
    else if(act==="delete"){if(!confirm("Gemeinsame Liste endgültig löschen? Alle mit dem Link verlieren den Zugriff."))return;
      try{await db.destroy();goLocal("Gemeinsame Liste gelöscht.")}catch(err){toast(err&&KNOWN.includes(err.code)?err.message:"Löschen fehlgeschlagen.")}}
  }
  function mount(opts){
    o=opts;const el=$("shareBar");if(!el)return;
    if(!el.dataset.bound){el.dataset.bound="1";el.addEventListener("click",onClick);
      document.addEventListener("click",e=>{const d=el.querySelector("details[open]");if(d&&!d.contains(e.target))d.open=false})}
    render();
  }
  window.ShareUI={mount,render};
})();
