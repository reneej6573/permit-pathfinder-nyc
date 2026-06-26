// Server functions backed by the DOB NOW: Build — Approved Permits dataset.
// Aggregations are performed server-side via SoQL so the client never downloads
// the full dataset. Results are cached in memory per warm server instance and
// also via TanStack Query on the client (see ./queries.ts).

import { createServerFn } from "@tanstack/react-start";
import { fetchSocrata } from "./socrata";
import { DATASETS } from "./datasets";

const DATASET = DATASETS.dobApprovedPermits;

// Curated set of permit categories surfaced in the UI. These map 1:1 to
// `work_type` values in the dataset, so they can be used directly in SoQL.
export const PERMIT_TYPES = [
  "General Construction",
  "Plumbing",
  "Mechanical Systems",
  "Sprinklers",
  "Sign",
  "Solar",
] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;
export type Borough = (typeof BOROUGHS)[number];

const BOROUGH_TITLE: Record<string, Borough> = {
  MANHATTAN: "Manhattan",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  BRONX: "Bronx",
  "STATEN ISLAND": "Staten Island",
};
const BOROUGH_CODE: Record<Borough, string> = {
  Manhattan: "MN",
  Brooklyn: "BK",
  Queens: "QN",
  Bronx: "BX",
  "Staten Island": "SI",
};

export interface Neighborhood {
  slug: string; // ZIP code is the canonical slug
  name: string; // NTA name (Neighborhood Tabulation Area)
  borough: Borough;
  code: string;
  zips: string[];
  lat: number;
  lng: number;
  permitCount: number;
  // Median (avg) approval lag in days per permit type.
  days: Record<PermitType, number>;
  primaryBottleneck: string;
  trend: number; // % change vs prior window (positive = slower)
}

export interface RecentApproval {
  jobFilingNumber: string;
  neighborhood: string;
  code: string;
  borough: Borough;
  zip: string;
  workType: string;
  permit: string;
  description: string;
  days: number;
  deltaPct: number;
  issuedDate: string;
}

function sqlList(items: readonly string[]) {
  return items.map((i) => `'${i.replace(/'/g, "''")}'`).join(",");
}

interface ZipMetaRow {
  zip_code: string;
  borough: string;
  nta: string;
  lat: string;
  lng: string;
  cnt: string;
}

interface ZipPermitRow {
  zip_code: string;
  work_type: string;
  avg_days: string;
  cnt: string;
}

interface CityPermitRow {
  work_type: string;
  avg_days: string;
}

interface TrendRow {
  zip_code: string;
  avg_days: string;
}

async function loadZipMetadata(sinceIso: string, minCount: number, limit: number) {
  return fetchSocrata<ZipMetaRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "zip_code, borough, min(nta) as nta, avg(latitude) as lat, avg(longitude) as lng, count(*) as cnt",
      $where: `zip_code IS NOT NULL AND latitude IS NOT NULL AND issued_date >= '${sinceIso}'`,
      $group: "zip_code, borough",
      $having: `cnt > ${minCount}`,
      $order: "cnt DESC",
      $limit: limit,
    },
  });
}

async function loadZipPermitLag(sinceIso: string) {
  return fetchSocrata<ZipPermitRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "zip_code, work_type, avg(date_diff_d(issued_date, approved_date)) as avg_days, count(*) as cnt",
      $where: `issued_date IS NOT NULL AND approved_date IS NOT NULL AND issued_date >= '${sinceIso}' AND work_type IN (${sqlList(PERMIT_TYPES)})`,
      $group: "zip_code, work_type",
      $having: "cnt > 3",
      $limit: 50000,
    },
  });
}

async function loadCityAverages(sinceIso: string) {
  return fetchSocrata<CityPermitRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "work_type, avg(date_diff_d(issued_date, approved_date)) as avg_days",
      $where: `issued_date IS NOT NULL AND approved_date IS NOT NULL AND issued_date >= '${sinceIso}' AND work_type IN (${sqlList(PERMIT_TYPES)})`,
      $group: "work_type",
      $limit: 50,
    },
  });
}

async function loadTrend(sinceIso: string, midIso: string) {
  // Avg lag in two windows so we can compute trend per zip.
  const recent = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "zip_code, avg(date_diff_d(issued_date, approved_date)) as avg_days",
      $where: `issued_date >= '${midIso}' AND approved_date IS NOT NULL`,
      $group: "zip_code",
      $limit: 5000,
    },
  });
  const prior = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "zip_code, avg(date_diff_d(issued_date, approved_date)) as avg_days",
      $where: `issued_date >= '${sinceIso}' AND issued_date < '${midIso}' AND approved_date IS NOT NULL`,
      $group: "zip_code",
      $limit: 5000,
    },
  });
  const recentMap = new Map(recent.map((r) => [r.zip_code, Number(r.avg_days)]));
  const priorMap = new Map(prior.map((r) => [r.zip_code, Number(r.avg_days)]));
  return { recentMap, priorMap };
}

