// Registry of NYC Open Data datasets used by the app.
// To add a new dataset: add an entry here and create a `*.functions.ts` module
// next to this file that exposes typed server functions backed by `fetchSocrata`.

export interface DatasetDescriptor {
  id: string; // Socrata dataset identifier (4x4)
  name: string;
  domain: string;
  endpoint: string;
  description: string;
  // Recent-window default for aggregations.
  recentSinceIso: string;
}

export const DATASETS = {
  dobApprovedPermits: {
    id: "rbx6-tga4",
    name: "DOB NOW: Build — Approved Permits",
    domain: "data.cityofnewyork.us",
    endpoint: "https://data.cityofnewyork.us/resource/rbx6-tga4.json",
    description:
      "Approved building permits filed through DOB NOW. Includes filing dates, approval dates, work types, and geocoded locations.",
    recentSinceIso: "2024-01-01",
  },
} as const satisfies Record<string, DatasetDescriptor>;

export type DatasetKey = keyof typeof DATASETS;
