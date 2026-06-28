import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/site-nav";
import { PERMIT_TYPES, boroughFriction, type PermitType } from "@/lib/permit-data";
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
          "Borough Friction Index: compare NYC permit approval times across boroughs by DOB permit and business license.",
      },
      { property: "og:title", content: "Borough Benchmarks — NYC Permit Path" },
      {
        property: "og:description",
        content: "Borough-level permit friction across NYC, by DOB permit and license type.",
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
            Borough <span className="font-bold">Friction Index.</span>
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Pick a DOB permit and an optional business license type to see how long approvals
            typically take in each borough. Click a borough to drill into its neighborhood-level
            breakdown.
          </p>
        </header>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">
              DOB permit type
            </p>
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
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-2">
              Business type (optional)
            </p>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-background border border-edge rounded-md px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/30 w-full max-w-sm"
            >
              <option value="">— None —</option>
              {dcwpCategories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedCategory && (
          <div className="mb-8">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                Required licenses
              </p>
              {!dcwpQuery.isLoading && dcwpPermits.length > 0 && (
                <span className="text-[10px] font-mono text-ink-muted">
                  {selectedIds.length} / {dcwpPermits.length}
                </span>
              )}
            </div>
            {dcwpQuery.isLoading ? (
              <p className="text-[11px] text-ink-muted py-2">Loading licenses…</p>
            ) : dcwpPermits.length === 0 ? (
              <p className="text-[11px] text-ink-muted py-2">
                No license data for this business type.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dcwpPermits.map((p) => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleLicense(p.id)}
                      className={
                        checked
                          ? "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-foreground bg-foreground text-background text-[11px] font-semibold"
                          : "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-edge text-ink-muted hover:text-foreground hover:border-foreground transition-colors text-[11px] font-medium"
                      }
                    >
                      <span aria-hidden>{checked ? "✓" : "+"}</span>
                      <span className="truncate max-w-[18rem]">{p.licenseType}</span>
                      {p.avgDays > 0 && (
                        <span className="font-mono opacity-70">~{p.avgDays}d</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <section className="bg-background border border-edge rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-edge">
            <h2 className="font-display font-bold text-sm uppercase tracking-wider">
              Borough Friction Index
            </h2>
            <p className="text-xs text-ink-muted mt-1">
              Typical days per borough for{" "}
              <span className="font-semibold text-foreground">{permit}</span>
              {selectedLicenses.length > 0 && (
                <>
                  {" "}
                  combined with {selectedLicenses.length} selected license
                  {selectedLicenses.length === 1 ? "" : "s"} (parallel filings — bottleneck wins).
                </>
              )}
            </p>
          </div>

          <ul>
            {friction.map((f) => {
              const widthPct = (f.combined / frictionMax) * 100;
              const driverIsLicense =
                licenseBottleneck.days > 0 && licenseBottleneck.days >= f.days;
              return (
                <li key={f.borough}>
                  <Link
                    to="/neighborhoods"
                    search={{ borough: f.borough, permit }}
                    className="block px-6 py-4 border-b border-edge last:border-b-0 grid grid-cols-12 gap-4 items-center hover:bg-surface/60 transition-colors group"
                  >
                    <div className="col-span-12 sm:col-span-3 min-w-0">
                      <p className="font-semibold text-sm group-hover:text-brand transition-colors">
                        {f.borough}
                      </p>
                      <p className="text-[10px] text-ink-muted uppercase tracking-wider">
                        DOB {f.days}d
                        {licenseBottleneck.days > 0 && <> · License {licenseBottleneck.days}d</>}
                      </p>
                    </div>
                    <div className="col-span-8 sm:col-span-6">
                      <div className="relative h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={
                            driverIsLicense
                              ? "absolute inset-y-0 left-0 bg-brand rounded-full"
                              : "absolute inset-y-0 left-0 bg-foreground/70 rounded-full"
                          }
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-4 sm:col-span-3 text-right">
                      <p className="font-display font-bold text-base">{f.combined} days</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                        {driverIsLicense ? `Driven by ${licenseBottleneck.label}` : "Driven by DOB"}{" "}
                        <span className="text-brand">→</span>
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="mt-6 text-[11px] text-ink-muted italic">
          Click any borough to view its neighborhood-level breakdown. Source: NYC Open Data, dataset{" "}
          <code className="font-mono">w9ak-ipjd</code> (DOB NOW Job Application Filings) — approved
          filings from the last 24 months, wait time measured as days from{" "}
          <code className="font-mono">filing_date</code> to{" "}
          <code className="font-mono">first_permit_date</code>.
        </p>
      </main>
    </div>
  );
}
