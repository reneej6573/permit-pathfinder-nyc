import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQuery, useQueries } from "@tanstack/react-query";
import { SiteNav } from "@/components/site-nav";
import { NycGoogleMap } from "@/components/nyc-google-map";
import {
  BOROUGHS,
  PERMIT_TYPES,
  estimateTimeline,
  type Borough,
  type PermitType,
} from "@/lib/permit-data";
import {
  neighborhoodStatsQuery,
  recentApprovalsQuery,
  dcwpCategoriesQuery,
  dcwpPermitsForCategoryQuery,
} from "@/lib/nyc-open-data/queries";
import type { DcwpPermit } from "@/lib/nyc-open-data/dcwp-licenses.functions";

const RESTAURANT_CATEGORY = "Restaurant / Food Service";
// Curated DCWP categories relevant to restaurants. Intersected with the
// live category list so we never request a category absent from the dataset.
const RESTAURANT_DCWP_CATEGORIES = [
  "Sidewalk Cafe",
  "Tobacco Retail Dealer",
  "Catering Establishment",
  "Food Service Establishment",
  "Stoop Line Stand",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NYC Permit Path — Explorer" },
      {
        name: "description",
        content:
          "Compare NYC neighborhoods by DOB permit and DCWP license wait times to pick the best ZIP to open your business.",
      },
      { property: "og:title", content: "NYC Permit Path — Explorer" },
      {
        property: "og:description",
        content:
          "Scout NYC neighborhoods by permit and license lead times before you sign a lease.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(neighborhoodStatsQuery);
    context.queryClient.ensureQueryData(recentApprovalsQuery({ limit: 8 }));
    context.queryClient.ensureQueryData(dcwpCategoriesQuery);
  },
  component: ExplorerPage,
});

