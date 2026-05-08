import { searchSearxng } from '@/lib/searxng';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  q: z.string().min(1),
  engines: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  language: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

// Shared handler for both GET and POST
async function handleQuick(req: Request) {
  try {
    let q: string;
    let engines: string[] | undefined;
    let categories: string[] | undefined;
    let limit = 10;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // POST: read JSON body with query/top_k fields
      const body = await req.json();
      q = body.query || body.q;
      limit = Math.min(Math.max(parseInt(body.top_k || '10', 10), 1), 20);
      engines = body.engines;
      categories = body.categories;
    } else {
      // GET: read URL query params
      const url = new URL(req.url);
      const raw = Object.fromEntries(url.searchParams);
      const parsed = querySchema.safeParse(raw);
      if (!parsed.success) {
        return Response.json(
          { error: 'Invalid query params', details: parsed.error.issues },
          { status: 400 },
        );
      }
      q = parsed.data.q;
      engines = parsed.data.engines;
      categories = parsed.data.categories;
      limit = parsed.data.limit;
    }

    if (!q || q.trim().length === 0) {
      return Response.json({ error: 'Missing query' }, { status: 400 });
    }

    const data = await searchSearxng(q, { engines, categories });

    const results = (data.results || []).slice(0, limit).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 300) || '',
      img_src: r.img_src || r.thumbnail_src || null,
    }));

    return Response.json(
      {
        query: q,
        count: results.length,
        results,
        suggestions: data.suggestions || [],
        engine: 'searxng',
        latency_ms: 0,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[vane/quick]', err.message, err.stack?.split('\n').slice(0,3).join(' | '));
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export const GET = handleQuick;
export const POST = handleQuick;
