// Server functions backed by the DOB NOW: Build — Job Application Filings
// dataset (w9ak-ipjd). The app only considers records that are BOTH approved
// (approved_date IS NOT NULL) AND have an issued permit
// (first_permit_date IS NOT NULL) — i.e. excludes pending, withdrawn, denied,
// expired, or otherwise non-issued filings. Lag is measured in days from
// approval to first permit issuance.
//
// All aggregations are performed server-side via SoQL so the client never
// downloads the raw dataset. Results are cached in memory per warm server
// instance and also via TanStack Query on the client (see ./queries.ts).

import { createServerFn } from "@tanstack/react-start";
import { fetchSocrata } from "./socrata";
import { DATASETS } from "./datasets";

const DATASET = DATASETS.dobJobApplicationFilings;

// Curated set of permit categories surfaced in the UI. Each maps to a boolean
// ('YES'/'NO') column on the filings dataset. We keep stable display labels
// for the UI while pointing at the underlying SoQL column.
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

// Baseline filter applied to every aggregation: only approved + issued filings.
const APPROVED_AND_ISSUED = "approved_date IS NOT NULL AND first_permit_date IS NOT NULL";

export interface Neighborhood {
  slug: string; // ZIP code is the canonical slug
  name: string; // NTA name (Neighborhood Tabulation Area)
  borough: Borough;
  code: string;
  zips: string[];
  lat: number;
  lng: number;
  permitCount: number;
  // Median (avg) approval→issuance lag in days per permit type.
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

function escSql(v: string) {
  return v.replace(/'/g, "''");
}

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

async function loadZipMetadata(sinceIso: string, minCount: number, limit: number) {
  return fetchSocrata<ZipMetaRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "postcode, borough, min(nta) as nta, avg(latitude::number) as lat, avg(longitude::number) as lng, count(*) as cnt",
      $where: `${APPROVED_AND_ISSUED} AND postcode IS NOT NULL AND latitude IS NOT NULL AND first_permit_date >= '${sinceIso}'`,
      $group: "postcode, borough",
      $having: `cnt > ${minCount}`,
      $order: "cnt DESC",
      $limit: limit,
    },
  });
}

async function loadZipLagForPermit(permit: PermitType, sinceIso: string) {
  const col = PERMIT_TYPE_COLUMNS[permit];
  return fetchSocrata<ZipLagRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select:
        "postcode, avg(date_diff_d(first_permit_date, approved_date)) as avg_days, count(*) as cnt",
      $where: `${APPROVED_AND_ISSUED} AND first_permit_date >= '${sinceIso}' AND upper(${col})='YES'`,
      $group: "postcode",
      $having: "cnt > 3",
      $limit: 50000,
    },
  });
}

async function loadCityAvgForPermit(permit: PermitType, sinceIso: string) {
  const col = PERMIT_TYPE_COLUMNS[permit];
  const rows = await fetchSocrata<CityAvgRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "avg(date_diff_d(first_permit_date, approved_date)) as avg_days",
      $where: `${APPROVED_AND_ISSUED} AND first_permit_date >= '${sinceIso}' AND upper(${col})='YES'`,
      $limit: 1,
    },
  });
  const v = Number(rows[0]?.avg_days);
  return Number.isFinite(v) ? Math.max(1, Math.round(v)) : 30;
}

async function loadTrend(sinceIso: string, midIso: string) {
  const baseSelect =
    "postcode, avg(date_diff_d(first_permit_date, approved_date)) as avg_days";
  const recent = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: baseSelect,
      $where: `${APPROVED_AND_ISSUED} AND first_permit_date >= '${midIso}'`,
      $group: "postcode",
      $limit: 5000,
    },
  });
  const prior = await fetchSocrata<TrendRow>({
    datasetId: DATASET.id,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: baseSelect,
      $where: `${APPROVED_AND_ISSUED} AND first_permit_date >= '${sinceIso}' AND first_permit_date < '${midIso}'`,
      $group: "postcode",
      $limit: 5000,
    },
  });
  const recentMap = new Map(recent.map((r) => [r.postcode, Number(r.avg_days)]));
  const priorMap = new Map(prior.map((r) => [r.postcode, Number(r.avg_days)]));
  return { recentMap, priorMap };
}

