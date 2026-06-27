import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/site-nav";
import {
  PERMIT_TYPES,
  estimateTimeline,
  type PermitType,
} from "@/lib/permit-data";
import {
  neighborhoodStatsQuery,
  dcwpCategoriesQuery,
  dcwpPermitsForCategoryQuery,
} from "@/lib/nyc-open-data/queries";

export const Route = createFileRoute("/predictor")({
  head: () => ({
    meta: [
      { title: "Predictor — NYC Permit Path" },
      {
        name: "description",
        content:
          "Forecast NYC permit approval timelines using live DOB NOW data. Pick a ZIP and one or more permits to see your launch window.",
      },
      { property: "og:title", content: "Predictor — NYC Permit Path" },
      {
        property: "og:description",
        content: "Forecast your NYC permit approval timeline with a confidence range.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(neighborhoodStatsQuery);
    context.queryClient.ensureQueryData(dcwpCategoriesQuery);
  },
  component: PredictorPage,
});

function formatLaunchWindow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtFullDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function PredictorPage() {
  const { data: stats } = useSuspenseQuery(neighborhoodStatsQuery);
  const neighborhoods = stats.neighborhoods;

  const [slug, setSlug] = useState<string>(neighborhoods[0]?.slug ?? "");
  const [selectedPermits, setSelectedPermits] = useState<PermitType[]>(["General Construction"]);

  const togglePermit = (p: PermitType) => {
    setSelectedPermits((prev) =>
      prev.includes(p)
        ? prev.length === 1
          ? prev
          : prev.filter((x) => x !== p)
        : [...prev, p],
    );
  };

  // ---- DCWP licensing state -------------------------------------------------
  const { data: dcwpCategories } = useSuspenseQuery(dcwpCategoriesQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  // Per-category selection cache so switching categories preserves choices.
  const [dcwpSelectionsByCategory, setDcwpSelectionsByCategory] = useState<
    Record<string, string[]>
  >({});

  const dcwpQuery = useQuery(dcwpPermitsForCategoryQuery(selectedCategory));
  const dcwpPermits = dcwpQuery.data ?? [];

  // Default-check all permits the first time a category is loaded; respect
  // any cached selection the user already made for this category this session.
  const cachedSelection = dcwpSelectionsByCategory[selectedCategory];
  const dcwpSelectedIds = useMemo(() => {
    if (!selectedCategory) return [] as string[];
    if (cachedSelection) return cachedSelection;
    return dcwpPermits.map((p) => p.id);
  }, [selectedCategory, cachedSelection, dcwpPermits]);

  const toggleDcwp = (id: string) => {
    if (!selectedCategory) return;
    const current = cachedSelection ?? dcwpPermits.map((p) => p.id);
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setDcwpSelectionsByCategory((prev) => ({ ...prev, [selectedCategory]: next }));
  };

  const totalSelected = selectedPermits.length + dcwpSelectedIds.length;
  const totalSuggested = selectedPermits.length + dcwpPermits.length;

  const dobEstimates = useMemo(
    () =>
      selectedPermits
        .map((p) => estimateTimeline(slug, p, neighborhoods, stats.cityMedianByPermit))
        .filter((e): e is NonNullable<ReturnType<typeof estimateTimeline>> => !!e)
        .map((e) => ({
          key: `dob:${e.permit}`,
          label: e.permit,
          source: "DOB" as const,
          expected: e.expected,
          min: e.min,
          max: e.max,
          confidence: e.confidence,
          neighborhood: e.neighborhood,
        })),
    [slug, selectedPermits, neighborhoods, stats.cityMedianByPermit],
  );

  const dcwpEstimates = useMemo(() => {
    if (!selectedCategory) return [];
    return dcwpPermits
      .filter((p) => dcwpSelectedIds.includes(p.id) && p.avgDays > 0)
      .map((p) => {
        const expected = Math.max(1, p.avgDays);
        const variance = Math.max(1, Math.round(expected * 0.18));
        return {
          key: `dcwp:${p.id}`,
          label: `${p.licenseType} (DCWP)`,
          source: "DCWP" as const,
          expected,
          min: Math.max(1, expected - variance),
          max: expected + variance,
          confidence: 80,
          neighborhood: null as null | (typeof dobEstimates)[number]["neighborhood"],
        };
      });
  }, [selectedCategory, dcwpPermits, dcwpSelectedIds, dobEstimates]);

  const perPermit = useMemo(
    () => [...dobEstimates, ...dcwpEstimates],
    [dobEstimates, dcwpEstimates],
  );

  const aggregate = useMemo(() => {
    if (perPermit.length === 0) return null;
    const critical = perPermit.reduce((a, b) => (b.expected > a.expected ? b : a));
    const min = Math.max(...perPermit.map((e) => e.min));
    const max = Math.max(...perPermit.map((e) => e.max));
    const neighborhood =
      critical.neighborhood ??
      dobEstimates[0]?.neighborhood ??
      neighborhoods.find((n) => n.slug === slug) ??
      neighborhoods[0];
    return {
      neighborhood,
      critical,
      expected: critical.expected,
      min,
      max,
      confidence: Math.min(...perPermit.map((e) => e.confidence)),
    };
  }, [perPermit, dobEstimates, neighborhoods, slug]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const defaultLaunch = useMemo(
    () => toInputDate(addDays(today, (aggregate?.expected ?? 60) + 30)),
    [today, aggregate?.expected],
  );
  const [launchDate, setLaunchDate] = useState<string>(defaultLaunch);

  const targetLaunch = launchDate ? new Date(launchDate + "T00:00:00") : null;
  const approvalEarliest = aggregate ? addDays(today, aggregate.min) : null;
  const approvalExpected = aggregate ? addDays(today, aggregate.expected) : null;
  const approvalLatest = aggregate ? addDays(today, aggregate.max) : null;

  const deadlineRecommended =
    aggregate && targetLaunch ? addDays(targetLaunch, -aggregate.max) : null;
  const deadlineLatest =
    aggregate && targetLaunch ? addDays(targetLaunch, -aggregate.expected) : null;
  const daysUntilDeadline = deadlineRecommended
    ? Math.ceil((deadlineRecommended.getTime() - today.getTime()) / 86400000)
    : null;
  const deadlinePassed = daysUntilDeadline !== null && daysUntilDeadline < 0;

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />

      <main className="max-w-5xl mx-auto p-6 lg:p-10">
        <header className="mb-10 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Predictive estimator · live data
          </p>
          <h1 className="font-display text-4xl font-light leading-tight mb-4 text-balance">
            Forecast your <span className="font-bold">launch window</span> in two clicks.
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Estimates are computed from the NYC Open Data DOB NOW Approved Permits dataset
            (estimated days from filing to issuance per ZIP), adjusted for the 90-day trend.
          </p>
        </header>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-2 bg-background border border-edge rounded-xl p-6 space-y-5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 text-ink-muted">
                Target ZIP
              </label>
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full bg-surface border border-edge rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {neighborhoods.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.zips[0]} · {n.name}, {n.borough}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                  DOB Permits
                </h2>
                <span className="text-[10px] font-mono text-ink-muted">
                  {selectedPermits.length} / {PERMIT_TYPES.length} selected
                </span>
              </div>
              <p className="text-[11px] text-ink-muted mb-2">
                Construction-related permits from DOB NOW filings.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {PERMIT_TYPES.map((p) => {
                  const checked = selectedPermits.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => togglePermit(p)}
                      className={
                        checked
                          ? "flex items-center gap-2.5 text-left px-3 py-2.5 border-2 border-brand bg-brand/5 rounded-md text-xs font-bold text-brand"
                          : "flex items-center gap-2.5 text-left px-3 py-2.5 border border-edge bg-background hover:border-foreground transition-colors rounded-md text-xs font-semibold text-ink-muted"
                      }
                    >
                      <span
                        className={
                          checked
                            ? "flex h-4 w-4 items-center justify-center rounded-sm bg-brand text-background text-[10px] font-bold"
                            : "flex h-4 w-4 items-center justify-center rounded-sm border border-edge"
                        }
                        aria-hidden
                      >
                        {checked ? "✓" : ""}
                      </span>
                      <span className="flex-1">{p}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-ink-muted mt-2">
                Filings run in parallel — the longest permit drives your launch date.
              </p>
            </div>

            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground mb-1.5">
                DCWP License Requirements
              </h2>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 text-ink-muted">
                Select Your Business Type
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-surface border border-edge rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">— Choose a business category —</option>
                {dcwpCategories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>

              {selectedCategory && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                      Suggested licenses
                    </p>
                    {!dcwpQuery.isLoading && dcwpPermits.length > 0 && (
                      <span className="text-[10px] font-mono text-ink-muted">
                        {dcwpSelectedIds.length} / {dcwpPermits.length} selected
                      </span>
                    )}
                  </div>
                  {dcwpQuery.isLoading ? (
                    <p className="text-xs text-ink-muted py-3">Loading DCWP licenses…</p>
                  ) : dcwpPermits.length === 0 ? (
                    <p className="text-xs text-ink-muted py-3">
                      No permit data found for this business type. Try a different category.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
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
                                ? "flex items-center gap-2.5 text-left px-3 py-2.5 border-2 border-brand bg-brand/5 rounded-md text-xs font-bold text-brand"
                                : "flex items-center gap-2.5 text-left px-3 py-2.5 border border-edge bg-background hover:border-foreground transition-colors rounded-md text-xs font-semibold text-ink-muted"
                            }
                          >
                            <span
                              className={
                                checked
                                  ? "flex h-4 w-4 items-center justify-center rounded-sm bg-brand text-background text-[10px] font-bold"
                                  : "flex h-4 w-4 items-center justify-center rounded-sm border border-edge"
                              }
                              aria-hidden
                            >
                              {checked ? "✓" : ""}
                            </span>
                            <span className="flex-1">
                              {p.category} — {p.licenseType}
                            </span>
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
            </div>

            <div className="border-t border-edge pt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                  Total permits selected
                </span>
                <span className="text-sm font-mono font-bold text-foreground">
                  {totalSelected} / {totalSuggested}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 text-ink-muted">
                Target Launch Date
              </label>
              <input
                type="date"
                value={launchDate}
                min={toInputDate(today)}
                onChange={(e) => setLaunchDate(e.target.value)}
                className="w-full bg-surface border border-edge rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <p className="text-[11px] text-ink-muted mt-1.5">
                When you'd like to open. We'll work backward to your application deadline.
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {aggregate && (
              <>
                <div className="bg-foreground text-background rounded-xl p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                        Projected wait ({perPermit.length} permit
                        {perPermit.length === 1 ? "" : "s"})
                      </p>
                      <p className="text-xs opacity-80 mt-1">
                        {aggregate.neighborhood.name} · ZIP {aggregate.neighborhood.zips[0]} —
                        critical path: {aggregate.critical.label}
                      </p>

                    </div>
                    <span className="text-[10px] font-mono bg-white/10 px-2 py-1 rounded-sm">
                      {aggregate.confidence}% confidence
                    </span>
                  </div>
                  <div className="font-display text-6xl font-bold tracking-tight leading-none">
                    {aggregate.expected}
                    <span className="text-2xl font-normal opacity-60"> days</span>
                  </div>

                  <div className="mt-8">
                    <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-[15%] right-[15%] bg-brand rounded-full" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-background border-2 border-brand rounded-full"
                        style={{ left: "50%", transform: "translate(-50%, -50%)" }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono mt-2 opacity-70">
                      <span>Min {aggregate.min}d</span>
                      <span>Expected {aggregate.expected}d</span>
                      <span>Max {aggregate.max}d</span>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Earliest
                      </p>
                      <p className="font-display font-bold text-lg mt-1">
                        {formatLaunchWindow(aggregate.min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Realistic
                      </p>
                      <p className="font-display font-bold text-lg mt-1 text-brand">
                        {formatLaunchWindow(aggregate.expected)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Buffer plan for
                      </p>
                      <p className="font-display font-bold text-lg mt-1">
                        {formatLaunchWindow(aggregate.max)}
                      </p>
                    </div>
                  </div>
                </div>

                {perPermit.length > 1 && (
                  <div className="bg-background border border-edge rounded-xl p-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted mb-4">
                      Per-permit breakdown
                    </p>
                    <div className="space-y-3">
                      {perPermit
                        .slice()
                        .sort((a, b) => b.expected - a.expected)
                        .map((e) => {
                          const isCritical = e.key === aggregate.critical.key;
                          const pct = Math.round((e.expected / aggregate.expected) * 100);
                          return (
                            <div key={e.key}>
                              <div className="flex items-baseline justify-between text-xs mb-1">
                                <span
                                  className={
                                    isCritical
                                      ? "font-bold text-brand"
                                      : "font-semibold text-foreground"
                                  }
                                >
                                  {e.label}
                                  {isCritical && (
                                    <span className="ml-2 text-[10px] font-mono uppercase tracking-widest">
                                      critical path
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono text-ink-muted">
                                  {e.min}–{e.max}d
                                </span>
                              </div>
                              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                                <div
                                  className={
                                    isCritical ? "h-full bg-brand" : "h-full bg-foreground/40"
                                  }
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {approvalExpected && approvalEarliest && approvalLatest && (
                  <div className="bg-background border border-edge rounded-xl p-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                      Estimated approval date (all permits in hand)
                    </p>
                    <p className="font-display text-3xl font-bold mt-2 leading-tight">
                      {fmtFullDate(approvalExpected)}
                    </p>
                    <p className="text-xs text-ink-muted mt-2">
                      If you file today. Range: {fmtFullDate(approvalEarliest)} →{" "}
                      {fmtFullDate(approvalLatest)}.
                    </p>
                  </div>
                )}

                {targetLaunch && deadlineRecommended && deadlineLatest && (
                  <div
                    className={
                      deadlinePassed
                        ? "border-2 border-brand bg-brand/5 rounded-xl p-6"
                        : "border-2 border-foreground bg-background rounded-xl p-6"
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand">
                          Deadline to apply
                        </p>
                        <p className="text-xs text-ink-muted mt-1">
                          To open by {fmtFullDate(targetLaunch)}
                        </p>
                      </div>
                      {!deadlinePassed && daysUntilDeadline !== null && (
                        <span className="text-[10px] font-mono bg-foreground text-background px-2 py-1 rounded-sm whitespace-nowrap">
                          {daysUntilDeadline} days left
                        </span>
                      )}
                    </div>
                    <p className="font-display text-3xl font-bold mt-3 leading-tight">
                      File by {fmtFullDate(deadlineRecommended)}
                    </p>
                    <p className="text-xs text-ink-muted mt-2">
                      Latest safe date: {fmtFullDate(deadlineLatest)} (no buffer for delays).
                    </p>
                    {deadlinePassed && (
                      <p className="text-xs font-semibold text-brand mt-3">
                        Heads up — your target launch is sooner than the typical wait for these
                        permits. Consider filing immediately or pushing the launch date.
                      </p>
                    )}
                  </div>
                )}

                <div className="bg-background border border-edge rounded-xl p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                    Primary bottleneck
                  </p>
                  <p className="font-display font-bold text-base mt-2 leading-tight">
                    {aggregate.neighborhood.primaryBottleneck}
                  </p>
                  <p className="text-xs text-ink-muted mt-2">
                    Schedule early submissions around this step to keep your timeline on track.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
