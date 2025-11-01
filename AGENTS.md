# 🤖 Project Agents and Constraints

This document defines the automated agents operating on this monorepo, their specific responsibilities, and the core constraints they must follow, ensuring consistency across all packages.

---

## 👨‍💻 Core Project Constraints

Agents **must strictly adhere** to these project-wide rules:

* **Language:** All new functional code must be written in **TypeScript**. Type definitions must be explicit where possible.
* **Package Manager:** Must use **pnpm** for all dependency management (`pnpm install`, `pnpm add`, etc.). **Do not** use `npm` or `yarn`.
* Prefer writing code over installing a package.  When a package is needed, **always** stop and tell the user what the package is, and how much code it is saving
* Always use the pnpm --filter command from the root of the project repo (and NOT 'cd' into the directory to run the pnpm commands)
* Always give me the pnpm --fiter command and not the "cd" commands
* When giving me a 'wrangler' command to run **ALWAYS** give me the command as "pnpm --filter api exec wrangler..."
* **Monorepo Structure:** All packages reside in the `/packages` directory. Agent operations must respect package boundaries and use **pnpm workspaces** for internal dependency linking.
* **Testing Framework:** Use **Vitest** for unit and integration tests.
* **Linting & Formatting:** Adhere to the existing **ESLint** and **Prettier** configurations. Agents must run `pnpm lint --fix` before committing changes.
* **Documentation:** APIs must be documented with OpenAPI and expose an endpoint with the documentation.

---

## 🌐 Deployment Constraints (Cloudflare)

Agents working on deployment or infrastructure code must follow these Cloudflare-specific rules:

* **Runtime:** The primary runtime for serverless functions is **Cloudflare Workers**. Agents should prefer the **Miniflare** local environment for testing.
* **Database:** Utilize **Cloudflare D1** for relational data and **Cloudflare R2** for object storage.
* **Routing:** Deployment configuration must be managed via **Wrangler** (the Cloudflare CLI).
* **Environment Variables:** Secrets must be accessed through the standard Cloudflare Worker environment binding system.

---

## 👤 Defined Agents

| Agent Name | Role / Purpose | Monorepo Focus | Key Responsibilities & Constraints |
| :--- | :--- | :--- | :--- |
| **`RepoMaintainer`** | Manages dependency updates and project-wide configurations. | Root (`/`) and `packages/*` | * Only update dependencies using `pnpm up --latest`. * Must keep TypeScript versions synchronized across all packages. * Manages `pnpm-workspace.yaml`. |
| **`WorkerBuilder`** | Develops and refactors Cloudflare Worker service packages. | `packages/worker-service` | * Must adhere to **Cloudflare Deployment Constraints**. * Focuses on performance and low-latency code for the Workers environment. * Writes `.ts` code that is compatible with the V8 isolate runtime. |
| **`UIDeveloper`** | Implements new features and fixes bugs in the front-end package. | `packages/web-app` | * Ensures all components are fully typed with TypeScript interfaces. * Must write unit tests using **Vitest** for all new components. * Designs must be responsive and accessible (ARIA-compliant). |
| **`SchemaUpdater`** | Manages database schemas, migrations, and ORM integration. | `packages/db-schema` | * Only makes changes to schemas after confirmation from the lead developer. * Must generate migration files before committing schema changes. * Utilizes the configured D1-compatible ORM (e.g., Drizzle, Prisma with D1 connector). |

---

## ✅ Checklist for Agent Operations

Before any agent commits or opens a Pull Request, the following commands **must be executed successfully**:

1.  **Install/Update Dependencies:** `pnpm install`
2.  **Build:** `pnpm build`
3.  **Test:** `pnpm test`
4.  **Lint & Format:** `pnpm lint --fix`

Any failed command indicates the task is incomplete and the agent must resolve the issue before proceeding.



<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->
