# DAS-HABE-ICH-GELERNT

Dieses Dokument beschreibt **praezise**, was bei den letzten Versuchen schief lief, warum die Module-Links 500er erzeugten, wo die Fehler lagen und wie die Probleme behoben wurden.

---

## 1) Ausgangslage

- Die Modul-Links in der Sidebar (z.B. `/bookmarks`, `/notes`, `/projects`) führten in Produktion zu **500 Internal Server Errors**.
- Core-Routen funktionierten, nur Modul-Routen nicht.
- In der Browser-Konsole war nur der generische Next.js RSC-Fehler sichtbar (ohne Details), Server-Logs zeigten nichts Konkretes.

---

## 2) Warum die Modul-Routen 500er produzierten

### Ursache A: Dynamische Modul-Routen ohne echte App-Pages
Die Modul-Routen wurden nur über die Catch-All Route
`src/app/(dashboard)/[...modulePath]/page.tsx` gerendert.
Das sollte Plug&Play sein, hat in Produktion aber zu einem **Server Components Render Error** geführt.

In der Praxis bedeutet das:
- Next.js erzeugt kein stabiles Route-Manifest fuer `/bookmarks`, `/notes`, `/projects`.
- Die Route-Aufloesung findet nur zur Laufzeit statt.
- In der Produktionspipeline (RSC + Client Manifest) kann das dazu fuehren, dass Client-Komponenten nicht korrekt im Manifest registriert werden.
- Ergebnis: **RSC render failure** -> 500.

### Ursache B: Fehlerhaftes Abfangen von Next.js Redirect/NotFound Errors
Die dynamische Modul-Routenlogik hat Next.js interne Errors (Redirects/NotFound) abgefangen
und als normale Errors gerendert. Dadurch wurde der eigentliche Redirect/Error-Flow von Next.js
unterbrochen und konnte sich als 500 manifestieren.

---

## 3) Was der Fix ist (und warum es jetzt funktioniert)

### Fix 1: **Echte App-Routen automatisch generieren**
Ich habe einen Generator gebaut, der **vor dem Build** echte Wrapper-Pages fuer jede Modul-Route
anlegt. Dadurch existieren `/bookmarks`, `/notes`, `/projects`, etc. als **echte Next.js Pages**.

- Script: `scripts/generate-module-pages.ts`
- Hooked in: `predev` und `prebuild`
- Ergebnis: Next.js kennt alle Modul-Routen bereits beim Build und erzeugt ein stabiles Manifest.

Damit ist Plug&Play weiterhin gegeben, weil:
- Module werden per `discover-modules` erkannt.
- Die Wrapper-Pages entstehen automatisch (keine manuelle Core-Aenderung).
- Neue Module funktionieren nach dem Kopieren + Aktivieren sofort.

### Fix 2: **Saubere Route-Resolver-Logik mit Redirect-Passthrough**
Die Modul-Resolver-Funktion wurde abgesichert:
- Next.js Redirect/NotFound Errors werden **nicht** mehr abgefangen.
- Fehlende Components, ungueltige Routes oder inaktive Module geben klare Fehl-UI statt 500.

Datei: `src/lib/module-route-resolver.tsx`

### Fix 3: **Build-Fehler durch server-only Import behoben**
Beim Build lief der Generator in `prebuild`. Dabei wurde versehentlich
`module-registry.server.ts` importiert. Diese Datei nutzt `server-only`, was in
TSX-Scripts (Node-Kontext) **nicht** erlaubt ist.

Fehler:
```
Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.
```

Loesung:
- Generator nutzt jetzt `module-registry.route.ts` statt `module-registry.server.ts`.
- Dadurch kein `server-only` Import im Build-Script.

---

## 4) Zusammenfassung der konkreten Aenderungen

1. **Automatische Wrapper-Pages** fuer Modul-Routen
   - Script: `scripts/generate-module-pages.ts`
   - Hooked in `predev` + `prebuild`
   - Jede Modul-Route erzeugt eine echte `page.tsx`.

2. **Robuster Module-Resolver**
   - Redirect/NotFound Fehler werden korrekt durchgereicht.
   - Fehlende Components/Routen werden sauber abgefangen.

3. **Build-Script Fix**
   - `generate-module-pages.ts` nutzt `module-registry.route.ts`
   - Kein `server-only` Import mehr

---

## 5) Wichtigstes Learning

**Next.js App Router + RSC brauchen stabile Build-Time Routen**, besonders wenn Client-Komponenten
in dynamisch geladenen Modulen liegen. Rein runtime-basiertes Routing kann zu Manifest-Problemen
fuehren, die sich erst in Produktion als 500 zeigen.

Die Kombination aus:
- Plug&Play Discovery (Runtime)
- **Build-Time generierten Wrapper-Pages**

ist aktuell die stabilste Loesung.

---

Stand: Januar 2026
