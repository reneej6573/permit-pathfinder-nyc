import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDataFreshness } from "@/lib/nyc-open-data/freshness.functions";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtAge(iso: string | null, checked: string) {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((new Date(checked).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function DataFreshnessPanel() {
  const fetchFreshness = useServerFn(getDataFreshness);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["data-freshness"],
    queryFn: () => fetchFreshness(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section aria-labelledby="freshness-heading" className="mt-16 border border-edge rounded-sm bg-card">
      <div className="px-5 py-4 border-b border-edge flex items-center justify-between">
        <h2 id="freshness-heading" className="font-display font-bold text-lg tracking-tight">Data freshness</h2>
        <span className="text-[11px] uppercase tracking-widest text-ink-muted">Cache refreshes every 6h</span>
      </div>
      {isLoading && <p className="px-5 py-6 text-sm text-ink-muted">Checking sources…</p>}
      {isError && <p className="px-5 py-6 text-sm text-destructive">Couldn't reach NYC Open Data right now.</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-ink-muted text-left">
              <tr>
                <th className="px-5 py-3 font-bold">Dataset</th>
                <th className="px-5 py-3 font-bold">Latest record</th>
                <th className="px-5 py-3 font-bold">Last successful fetch</th>
                <th className="px-5 py-3 font-bold">Cache age</th>
                <th className="px-5 py-3 font-bold">Source</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id} className="border-t border-edge align-top">
                  <td className="px-5 py-3">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-ink-muted">{s.usedFor} · <span className="font-mono">{s.id}</span></div>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{s.ok ? (s.latestRecord ? fmtDate(s.latestRecord) : "Static reference") : <span className="text-destructive">Fetch failed</span>}</td>
                  <td className="px-5 py-3 whitespace-nowrap" suppressHydrationWarning>{fmtTime(s.fetchedAt)}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{fmtAge(s.fetchedAt, data.checkedAt)}</td>
                  <td className="px-5 py-3 whitespace-nowrap space-x-3">
                    <a href={s.portalUrl} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">Portal</a>
                    <a href={s.apiUrl} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">API</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
