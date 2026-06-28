import { Link } from "@tanstack/react-router";

export function SiteNav() {
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
        Data updated: 14 Oct 2026
      </div>
    </nav>
  );
}
