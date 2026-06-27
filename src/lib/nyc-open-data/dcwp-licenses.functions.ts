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

export const getDcwpPermitsForCategory = createServerFn({ method: "GET" })
  .inputValidator((d: { category: string }) => ({ category: String(d?.category ?? "").trim() }))
  .handler(async ({ data }) => {
    if (!data.category) return [] as DcwpPermit[];
    const rows = await fetchSocrata<{
      business_category: string;
      license_type: string;
      cnt: string;
      avg_days: string;
    }>({
      datasetId: DATASET_ID,
      cacheTtlMs: 6 * 60 * 60 * 1000,
      params: {
        $select:
          "business_category, license_type, count(*) as cnt, avg(date_diff_d(date_closed, submission_date)) as avg_days",
        $where: `${BASE_FILTER} AND business_category='${escSql(data.category)}'`,
        $group: "business_category, license_type",
        $order: "cnt DESC",
        $limit: 50,
      },
    });
    const out: DcwpPermit[] = [];
    for (const r of rows) {
      const cat = norm(r.business_category);
      const lt = norm(r.license_type) || "License";
      if (!cat) continue;
      const cnt = Number(r.cnt);
      const avg = Number(r.avg_days);
      out.push({
        id: `${cat}::${lt}`,
        category: cat,
        licenseType: lt,
        count: Number.isFinite(cnt) ? cnt : 0,
        avgDays: Number.isFinite(avg) ? Math.max(1, Math.round(avg)) : 0,
      });
    }
    return out;
  });
