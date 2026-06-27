import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/site-nav";
import { NycGoogleMap } from "@/components/nyc-google-map";
import {
  BOROUGHS,
  PERMIT_TYPES,
  boroughFriction,
  estimateTimeline,
  type Borough,
  type PermitType,
} from "@/lib/permit-data";
import { neighborhoodStatsQuery, recentApprovalsQuery } from "@/lib/nyc-open-data/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NYC Permit Path — Explorer" },
      {
        name: "description",
        content:
          "Live NYC DOB permit approval times by ZIP. Map, ranking, and recent approvals sourced from NYC Open Data.",
      },
      { property: "og:title", content: "NYC Permit Path — Explorer" },
      {
        property: "og:description",
        content: "Live map of NYC permit lag times from the DOB NOW Job Application Filings dataset.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(neighborhoodStatsQuery);
    context.queryClient.ensureQueryData(recentApprovalsQuery({ limit: 8 }));
  },
  component: ExplorerPage,
});

function ExplorerPage() {
  const { data: stats } = useSuspenseQuery(neighborhoodStatsQuery);
  const { data: recent } = useSuspenseQuery(recentApprovalsQuery({ limit: 8 }));
  const neighborhoods = stats.neighborhoods;

  const [boroughFilter, setBoroughFilter] = useState<Borough | "All">("All");
  const [permit, setPermit] = useState<PermitType>("General Construction");
  const [slug, setSlug] = useState<string>(neighborhoods[0]?.slug ?? "");

  const estimate = useMemo(
    () => estimateTimeline(slug, permit, neighborhoods, stats.cityMedianByPermit),
    [slug, permit, neighborhoods, stats.cityMedianByPermit],
  );
  const friction = useMemo(() => boroughFriction(neighborhoods, permit), [neighborhoods, permit]);
  const cityMaxFriction = Math.max(1, ...friction.map((f) => f.days));
  const cityMedian = stats.cityMedianByPermit[permit] ?? 0;
  const selected = useMemo(
    () => neighborhoods.find((n) => n.slug === slug),
    [neighborhoods, slug],
  );

  const visibleNeighborhoods = useMemo(
    () =>
      neighborhoods
        .filter((n) => boroughFilter === "All" || n.borough === boroughFilter)
        .sort((a, b) => a.days[permit] - b.days[permit])
        .slice(0, 30),
    [neighborhoods, boroughFilter, permit],
  );

  const allZipOptions = useMemo(
    () =>
      neighborhoods
        .map((n) => ({ zip: n.zips[0], slug: n.slug, label: `${n.zips[0]} — ${n.name}` }))
        .sort((a, b) => a.zip.localeCompare(b.zip)),
    [neighborhoods],
  );

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        <header className="mb-12 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Live from NYC Open Data · DOB NOW Job Application Filings
          </p>
          <h1 className="font-display text-4xl lg:text-5xl font-light leading-tight mb-4 text-balance">
            Anticipate your <span className="font-bold text-brand">opening day</span> with
            neighborhood-level data.
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Wait times are computed live from the City's DOB NOW dataset — {neighborhoods.length}{" "}
            ZIPs ranked by average days from approval to permit issuance.
          </p>
        </header>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-background border border-edge rounded-xl p-1 overflow-hidden shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-surface border-b border-edge rounded-t-lg">
                <div className="flex flex-wrap gap-2">
                  {(["All", ...BOROUGHS] as const).map((b) => {
                    const active = boroughFilter === b;
                    return (
                      <button
                        key={b}
                        onClick={() => setBoroughFilter(b)}
                        className={
                          active
                            ? "px-4 py-1.5 bg-background border border-edge rounded-full text-xs font-semibold shadow-sm text-foreground"
                            : "px-4 py-1.5 hover:bg-background/60 transition-colors text-xs font-semibold text-ink-muted rounded-full"
                        }
                      >
                        {b === "All" ? "All Boroughs" : b}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    aria-label="Select ZIP code"
                    className="w-56 bg-background border border-edge rounded-md px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    {allZipOptions.map((o) => (
                      <option key={o.zip} value={o.slug}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => setSlug("")}
                      className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted hover:text-foreground"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <div className="relative w-full aspect-[16/9] bg-surface overflow-hidden">
                <NycGoogleMap
                  neighborhoods={neighborhoods.filter(
                    (n) => boroughFilter === "All" || n.borough === boroughFilter,
                  )}
                  permit={permit}
                  selectedSlug={slug}
                  onSelect={(s: string) => setSlug(s)}
                />
                <div className="absolute top-3 right-3 bg-background/95 backdrop-blur border border-edge rounded-md px-2 py-1 text-[10px] font-semibold text-ink-muted pointer-events-none">
                  {selected ? `Zoomed: ${selected.name} · ${selected.zips[0]}` : "Click a marker or pick a ZIP"}
                </div>
                <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur border border-edge rounded-md px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1.5">
                    Avg days, filing → issued
                  </p>
                  <div
                    className="h-2 w-44 rounded-sm"
                    style={{
                      background:
                        "linear-gradient(to right,#fde9e1,#fbc7b0,#f99e76,#f47042,#d94915,#a32f08)",
                    }}
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-mono text-ink-muted w-44">
                    <span>Fewer</span>
                    <span>More</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-background border border-edge rounded-xl">
              <div className="p-4 border-b border-edge flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display font-bold text-sm uppercase tracking-wider">
                    ZIP ranking
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Median days to issuance • City median{" "}
                    <span className="font-semibold text-foreground">{cityMedian}d</span>
                  </p>
                </div>
                <select
                  value={permit}
                  onChange={(e) => setPermit(e.target.value as PermitType)}
                  className="bg-surface border border-edge rounded-md px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  {PERMIT_TYPES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <ul className="divide-y divide-edge">
                {visibleNeighborhoods.map((n) => {
                  const days = n.days[permit];
                  const delta = cityMedian > 0 ? Math.round(((days - cityMedian) / cityMedian) * 100) : 0;
                  const faster = delta < 0;
                  const isSelected = n.slug === slug;
                  return (
                    <li key={n.slug}>
                      <button
                        type="button"
                        onClick={() => {
                          setSlug(n.slug);
                        }}
                        aria-pressed={isSelected}
                        className={
                          "w-full text-left p-4 flex items-center justify-between gap-4 transition-colors hover:bg-surface/60 focus:outline-none focus:bg-surface/60 " +
                          (isSelected ? "bg-surface" : "")
                        }
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="size-10 bg-surface rounded grid place-items-center font-display font-bold text-ink-muted text-xs shrink-0">
                            {n.code}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {n.name} <span className="text-ink-muted font-normal">• {n.borough} · {n.zips[0]}</span>
                            </p>
                            <p className="text-xs text-ink-muted truncate">
                              Bottleneck: {n.primaryBottleneck}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={
                              faster
                                ? "text-sm font-display font-bold text-success"
                                : delta > 10
                                  ? "text-sm font-display font-bold text-brand"
                                  : "text-sm font-display font-bold text-foreground"
                            }
                          >
                            {days} days
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                            {delta === 0
                              ? "On city average"
                              : `${faster ? "" : "+"}${delta}% vs city median`}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="bg-background border border-edge rounded-xl">
              <div className="p-4 border-b border-edge">
                <h2 className="font-display font-bold text-sm uppercase tracking-wider">
                  Recent approvals — live feed
                </h2>
              </div>
              <ul className="divide-y divide-edge">
                {recent.map((r) => (
                  <li key={r.jobFilingNumber} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="size-10 bg-surface rounded grid place-items-center font-display font-bold text-ink-muted text-xs shrink-0">
                        {r.code}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {r.neighborhood} • {r.workType}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          ZIP {r.zip} · issued {r.issuedDate}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-display font-bold text-foreground">
                        {r.days} Days
                      </p>
                      <p className="text-[10px] uppercase text-ink-muted">
                        {r.deltaPct === 0
                          ? "Standard timeline"
                          : r.deltaPct < 0
                            ? `${Math.abs(r.deltaPct)}% faster`
                            : `${r.deltaPct}% slower`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="bg-brand text-brand-foreground p-6 rounded-xl shadow-brand">
              <h2 className="font-display font-bold text-lg mb-1 italic">Predictive Estimator</h2>
              <p className="text-brand-foreground/80 text-xs mb-6">
                Calculate your realistic launch window.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 opacity-80">
                    Permit Category
                  </label>
                  <select
                    value={permit}
                    onChange={(e) => setPermit(e.target.value as PermitType)}
                    className="w-full bg-white/10 border border-white/20 rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 ring-white/30"
                  >
                    {PERMIT_TYPES.map((p) => (
                      <option key={p} className="text-foreground">
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 opacity-80">
                    Target ZIP
                  </label>
                  <select
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 ring-white/30"
                  >
                    {neighborhoods.map((n) => (
                      <option key={n.slug} value={n.slug} className="text-foreground">
                        {n.zips[0]} · {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                {estimate && (
                  <div className="mt-2 bg-black/15 rounded-md p-4 border border-white/15">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        Projected wait
                      </span>
                      <span className="text-[10px] font-mono opacity-80">
                        {estimate.confidence}% confidence
                      </span>
                    </div>
                    <div className="font-display text-4xl font-bold leading-none">
                      {estimate.expected}
                      <span className="text-lg font-normal opacity-80"> days</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] font-mono opacity-80">
                      <span>Min {estimate.min}d</span>
                      <span>—</span>
                      <span>Max {estimate.max}d</span>
                    </div>
                    <p className="mt-3 text-[11px] opacity-80 leading-relaxed">
                      {estimate.deltaPct === 0
                        ? "Tracks with the citywide average."
                        : estimate.deltaPct < 0
                          ? `${Math.abs(estimate.deltaPct)}% faster than citywide.`
                          : `${estimate.deltaPct}% slower than citywide.`}
                    </p>
                  </div>
                )}

                <Link
                  to="/predictor"
                  className="block text-center bg-background text-brand font-bold py-3 rounded-md text-sm shadow-xl mt-2 active:scale-[0.98] transition-transform hover:bg-surface"
                >
                  Open full predictor →
                </Link>
              </div>
            </div>

            <div className="bg-background border border-edge rounded-xl p-6">
              <h2 className="font-display font-bold text-sm mb-4 border-b border-edge pb-2">
                Borough Friction Index
              </h2>
              <div className="space-y-4">
                {friction.map((f) => (
                  <div key={f.borough}>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span>{f.borough}</span>
                      <span>{f.days} days</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${(f.days / cityMaxFriction) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-[10px] leading-relaxed text-ink-muted italic">
                * Median approval→issuance days across ZIPs in each borough for{" "}
                <span className="font-semibold">{permit}</span>.
              </p>
            </div>
          </aside>
        </div>

        <footer className="mt-16 pt-8 border-t border-edge text-[11px] text-ink-muted">
          Source: NYC Open Data, DOB NOW: Build — Approved Permits (dataset{" "}
          <code className="font-mono">rbx6-tga4</code>). Cached server-side, refreshed hourly.
          Snapshot fetched {new Date(stats.fetchedAt).toLocaleString()}.
        </footer>
      </main>
    </div>
  );
}
