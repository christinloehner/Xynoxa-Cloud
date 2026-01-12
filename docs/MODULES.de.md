# Xynoxa Modul-System – Aktuelle Entwickler-Dokumentation

Diese Dokumentation beschreibt **ausschliesslich** das Modul-System der Xynoxa Cloud Anwendung.
Sie erklaert, wie Module gebaut werden, welche Struktur verpflichtend ist, wie Hooks/Schnittstellen
funktionieren und wie Module sich in Navigation, Suche, Shares und API integrieren.

---

## 1) Ziel des Modul-Systems

Xynoxa Module sind **Plug&Play Erweiterungen**. Entwicklerinnen und Entwickler koennen Module
in `src/modules/` ablegen und sie im Adminbereich aktivieren, **ohne** weitere Core-Dateien
oder Routen anfassen zu muessen.

Das System bietet:
- Runtime Discovery und DB-Registrierung
- Aktivieren/Deaktivieren im Adminbereich
- UI-Integration (Sidebar, User-Menue, Admin-Menue)
- tRPC Router Integration (typed API)
- Search/Embedding Integration
- Shares Integration
- Lifecycle Hooks

---

## 2) Verzeichnisstruktur (Pflicht/Optional)

### Minimal (nur UI + Navigation)
```
src/modules/
└── XynoxaMeinModul/
    ├── index.ts              # Pflicht: Modul-Definition (Server)
    ├── client.ts             # Pflicht fuer Navigation/UI (Client-Safe)
    └── MeinComponent.tsx     # Optional: UI-Komponenten
```

### Vollstaendig (mit API + DB)
```
src/modules/
└── XynoxaMeinModul/
    ├── index.ts              # Pflicht: Modul-Definition (Server)
    ├── client.ts             # Pflicht fuer Navigation/UI (Client-Safe)
    ├── router.ts             # Optional: tRPC Router
    ├── schema.ts             # Optional: Drizzle Schema (mod_* Tabellen)
    ├── components/           # Optional: UI Komponenten
    ├── lib/                  # Optional: Hilfsfunktionen
    └── types.ts              # Optional: Typen
```

**Namenskonventionen:**
- Ordnername **muss** mit `Xynoxa` beginnen (z.B. `XynoxaBookmarks`).
- `metadata.id` **muss** kebab-case sein (z.B. `bookmarks`, `project-tasks`).
- Modul-Tabellen **mussen** mit `mod_` anfangen.

---

## 3) Pflichtdateien

### `index.ts` (Server-Modul)
- Enthaltet die **vollstaendige Modul-Definition** inkl. Hooks
- Darf server-only Abhaengigkeiten nutzen (DB, fs, etc.)

### `client.ts` (Client-Safe Exports)
- Nur Client-sichere Felder: `metadata`, `navigation`, `routes`, `userNavigation`, `adminNavigation`, `getSearchResultUrl`
- **Keine** Server-only Imports (keine DB, kein fs, kein server-only)
- Wird fuer Sidebar/Topbar/Client Navigation genutzt

---

## 4) Modul-Definition (index.ts)

Minimalbeispiel:
```ts
import { XynoxaModule } from "@/types/module";
import { TestTube } from "lucide-react";
import MyComponent from "./MyComponent";

const myModule: XynoxaModule = {
  metadata: {
    id: "my-module",
    name: "Mein Modul",
    description: "Kurzbeschreibung",
    version: "1.0.0",
    author: "Dein Name",
    icon: TestTube
  },

  navigation: [
    { id: "my-module-nav", label: "Mein Modul", href: "/my-module", icon: TestTube }
  ],

  routes: [
    { path: "/my-module", component: MyComponent, requiresAuth: true }
  ]
};

export default myModule;
```

### Pflichtfelder (`metadata`)
- `id` (kebab-case, eindeutig)
- `name`
- `description`
- `version` (SemVer)
- `author`
- `icon` (Lucide React Icon)

---

## 5) Client-Safe Modul (client.ts)

