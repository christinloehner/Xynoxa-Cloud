# Xynoxa Module Template (vollstaendig)

Dieses Template ist fuer **neue Xynoxa Module** gedacht und deckt alle Aspekte ab:
- Modul-Definition (index.ts)
- Client-Safe Exports (client.ts)
- tRPC Router (router.ts)
- Drizzle Schema (schema.ts)
- UI Komponenten + Hooks
- Search/Embeddings/Share Integration

## Verwendung

1) Ordner kopieren:
```
cp -R templates/module-template src/modules/XynoxaMeinModul
```

2) In allen Dateien "XynoxaModuleTemplate" und "module-template" anpassen.

3) Modul im Adminbereich aktivieren.

WICHTIG:
- Ordnername **muss** mit `Xynoxa` beginnen.
- `metadata.id` **muss** kebab-case sein (z.B. `my-module`).
- Tabellen **mussen** mit `mod_` beginnen.
- `client.ts` ist Pflicht fuer Navigation/Topbar/Admin Menue.
- `routes` in `index.ts` und `client.ts` muessen deckungsgleich sein.

## Dateistruktur

- `index.ts` – Modul-Definition (Server)
- `client.ts` – Client-Safe Navigation/Routes
- `router.ts` – tRPC Router (optional)
- `schema.ts` – Drizzle Tabellen (optional)
- `components/` – UI
- `lib/` – Utils
- `hooks/` – React Hooks

