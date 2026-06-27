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
      "Job application filings submitted through DOB NOW. The app filters server-side to records where filing_status='Approved' with non-null filing_date and approved_date, approved within the last 24 months, and approved_date >= filing_date. Approval Time (days) = approved_date - filing_date. (The dataset has no separate `issue_date` field; `approved_date` is the closest semantic equivalent for an approved application.)",
    recentSinceIso: "2023-01-01",
  },
} as const satisfies Record<string, DatasetDescriptor>;

export type DatasetKey = keyof typeof DATASETS;
