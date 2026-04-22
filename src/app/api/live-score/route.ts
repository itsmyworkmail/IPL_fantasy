/**
 * GET /api/live-score
 *
 * Proxies the public crictimes.org JSON endpoint and returns only live IPL matches.
 * Running server-side avoids CORS and hides the referer from the third-party API.
 *
 * Response shape:
 *   { live: LiveMatch[] }
 *
 * where LiveMatch = { t_one, t_one_s, t_two, t_two_s, m_status, status, spec, series }
 */

export const runtime = 'edge';
// Cache at the edge for 15 s — the upstream data updates roughly every 30-60 s
// so there's no point hitting it more often than that.
export const revalidate = 15;

interface CrictimesMatch {
  url: string;
  id: number;
  status: string;       // 'LIVE' | 'UPCOMING' | 'COMPLETED'
  dt: string;
  t_one: string;
  t_one_s: string;
  t_two: string;
  t_two_s: string;
  m_status: string;
  series: string;
  spec: string;
}

interface CrictimesResponse {
  live?: CrictimesMatch[];
  upcoming?: CrictimesMatch[];
  completed?: CrictimesMatch[];
}

export async function GET() {
  try {
    const upstream = await fetch(
      `https://crictimes.org/data/v1/scores.json?q=${Date.now()}`,
      {
        headers: {
          // Pretend we're the widget so the API doesn't geo-block
          Referer: 'https://widget.crictimes.org/',
          'User-Agent': 'Mozilla/5.0',
        },
        next: { revalidate: 15 },
      }
    );

    if (!upstream.ok) {
      return Response.json({ live: [] }, { status: 200 });
    }

    const data: CrictimesResponse = await upstream.json();

    // The 'live' array contains LIVE + near-upcoming matches from crictimes.
    // Filter to only matches that are genuinely LIVE and part of IPL.
    const iplLive = (data.live ?? []).filter(
      (m) => m.status === 'LIVE' && m.series?.toUpperCase().includes('IPL')
    );

    // Also surface the most recently completed IPL match so the client can
    // display the last score for a short window after the match ends.
    const iplCompleted = (data.completed ?? []).filter(
      (m) => m.series?.toUpperCase().includes('IPL')
    );
    // completed array is most-recent-first from crictimes
    const lastCompleted = iplCompleted.length > 0 ? [iplCompleted[0]] : [];

    return Response.json(
      { live: iplLive, completed: lastCompleted },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
        },
      }
    );
  } catch {
    // Upstream failure — return empty so the UI gracefully falls back to matchName
    return Response.json({ live: [] }, { status: 200 });
  }
}
