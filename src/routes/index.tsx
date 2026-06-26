import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import {
  BOROUGHS,
  NEIGHBORHOODS,
  PERMIT_TYPES,
  RECENT_APPROVALS,
  boroughFriction,
  cityAverage,
  estimateTimeline,
  findNeighborhoodByZip,
  type Borough,
  type PermitType,
} from "@/lib/permit-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NYC Permit Path — Explorer" },
      {
        name: "description",
        content:
          "Explore NYC neighborhood permit approval times. Map overlays, recent approvals, and borough friction comparisons for small business launches.",
      },
      { property: "og:title", content: "NYC Permit Path — Explorer" },
      {
        property: "og:description",
        content: "Map and compare bureaucratic lag times across NYC neighborhoods.",
      },
    ],
  }),
  component: ExplorerPage,
});

function ExplorerPage() {
  const [boroughFilter, setBoroughFilter] = useState<Borough | "All">("All");
  const [permit, setPermit] = useState<PermitType>("Commercial Renovation (Alt-1)");
  const [slug, setSlug] = useState<string>("bushwick");
  const [zipQuery, setZipQuery] = useState<string>("");
  const [zipError, setZipError] = useState<string>("");

  const estimate = useMemo(() => estimateTimeline(slug, permit), [slug, permit]);
  const friction = useMemo(() => boroughFriction(), []);
  const cityMaxFriction = Math.max(...friction.map((f) => f.days));
  const cityAvg = cityAverage(permit);
  const selected = useMemo(() => NEIGHBORHOODS.find((n) => n.slug === slug), [slug]);

  const visibleNeighborhoods = useMemo(
    () =>
      NEIGHBORHOODS.filter((n) => boroughFilter === "All" || n.borough === boroughFilter).sort(
        (a, b) => a.days[permit] - b.days[permit],
      ),
    [boroughFilter, permit],
  );

  function colorClassFor(days: number): string {
    if (days < 40) return "text-success";
    if (days < 90) return "text-warning";
    return "text-brand";
  }

  function handleZipSubmit(e: React.FormEvent) {
    e.preventDefault();
    const match = findNeighborhoodByZip(zipQuery);
    if (match) {
      setSlug(match.slug);
      setBoroughFilter("All");
      setZipError("");
    } else {
      setZipError(`No coverage for ZIP ${zipQuery}. Try 11206, 10002, 11102…`);
    }
  }

  // Zoom viewBox around the selected neighborhood
  const viewBox = selected
    ? `${selected.x - 14} ${selected.y - 10} 28 20`
    : "0 0 100 70";

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        {/* Hero */}
        <header className="mb-12 max-w-2xl">
          <h1 className="font-display text-4xl lg:text-5xl font-light leading-tight mb-4 text-balance">
            Anticipate your <span className="font-bold text-brand">opening day</span> with
            neighborhood-level data.
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            We track over 40,000 active DOB and SLA applications to calculate the most accurate
            bureaucratic lag times in New York City — so small business owners can plan a launch
            window grounded in reality, not optimism.
          </p>
        </header>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left: Map + recent activity */}
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
                  <div className="w-3 h-3 rounded-full bg-brand/20 border border-brand/50" />
                  <span className="text-[10px] font-bold uppercase tracking-tighter text-ink-muted/80">
                    Hot zone: high lag time
                  </span>
                </div>
              </div>

              <div className="relative w-full aspect-[16/9] bg-surface overflow-hidden">
                <img
                  src={nycHeatmap}
                  alt="Heat map of NYC neighborhoods showing permit approval lag times"
                  width={1600}
                  height={896}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/20 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur border border-edge rounded-md px-3 py-2 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-1">
                    Legend — Median Alt-1 days
                  </p>
                  <div className="flex items-center gap-4 text-[11px] font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-success" /> &lt; 40
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-warning" /> 40–90
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-brand" /> 90+
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Neighborhood rankings (responsive to filter + permit) */}
            <section className="bg-background border border-edge rounded-xl">
              <div className="p-4 border-b border-edge flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display font-bold text-sm uppercase tracking-wider">
                    Neighborhood ranking
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Median days to approval • City avg{" "}
                    <span className="font-semibold text-foreground">{cityAvg}d</span>
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
                  const delta = Math.round(((days - cityAvg) / cityAvg) * 100);
                  const faster = delta < 0;
                  return (
                    <li key={n.slug} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="size-10 bg-surface rounded grid place-items-center font-display font-bold text-ink-muted text-xs shrink-0">
                          {n.code}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {n.name} <span className="text-ink-muted font-normal">• {n.borough}</span>
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
                            : `${faster ? "" : "+"}${delta}% vs city avg`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Recent activity */}
            <section className="bg-background border border-edge rounded-xl">
              <div className="p-4 border-b border-edge">
                <h2 className="font-display font-bold text-sm uppercase tracking-wider">
                  Recent approval velocity
                </h2>
              </div>
              <ul className="divide-y divide-edge">
                {RECENT_APPROVALS.map((r, i) => (
                  <li key={i} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="size-10 bg-surface rounded grid place-items-center font-display font-bold text-ink-muted text-xs shrink-0">
                        {r.code}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {r.neighborhood} • {r.use}
                        </p>
                        <p className="text-xs text-ink-muted truncate">{r.permit}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={
                          r.deltaPct < 0
                            ? "text-sm font-display font-bold text-brand"
                            : r.deltaPct > 0
                              ? "text-sm font-display font-bold text-foreground"
                              : "text-sm font-display font-bold text-foreground"
                        }
                      >
                        {r.days} Days
                      </p>
                      <p className="text-[10px] uppercase text-ink-muted">
                        {r.deltaPct === 0
                          ? "Standard timeline"
                          : r.deltaPct < 0
                            ? `${Math.abs(r.deltaPct)}% faster than avg.`
                            : `${r.deltaPct}% slower than avg.`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right: Predictor + Friction */}
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
                    Target Neighborhood
                  </label>
                  <select
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 ring-white/30"
                  >
                    {NEIGHBORHOODS.map((n) => (
                      <option key={n.slug} value={n.slug} className="text-foreground">
                        {n.name}, {n.borough}
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
                        ? "Tracks with the citywide median."
                        : estimate.deltaPct < 0
                          ? `${Math.abs(estimate.deltaPct)}% faster than the citywide median.`
                          : `${estimate.deltaPct}% slower than the citywide median.`}
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
                * Friction Index uses median wait time on Alt-1 commercial renovations from
                application submission to issued permit.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-edge bg-background mt-16">
        <div className="max-w-7xl mx-auto p-6 lg:p-10 flex flex-wrap justify-between gap-4 text-xs text-ink-muted">
          <p>© 2026 NYC Permit Path. Built on public DOB NOW and SLA LAMP datasets.</p>
          <p className="font-mono">Sample data for demonstration.</p>
        </div>
      </footer>
    </div>
  );
}
