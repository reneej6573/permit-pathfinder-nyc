import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestDataDate } from "@/lib/nyc-open-data/dob-permits.functions";

export function SiteNav() {
  const fetchLatest = useServerFn(getLatestDataDate);
  const { data } = useQuery({
    queryKey: ["dob-latest-date"],
    queryFn: () => fetchLatest(),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const label = data?.latest
    ? new Date(data.latest).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "…";
  return (
    <nav className="border-b border-edge bg-background px-6 py-4 flex items-center justify-between sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex items-center gap-8">
        <Link to="/" className="font-display font-bold text-xl tracking-tight flex items-center gap-2">
          <span className="bg-brand text-brand-foreground px-1.5 py-0.5 rounded-sm">NYC</span>
          <span>PERMIT PATH</span>
        </Link>
        <div className="hidden md:flex gap-6 text-sm font-medium text-ink-muted">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-brand underline decoration-2 underline-offset-4" }}
            className="hover:text-foreground transition-colors"
          >
            Explorer
          </Link>
          <Link
            to="/predictor"
            activeProps={{ className: "text-brand underline decoration-2 underline-offset-4" }}
            className="hover:text-foreground transition-colors"
          >
            Timeline Estimator
          </Link>
          <Link
            to="/benchmarks"
            activeProps={{ className: "text-brand underline decoration-2 underline-offset-4" }}
            className="hover:text-foreground transition-colors"
          >
            Borough Benchmarks
          </Link>
          <Link
            to="/neighborhoods"
            activeProps={{ className: "text-brand underline decoration-2 underline-offset-4" }}
            className="hover:text-foreground transition-colors"
          >
            Neighborhood Benchmarks
          </Link>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-ink-muted/70">
        Data updated: {label}
      </div>
    </nav>
  );
}
