import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function LogsTab() {
  const logs = useAppStore((s) => s.logs);
  const setLogs = useAppStore((s) => s.setLogs);
  const setError = useAppStore((s) => s.setError);

  async function clear() {
    try {
      setLogs(await window.api.clearLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const tone: Record<string, string> = {
    info: "bg-blue-50 text-blue-700",
    warn: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="app-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Application logs</h2>
          <p className="text-xs text-[var(--muted)]">Local only. Secrets and diffs are redacted.</p>
        </div>
        <Button onClick={clear} disabled={logs.length === 0}>
          Clear
        </Button>
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-auto px-3 pb-3">
        {logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted)]">No log entries.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--muted)]">{formatDate(log.timestamp)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone[log.level] ?? tone.info}`}
                >
                  {log.level}
                </span>
              </div>
              <div className="mt-1.5 font-mono text-xs whitespace-pre-wrap break-words text-[var(--text)]">
                {log.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
