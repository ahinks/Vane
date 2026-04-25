import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KG_DB = (process.env.HOME || '/home/alexanderh') + '/.mempalace/knowledge_graph.sqlite3';

const bodySchema = z.object({
  query: z.string().min(1),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string().optional(),
    }),
  ),
  topic: z.string().optional().default('vane'),
});

export const POST = async (req: Request) => {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid body', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { query, results, topic } = parsed.data;

    let Database: any;
    try {
      Database = require('better-sqlite3');
    } catch {
      return Response.json({ error: 'better-sqlite3 not available' }, { status: 500 });
    }

    let kg: any;
    try {
      kg = new Database(KG_DB);
    } catch {
      return Response.json({ error: 'KG database not found', path: KG_DB }, { status: 503 });
    }

    // Disable FK enforcement during bulk insert, then restore
    kg.pragma('foreign_keys = OFF');

    const inserted: string[] = [];
    const errors: string[] = [];

    // Helper: ensure entity exists, return its id
    const upsertEntity = (id: string, name: string) => {
      try {
        kg.prepare(
          `INSERT OR IGNORE INTO entities (id, name) VALUES (?, ?)`,
        ).run(id, name);
      } catch {}
    };

    // Helper: insert triple (no FK check)
    const insertTriple = (id: string, subject: string, predicate: string, object: string) => {
      try {
        kg.prepare(
          `INSERT INTO triples (id, subject, predicate, object, source_closet, extracted_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        ).run(id, subject, predicate, object, topic);
        return true;
      } catch (e: any) {
        errors.push(`${predicate}: ${e.message}`);
        return false;
      }
    };

    // The query itself as a subject
    const queryId = `vane:${crypto.randomUUID().slice(0, 8)}`;
    upsertEntity(query, query); // query text as its own entity

    for (const r of results) {
      const title = r.title.slice(0, 120);
      const urlId = `vane:${crypto.randomUUID().slice(0, 8)}`;

      // Ensure entity for this URL
      upsertEntity(r.url, title);

      // (query, referenced_in, title)
      if (insertTriple(crypto.randomUUID(), query, 'referenced_in', title)) {
        inserted.push(title);
      }
      // (url, has_title, title)
      if (insertTriple(crypto.randomUUID(), r.url, 'has_title', title)) {
        // already counted above
      }
    }

    kg.pragma('foreign_keys = ON');
    kg.close();

    return Response.json(
      {
        query,
        topic,
        triples_added: inserted.length * 2,
        results_processed: results.length,
        errors: errors.length ? errors.slice(0, 5) : undefined,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[vane/kg-file]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
