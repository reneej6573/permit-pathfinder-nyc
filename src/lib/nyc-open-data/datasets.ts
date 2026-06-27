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
      "Job application filings submitted through DOB NOW. The app filters server-side to records with non-null filing_date and first_permit_date, issued within the last 24 months, and first_permit_date >= filing_date. Permit Wait Time (days) = first_permit_date - filing_date. (`first_permit_date` is treated as the permit issuance date for this dataset; `approved_date` is intentionally not used since it reflects DOB filing approval rather than permit issuance.)",
    recentSinceIso: "2023-01-01",
  },
} as const satisfies Record<string, DatasetDescriptor>;

export type DatasetKey = keyof typeof DATASETS;