Beispiel:
```ts
import { TestTube } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

const myClientModule: ClientXynoxaModule = {
  metadata: {
    id: "my-module",
    name: "Mein Modul",
    description: "Kurzbeschreibung",
    version: "1.0.0",
    author: "Dein Name",
    icon: TestTube
  },
  navigation: [
    { id: "my-module-nav", label: "Mein Modul", href: "/my-module", icon: TestTube }
  ],
  routes: [
    { path: "/my-module", requiresAuth: true }
  ]
};

export default myClientModule;
```

**Wichtig:** Die Routen in `client.ts` muessen **alle** dynamischen Routen aus `index.ts` abbilden.

---

## 6) Routen (Plug&Play)

Modul-Routen werden **automatisch** als echte App-Routen erzeugt.
Der Generator `scripts/generate-module-pages.ts` erstellt fuer **jede** Modul-Route
eine Wrapper-Page unter `src/app/(dashboard)/.../page.tsx`.

Die Wrapper-Page ruft `renderModulePage()` auf und:
- prueft Session & Rolle
- prueft ob das Modul aktiv ist
- rendert die Modul-Komponente inkl. `getProps()`

**Das bedeutet:**
- Keine manuellen Wrapper-Pages.
- Neue Module funktionieren nach dem Kopieren in `src/modules/` und Aktivieren im Adminbereich.
- Die Generierung laeuft automatisch in `predev` und `prebuild`.
  - In Produktion ist ein Build/Deploy notwendig, damit neue Modul-Routen wirklich existieren.

Fallback:
- `src/app/(dashboard)/[...modulePath]/page.tsx` existiert als Catch-All,
  falls ein Modul-Route-Pfad nicht (mehr) generiert wurde.

---

## 7) Hooks (Lifecycle & Integration)

### Lifecycle Hooks
- `onLoad()` – Modul geladen (z.B. Router/Entity registrieren)
- `onUnload()` – Modul entladen
- `onUserLogin(userId)` – nach Login
- `onUserLogout()` – nach Logout

### Install/Uninstall Hooks
- `onInstall()` – beim Aktivieren, z.B. Tabellen erstellen
- `onUninstall()` – beim Deaktivieren (optional, meist kein Drop)

Rueckgabe von `onInstall/onUninstall`:
- `string[]` (SQL Statements) oder `void`

### Search/Embedding Hooks
- `onReindex(ownerId, context)` – Indexierung fuer Suche
- `getSearchResultUrl(entityId, entityType?)` – Link fuer Suchergebnisse

---

## 8) Modul-Router (tRPC)

`router.ts` ist optional. Wenn vorhanden:
- Exporte `default` = tRPC Router
- Exporte `entityTypes` fuer Shares/Embeddings/Search

Beispiel (vereinfacht):
```ts
import "server-only";
import { router, protectedProcedure } from "@/server/trpc";
import { z } from "zod";

export const entityTypes = [
  {
    name: "my-item",
    tableName: "mod_my_items",
    idColumn: "id",
    ownerIdColumn: "owner_id",
    searchIndexName: "my_items",
    displayName: "Mein Item"
  }
];

export default router({
  list: protectedProcedure.query(async () => { /* ... */ })
});
```

---

## 9) Entity Types (Shares/Embeddings/Search)

Module koennen ihre Entities registrieren, damit sie:
- in der globalen Suche erscheinen
- per Share geteilt werden koennen
- Embeddings fuer semantische Suche erhalten

Wichtige Felder:
- `name` (Entity Type Name)
- `tableName`, `idColumn`, `ownerIdColumn`
- optional: `shareFkColumn`, `embeddingFkColumn`, `entityTagFkColumn`
- optional: `searchIndexName`
- optional: `buildShareHtml()` fuer Public Shares

---

## 10) Datenbank (Drizzle)

- Tabellen muessen `mod_` prefix nutzen.
- Foreign Keys zu `users` sollten `ON DELETE CASCADE` nutzen.
- Indizes fuer `owner_id` und haeufige Filter.

---

## 11) Navigation & Menues

