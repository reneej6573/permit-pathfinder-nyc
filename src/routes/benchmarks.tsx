import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/site-nav";
import { PERMIT_TYPES, BOROUGHS, boroughFriction, type PermitType } from "@/lib/permit-data";
import {
  neighborhoodStatsQuery,
  dcwpCategoriesQuery,
  dcwpPermitsForCategoryQuery,
} from "@/lib/nyc-open-data/queries";

export const Route = createFileRoute("/benchmarks")({
  head: () => ({
    meta: [
      { title: "Borough Benchmarks — NYC Permit Path" },
      {
        name: "description",
        content:
          "Side-by-side benchmarks of NYC permit approval times by ZIP and permit type, sourced from NYC Open Data.",
      },
      { property: "og:title", content: "Borough Benchmarks — NYC Permit Path" },
      {
        property: "og:description",
        content: "Compare permit approval times across NYC ZIPs and boroughs at a glance.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(neighborhoodStatsQuery);
    context.queryClient.ensureQueryData(dcwpCategoriesQuery);
  },
  component: BenchmarksPage,
});

function BenchmarksPage() {
  const { data: stats } = useSuspenseQuery(neighborhoodStatsQuery);
  const { data: dcwpCategories } = useSuspenseQuery(dcwpCategoriesQuery);
  const [permit, setPermit] = useState<PermitType>("General Construction");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedLicenseIds, setSelectedLicenseIds] = useState<Record<string, string[]>>({});
  const dcwpQuery = useQuery(dcwpPermitsForCategoryQuery(selectedCategory));
  const dcwpPermits = dcwpQuery.data ?? [];
  const cached = selectedLicenseIds[selectedCategory];
  const selectedIds = useMemo(() => {
    if (!selectedCategory) return [] as string[];
    if (cached) return cached;
    return dcwpPermits.map((p) => p.id);
  }, [selectedCategory, cached, dcwpPermits]);
  const toggleLicense = (id: string) => {
    if (!selectedCategory) return;
    const current = cached ?? dcwpPermits.map((p) => p.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSelectedLicenseIds((prev) => ({ ...prev, [selectedCategory]: next }));
  };
  const selectedLicenses = dcwpPermits.filter((p) => selectedIds.includes(p.id) && p.avgDays > 0);
  const licenseBottleneck = selectedLicenses.reduce(
    (acc, p) => (p.avgDays > acc.days ? { days: p.avgDays, label: p.licenseType } : acc),
    { days: 0, label: "" as string },
  );

  const cityMedian = stats.cityMedianByPermit[permit] ?? 0;
  const sorted = useMemo(
    () => [...stats.neighborhoods].sort((a, b) => a.days[permit] - b.days[permit]).slice(0, 40),
    [stats.neighborhoods, permit],
  );
  const max = Math.max(1, ...sorted.map((n) => n.days[permit]));

  // Borough Friction Index — borough medians for the selected DOB permit,
  // combined with the bottleneck of any selected DCWP licenses (parallel filings).
  const friction = useMemo(() => {
    const base = boroughFriction(stats.neighborhoods, permit);
    return base.map((f) => {
      const combined = Math.max(f.days, licenseBottleneck.days);
      return { ...f, combined };
    });
  }, [stats.neighborhoods, permit, licenseBottleneck.days]);
  const frictionMax = Math.max(1, ...friction.map((f) => f.combined));

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />

      <main className="max-w-6xl mx-auto p-6 lg:p-10">
        <header className="mb-10 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Borough benchmarks
          </p>
          <h1 className="font-display text-4xl font-light leading-tight mb-4 text-balance">
            Compare ZIPs <span className="font-bold">side by side.</span>
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Typical days from application to permit issuance, computed live from the NYC DOB NOW dataset.
            Switch permit types to see how different bureaucratic paths reshape the map.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            Permit type
          </span>
          <div className="flex flex-wrap gap-2">
            {PERMIT_TYPES.map((p) => (
              <button
                key={p}
                onClick={() => setPermit(p)}
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
            <h2 className="font-display font-bold text-sm uppercase tracking-wider">{permit}</h2>
            <p className="text-xs text-ink-muted">
              City estimate:{" "}
              <span className="font-display font-bold text-foreground">{cityMedian} days</span>
            </p>
          </div>

          <ul>
            {sorted.map((n) => {
              const days = n.days[permit];
              const delta = cityMedian > 0 ? Math.round(((days - cityMedian) / cityMedian) * 100) : 0;
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
                      {delta === 0 ? "On city estimate" : `${delta > 0 ? "+" : ""}${delta}% vs city estimate`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="mt-6 text-[11px] text-ink-muted italic">
          Vertical tick on each bar marks the citywide typical wait for the selected permit type. Source:
          NYC Open Data, dataset <code className="font-mono">w9ak-ipjd</code> (DOB NOW Job
          Application Filings) — approved filings from the last 24 months, with wait time
          measured as days from <code className="font-mono">filing_date</code> to{" "}
          <code className="font-mono">first_permit_date</code>.
        </p>
      </main>
    </div>
  );
}
