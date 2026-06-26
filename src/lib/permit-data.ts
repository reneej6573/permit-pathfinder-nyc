export type Borough = "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";

export type PermitType =
  | "Commercial Renovation (Alt-1)"
  | "New Construction"
  | "Sidewalk Cafe Permit"
  | "Full Liquor License (SLA)"
  | "Health Department Permit"
  | "Alt-2 Minor Alteration";

export interface Neighborhood {
  slug: string;
  name: string;
  borough: Borough;
  code: string;
  // median days to approval by permit type
  days: Record<PermitType, number>;
  trend: number; // % change last 90 days (positive = slower)
  primaryBottleneck: string;
}

export const PERMIT_TYPES: PermitType[] = [
  "Commercial Renovation (Alt-1)",
  "New Construction",
  "Sidewalk Cafe Permit",
  "Full Liquor License (SLA)",
  "Health Department Permit",
  "Alt-2 Minor Alteration",
];

export const NEIGHBORHOODS: Neighborhood[] = [
  {
    slug: "bushwick",
    name: "Bushwick",
    borough: "Brooklyn",
    code: "BK",
    days: {
      "Commercial Renovation (Alt-1)": 52,
      "New Construction": 198,
      "Sidewalk Cafe Permit": 84,
      "Full Liquor License (SLA)": 142,
      "Health Department Permit": 38,
      "Alt-2 Minor Alteration": 41,
    },
    trend: 8,
    primaryBottleneck: "Community Board 4 review cycle",
  },
  {
    slug: "williamsburg",
    name: "Williamsburg",
    borough: "Brooklyn",
    code: "BK",
    days: {
      "Commercial Renovation (Alt-1)": 58,
      "New Construction": 215,
      "Sidewalk Cafe Permit": 72,
      "Full Liquor License (SLA)": 168,
      "Health Department Permit": 35,
      "Alt-2 Minor Alteration": 44,
    },
    trend: 12,
    primaryBottleneck: "DOB plan examiner backlog",
  },
  {
    slug: "astoria",
    name: "Astoria",
    borough: "Queens",
    code: "QN",
    days: {
      "Commercial Renovation (Alt-1)": 29,
      "New Construction": 162,
      "Sidewalk Cafe Permit": 64,
      "Full Liquor License (SLA)": 118,
      "Health Department Permit": 28,
      "Alt-2 Minor Alteration": 31,
    },
    trend: 0,
    primaryBottleneck: "Fire Department site inspection",
  },
  {
    slug: "lower-east-side",
    name: "Lower East Side",
    borough: "Manhattan",
    code: "MN",
    days: {
      "Commercial Renovation (Alt-1)": 89,
      "New Construction": 245,
      "Sidewalk Cafe Permit": 96,
      "Full Liquor License (SLA)": 188,
      "Health Department Permit": 42,
      "Alt-2 Minor Alteration": 67,
    },
    trend: 6,
    primaryBottleneck: "Community Board 3 approval window",
  },
  {
    slug: "harlem",
    name: "Harlem",
    borough: "Manhattan",
    code: "MN",
    days: {
      "Commercial Renovation (Alt-1)": 38,
      "New Construction": 178,
      "Sidewalk Cafe Permit": 70,
      "Full Liquor License (SLA)": 124,
      "Health Department Permit": 30,
      "Alt-2 Minor Alteration": 36,
    },
    trend: -4,
    primaryBottleneck: "Landmark Preservation review (when applicable)",
  },
  {
    slug: "sunset-park",
    name: "Sunset Park",
    borough: "Brooklyn",
    code: "BK",
    days: {
      "Commercial Renovation (Alt-1)": 114,
      "New Construction": 226,
      "Sidewalk Cafe Permit": 102,
      "Full Liquor License (SLA)": 196,
      "Health Department Permit": 48,
      "Alt-2 Minor Alteration": 78,
    },
    trend: 24,
    primaryBottleneck: "Health Department inspection queue",
  },
  {
    slug: "flatbush",
    name: "Flatbush",
    borough: "Brooklyn",
    code: "BK",
    days: {
      "Commercial Renovation (Alt-1)": 74,
      "New Construction": 188,
      "Sidewalk Cafe Permit": 80,
      "Full Liquor License (SLA)": 156,
      "Health Department Permit": 36,
      "Alt-2 Minor Alteration": 49,
    },
    trend: -4,
    primaryBottleneck: "DOB plan examiner backlog",
  },
  {
    slug: "south-bronx",
    name: "South Bronx",
    borough: "Bronx",
    code: "BX",
    days: {
      "Commercial Renovation (Alt-1)": 46,
      "New Construction": 172,
      "Sidewalk Cafe Permit": 68,
      "Full Liquor License (SLA)": 134,
      "Health Department Permit": 32,
      "Alt-2 Minor Alteration": 38,
    },
    trend: -2,
    primaryBottleneck: "Document intake processing",
  },
  {
    slug: "st-george",
    name: "St. George",
    borough: "Staten Island",
    code: "SI",
    days: {
      "Commercial Renovation (Alt-1)": 31,
      "New Construction": 142,
      "Sidewalk Cafe Permit": 58,
      "Full Liquor License (SLA)": 108,
      "Health Department Permit": 26,
      "Alt-2 Minor Alteration": 28,
    },
    trend: 1,
    primaryBottleneck: "Borough President sign-off",
  },
];

