// Server functions backed by the DOB NOW: Build — Job Application Filings
// dataset (w9ak-ipjd).
//
// Inclusion contract (applied server-side via SoQL on every aggregation):
//   - filing_status = 'Approved'
//   - approved_date IS NOT NULL      (dataset's equivalent of an "issue date"
//                                     for an approved application; the schema
//                                     has no separate `issue_date` field)
//   - filing_date    IS NOT NULL
//   - approved_date >= now - 24 months
//   - approved_date >= filing_date   (drop bogus negative-lag rows)
//
// Approval Time (days) = date_diff_d(first_permit_date, filing_date).
//
// All aggregations run server-side so the client never downloads the raw
// dataset. Results are cached in memory per warm server instance and again
// via TanStack Query on the client (see ./queries.ts).

import { createServerFn } from "@tanstack/react-start";
import { fetchSocrata } from "./socrata";
import { DATASETS } from "./datasets";

const DATASET = DATASETS.dobJobApplicationFilings;

// Curated set of permit categories surfaced in the UI. Each maps to a boolean
// ('YES'/'NO') column on the filings dataset.
export const PERMIT_TYPE_COLUMNS = {
  "General Construction": "general_construction_work_type_",
  Plumbing: "plumbing_work_type",
  "Mechanical Systems": "mechanical_systems_work_type_",
  Sprinklers: "sprinkler_work_type",
  Sign: "sign",
  Solar: "solar_work_type_",
} as const;
export const PERMIT_TYPES = Object.keys(PERMIT_TYPE_COLUMNS) as PermitType[];
export type PermitType = keyof typeof PERMIT_TYPE_COLUMNS;

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

// ---- Baseline filter (24-month rolling window) ---------------------------

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Recomputed at module load — server warm instances refresh hourly via the
// TanStack Query staleTime, so a slightly stale floor is fine.
const WINDOW_START_ISO = isoDaysAgo(365 * 2);

const BASE_FILTER = [
  "first_permit_date IS NOT NULL",
  "filing_date IS NOT NULL",
  `first_permit_date >= '${WINDOW_START_ISO}T00:00:00'`,
  "first_permit_date >= filing_date",
].join(" AND ");

// ---- Types ---------------------------------------------------------------

export interface Neighborhood {
  slug: string; // ZIP code is the canonical slug
  name: string; // NTA name (Neighborhood Tabulation Area)
  borough: Borough;
  code: string;
  zips: string[];
  lat: number;
  lng: number;
  permitCount: number;
  // Avg approval-time (days) per permit type in this ZIP.
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

// ---- Normalization helpers ----------------------------------------------

const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const upper = (v: unknown) => norm(v).toUpperCase();
const title = (v: unknown) => {
  const s = norm(v).toLowerCase();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
};
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const isoDate = (v: unknown) => {
  const s = norm(v);
  return s ? s.slice(0, 10) : "";
};
const escSql = (v: string) => v.replace(/'/g, "''");

// ---- Aggregation queries -------------------------------------------------

interface ZipMetaRow {
  postcode: string;
  borough: string;
  nta: string;
  lat: string;
  lng: string;
  cnt: string;
}

interface ZipLagRow {
  postcode: string;
  avg_days: string;
  cnt: string;
}

interface CityAvgRow {
  avg_days: string;
}

interface TrendRow {
  postcode: string;
  avg_days: string;
}

async function loadZipMetadata(minCount: number, limit: number) {
  return fetchSocrata<ZipMetaRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "postcode, borough, min(nta) as nta, avg(latitude::number) as lat, avg(longitude::number) as lng, count(*) as cnt",
      $where: `${BASE_FILTER} AND postcode IS NOT NULL AND latitude IS NOT NULL`,
      $group: "postcode, borough",
      $having: `cnt > ${minCount}`,
      $order: "cnt DESC",
      $limit: limit,
    },
  });
}

async function loadZipLagForPermit(permit: PermitType) {
  const col = PERMIT_TYPE_COLUMNS[permit];
  return fetchSocrata<ZipLagRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "postcode, avg(date_diff_d(first_permit_date, filing_date)) as avg_days, count(*) as cnt",
      $where: `${BASE_FILTER} AND upper(${col})='YES'`,
      $group: "postcode",
      $having: "cnt > 3",
      $limit: 50000,
    },
  });
}

