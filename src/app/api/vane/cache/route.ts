import { z } from 'zod';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const DATA_DIR = process.env.DATA_DIR || process.cwd();

// simple in-memory cache with SQLite persistence
const initCache = () => {
  const Database = require('better-sqlite3');
  const path = require('path');
  const sqlite = new Database(path.join(DATA_DIR, './data/cache.sqlite'));
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS url_cache (
      url_hash  TEXT PRIMARY KEY,
      url       TEXT NOT NULL,
      content   TEXT NOT NULL,
      title     TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  sqlite.exec(`
    DELETE FROM url_cache WHERE created_at < datetime('now', '-1 day');
  `);
  return sqlite;
};

const hashUrl = (url: string) =>
  crypto.createHash('sha256').update(url.trim()).digest('hex').slice(0, 32);

const getSchema = z.object({
  url: z.string().url(),
});

const setSchema = z.object({
  url: z.string().url(),
  content: z.string().min(1),
  title: z.string().optional(),
});

export const GET = async (req: Request) => {
  try {
    const url = new URL(req.url).searchParams.get('url');
    if (!url) {
      return Response.json({ error: 'url param required' }, { status: 400 });
    }

    const parsed = getSchema.safeParse({ url });
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues }, { status: 400 });
    }

    const sqlite = initCache();
    const row: any = sqlite
      .prepare(`SELECT * FROM url_cache WHERE url_hash = ?`)
      .get(hashUrl(url));

    sqlite.close();

    if (!row) {
      return Response.json({ cached: false }, { status: 200 });
    }

    return Response.json(
      {
        cached: true,
        url: row.url,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[vane/cache GET]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const POST = async (req: Request) => {
  try {
    const body = await req.json();
    const parsed = setSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { url, content, title } = parsed.data;
    const sqlite = initCache();

    sqlite
      .prepare(
        `INSERT OR REPLACE INTO url_cache (url_hash, url, content, title, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(hashUrl(url), url, content, title ?? null);

    sqlite.close();

    return Response.json({ cached: true, url }, { status: 200 });
  } catch (err: any) {
    console.error('[vane/cache POST]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const DELETE = async (req: Request) => {
  try {
    const url = new URL(req.url).searchParams.get('url');
    const sqlite = initCache();

    if (url) {
      sqlite.prepare(`DELETE FROM url_cache WHERE url_hash = ?`).run(hashUrl(url));
    } else {
      sqlite.prepare(`DELETE FROM url_cache`).run();
    }

    sqlite.close();
    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error('[vane/cache DELETE]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
