import { Button } from "@/components/ui/button";
import { formatDate, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { FileText } from "lucide-react";

export function HistoryTab() {
  const history = useAppStore((s) => s.history);
  const setError = useAppStore((s) => s.setError);

  async function openFile(path: string) {
    if (!path) {
      setError("No result file for this entry");
      return;
    }
    try {
      await window.api.openReviewFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app-panel overflow-hidden">
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Review history</h2>
        <p className="text-xs text-[var(--muted)]">{history.length} completed runs</p>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <tr className="border-y border-[var(--border)]">
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">PR</th>
              <th className="px-4 py-2.5">Result</th>
              <th className="px-4 py-2.5">Duration</th>
              <th className="px-4 py-2.5">Summary</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[var(--muted)]">
                  No reviews yet.
                </td>
              </tr>
            ) : (
              history.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[var(--border)]/70 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
                    {formatDate(entry.reviewedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-[var(--accent)]">#{entry.prId}</div>
                    <div className="max-w-[220px] truncate text-xs text-[var(--muted)]" title={entry.prTitle}>
                      {entry.prTitle}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        entry.result === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {entry.result}
                    </span>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {entry.postedToBitbucket ? "posted" : "local only"}
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatDuration(entry.durationMs)}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-[var(--muted)]" title={entry.summary}>
                    {entry.summary}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      disabled={!entry.resultPath}
                      onClick={() => openFile(entry.resultPath)}
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Open file
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
