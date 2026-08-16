import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatDuration } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { FileText } from "lucide-react";

type ResultFilter = "all" | "success" | "failed";

export function HistoryTab() {
  const history = useAppStore((s) => s.history);
  const setError = useAppStore((s) => s.setError);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((entry) => {
      if (resultFilter !== "all" && entry.result !== resultFilter) return false;
      if (!q) return true;
      const author = (entry.author ?? "").toLowerCase();
      return String(entry.prId).includes(q) || author.includes(q);
    });
  }, [history, query, resultFilter]);

  const successCount = history.filter((entry) => entry.result === "success").length;
  const failedCount = history.length - successCount;

  return (
    <div className="app-panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by PR # or author..."
          aria-label="Filter history by PR number or author"
          className="h-9 min-h-9 max-w-xs flex-1"
        />
        <select
          value={resultFilter}
          onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
          aria-label="Filter by result"
          className="h-9 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm text-[var(--text)] shadow-[var(--shadow-sm)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        >
          <option value="all">All results</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>
            <span className="font-semibold tabular-nums text-[var(--text)]">{history.length}</span>{" "}
            completed runs
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold tabular-nums text-[var(--success)]">{successCount}</span>{" "}
            success
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold tabular-nums text-[var(--danger)]">{failedCount}</span>{" "}
            failed
          </span>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>PR</th>
              <th>Author</th>
              <th>Source</th>
              <th>Target</th>
              <th>Result</th>
              <th>Duration</th>
              <th>Summary</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={9} className="!py-14 text-center text-[var(--muted)]">
                  No reviews yet.
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="!py-14 text-center text-[var(--muted)]">
                  No matching history.
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap text-[var(--muted)]">{formatDate(entry.reviewedAt)}</td>
                  <td className="font-mono text-xs font-medium text-[var(--accent)]">#{entry.prId}</td>
                  <td className="max-w-[160px] truncate text-[var(--muted)]" title={entry.author || "Unknown"}>
                    {entry.author || "Unknown"}
                  </td>
                  <td
                    className="max-w-[160px] truncate font-mono text-xs text-[var(--text)]"
                    title={entry.sourceBranch || "—"}
                  >
                    {entry.sourceBranch || "—"}
                  </td>
                  <td
                    className="max-w-[160px] truncate font-mono text-xs text-[var(--muted)]"
                    title={entry.destinationBranch || "—"}
                  >
                    {entry.destinationBranch || "—"}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
                        entry.result === "success"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                          : "bg-rose-50 text-rose-700 ring-rose-200/80"
                      }`}
                    >
                      {entry.result}
                    </span>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {entry.postedToBitbucket ? "posted" : "local only"}
                    </div>
                  </td>
                  <td className="tabular-nums text-[var(--muted)]">{formatDuration(entry.durationMs)}</td>
                  <td className="max-w-[280px] truncate text-[var(--muted)]" title={entry.summary}>
                    {entry.summary}
                  </td>
                  <td className="text-right">
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