function ExplorerPage() {
  const { data: stats } = useSuspenseQuery(neighborhoodStatsQuery);
  const { data: recent } = useSuspenseQuery(recentApprovalsQuery({ limit: 8 }));
  const { data: dcwpCategories } = useSuspenseQuery(dcwpCategoriesQuery);
  const neighborhoods = stats.neighborhoods;

  const [boroughFilter, setBoroughFilter] = useState<Borough | "All">("All");
  const [permit, setPermit] = useState<PermitType>("General Construction");
  const [slug, setSlug] = useState<string>(neighborhoods[0]?.slug ?? "");

  // DCWP business category + licenses
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [dcwpSelectionsByCategory, setDcwpSelectionsByCategory] = useState<
    Record<string, string[]>
  >({});
  const isRestaurant = selectedCategory === RESTAURANT_CATEGORY;
  const restaurantSubCategories = useMemo(
    () =>
      isRestaurant
        ? RESTAURANT_DCWP_CATEGORIES.filter((c) =>
            dcwpCategories.some((dc) => dc.category === c),
          )
        : [],
    [isRestaurant, dcwpCategories],
  );
  const singleDcwpQuery = useQuery(
    dcwpPermitsForCategoryQuery(isRestaurant ? "" : selectedCategory),
  );
  const restaurantQueries = useQueries({
    queries: restaurantSubCategories.map((c) => dcwpPermitsForCategoryQuery(c)),
  });
  const dcwpPermits: DcwpPermit[] = useMemo(() => {
    if (!selectedCategory) return [];
    if (isRestaurant) {
      return restaurantQueries.flatMap((q) => q.data ?? []);
    }
    return singleDcwpQuery.data ?? [];
  }, [selectedCategory, isRestaurant, restaurantQueries, singleDcwpQuery.data]);
  const dcwpIsLoading = isRestaurant
    ? restaurantQueries.some((q) => q.isLoading)
    : singleDcwpQuery.isLoading;
  const cachedSelection = dcwpSelectionsByCategory[selectedCategory];
  const dcwpSelectedIds = useMemo(() => {
    if (!selectedCategory) return [] as string[];
    if (cachedSelection) return cachedSelection;
    // Default: select items that have timing data; informational rows stay off.
    return dcwpPermits.filter((p) => p.avgDays > 0).map((p) => p.id);
  }, [selectedCategory, cachedSelection, dcwpPermits]);
  const toggleDcwp = (id: string) => {
    if (!selectedCategory) return;
    const current =
      cachedSelection ?? dcwpPermits.filter((p) => p.avgDays > 0).map((p) => p.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setDcwpSelectionsByCategory((prev) => ({ ...prev, [selectedCategory]: next }));
  };

  const dobEstimate = useMemo(
    () => estimateTimeline(slug, permit, neighborhoods, stats.cityMedianByPermit),
    [slug, permit, neighborhoods, stats.cityMedianByPermit],
  );

  // Combine DOB + selected DCWP licenses into a single projected wait
  // (parallel filings → bottleneck = longest expected wait).
  const combinedEstimate = useMemo(() => {
    const parts: { label: string; expected: number; min: number; max: number }[] = [];
    if (dobEstimate) {
      parts.push({
        label: permit,
        expected: dobEstimate.expected,
        min: dobEstimate.min,
        max: dobEstimate.max,
      });
    }
    for (const p of dcwpPermits) {
      if (!dcwpSelectedIds.includes(p.id) || p.avgDays <= 0) continue;
      const expected = Math.max(1, p.avgDays);
      const variance = Math.max(1, Math.round(expected * 0.18));
      parts.push({
        label: `${p.category} — ${p.licenseType}`,
        expected,
        min: Math.max(1, expected - variance),
        max: expected + variance,
      });
    }
    if (!parts.length) return null;
    const critical = parts.reduce((a, b) => (b.expected > a.expected ? b : a));
    return {
      parts: [...parts].sort((a, b) => b.expected - a.expected),
      critical,
      expected: critical.expected,
      min: Math.max(...parts.map((p) => p.min)),
      max: Math.max(...parts.map((p) => p.max)),
      count: parts.length,
      confidence: dobEstimate?.confidence ?? 80,
    };
  }, [dobEstimate, dcwpPermits, dcwpSelectedIds, permit]);

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
            Live from NYC Open Data · DOB NOW + DCWP Licenses
          </p>
          <h1 className="font-display text-4xl lg:text-5xl font-light leading-tight mb-4 text-balance">
            Scout the <span className="font-bold text-brand">right neighborhood</span> before
            you sign a lease.
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Compare {neighborhoods.length} NYC ZIPs by DOB permit lead times, layer in the DCWP
            licenses your business actually needs, and see a projected wait per ZIP — so you can
            pick where to open with the timeline in view.
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
                    Typical wait, filing → issued
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
                    Estimated days to issuance • City estimate{" "}
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
                              ? "On city"
                              : `${faster ? "" : "+"}${delta}% vs city`}
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
              <h2 className="font-display font-bold text-lg mb-1 italic">Projected wait for this ZIP</h2>
              <p className="text-brand-foreground/80 text-xs mb-6">
                Pick a DOB permit and your business type to see the realistic timeline here.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 opacity-80">
                    DOB Permit
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

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 opacity-80">
                    Business Type <span className="opacity-60 font-mono normal-case">(optional)</span>
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 ring-white/30"
                  >
                    <option value="" className="text-foreground">— None —</option>
                    <option value={RESTAURANT_CATEGORY} className="text-foreground">
                      {RESTAURANT_CATEGORY}
                    </option>
                    {dcwpCategories.map((c) => (
                      <option key={c.category} value={c.category} className="text-foreground">
                        {c.category}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCategory && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        Suggested licenses
                      </p>
                      {!dcwpIsLoading && dcwpPermits.length > 0 && (
                        <span className="text-[10px] font-mono opacity-70">
                          {dcwpSelectedIds.length} / {dcwpPermits.length}
                        </span>
                      )}
                    </div>
                    {dcwpIsLoading ? (
                      <p className="text-[11px] opacity-70 py-2">Loading licenses…</p>
                    ) : dcwpPermits.length === 0 ? (
                      <p className="text-[11px] opacity-70 py-2">
                        No license data for this business type.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
                        {dcwpPermits.map((p) => {
                          const checked = dcwpSelectedIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              aria-pressed={checked}
                              onClick={() => toggleDcwp(p.id)}
                              className={
                                checked
                                  ? "flex items-center gap-2 text-left px-2.5 py-2 border border-white/60 bg-white/15 rounded-md text-[11px] font-semibold"
                                  : "flex items-center gap-2 text-left px-2.5 py-2 border border-white/20 hover:border-white/50 transition-colors rounded-md text-[11px] font-medium opacity-80"
                              }
                            >
                              <span
                                className={
                                  checked
                                    ? "flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-white text-brand text-[9px] font-bold"
                                    : "flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-white/40"
                                }
                                aria-hidden
                              >
                                {checked ? "✓" : ""}
                              </span>
                              <span className="flex-1 truncate">{p.licenseType}</span>
                              {p.avgDays > 0 && (
                                <span className="text-[10px] font-mono opacity-70">
                                  ~{p.avgDays}d
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {combinedEstimate && (
                  <div className="mt-2 bg-black/15 rounded-md p-4 border border-white/15">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                        Projected wait ({combinedEstimate.count} permit
                        {combinedEstimate.count === 1 ? "" : "s"})
                      </span>
                      <span className="text-[10px] font-mono opacity-80">
                        {combinedEstimate.confidence}% conf
                      </span>
                    </div>
                    <div className="font-display text-4xl font-bold leading-none">
                      {combinedEstimate.expected}
                      <span className="text-lg font-normal opacity-80"> days</span>
                    </div>
                    <p className="mt-2 text-[11px] opacity-80 leading-snug">
                      Bottleneck: <span className="font-semibold">{combinedEstimate.critical.label}</span>
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[10px] font-mono opacity-80">
                      <span>Min {combinedEstimate.min}d</span>
                      <span>—</span>
                      <span>Max {combinedEstimate.max}d</span>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/15 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
                        Included in this estimate
                      </p>
                      {combinedEstimate.parts.map((p) => {
                        const isCrit = p.label === combinedEstimate.critical.label;
                        return (
                          <div
                            key={p.label}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className={isCrit ? "font-semibold truncate" : "opacity-80 truncate"}>
                              {isCrit ? "▸ " : ""}{p.label}
                            </span>
                            <span className="font-mono opacity-90 shrink-0">{p.expected}d</span>
                          </div>
                        );
                      })}
                      <p className="text-[10px] opacity-60 leading-snug pt-1">
                        Permits and licenses file in parallel — the longest one sets your launch date.
                      </p>
                    </div>
                  </div>
                )}

                <Link
                  to="/predictor"
                  className="block text-center bg-background text-brand font-bold py-3 rounded-md text-sm shadow-xl mt-2 active:scale-[0.98] transition-transform hover:bg-surface"
                >
                  Calculate my Deadline →
                </Link>
              </div>
            </div>



          </aside>
        </div>

        <footer className="mt-16 pt-8 border-t border-edge text-[11px] text-ink-muted">
          Source: NYC Open Data — DOB NOW: Build (dataset{" "}
          <code className="font-mono">rbx6-tga4</code>) and DCWP License Applications (dataset{" "}
          <code className="font-mono">ptev-4hud</code>). Cached server-side, refreshed hourly.
          Snapshot fetched {new Date(stats.fetchedAt).toLocaleString()}.
        </footer>
      </main>
    </div>
  );
}
