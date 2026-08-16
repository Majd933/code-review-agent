import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { settingsComplete, useAppStore } from "@/store/app-store";
import { Clock3, GitPullRequest, RefreshCw } from "lucide-react";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    not_reviewed: "bg-slate-100 text-slate-600",
    reviewed: "bg-emerald-50 text-emerald-700",
    running: "bg-amber-50 text-amber-700",
    failed: "bg-rose-50 text-rose-700",
  };
  const label = status.replace("_", " ");
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? map.not_reviewed}`}
    >
      {label}
    </span>
  );
}

export function DashboardTab() {
  const settings = useAppStore((s) => s.settings);
  const connection = useAppStore((s) => s.connection);
  const prs = useAppStore((s) => s.prs);
  const stats = useAppStore((s) => s.stats);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const setPrs = useAppStore((s) => s.setPrs);
  const setStats = useAppStore((s) => s.setStats);
  const setError = useAppStore((s) => s.setError);
  const setLogs = useAppStore((s) => s.setLogs);

  const ready =
    settingsComplete(settings) &&
    connection.bitbucket === "connected" &&
    connection.copilot === "connected";

  async function refresh() {
    if (!settingsComplete(settings) || connection.bitbucket !== "connected") {
      setError("Bitbucket must be connected. Complete Settings first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.api.refreshPullRequests();
      setPrs(result.prs);
      setStats(result.stats);
      setLogs(await window.api.getLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function review(prId: number) {
    if (!ready) {
      setError("Bitbucket and Copilot must both be connected before review.");
      return;
    }
    setBusy(true);
    setError(null);
    setPrs(prs.map((p) => (p.id === prId ? { ...p, reviewStatus: "running", lastError: undefined } : p)));
    try {
      const result = await window.api.reviewPullRequest(prId);
      const [nextPrs, nextStats, nextHistory, nextLogs] = await Promise.all([
        window.api.listPullRequests(),
        window.api.getDashboardStats(),
        window.api.getHistory(),
        window.api.getLogs(),
      ]);
      setPrs(nextPrs);
      setStats(nextStats);
      useAppStore.getState().setHistory(nextHistory);
      setLogs(nextLogs);
      if (!result.success) setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      const nextPrs = await window.api.listPullRequests();
      setPrs(nextPrs);
    } finally {
      setBusy(false);
    }
  }

  const bitbucketReady = settingsComplete(settings) && connection.bitbucket === "connected";

  const cards = [
    { label: "Open pull requests", value: String(prs.length), icon: GitPullRequest },
    { label: "Last list refresh", value: formatDate(stats.lastListRefresh), icon: RefreshCw },
    { label: "Last review", value: formatDate(stats.lastReviewAt), icon: Clock3 },
  ];

  const emptyMessage = bitbucketReady
    ? "No pull requests loaded. Click Refresh."
    : "No pull requests. Connect Bitbucket in Settings, then Refresh.";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="app-panel flex items-start gap-3 px-4 py-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--muted)]">{card.label}</div>
                <div className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums" title={card.value}>
                  {card.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="app-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Pull requests</h2>
            <p className="text-xs text-[var(--muted)]">
              {bitbucketReady ? `${prs.length} open in the current list` : "Not connected"}
            </p>
          </div>
          <Button
            onClick={refresh}
            disabled={busy || !bitbucketReady}
            aria-busy={busy}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-y border-[var(--border)]">
                <th className="px-4 py-2.5">ID</th>
                <th className="px-4 py-2.5">Title</th>
                <th className="px-4 py-2.5">Author</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Updated</th>
                <th className="px-4 py-2.5">Review</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[var(--muted)]">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                prs.map((pr) => (
                  <tr key={pr.id} className="border-b border-[var(--border)]/70 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--accent)]">#{pr.id}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 font-medium" title={pr.title}>
                      {pr.title}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{pr.author}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
                      {pr.sourceBranch} → {pr.destinationBranch}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                      {formatDate(pr.updatedOn)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={pr.reviewStatus} />
                      {pr.lastError ? (
                        <div
                          className="mt-1 max-w-[180px] truncate text-xs text-[var(--danger)]"
                          title={pr.lastError}
                        >
                          {pr.lastError}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="primary"
                        disabled={!ready || busy || pr.reviewStatus === "running"}
                        onClick={() => review(pr.id)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
