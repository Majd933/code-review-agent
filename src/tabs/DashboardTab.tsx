import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import {
  clampAutoRefreshMinutes,
  maybeAutoReviewNew,
  refreshpull-requestsAction,
  reviewPullRequestAction,
  saveAutomationAction,
} from "@/lib/review-actions";
import { settingsComplete, useAppStore } from "@/store/app-store";
import { Clock3, GitPullRequest, RefreshCw } from "lucide-react";
import {
  MAX_AUTO_REFRESH_MINUTES,
  MIN_AUTO_REFRESH_MINUTES,
} from "../../electron/main/types";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    not_reviewed: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
    reviewed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
    running: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
    failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80",
  };
  const label = status.replace("_", " ");
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize tracking-tight ${map[status] ?? map.not_reviewed}`}
    >
      {label}
    </span>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  trailing,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold tracking-tight text-[#111827]">{label}</div>
        <div className="mt-1 text-xs leading-relaxed text-[#6B7280]">{description}</div>
      </div>
      {trailing}
    </div>
  );
}

export function DashboardTab() {
  const settings = useAppStore((s) => s.settings);
  const connection = useAppStore((s) => s.connection);
  const prs = useAppStore((s) => s.prs);
  const stats = useAppStore((s) => s.stats);
  const busy = useAppStore((s) => s.busy);
  const reviewing = useAppStore((s) => s.reviewing);
  const setError = useAppStore((s) => s.setError);
  const [minutesDraft, setMinutesDraft] = useState(String(settings.autoRefreshMinutes));

  useEffect(() => {
    setMinutesDraft(String(settings.autoRefreshMinutes));
  }, [settings.autoRefreshMinutes]);

  const ready =
    settingsComplete(settings) &&
    connection.bitbucket === "connected" &&
    connection.copilot === "connected";

  const actionLocked = busy || reviewing;

  async function refresh() {
    const result = await refreshpull-requestsAction();
    if (result) await maybeAutoReviewNew(result.newPrIds);
  }

  async function updateAutomation(patch: {
    autoRefresh?: boolean;
    autoRefreshMinutes?: number;
    autoReviewNew?: boolean;
  }) {
    try {
      await saveAutomationAction(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function commitMinutes() {
    const minutes = clampAutoRefreshMinutes(Number(minutesDraft));
    setMinutesDraft(String(minutes));
    if (minutes !== settings.autoRefreshMinutes) {
      void updateAutomation({ autoRefreshMinutes: minutes });
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
            <div key={card.label} className="app-panel metric-card flex items-start gap-3 px-4 py-4">
              <div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="relative z-10 min-w-0">
                <div className="text-xs font-medium text-[var(--muted)]">{card.label}</div>
                <div
                  className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums"
                  title={card.value}
                >
                  {card.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="app-panel space-y-3 px-4 py-3.5">
        <ToggleSwitch
          checked={settings.autoRefresh}
          onChange={(next) => void updateAutomation({ autoRefresh: next })}
          label="Auto refresh"
          description="Reload the open PR list on a timer."
          trailing={
            settings.autoRefresh ? (
              <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--muted)]">
                <Input
                  type="number"
                  min={MIN_AUTO_REFRESH_MINUTES}
                  max={MAX_AUTO_REFRESH_MINUTES}
                  step={1}
                  value={minutesDraft}
                  onChange={(event) => setMinutesDraft(event.target.value)}
                  onBlur={commitMinutes}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Auto refresh interval in minutes"
                  className="h-9 min-h-9 w-16 px-2 text-center tabular-nums"
                />
                min
              </label>
            ) : null
          }
        />
        <ToggleSwitch
          checked={settings.autoReviewNew}
          onChange={(next) => void updateAutomation({ autoReviewNew: next })}
          label="Auto-review new PRs"
          description="Review newly opened pull requests as soon as they appear. Existing PRs stay manual."
        />
      </div>

      <div className="app-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Pull requests</h2>
            <p className="text-xs text-[var(--muted)]">
              {bitbucketReady ? `${prs.length} open in the current list` : "Not connected"}
            </p>
          </div>
          <Button onClick={() => void refresh()} disabled={actionLocked || !bitbucketReady} aria-busy={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Author</th>
                <th>Source</th>
                <th>Target</th>
                <th>Updated</th>
                <th>Review</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="!py-14 text-center text-[var(--muted)]">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                prs.map((pr) => (
                  <tr key={pr.id}>
                    <td className="font-mono text-xs font-medium text-[var(--accent)]">#{pr.id}</td>
                    <td className="text-[var(--muted)]">{pr.author}</td>
                    <td className="max-w-[180px] truncate font-mono text-xs text-[var(--text)]" title={pr.sourceBranch}>
                      {pr.sourceBranch || "—"}
                    </td>
                    <td
                      className="max-w-[180px] truncate font-mono text-xs text-[var(--muted)]"
                      title={pr.destinationBranch}
                    >
                      {pr.destinationBranch || "—"}
                    </td>
                    <td className="whitespace-nowrap text-[var(--muted)]">{formatDate(pr.updatedOn)}</td>
                    <td>
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
                    <td className="text-right">
                      <Button
                        variant="primary"
                        disabled={!ready || actionLocked || pr.reviewStatus === "running"}
                        onClick={() => void reviewPullRequestAction(pr.id)}
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
