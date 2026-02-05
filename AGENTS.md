# AGENTS

Working agreement for agentic coding assistants in this repo.
This is a pnpm workspace (monorepo) with multiple apps and packages. Default stack is TypeScript + ESM.

## Commands

### Install

```bash
pnpm install
```

### Dev

```bash
# SSR dev (and proxies web dev)
pnpm dev

# Web only (Vite)
pnpm --filter @afilmory/web dev

# SSR only (Next.js)
pnpm --filter @afilmory/ssr dev

# Backend core server (Hono)
pnpm --filter @afilmory/core dev
```

### Build

```bash
# Build SSR (root script)
pnpm build

# Build web only
pnpm --filter @afilmory/web build

# Build backend core only
pnpm --filter @afilmory/core build
```

### Lint / Format / Types

```bash
# Lint (auto-fix)
pnpm lint

# Format (Prettier)
pnpm format

# Type-check all workspaces that expose "type-check"
pnpm type-check
```

### Tests (Vitest)

```bash
# Run all tests in backend workspace (runs test scripts recursively)
pnpm -C be test

# Framework package tests
pnpm -C be/packages/framework test

# Single test file (real file)
pnpm -C be/packages/framework test -- tests/application.spec.ts

# Single test name (real test name from application.spec.ts)
pnpm -C be/packages/framework test -- -t "processes successful request through guards, pipes, and interceptors"

```

### Manifest builder (photos-manifest.json)

```bash
# Incremental build (root script)
pnpm build:manifest

# Pass flags to the builder CLI (do NOT use pnpm build:manifest -- --flag)
pnpm --filter @afilmory/builder cli -- --force
pnpm --filter @afilmory/builder cli -- --force-manifest
pnpm --filter @afilmory/builder cli -- --force-thumbnails
```

### Database (SSR / core)

```bash
# SSR app migrations
pnpm --filter @afilmory/ssr db:generate
pnpm --filter @afilmory/ssr db:migrate

# Core backend migrations (delegates to be/packages/db)
pnpm --filter @afilmory/core db:generate
pnpm --filter @afilmory/core db:migrate
```

## Code style (repo-wide defaults)

- Formatting: Prettier (`.prettierrc.mjs`) with `semi: false`, `singleQuote: true`, `printWidth: 120`, `trailingComma: all`.
- Lint: ESLint flat config (`eslint.config.mjs`) based on `eslint-config-hyoban`; formatting is disabled in ESLint (run Prettier separately).
- TSX: keep JSX self-closing where possible (enforced by ESLint for `**/*.tsx`).
- Avoid `location`: ESLint forbids using the global `location` object; use app/router utilities instead.
- TypeScript:
  - Default `tsconfig.json` uses `strict: true` (note: `noImplicitAny: false` exists; still avoid implicit `any`).
  - ESM everywhere (`"type": "module"` across packages); prefer `import type { ... }` when it is truly type-only.
  - Backend DI caveat: for `tsyringe` constructor injection, do not use type-only imports for injected classes (needs runtime value). See `be/AGENTS.md`.
- Import paths / aliases:
  - `apps/web` and `be/apps/dashboard`: use `~/*` for `src/*` (see `apps/web/tsconfig.json`, `be/apps/dashboard/tsconfig.json`).
  - `be/apps/core`: use `core/*` for `src/*` (see `be/apps/core/tsconfig.json`).
  - Backend packages: use `@afilmory/*` workspace imports (see `be/tsconfig.json`).
- Naming:
  - React components: `PascalCase`, hooks: `useX`.
  - Backend conventions: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.provider.ts`, `*.guard.ts`, `*.interceptor.ts`, `*.filter.ts`.
  - Constants: `SCREAMING_SNAKE_CASE`.
- Error handling:
  - Backend: throw `HttpException` / `BizException` and rely on filters/interceptors for consistent JSON responses (see `be/apps/core/src/app.factory.ts`).
  - Never swallow errors (`catch {}`); log unexpected failures with context.

## i18n rules

- Locales live under `locales/**`. Keys are flat dot-separated strings; avoid parent/leaf conflicts after dot-to-object transform.
- Plurals use `_one` / `_other` suffixes.
- Update English first, then other languages.
- JSON is linted for key validity and recursively sorted (see `eslint.config.mjs` and `.cursor/rules/i18n.mdc`).

## UI color tokens

- Prefer Apple UIKit color system Tailwind tokens (see `.cursor/rules/color.mdc`).

## Architecture pointers (don’t duplicate app-specific rules here)

- `apps/web` UI system: see `apps/web/AGENTS.md`.
- `be/apps/dashboard` UI system + routing/state rules: see `be/apps/dashboard/AGENTS.md`.
- Backend framework patterns (modules/controllers/DI/enhancers): see `be/AGENTS.md` and `be/apps/core/AGENTS.md`.
- Manifest injection via `window.__MANIFEST__`: see `packages/data/src/index.ts` and `apps/ssr` host code.

## Repo hygiene

- Pre-commit runs `lint-staged` (Prettier then ESLint). Don’t commit secrets or generated artifacts.
- Avoid feature flags/backwards-compat shims: treat the app as unreleased.

## Cursor / Copilot rules

- Cursor rules:
  - `.cursor/rules/code-quality.mdc`
  - `.cursor/rules/i18n.mdc`
  - `.cursor/rules/color.mdc`
  - `.cursor/rules/project.mdc`
- Copilot instructions: none found (`.github/copilot-instructions.md` is absent).