export const getNeighborhoodStats = createServerFn({ method: "GET" }).handler(async () => {
  const sinceIso = DATASET.recentSinceIso;
  // Mid-point ~ today minus 90d. Approximate with a fixed offset relative to today.
  const mid = new Date();
  mid.setDate(mid.getDate() - 90);
  const midIso = mid.toISOString().slice(0, 10);

  const [meta, lag, cityRows, trend] = await Promise.all([
    loadZipMetadata(sinceIso, 50, 250),
    loadZipPermitLag(sinceIso),
    loadCityAverages(sinceIso),
    loadTrend(sinceIso, midIso),
  ]);

  // Pivot lag rows by zip → { work_type: avg_days }
  const lagByZip = new Map<string, Map<string, number>>();
  const bottleneckByZip = new Map<string, { type: string; days: number }>();
  for (const r of lag) {
    const days = Math.max(1, Math.round(Number(r.avg_days)));
    if (!Number.isFinite(days)) continue;
    let m = lagByZip.get(r.zip_code);
    if (!m) {
      m = new Map();
      lagByZip.set(r.zip_code, m);
    }
    m.set(r.work_type, days);
    const cur = bottleneckByZip.get(r.zip_code);
    if (!cur || days > cur.days) bottleneckByZip.set(r.zip_code, { type: r.work_type, days });
  }

  const cityAvgByPermit = new Map<string, number>();
  for (const c of cityRows) {
    cityAvgByPermit.set(c.work_type, Math.max(1, Math.round(Number(c.avg_days))));
  }
  // Fallback for missing permits.
  for (const p of PERMIT_TYPES) if (!cityAvgByPermit.has(p)) cityAvgByPermit.set(p, 30);

  const neighborhoods: Neighborhood[] = [];
  for (const m of meta) {
    const borough = BOROUGH_TITLE[m.borough];
    if (!borough) continue;
    const lat = Number(m.lat);
    const lng = Number(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const lagMap = lagByZip.get(m.zip_code) ?? new Map();
    const days = Object.fromEntries(
      PERMIT_TYPES.map((p) => [p, lagMap.get(p) ?? cityAvgByPermit.get(p) ?? 30]),
    ) as Record<PermitType, number>;

    const bottleneck = bottleneckByZip.get(m.zip_code);
    const tRecent = trend.recentMap.get(m.zip_code);
    const tPrior = trend.priorMap.get(m.zip_code);
    let trendPct = 0;
    if (tRecent && tPrior && tPrior > 0) {
      trendPct = Math.round(((tRecent - tPrior) / tPrior) * 100);
      if (!Number.isFinite(trendPct)) trendPct = 0;
      trendPct = Math.max(-50, Math.min(75, trendPct));
    }

    neighborhoods.push({
      slug: m.zip_code,
      name: m.nta || `ZIP ${m.zip_code}`,
      borough,
      code: BOROUGH_CODE[borough],
      zips: [m.zip_code],
      lat,
      lng,
      permitCount: Number(m.cnt),
      days,
      primaryBottleneck: bottleneck
        ? `${bottleneck.type} review (avg ${bottleneck.days}d)`
        : "Plan examiner intake",
      trend: trendPct,
    });
  }

  // Keep the densest 80 ZIPs to stay responsive.
  neighborhoods.sort((a, b) => b.permitCount - a.permitCount);
  const top = neighborhoods.slice(0, 80);

  return {
    neighborhoods: top,
    cityAvgByPermit: Object.fromEntries(cityAvgByPermit) as Record<PermitType, number>,
    sinceIso,
    fetchedAt: new Date().toISOString(),
  };
});

interface RecentRow {
  job_filing_number: string;
  zip_code: string;
  borough: string;
  nta: string;
  work_type: string;
  issued_date: string;
  approved_date: string;
  job_description: string;
}

export const getRecentApprovals = createServerFn({ method: "GET" })
  .inputValidator((d: { workType?: string; zip?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 12, 1), 50);
    const where = [
      "issued_date IS NOT NULL",
      "approved_date IS NOT NULL",
      `work_type IN (${sqlList(PERMIT_TYPES)})`,
    ];
    if (data.zip) where.push(`zip_code='${data.zip.replace(/'/g, "")}'`);
    if (data.workType) where.push(`work_type='${data.workType.replace(/'/g, "''")}'`);
    const rows = await fetchSocrata<RecentRow>({
      datasetId: DATASET.id,
      cacheTtlMs: 15 * 60 * 1000,
      params: {
        $select:
          "job_filing_number, zip_code, borough, nta, work_type, issued_date, approved_date, job_description",
        $where: where.join(" AND "),
        $order: "issued_date DESC",
        $limit: limit,
      },
    });

    const city = await fetchSocrata<CityPermitRow>({
      datasetId: DATASET.id,
      cacheTtlMs: 6 * 60 * 60 * 1000,
      params: {
        $select: "work_type, avg(date_diff_d(issued_date, approved_date)) as avg_days",
        $where: `issued_date >= '${DATASET.recentSinceIso}' AND approved_date IS NOT NULL AND work_type IN (${sqlList(PERMIT_TYPES)})`,
        $group: "work_type",
      },
    });
    const cityMap = new Map(city.map((c) => [c.work_type, Number(c.avg_days)]));

    const approvals: RecentApproval[] = rows.map((r) => {
      const days = Math.max(
        0,
        Math.round((new Date(r.issued_date).getTime() - new Date(r.approved_date).getTime()) / 86400000),
      );
      const cityAvg = cityMap.get(r.work_type) ?? days;
      const deltaPct = cityAvg > 0 ? Math.round(((days - cityAvg) / cityAvg) * 100) : 0;
      const borough = BOROUGH_TITLE[r.borough] ?? "Manhattan";
      return {
        jobFilingNumber: r.job_filing_number,
        neighborhood: r.nta || `ZIP ${r.zip_code}`,
        code: BOROUGH_CODE[borough],
        borough,
        zip: r.zip_code,
        workType: r.work_type,
        permit: r.work_type,
        description: (r.job_description || "").slice(0, 120),
        days,
        deltaPct,
        issuedDate: r.issued_date.slice(0, 10),
      };
    });

    return approvals;
  });
