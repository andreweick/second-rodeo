# Astro + Cloudflare Workers Monorepo

A lightweight monorepo that deploys an **Astro** site to **Cloudflare Pages** and a sibling **Cloudflare Worker API** that talks to **D1 (SQLite)** via **Drizzle ORM**.

```
.
├─ apps/
│  ├─ web/           # Astro blog (static → Pages)
│  └─ api/           # Worker API (D1, Drizzle; add KV/R2 later)
├─ packages/
│  └─ db/            # Drizzle schema/client (shared)
├─ pnpm-workspace.yaml
└─ package.json
```

---

## 🧰 Prerequisites

- Node 20+
- pnpm 9+
- Wrangler CLI (`pnpm dlx wrangler --version`)
- Cloudflare account (for D1/KV/R2 deploys)

---

## 🚀 Local Development

### 1. Start the API (Worker + local D1)

```bash
pnpm --dir apps/api dev
```

In another terminal (seed D1):

```bash
curl http://127.0.0.1:8787/d1/init
```

Test endpoints:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/d1/docs/doc_1
```

---

### 2. Start the Web (Astro)

Create `.env` in `apps/web`:

```bash
echo "PUBLIC_API_BASE=http://127.0.0.1:8787" > apps/web/.env
```

Run the dev server:

```bash
pnpm --dir apps/web dev
```

Open [http://localhost:4321](http://localhost:4321)  
You should see:

```
API health: ok
Doc from D1: Hello Drizzle+D1
```

---

## 🗃️ Database (D1) with Drizzle ORM

- Schema: `packages/db/schema.ts`
- Config: `packages/db/drizzle.config.ts` (outputs to `apps/api/migrations`)

Generate and apply migrations:

```bash
pnpm exec drizzle-kit generate --config=packages/db/drizzle.config.ts
pnpm --dir apps/api exec wrangler d1 migrations apply app_db --local
```

List tables:

```bash
pnpm --dir apps/api exec wrangler d1 execute app_db --local \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

D1 is backed by SQLite in `.wrangler/state/v3/d1/`.

---

## ⚙️ How to Add KV (Later)

### 1. Create a KV namespace

```bash
pnpm --dir apps/api exec wrangler kv namespace create app_kv
```

Copy the `id` Wrangler prints.

### 2. Bind KV in `apps/api/wrangler.jsonc`

```jsonc
{
  "kv_namespaces": [
    { "binding": "KV", "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
  ]
}
```

### 3. Use KV in your Worker

```ts
if (url.pathname === "/kv/set") {
  await env.KV.put("greeting", "hello");
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
}

if (url.pathname === "/kv/get") {
  const v = await env.KV.get("greeting");
  return new Response(JSON.stringify({ value: v }), { headers: { "content-type": "application/json" } });
}
```

### 4. Test KV locally

```bash
pnpm --dir apps/api dev
curl http://127.0.0.1:8787/kv/set
curl http://127.0.0.1:8787/kv/get
```

---

## ☁️ Deployment Overview

### Web (Astro → Cloudflare Pages)

- Root directory: `apps/web`
- Build command: `pnpm --dir apps/web build`
- Output directory: `apps/web/dist`

### API (Worker → Cloudflare Workers)

```bash
pnpm --dir apps/api deploy -- --env production
```

Add production resources (D1, KV, R2) in `wrangler.jsonc` under an `"env": { "production": { ... } }` block.

---

## 🧩 Common Issues

| Problem | Fix |
|----------|-----|
| `init` returns `"ok"` | Ensure `/d1/init` route exists in `apps/api/src/index.ts` and restart `wrangler dev` |
| `TypeError: value.getTime` | Use `new Date()` for Drizzle timestamps |
| Astro shows port 8787 | Run `pnpm --dir apps/web dev` (Astro CLI), not Wrangler |

---

## 🧠 Handy Commands

| Action | Command |
|--------|----------|
| Generate Drizzle migrations | `pnpm exec drizzle-kit generate --config=packages/db/drizzle.config.ts` |
| Apply local D1 migrations | `pnpm --dir apps/api exec wrangler d1 migrations apply app_db --local` |
| Run API locally | `pnpm --dir apps/api dev` |
| Run Web locally | `pnpm --dir apps/web dev` |
| Seed D1 | `curl http://127.0.0.1:8787/d1/init` |

---

## 🛠️ Roadmap

- [ ] Add KV storage
- [ ] Add R2 image uploads
- [ ] Add Cloudflare Queues consumer
- [ ] Add Workers AI + Vectorize for RAG
- [ ] GitHub Actions CI/CD

---

© 2025 – Monorepo scaffold by [Andrew Eick](https://github.com/andreweick)
