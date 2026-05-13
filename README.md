# Comercio

Sistema de gestión comercial (PoS + Admin web) — terminal de Córdoba.

## Requisitos

- Node 20+
- pnpm 9+

## Setup

```bash
pnpm install
pnpm dev          # levanta admin y pos en paralelo
```

- Admin: <http://localhost:3000>
- PoS: <http://localhost:3100>

## Scripts útiles

```bash
pnpm dev:admin    # solo admin
pnpm dev:pos      # solo PoS
pnpm typecheck    # tsc --noEmit en todo el monorepo
pnpm lint
pnpm test
```

## Estructura

Ver [`CLAUDE.md`](./CLAUDE.md).
