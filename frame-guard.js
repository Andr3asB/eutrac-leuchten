// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Andreas Bosch – Lichtplaner für EUTRAC, siehe LICENSE und NOTICE
// Schutz gegen Einbetten in fremde Seiten (Clickjacking). GitHub Pages erlaubt keinen Header
// „frame-ancestors“/„X-Frame-Options“; daher blendet sich die Seite in einem fremden Rahmen aus
// und versucht, sich stattdessen selbst zu öffnen.
(function(){
  var framed;try{framed=window.top!==window.self}catch(e){framed=true}
  if(!framed)return;
  document.documentElement.style.display="none";
  try{window.top.location.replace(window.location.href)}catch(e){}
})();
