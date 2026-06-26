// Thin compatibility / helper layer that re-exports the live dataset's types
// and provides pure aggregations the UI components use. All data is loaded
// from NYC Open Data via `./nyc-open-data/queries.ts` — there is no static
// neighborhood data in this file.

export {
  PERMIT_TYPES,
  BOROUGHS,
  type PermitType,
  type Borough,
  type Neighborhood,
  type RecentApproval,
} from "./nyc-open-data/dob-permits.functions";

import type { Borough, Neighborhood, PermitType } from "./nyc-open-data/dob-permits.functions";
import { BOROUGHS } from "./nyc-open-data/dob-permits.functions";

export function findNeighborhoodByZip(zip: string, list: Neighborhood[]): Neighborhood | undefined {
  const z = zip.trim();
  return list.find((n) => n.zips.includes(z));
}

export function cityAverage(
  permit: PermitType,
  neighborhoods: Neighborhood[],
  fallbackMap?: Record<PermitType, number>,
): number {
  if (neighborhoods.length === 0) return fallbackMap?.[permit] ?? 0;
  const total = neighborhoods.reduce((s, n) => s + (n.days[permit] ?? 0), 0);
  return Math.round(total / neighborhoods.length);
}

export function boroughFriction(
  neighborhoods: Neighborhood[],
  permit: PermitType = "General Construction",
): { borough: Borough; days: number }[] {
  const groups = new Map<Borough, number[]>();
  for (const n of neighborhoods) {
    const arr = groups.get(n.borough) ?? [];
    arr.push(n.days[permit]);
    groups.set(n.borough, arr);
  }
  return BOROUGHS.map((b) => {
    const arr = (groups.get(b) ?? [0]).slice().sort((a, c) => a - c);
    const median = arr[Math.floor(arr.length / 2)] ?? 0;
    return { borough: b, days: median };
  }).sort((a, b) => b.days - a.days);
}

export interface TimelineEstimate {
  neighborhood: Neighborhood;
  permit: PermitType;
  expected: number;
  min: number;
  max: number;
  cityAvg: number;
  deltaPct: number;
  confidence: number;
}

export function estimateTimeline(
  slug: string,
  permit: PermitType,
  neighborhoods: Neighborhood[],
  cityAvgByPermit: Record<PermitType, number>,
): TimelineEstimate | null {
  const n = neighborhoods.find((x) => x.slug === slug);
  if (!n) return null;
  const base = n.days[permit];
  const trendAdj = Math.round(base * (n.trend / 100) * 0.5);
  const expected = Math.max(1, base + trendAdj);
  const variance = Math.max(1, Math.round(expected * 0.18));
  const cityAvg = cityAvgByPermit[permit] ?? base;
  const delta = cityAvg > 0 ? Math.round(((expected - cityAvg) / cityAvg) * 100) : 0;
  return {
    neighborhood: n,
    permit,
    expected,
    min: Math.max(1, expected - variance),
    max: expected + variance,
    cityAvg,
    deltaPct: delta,
    confidence: Math.max(72, 96 - Math.abs(n.trend)),
  };
}
