// Server functions backed by the DCWP License Applications dataset (ptev-4hud).
//
// Filter contract:
//   status = 'Approved'
//   application_type = 'New'
//   submission_date IS NOT NULL
//   date_closed IS NOT NULL
//   date_closed >= submission_date

import { createServerFn } from "@tanstack/react-start";
import { fetchSocrata } from "./socrata";

const DATASET_ID = "ptev-4hud";

const BASE_FILTER = [
  "status='Approved'",
  "application_type='New'",
  "submission_date IS NOT NULL",
  "date_closed IS NOT NULL",
  "date_closed >= submission_date",
].join(" AND ");

const escSql = (v: string) => v.replace(/'/g, "''");
const norm = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export interface DcwpCategory {
  category: string;
  count: number;
}

export interface DcwpPermit {
  id: string; // category::licenseType
  category: string;
  licenseType: string;
  count: number;
  avgDays: number;
}

export const getDcwpCategories = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await fetchSocrata<{ business_category: string; cnt: string }>({
    datasetId: DATASET_ID,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    params: {
      $select: "business_category, count(*) as cnt",
      $where: `${BASE_FILTER} AND business_category IS NOT NULL`,
      $group: "business_category",
      $order: "business_category",
      $limit: 2000,
    },
  });
  const out: DcwpCategory[] = [];
  for (const r of rows) {
    const c = norm(r.business_category);
    if (!c) continue;
    const n = Number(r.cnt);
    out.push({ category: c, count: Number.isFinite(n) ? n : 0 });
  }
  out.sort((a, b) => a.category.localeCompare(b.category));
  return out;
});

function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const getDcwpPermitsForCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { category: string }) => ({ category: String(d?.category ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!data.category) return [] as DcwpPermit[];
    const rows = await fetchSocrata<{
      license_type: string;
      days: string;
    }>({
      datasetId: DATASET_ID,
      cacheTtlMs: 6 * 60 * 60 * 1000,
      params: {
        $select: "license_type, date_diff_d(date_closed, submission_date) as days",
        $where: `${BASE_FILTER} AND business_category='${escSql(data.category)}'`,
        $limit: 50000,
      },
    });
    const buckets = new Map<string, number[]>();
    for (const r of rows) {
      const lt = norm(r.license_type) || "License";
      const d = Number(r.days);
      if (!Number.isFinite(d) || d < 0) continue;
      let arr = buckets.get(lt);
      if (!arr) {
        arr = [];
        buckets.set(lt, arr);
      }
      arr.push(d);
    }
    const out: DcwpPermit[] = [];
    for (const [lt, arr] of buckets) {
      const med = medianOf(arr);
      out.push({
        id: `${data.category}::${lt}`,
        category: data.category,
        licenseType: lt,
        count: arr.length,
        avgDays: Math.max(1, Math.round(med)),
      });
    }
    out.sort((a, b) => b.count - a.count);
    return out.slice(0, 50);
});

// ---- Seasonality ---------------------------------------------------------

export interface DcwpSeasonality {
  licenseType: string;
  baselineDays: number;
  months: { month: number; medianDays: number; sampleSize: number; deltaPct: number }[];
}

export const getDcwpSeasonalityForCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { category: string }) => ({ category: String(d?.category ?? "").trim() }))
  .handler(async ({ data }): Promise<DcwpSeasonality[]> => {
    if (!data.category) return [];
    const rows = await fetchSocrata<{
      license_type: string;
      mo: string;
      days: string;
    }>({
      datasetId: DATASET_ID,
      cacheTtlMs: 6 * 60 * 60 * 1000,
      params: {
        $select:
          "license_type, date_extract_m(submission_date) as mo, date_diff_d(date_closed, submission_date) as days",
        $where: `${BASE_FILTER} AND business_category='${escSql(data.category)}'`,
        $limit: 50000,
      },
    });
    const byType = new Map<string, Map<number, number[]>>();
    const allByType = new Map<string, number[]>();
    for (const r of rows) {
      const lt = norm(r.license_type) || "License";
      const mo = Number(r.mo);
      const d = Number(r.days);
      if (!Number.isFinite(mo) || mo < 1 || mo > 12) continue;
      if (!Number.isFinite(d) || d < 0) continue;
      let m = byType.get(lt);
      if (!m) {
        m = new Map();
        byType.set(lt, m);
      }
      let arr = m.get(mo);
      if (!arr) {
        arr = [];
        m.set(mo, arr);
      }
      arr.push(d);
      let all = allByType.get(lt);
      if (!all) {
        all = [];
        allByType.set(lt, all);
      }
      all.push(d);
    }
    const out: DcwpSeasonality[] = [];
    for (const [lt, m] of byType) {
      const baseline = medianOf(allByType.get(lt) ?? []);
      if (baseline <= 0) continue;
      const months: DcwpSeasonality["months"] = [];
      for (let mo = 1; mo <= 12; mo++) {
        const arr = m.get(mo);
        if (!arr || arr.length < 5) continue;
        const med = medianOf(arr);
        months.push({
          month: mo,
          medianDays: Math.round(med),
          sampleSize: arr.length,
          deltaPct: Math.round(((med - baseline) / baseline) * 100),
        });
      }
      out.push({ licenseType: lt, baselineDays: Math.round(baseline), months });
    }
    return out;
  });

