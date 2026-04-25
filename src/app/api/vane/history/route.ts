import { z } from 'zod';
import db from '@/lib/db';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Shared search_history table (persists queries independent of chat sessions)
const searchHistory = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  query: 'TEXT NOT NULL',
  mode: 'TEXT DEFAULT "balanced"',
  result_count: 'INTEGER DEFAULT 0',
  latency_ms: 'INTEGER',
  created_at: "TEXT DEFAULT (datetime('now'))",
};

const querySchema = z.object({
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const postBodySchema = z.object({
  query: z.string().min(1),
  mode: z.enum(['speed', 'balanced', 'quality']).optional().default('balanced'),
  result_count: z.number().int().min(0).optional().default(0),
  latency_ms: z.number().int().min(0).optional(),
});

// Ensure the search_history table exists
const initTable = () => {
  const DATA_DIR = process.env.DATA_DIR || process.cwd();
  const Database = require('better-sqlite3');
  const path = require('path');
  const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      mode TEXT DEFAULT 'balanced',
      result_count INTEGER DEFAULT 0,
      latency_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  sqlite.close();
};

export const GET = async (req: Request) => {
  initTable();
  try {
    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams);
    const parsed = querySchema.safeParse(raw);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { q, limit, offset } = parsed.data;

    const Database = require('better-sqlite3');
    const path = require('path');
    const DATA_DIR = process.env.DATA_DIR || process.cwd();
    const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));

    let rows: any[];
    if (q) {
      rows = sqlite
        .prepare(
          `SELECT * FROM search_history WHERE query LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(`%${q}%`, limit, offset);
    } else {
      rows = sqlite
        .prepare(
          `SELECT * FROM search_history ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(limit, offset);
    }
    sqlite.close();

    return Response.json({ queries: rows, count: rows.length }, { status: 200 });
  } catch (err: any) {
    console.error('[vane/history GET]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const POST = async (req: Request) => {
  initTable();
  try {
    const body = await req.json();
    const parsed = postBodySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues }, { status: 400 });
    }

    const { query, mode, result_count, latency_ms } = parsed.data;

    const Database = require('better-sqlite3');
    const path = require('path');
    const DATA_DIR = process.env.DATA_DIR || process.cwd();
    const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));

    const result = sqlite
      .prepare(
        `INSERT INTO search_history (query, mode, result_count, latency_ms) VALUES (?, ?, ?, ?)`,
      )
      .run(query, mode, result_count, latency_ms ?? null);

    sqlite.close();

    return Response.json({ id: result.lastInsertRowid, query }, { status: 201 });
  } catch (err: any) {
    console.error('[vane/history POST]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const DELETE = async (req: Request) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    const Database = require('better-sqlite3');
    const path = require('path');
    const DATA_DIR = process.env.DATA_DIR || process.cwd();
    const sqlite = new Database(path.join(DATA_DIR, './data/db.sqlite'));

    if (id) {
      sqlite.prepare(`DELETE FROM search_history WHERE id = ?`).run(id);
    } else {
      sqlite.prepare(`DELETE FROM search_history`).run();
    }

    sqlite.close();
    return Response.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error('[vane/history DELETE]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
