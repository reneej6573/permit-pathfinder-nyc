import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import {
  NEIGHBORHOODS,
  PERMIT_TYPES,
  estimateTimeline,
  type PermitType,
} from "@/lib/permit-data";

export const Route = createFileRoute("/predictor")({
  head: () => ({
    meta: [
      { title: "Predictor — NYC Permit Path" },
      {
        name: "description",
        content:
          "Forecast your NYC permit approval timeline. Pick a neighborhood and permit type to see a launch window with confidence range.",
      },
      { property: "og:title", content: "Predictor — NYC Permit Path" },
      {
        property: "og:description",
        content: "Forecast your NYC permit approval timeline with a confidence range.",
      },
    ],
  }),
  component: PredictorPage,
});

function formatLaunchWindow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function PredictorPage() {
  const [slug, setSlug] = useState("bushwick");
  const [permit, setPermit] = useState<PermitType>("Full Liquor License (SLA)");
  const estimate = useMemo(() => estimateTimeline(slug, permit), [slug, permit]);

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <SiteNav />

      <main className="max-w-5xl mx-auto p-6 lg:p-10">
        <header className="mb-10 max-w-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
            Predictive estimator
          </p>
          <h1 className="font-display text-4xl font-light leading-tight mb-4 text-balance">
            Forecast your <span className="font-bold">launch window</span> in two clicks.
          </h1>
          <p className="text-ink-muted leading-relaxed text-pretty">
            Estimates use neighborhood-specific medians from the last 24 months of filings,
            adjusted for the 90-day trend at the responsible community board.
          </p>
        </header>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-2 bg-background border border-edge rounded-xl p-6 space-y-5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 text-ink-muted">
                Neighborhood
              </label>
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full bg-surface border border-edge rounded-md p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {NEIGHBORHOODS.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.name}, {n.borough}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1.5 text-ink-muted">
                Permit Type
              </label>
              <div className="grid grid-cols-1 gap-2">
                {PERMIT_TYPES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPermit(p)}
                    className={
                      permit === p
                        ? "text-left px-3 py-2.5 border-2 border-brand bg-brand/5 rounded-md text-xs font-bold text-brand"
                        : "text-left px-3 py-2.5 border border-edge bg-background hover:border-foreground transition-colors rounded-md text-xs font-semibold text-ink-muted"
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {estimate && (
              <>
                <div className="bg-foreground text-background rounded-xl p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                        Projected wait
                      </p>
                      <p className="text-xs opacity-80 mt-1">
                        {estimate.neighborhood.name} • {estimate.permit}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-white/10 px-2 py-1 rounded-sm">
                      {estimate.confidence}% confidence
                    </span>
                  </div>
                  <div className="font-display text-6xl font-bold tracking-tight leading-none">
                    {estimate.expected}
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
                      <span>Min {estimate.min}d</span>
                      <span>Expected {estimate.expected}d</span>
                      <span>Max {estimate.max}d</span>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Earliest launch
                      </p>
                      <p className="font-display font-bold text-lg mt-1">
                        {formatLaunchWindow(estimate.min)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Realistic launch
                      </p>
                      <p className="font-display font-bold text-lg mt-1 text-brand">
                        {formatLaunchWindow(estimate.expected)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60">
                        Buffer plan for
                      </p>
                      <p className="font-display font-bold text-lg mt-1">
                        {formatLaunchWindow(estimate.max)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-background border border-edge rounded-xl p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                      vs. city average
                    </p>
                    <p
                      className={
                        estimate.deltaPct < 0
                          ? "font-display text-3xl font-bold text-success mt-1"
                          : estimate.deltaPct > 0
                            ? "font-display text-3xl font-bold text-brand mt-1"
                            : "font-display text-3xl font-bold mt-1"
                      }
                    >
                      {estimate.deltaPct > 0 ? "+" : ""}
                      {estimate.deltaPct}%
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      City median for this permit: {estimate.cityAvg} days.
                    </p>
                  </div>
                  <div className="bg-background border border-edge rounded-xl p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
                      Primary bottleneck
                    </p>
                    <p className="font-display font-bold text-base mt-2 leading-tight">
                      {estimate.neighborhood.primaryBottleneck}
                    </p>
                    <p className="text-xs text-ink-muted mt-2">
                      Schedule early submissions around this step to keep your timeline on track.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