export const getNeighborhoodStats = createServerFn({ method: "GET" }).handler(async () => {
  const sinceIso = DATASET.recentSinceIso;
  const mid = new Date();
  mid.setDate(mid.getDate() - 90);
  const midIso = mid.toISOString().slice(0, 10);

  const [meta, perPermitLag, perPermitCity, trend] = await Promise.all([
    loadZipMetadata(sinceIso, 30, 250),
    Promise.all(PERMIT_TYPES.map((p) => loadZipLagForPermit(p, sinceIso))),
    Promise.all(PERMIT_TYPES.map((p) => loadCityAvgForPermit(p, sinceIso))),
    loadTrend(sinceIso, midIso),
  ]);

  // lagByZip: postcode -> { permit -> avgDays }
  const lagByZip = new Map<string, Partial<Record<PermitType, number>>>();
  const bottleneckByZip = new Map<string, { type: PermitType; days: number }>();
  PERMIT_TYPES.forEach((permit, i) => {
    for (const r of perPermitLag[i]) {
      const days = Math.max(1, Math.round(Number(r.avg_days)));
      if (!Number.isFinite(days)) continue;
      let m = lagByZip.get(r.postcode);
      if (!m) {
        m = {};
        lagByZip.set(r.postcode, m);
      }
      m[permit] = days;
      const cur = bottleneckByZip.get(r.postcode);
      if (!cur || days > cur.days) bottleneckByZip.set(r.postcode, { type: permit, days });
    }
  });

  const cityAvgByPermit = Object.fromEntries(
    PERMIT_TYPES.map((p, i) => [p, perPermitCity[i]]),
  ) as Record<PermitType, number>;

  const neighborhoods: Neighborhood[] = [];
  for (const m of meta) {
    const borough = BOROUGH_TITLE[m.borough];
    if (!borough) continue;
    const lat = Number(m.lat);
    const lng = Number(m.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const lagMap = lagByZip.get(m.postcode) ?? {};
    const days = Object.fromEntries(
      PERMIT_TYPES.map((p) => [p, lagMap[p] ?? cityAvgByPermit[p] ?? 30]),
    ) as Record<PermitType, number>;

    const bottleneck = bottleneckByZip.get(m.postcode);
    const tRecent = trend.recentMap.get(m.postcode);
    const tPrior = trend.priorMap.get(m.postcode);
    let trendPct = 0;
    if (tRecent && tPrior && tPrior > 0) {
      trendPct = Math.round(((tRecent - tPrior) / tPrior) * 100);
      if (!Number.isFinite(trendPct)) trendPct = 0;
      trendPct = Math.max(-50, Math.min(75, trendPct));
    }

    neighborhoods.push({
      slug: m.postcode,
      name: m.nta || `ZIP ${m.postcode}`,
      borough,
      code: BOROUGH_CODE[borough],
      zips: [m.postcode],
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

  neighborhoods.sort((a, b) => b.permitCount - a.permitCount);
  const top = neighborhoods.slice(0, 80);

  return {
    neighborhoods: top,
    cityAvgByPermit,
    sinceIso,
    fetchedAt: new Date().toISOString(),
  };
});

interface RecentRow {
  job_filing_number: string;
  postcode: string;
  borough: string;
  nta: string;
  job_type: string;
  job_description: string;
  approved_date: string;
  first_permit_date: string;
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
    if ((r[col] as string | undefined)?.toUpperCase() === "YES") return p;
  }
  return "Other";
}

export const getRecentApprovals = createServerFn({ method: "GET" })
  .inputValidator((d: { workType?: string; zip?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 12, 1), 50);
    const where = [APPROVED_AND_ISSUED];
    if (data.zip) where.push(`postcode='${escSql(data.zip)}'`);
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
      "first_permit_date",
      ...Object.values(PERMIT_TYPE_COLUMNS),
    ].join(", ");

    const rows = await fetchSocrata<RecentRow>({
      datasetId: DATASET.id,
      cacheTtlMs: 15 * 60 * 1000,
      params: {
        $select: selectCols,
        $where: where.join(" AND "),
        $order: "first_permit_date DESC",
        $limit: limit,
      },
    });

    // City avg per permit type for delta% (cheap — 6 cached queries).
    const cityAvgs = await Promise.all(
      PERMIT_TYPES.map((p) => loadCityAvgForPermit(p, DATASET.recentSinceIso)),
    );
    const cityMap = new Map<string, number>(PERMIT_TYPES.map((p, i) => [p, cityAvgs[i]]));

    const approvals: RecentApproval[] = rows.map((r) => {
      const days = Math.max(
        0,
        Math.round(
          (new Date(r.first_permit_date).getTime() - new Date(r.approved_date).getTime()) /
            86400000,
        ),
      );
      const workType = deriveWorkType(r);
      const cityAvg = cityMap.get(workType) ?? days;
      const deltaPct = cityAvg > 0 ? Math.round(((days - cityAvg) / cityAvg) * 100) : 0;
      const borough = BOROUGH_TITLE[r.borough] ?? "Manhattan";
      return {
        jobFilingNumber: r.job_filing_number,
        neighborhood: r.nta || `ZIP ${r.postcode}`,
        code: BOROUGH_CODE[borough],
        borough,
        zip: r.postcode,
        workType,
        permit: workType,
        description: (r.job_description || r.job_type || "").slice(0, 120),
        days,
        deltaPct,
        issuedDate: r.first_permit_date.slice(0, 10),
      };
    });

    return approvals;
  });
