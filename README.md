## 🧭 First-Time Setup (New Laptop or Fresh Clone)

If you’ve just cloned this repo, follow this checklist to get your local environment running.

### Prerequisites
- [ ] Node 20+
- [ ] pnpm 9+ (enable via `corepack enable`)
- [ ] Cloudflare account (run `pnpm dlx wrangler login` once)

### Setup Checklist

- [ ] **Install all dependencies**
  ```bash
  pnpm install

  # 2. Approve the build scripts that pnpm blocked
  pnpm approve-builds esbuild sharp workerd

  # 3. Rebuild the approved packages (they were skipped earlier)
  pnpm rebuild esbuild sharp workerd
  ```

- [ ] **Create or ensure the local D1 database**
  ```bash
  pnpm --dir apps/api exec wrangler d1 create app_db
  ```
  > If it already exists, this may print a warning — safe to ignore.

- [ ] **Apply local migrations**
  ```bash
  pnpm --dir apps/api exec wrangler d1 migrations apply app_db --local
  ```

- [ ] **Point the web app to your local API**
  ```bash
  echo "PUBLIC_API_BASE=http://127.0.0.1:8787" > apps/web/.env
  ```

- [ ] **(Optional) Verify Drizzle CLI**
  ```bash
  pnpm exec drizzle-kit --version
  ```

- [ ] **Start both servers**
  - **Terminal A (API Worker + D1):**
    ```bash
    pnpm --dir apps/api dev
    ```
    Then seed once:
    ```bash
    curl http://127.0.0.1:8787/d1/init
    ```
  - **Terminal B (Astro Web):**
    ```bash
    pnpm --dir apps/web dev
    ```
    Open [http://localhost:4321](http://localhost:4321)

---

## 🗂️ Repo Layout

```
.
├─ apps/
│  ├─ web/           # Astro blog (Cloudflare Pages)
│  └─ api/           # Worker API (D1, Drizzle; add KV/R2 later)
├─ packages/
│  └─ db/            # Shared Drizzle schema/client
├─ pnpm-workspace.yaml
└─ package.json
```

---

## 🧰 Local Development Workflow

### Start the API

```bash
pnpm --dir apps/api dev
```

Test endpoints:
```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/d1/docs/doc_1
```

### Start the Web (Astro)

```bash
pnpm --dir apps/web dev
```

Visit [http://localhost:4321](http://localhost:4321) to verify the page displays:
```
API health: ok
Doc from D1: Hello Drizzle+D1
```

---

## 🗃️ Database (D1) + Drizzle ORM

- Schema: `packages/db/schema.ts`
- Config: `packages/db/drizzle.config.ts` (outputs migrations to `apps/api/migrations`)

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

---

## ⚙️ Add Cloudflare KV (Later)

### 1. Create a KV namespace
```bash
pnpm --dir apps/api exec wrangler kv namespace create app_kv
```

### 2. Add binding in `apps/api/wrangler.jsonc`
```jsonc
{
  "kv_namespaces": [
    { "binding": "KV", "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
  ]
}
```

### 3. Example routes
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

Test locally:
```bash
pnpm --dir apps/api dev
curl http://127.0.0.1:8787/kv/set
curl http://127.0.0.1:8787/kv/get
```

---

## ☁️ Deployment Overview

### Web → Cloudflare Pages
- Root directory: `apps/web`
- Build command: `pnpm --dir apps/web build`
- Output: `apps/web/dist`

### API → Cloudflare Workers
```bash
pnpm --dir apps/api deploy -- --env production
```

Add production bindings (D1, KV, R2) under `env.production` in `wrangler.jsonc`.

---

## 🧩 Common Issues

| Problem | Fix |
|----------|-----|
| `init` returns `"ok"` | Ensure `/d1/init` route exists and restart `wrangler dev` |
| `TypeError: value.getTime` | Use `new Date()` for Drizzle timestamps |
| Astro shows port 8787 | Run `pnpm --dir apps/web dev` (Astro CLI), not Wrangler |

---

## 🧠 Handy Commands

| Action | Command |
|--------|----------|
| Generate migrations | `pnpm exec drizzle-kit generate --config=packages/db/drizzle.config.ts` |
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
- [ ] Add GitHub Actions CI/CD

---

© 2025 – Monorepo scaffold by [Andrew Eick](https://github.com/andreweick)