Module koennen optional folgende Menues erweitern:
- `navigation` (Sidebar)
- `userNavigation` (Topbar User-Menue)
- `adminNavigation` (Adminbereich)

**Role-Gating** ueber `requiredRole`:
- `owner`, `admin`, `user`

---

## 12) Registrierung & Aktivierung

- Module werden automatisch im Adminbereich sichtbar.
- Aktivieren/Deaktivieren ueber `/admin/modules`.
- Neue Module muessen nicht im Core registriert werden.

---

## 13) Debugging Hinweise

Wenn ein Modul nicht erscheint:
1. Ordnername startet mit `Xynoxa`?
2. `index.ts` vorhanden?
3. `client.ts` vorhanden (fuer Navigation)?
4. Modul im Adminbereich aktiv?

Wenn Modul-Routen nicht funktionieren:
- Pfade in `routes` in `index.ts` und `client.ts` identisch?
- Modul aktiviert?

---

## 14) Wichtige Dateien (aktuell)

- `src/lib/module-loader.ts` – Laedt aktive Module
- `src/lib/module-registry.server.ts` – Auto-Registry (Server)
- `src/lib/module-registry.client.ts` – Auto-Registry (Client)
- `scripts/generate-module-pages.ts` – Generiert Wrapper-Pages fuer Modul-Routen
- `src/lib/module-route-resolver.tsx` – Route/Role/Auth/Active-Checks fuer Modul-Pages
- `src/server/services/module-service.ts` – Aktivierung/Discovery
- `src/server/module-router-registry.ts` – Entity/Router Registry
- `src/app/(dashboard)/[...modulePath]/page.tsx` – Catch-All fuer Modul-Routen

---

## 15) Best Practices

- **Kein** server-only Code in `client.ts`.
- `index.ts` nur dynamische Imports fuer server-only Module/Router.
- `routes` immer vollstaendig (auch dynamische Segmente).
- `onInstall()` nur `CREATE IF NOT EXISTS`.
- Embeddings nur fuer nicht-verschluesselte Inhalte.

---

## 16) Beispiel: Minimal-Modul (vollstaendig)

```
src/modules/XynoxaHello/
├── index.ts
├── client.ts
└── HelloComponent.tsx
```

`index.ts`
```ts
import { XynoxaModule } from "@/types/module";
import { Sparkles } from "lucide-react";
import HelloComponent from "./HelloComponent";

const helloModule: XynoxaModule = {
  metadata: { id: "hello", name: "Hello", description: "Demo", version: "1.0.0", author: "Xynoxa", icon: Sparkles },
  navigation: [{ id: "hello-nav", label: "Hello", href: "/hello", icon: Sparkles }],
  routes: [{ path: "/hello", component: HelloComponent, requiresAuth: true }]
};

export default helloModule;
```

`client.ts`
```ts
import { Sparkles } from "lucide-react";
import type { ClientXynoxaModule } from "@/types/module";

const helloClient: ClientXynoxaModule = {
  metadata: { id: "hello", name: "Hello", description: "Demo", version: "1.0.0", author: "Xynoxa", icon: Sparkles },
  navigation: [{ id: "hello-nav", label: "Hello", href: "/hello", icon: Sparkles }],
  routes: [{ path: "/hello", requiresAuth: true }]
};

export default helloClient;
```

---

Stand: Januar 2026

---

## 17) Modul-Template & Generator

Ein vollstaendiges Template liegt unter:
- `templates/module-template/`

Es enthaelt:
- `index.ts` (vollstaendige Modul-Definition)
- `client.ts` (Client-Safe Navigation/Routes)
- `router.ts` (tRPC Router + entityTypes)
- `schema.ts` (Drizzle Tabellen)
- `components/`, `hooks/`, `lib/`

Automatischer Generator:
```
npm run create-module -- --name "Mein Modul" --id mein-modul
```

Der Generator:
- kopiert das Template nach `src/modules/XynoxaMeinModul`
- ersetzt Platzhalter (`module-template`, `Module Template`)
- setzt `metadata.id` und Navigation korrekt
