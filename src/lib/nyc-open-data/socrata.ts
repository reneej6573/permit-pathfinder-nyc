// Generic Socrata (NYC Open Data) SoQL client. Server-side only.
// Designed to be extensible — see ./datasets.ts for the registry.

export interface SoqlParams {
  $select?: string;
  $where?: string;
  $group?: string;
  $having?: string;
  $order?: string;
  $limit?: number;
  $offset?: number;
  $q?: string;
}

export interface SocrataFetchOptions {
  datasetId: string; // e.g. "rbx6-tga4"
  domain?: string; // default data.cityofnewyork.us
  params?: SoqlParams;
  // Cache TTL in milliseconds for in-memory dedupe (per warm server instance).
  cacheTtlMs?: number;
  // Optional Socrata app token (raises rate limits). Read from env if present.
  appToken?: string;
}

// In-memory cache keyed by full URL. Bounded to avoid leaks.
const CACHE = new Map<string, { at: number; ttl: number; data: unknown }>();
const MAX_ENTRIES = 64;

function buildUrl({ datasetId, domain = "data.cityofnewyork.us", params = {} }: SocrataFetchOptions) {
  const url = new URL(`https://${domain}/resource/${datasetId}.json`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function fetchSocrata<T = Record<string, string>>(
  opts: SocrataFetchOptions,
): Promise<T[]> {
  const url = buildUrl(opts);
  const ttl = opts.cacheTtlMs ?? 60 * 60 * 1000; // 1h default
  const now = Date.now();

  const cached = CACHE.get(url);
  if (cached && now - cached.at < cached.ttl) {
    return cached.data as T[];
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.appToken ?? process.env.NYC_OPEN_DATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Socrata ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as T[];

  if (CACHE.size >= MAX_ENTRIES) {
    // drop oldest
    const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) CACHE.delete(oldest[0]);
  }
  CACHE.set(url, { at: now, ttl, data });
  return data;
}