export const BOROUGHS: Borough[] = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

export interface RecentApproval {
  neighborhood: string;
  code: string;
  use: string;
  permit: string;
  days: number;
  deltaPct: number; // negative = faster than avg
}

export const RECENT_APPROVALS: RecentApproval[] = [
  { neighborhood: "Bushwick", code: "BK", use: "New Restaurant", permit: "Full Liquor License (SLA)", days: 142, deltaPct: -12 },
  { neighborhood: "Lower East Side", code: "MN", use: "Retail Renovation", permit: "Alt-2 Minor Alteration", days: 89, deltaPct: 0 },
  { neighborhood: "Astoria", code: "QN", use: "Café Buildout", permit: "Sidewalk Cafe Permit", days: 61, deltaPct: -5 },
  { neighborhood: "Sunset Park", code: "BK", use: "Mixed-Use Tenant Fit", permit: "Commercial Renovation (Alt-1)", days: 121, deltaPct: 6 },
  { neighborhood: "Harlem", code: "MN", use: "Boutique Fitness", permit: "Commercial Renovation (Alt-1)", days: 42, deltaPct: -8 },
];

// Borough rollups (median Alt-1) for the Friction Index
export function boroughFriction(): { borough: Borough; days: number }[] {
  const groups: Record<string, number[]> = {};
  NEIGHBORHOODS.forEach((n) => {
    (groups[n.borough] ||= []).push(n.days["Commercial Renovation (Alt-1)"]);
  });
  const rollup = BOROUGHS.map((b) => {
    const arr = groups[b] ?? [0];
    const median = arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    return { borough: b, days: median };
  });
  return rollup.sort((a, b) => b.days - a.days);
}

export function cityAverage(permit: PermitType): number {
  const total = NEIGHBORHOODS.reduce((s, n) => s + n.days[permit], 0);
  return Math.round(total / NEIGHBORHOODS.length);
}

// Predictive estimate based on neighborhood + permit + trend.
// Returns days plus a confidence window (±).
export function estimateTimeline(slug: string, permit: PermitType) {
  const n = NEIGHBORHOODS.find((x) => x.slug === slug);
  if (!n) return null;
  const base = n.days[permit];
  const trendAdj = Math.round(base * (n.trend / 100) * 0.5);
  const expected = base + trendAdj;
  const variance = Math.round(expected * 0.18);
  const cityAvg = cityAverage(permit);
  const delta = Math.round(((expected - cityAvg) / cityAvg) * 100);
  return {
    neighborhood: n,
    permit,
    expected,
    min: expected - variance,
    max: expected + variance,
    cityAvg,
    deltaPct: delta,
    confidence: Math.max(72, 96 - Math.abs(n.trend)),
  };
}
