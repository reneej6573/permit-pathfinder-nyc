import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { SiteNav } from "@/components/site-nav";
import { PERMIT_TYPES, type PermitType, BOROUGHS, type Borough } from "@/lib/permit-data";
import { neighborhoodStatsQuery } from "@/lib/nyc-open-data/queries";

const searchSchema = z.object({
  borough: z.string().optional(),
  permit: z.string().optional(),
});

export const Route = createFileRoute("/neighborhoods")({
  head: () => ({
    meta: [
      { title: "Neighborhood Benchmarks — NYC Permit Path" },
      {
        name: "description",
        content:
          "ZIP-by-ZIP permit approval times across NYC neighborhoods, sourced from NYC Open Data.",
      },
      { property: "og:title", content: "Neighborhood Benchmarks — NYC Permit Path" },
      {
        property: "og:description",
        content: "Compare permit approval times by neighborhood across NYC.",
      },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(neighborhoodStatsQuery);
  },
  component: NeighborhoodsPage,
});

function NeighborhoodsPage() {
  const { data: stats } = useSuspenseQuery(neighborhoodStatsQuery);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const initialPermit = (PERMIT_TYPES.includes(search.permit as PermitType)
    ? (search.permit as PermitType)
    : "General Construction") as PermitType;
  const initialBorough = (BOROUGHS.includes(search.borough as Borough)
    ? (search.borough as Borough)
    : "All") as Borough | "All";

  const [permit, setPermit] = useState<PermitType>(initialPermit);
  const [borough, setBorough] = useState<Borough | "All">(initialBorough);

  const cityMedian = stats.cityMedianByPermit[permit] ?? 0;
  const filtered = useMemo(() => {
    const list =
      borough === "All"
        ? stats.neighborhoods
        : stats.neighborhoods.filter((n) => n.borough === borough);
    return [...list].sort((a, b) => a.days[permit] - b.days[permit]);
  }, [stats.neighborhoods, permit, borough]);
  const max = Math.max(1, ...filtered.map((n) => n.days[permit]));

  const setPermitAndUrl = (p: PermitType) => {
    setPermit(p);
    navigate({ search: (prev) => ({ ...prev, permit: p }), replace: true });
  };
  const setBoroughAndUrl = (b: Borough | "All") => {
    setBorough(b);
    navigate({
      search: (prev) => ({ ...prev, borough: b === "All" ? undefined : b }),
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />
      <main className="max-w-6xl mx-auto p-6 lg:p-10">
        <header className="mb-10 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Neighborhood benchmarks
          </p>
          <h1 className="font-display text-4xl font-light leading-tight mb-4 text-balance">
            ZIP-by-ZIP <span className="font-bold">breakdown.</span>
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Typical days from application to permit issuance for each NYC ZIP, computed live from
            the NYC DOB NOW dataset. Filter by borough to zoom in on a specific area.
          </p>
          <Link
            to="/benchmarks"
            className="inline-block mt-4 text-xs font-bold uppercase tracking-widest text-brand hover:underline"
          >
            ← Back to borough index
          </Link>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            Borough
          </span>
          <div className="flex flex-wrap gap-2">
            {(["All", ...BOROUGHS] as (Borough | "All")[]).map((b) => (
              <button
                key={b}
                onClick={() => setBoroughAndUrl(b)}
                className={
                  borough === b
                    ? "px-3 py-1.5 rounded-full text-xs font-bold bg-foreground text-background"
                    : "px-3 py-1.5 rounded-full text-xs font-semibold bg-background border border-edge text-ink-muted hover:text-foreground hover:border-foreground transition-colors"
                }
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            Permit type
          </span>
          <div className="flex flex-wrap gap-2">
            {PERMIT_TYPES.map((p) => (
              <button
                key={p}
                onClick={() => setPermitAndUrl(p)}
                className={
                  permit === p
                    ? "px-3 py-1.5 rounded-full text-xs font-bold bg-foreground text-background"
                    : "px-3 py-1.5 rounded-full text-xs font-semibold bg-background border border-edge text-ink-muted hover:text-foreground hover:border-foreground transition-colors"
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <section className="bg-background border border-edge rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-edge flex items-center justify-between">
            <h2 className="font-display font-bold text-sm uppercase tracking-wider">
              {permit} · {borough === "All" ? "All boroughs" : borough}
            </h2>
            <p className="text-xs text-ink-muted">
              City estimate:{" "}
              <span className="font-display font-bold text-foreground">{cityMedian} days</span>
            </p>
          </div>

          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-ink-muted">No neighborhoods for this filter.</p>
          ) : (
            <ul>
              {filtered.map((n) => {
                const days = n.days[permit];
                const delta =
                  cityMedian > 0 ? Math.round(((days - cityMedian) / cityMedian) * 100) : 0;
                const widthPct = (days / max) * 100;
                return (
                  <li
                    key={n.slug}
                    className="px-6 py-4 border-b border-edge last:border-b-0 grid grid-cols-12 gap-4 items-center"
                  >
                    <div className="col-span-12 sm:col-span-3 min-w-0">
                      <p className="font-semibold text-sm truncate">{n.name}</p>
                      <p className="text-xs text-ink-muted">
                        {n.borough} · ZIP {n.zips[0]}
                      </p>
                    </div>
                    <div className="col-span-8 sm:col-span-6">
                      <div className="relative h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={
                            delta < 0
                              ? "absolute inset-y-0 left-0 bg-success rounded-full"
                              : delta > 15
                                ? "absolute inset-y-0 left-0 bg-brand rounded-full"
                                : "absolute inset-y-0 left-0 bg-foreground/70 rounded-full"
                          }
                          style={{ width: `${widthPct}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-ink-muted/40"
                          style={{ left: `${(cityMedian / max) * 100}%` }}
                          aria-hidden
                        />
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-3 text-right">
                      <p className="font-display font-bold text-base">{days} days</p>
                      <p
                        className={
                          delta < 0
                            ? "text-[10px] uppercase tracking-wider text-success font-semibold"
                            : delta > 0
                              ? "text-[10px] uppercase tracking-wider text-brand font-semibold"
                              : "text-[10px] uppercase tracking-wider text-ink-muted font-semibold"
                        }
                      >
                        {delta === 0 ? "On city" : `${delta > 0 ? "+" : ""}${delta}% vs city`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="mt-6 text-[11px] text-ink-muted italic">
          Vertical tick marks the citywide typical wait for the selected permit type. Source: NYC
          Open Data, dataset <code className="font-mono">w9ak-ipjd</code> (DOB NOW Job Application
          Filings) — approved filings from the last 24 months, wait time measured as days from{" "}
          <code className="font-mono">filing_date</code> to{" "}
          <code className="font-mono">first_permit_date</code>.
        </p>
      </main>
    </div>
  );
}
