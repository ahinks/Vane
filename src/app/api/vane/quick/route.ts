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

export const GET = async (req: Request) => {
  try {
    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams);

    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid query params', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, engines, categories, language, limit } = parsed.data;

    const data = await searchSearxng(q, {
      engines,
      categories,
    });

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
        latency_ms: 0, // populated below if needed
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[vane/quick]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
};
