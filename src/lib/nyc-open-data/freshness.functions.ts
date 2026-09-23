import { createServerFn } from "@tanstack/react-start";
import { fetchSocrataWithMeta } from "./socrata";

const SOURCES = [
  { id: "w9ak-ipjd", name: "DOB NOW: Build — Job Application Filings", field: "first_permit_date", usedFor: "Map, rankings, DOB permit estimates" },
  { id: "ptev-4hud", name: "DCWP License Applications", field: "date_closed", usedFor: "Business license estimates" },
  { id: "pri4-ifjk", name: "NYC ZIP Code Boundaries", field: null, usedFor: "Choropleth map shapes" },
] as const;

export const getDataFreshness = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  const results = await Promise.all(
    SOURCES.map(async (s) => {
      const base = {
        id: s.id,
        name: s.name,
        usedFor: s.usedFor,
        portalUrl: `https://data.cityofnewyork.us/d/${s.id}`,
        apiUrl: `https://data.cityofnewyork.us/resource/${s.id}.json`,
      };
      if (!s.field) return { ...base, latestRecord: null, fetchedAt: null, ok: true, error: null };
      try {
        const { data, fetchedAt } = await fetchSocrataWithMeta<{ latest?: string }>({
          datasetId: s.id,
          params: { $select: `max(${s.field}) as latest`, $where: `${s.field} <= '${new Date().toISOString().slice(0, 10)}T23:59:59'` },
          cacheTtlMs: 6 * 60 * 60 * 1000,
        });
        return { ...base, latestRecord: data[0]?.latest ?? null, fetchedAt: new Date(fetchedAt).toISOString(), ok: true, error: null };
      } catch (e) {
        return { ...base, latestRecord: null, fetchedAt: null, ok: false, error: (e as Error).message.slice(0, 120) };
      }
    }),
  );
  return { checkedAt: new Date(now).toISOString(), sources: results };
});