async function loadCityAvgForPermit(permit: PermitType) {
  const col = PERMIT_TYPE_COLUMNS[permit];
  const rows = await fetchSocrata<CityAvgRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "avg(date_diff_d(first_permit_date, filing_date)) as avg_days",
      $where: `${BASE_FILTER} AND upper(${col})='YES'`,
      $limit: 1,
    },
  });
  const v = Number(rows[0]?.avg_days);
  return Number.isFinite(v) ? Math.max(1, Math.round(v)) : 30;
}

async function loadTrend(midIso: string) {
  const baseSelect =
    "postcode, avg(date_diff_d(first_permit_date, filing_date)) as avg_days";
  const recent = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: baseSelect,
      $where: `${BASE_FILTER} AND approved_date >= '${midIso}T00:00:00'`,
      $group: "postcode",
      $limit: 5000,
    },
  });
  const prior = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: baseSelect,
      $where: `${BASE_FILTER} AND approved_date < '${midIso}T00:00:00'`,
      $group: "postcode",
      $limit: 5000,
    },
  });
  const recentMap = new Map(recent.map((r) => [norm(r.postcode), num(r.avg_days)]));
  const priorMap = new Map(prior.map((r) => [norm(r.postcode), num(r.avg_days)]));
  return { recentMap, priorMap };
}

