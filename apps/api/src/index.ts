import { connectD1 } from "@app/db/client";
import { docs } from "@app/db/schema";
import { eq } from "drizzle-orm";

export default {
  async fetch(request: Request, env: { DB: D1Database }): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/d1/init") {
      const db = connectD1(env.DB);
      const now = new Date(); // ✅ pass a Date (Drizzle will store ms)
      await db
        .insert(docs)
        .values({ id: "doc_1", title: "Hello Drizzle+D1", updatedAt: now })
        .onConflictDoUpdate({
          target: docs.id,
          set: { title: "Hello Drizzle+D1 (updated)", updatedAt: now },
        });

      return new Response(JSON.stringify({ ok: true, at: now.getTime() }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/d1/docs/")) {
      const id = url.pathname.split("/").pop()!;
      const db = connectD1(env.DB);
      const rows = await db.select().from(docs).where(eq(docs.id, id)).limit(1);
      if (!rows.length) return new Response("not found", { status: 404 });

      // rows[0].updatedAt is a Date (because of mode:"timestamp_ms")
      const row = rows[0] as { id: string; title: string; updatedAt: Date };
      return new Response(
        JSON.stringify({
          id: row.id,
          title: row.title,
          updated_at: row.updatedAt.getTime(), // ✅ serialize to number for JSON
        }),
        { headers: { "content-type": "application/json; charset=utf-8" } }
      );
    }

    return new Response("ok");
  },
} satisfies ExportedHandler<{ DB: D1Database }>;
