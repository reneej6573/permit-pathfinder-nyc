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
  dobJobApplicationFilings: {
    id: "w9ak-ipjd",
    name: "DOB NOW: Build — Job Application Filings",
    domain: "data.cityofnewyork.us",
    endpoint: "https://data.cityofnewyork.us/resource/w9ak-ipjd.json",
    description:
      "Job application filings submitted through DOB NOW. Includes filing/approval dates, first permit issuance dates, work-type flags, and geocoded locations. The app filters to records that are both approved (approved_date IS NOT NULL) and have an issued permit (first_permit_date IS NOT NULL).",
    recentSinceIso: "2023-01-01",
  },
} as const satisfies Record<string, DatasetDescriptor>;

export type DatasetKey = keyof typeof DATASETS;