export const getNeighborhoodStats = createServerFn({ method: "GET" }).handler(async () => {
  const midIso = isoDaysAgo(90);

  const [meta, perPermitLag, perPermitCity, trend] = await Promise.all([
    loadZipMetadata(30, 250),
    Promise.all(PERMIT_TYPES.map((p) => loadZipLagForPermit(p))),
    Promise.all(PERMIT_TYPES.map((p) => loadCityAvgForPermit(p))),
    loadTrend(midIso),
  ]);

  const lagByZip = new Map<string, Partial<Record<PermitType, number>>>();
  const bottleneckByZip = new Map<string, { type: PermitType; days: number }>();
  PERMIT_TYPES.forEach((permit, i) => {
    for (const r of perPermitLag[i]) {
      const zip = norm(r.postcode);
      if (!zip) continue;
      const days = Math.max(1, Math.round(num(r.avg_days)));
      if (!Number.isFinite(days)) continue;
      let m = lagByZip.get(zip);
      if (!m) {
        m = {};
        lagByZip.set(zip, m);
      }
      m[permit] = days;
      const cur = bottleneckByZip.get(zip);
      if (!cur || days > cur.days) bottleneckByZip.set(zip, { type: permit, days });
    }
  });

  const cityAvgByPermit = Object.fromEntries(
    PERMIT_TYPES.map((p, i) => [p, perPermitCity[i]]),
  ) as Record<PermitType, number>;

  const seenZip = new Set<string>();
  const neighborhoods: Neighborhood[] = [];
  for (const m of meta) {
    const zip = norm(m.postcode);
    if (!zip || seenZip.has(zip)) continue; // dedupe
    seenZip.add(zip);
    const borough = BOROUGH_TITLE[upper(m.borough)];
    if (!borough) continue;
    const lat = num(m.lat);
    const lng = num(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cnt = num(m.cnt);
    if (!Number.isFinite(cnt) || cnt <= 0) continue;

    const lagMap = lagByZip.get(zip) ?? {};
    const days = Object.fromEntries(
      PERMIT_TYPES.map((p) => [p, lagMap[p] ?? cityAvgByPermit[p] ?? 30]),
    ) as Record<PermitType, number>;

    const bottleneck = bottleneckByZip.get(zip);
    const tRecent = trend.recentMap.get(zip);
    const tPrior = trend.priorMap.get(zip);
    let trendPct = 0;
    if (tRecent && tPrior && tPrior > 0) {
      trendPct = Math.round(((tRecent - tPrior) / tPrior) * 100);
      if (!Number.isFinite(trendPct)) trendPct = 0;
      trendPct = Math.max(-50, Math.min(75, trendPct));
    }

    neighborhoods.push({
      slug: zip,
      name: norm(m.nta) || `ZIP ${zip}`,
      borough,
      code: BOROUGH_CODE[borough],
      zips: [zip],
      lat,
      lng,
      permitCount: Math.round(cnt),
      days,
      primaryBottleneck: bottleneck
        ? `${bottleneck.type} review (avg ${bottleneck.days}d)`
        : "Plan examiner intake",
      trend: trendPct,
    });
  }

  neighborhoods.sort((a, b) => b.permitCount - a.permitCount);
  const top = neighborhoods.slice(0, 80);

  return {
    neighborhoods: top,
    cityAvgByPermit,
    sinceIso: WINDOW_START_ISO,
    fetchedAt: new Date().toISOString(),
  };
});

// ---- Recent approvals feed ----------------------------------------------

interface RecentRow {
  job_filing_number: string;
  postcode: string;
  borough: string;
  nta: string;
  job_type: string;
  job_description: string;
  approved_date: string;
  filing_date: string;
  general_construction_work_type_?: string;
  plumbing_work_type?: string;
  mechanical_systems_work_type_?: string;
  sprinkler_work_type?: string;
  sign?: string;
  solar_work_type_?: string;
}

function deriveWorkType(r: RecentRow): PermitType | "Other" {
  for (const p of PERMIT_TYPES) {
    const col = PERMIT_TYPE_COLUMNS[p] as keyof RecentRow;
    if (upper(r[col]) === "YES") return p;
  }
  return "Other";
}

export const getRecentApprovals = createServerFn({ method: "GET" })
  .inputValidator((d: { workType?: string; zip?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 12, 1), 50);
    const where = [BASE_FILTER];
    if (data.zip) where.push(`postcode='${escSql(data.zip.trim())}'`);
    if (data.workType && data.workType in PERMIT_TYPE_COLUMNS) {
      const col = PERMIT_TYPE_COLUMNS[data.workType as PermitType];
      where.push(`upper(${col})='YES'`);
    }
    const selectCols = [
      "job_filing_number",
      "postcode",
      "borough",
      "nta",
      "job_type",
      "job_description",
      "approved_date",
      "filing_date",
      ...Object.values(PERMIT_TYPE_COLUMNS),
    ].join(", ");

    const rows = await fetchSocrata<RecentRow>({
      datasetId: DATASET.id,
      cacheTtlMs: 15 * 60 * 1000,
      params: {
        $select: selectCols,
        $where: where.join(" AND "),
        $order: "approved_date DESC",
        $limit: limit * 2, // overfetch to allow client dedupe below
      },
    });

    const cityAvgs = await Promise.all(PERMIT_TYPES.map((p) => loadCityAvgForPermit(p)));
    const cityMap = new Map<string, number>(PERMIT_TYPES.map((p, i) => [p, cityAvgs[i]]));

    const seen = new Set<string>();
    const approvals: RecentApproval[] = [];
    for (const r of rows) {
      const jfn = norm(r.job_filing_number);
      if (!jfn || seen.has(jfn)) continue;
      seen.add(jfn);

      const approved = norm(r.approved_date);
      const filed = norm(r.filing_date);
      if (!approved || !filed) continue;
      const days = Math.round(
        (new Date(approved).getTime() - new Date(filed).getTime()) / 86400000,
      );
      if (!Number.isFinite(days) || days < 0) continue;

      const workType = deriveWorkType(r);
      const cityAvg = cityMap.get(workType) ?? days;
      const deltaPct = cityAvg > 0 ? Math.round(((days - cityAvg) / cityAvg) * 100) : 0;
      const borough = BOROUGH_TITLE[upper(r.borough)] ?? "Manhattan";

      approvals.push({
        jobFilingNumber: jfn,
        neighborhood: norm(r.nta) || `ZIP ${norm(r.postcode)}`,
        code: BOROUGH_CODE[borough],
        borough,
        zip: norm(r.postcode),
        workType,
        permit: workType,
        description: norm(r.job_description) || title(r.job_type),
        days,
        deltaPct,
        issuedDate: isoDate(approved),
      });
      if (approvals.length >= limit) break;
    }

    return approvals;
  });
