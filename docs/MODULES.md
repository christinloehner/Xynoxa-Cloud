# Module System

Xynoxa supports plug‑and‑play modules placed in `src/modules/`.
Each module can contribute UI, routes, tRPC routers, DB schema, and search integration.

## Minimal structure

```
src/modules/
└── XynoxaMyModule/
    ├── index.ts   # server module definition
    └── client.ts  # client‑safe exports (navigation/routes)
```

## Full structure

```
src/modules/
└── XynoxaMyModule/
    ├── index.ts
    ├── client.ts
    ├── router.ts
    ├── schema.ts
    ├── components/
    ├── lib/
    └── types.ts
```

## Rules

- Folder name must start with `Xynoxa`
- `metadata.id` must be kebab‑case
- Module tables must start with `mod_`
- `client.ts` must not import server‑only code

## Routes

Routes are generated at build time by `scripts/generate-module-pages.ts`.
This creates real Next.js pages under `src/app/(dashboard)/` and prevents RSC manifest issues.

## Activation

Modules are discovered automatically and can be enabled/disabled in the admin UI at `/admin/modules`.

For the full German documentation, see `docs/MODULES.de.md`.
