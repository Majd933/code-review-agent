import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { LogLevel } from "../../electron/main/types";

const LEVELS: Array<"all" | LogLevel> = ["all", "info", "warn", "error"];

const LEVEL_BADGE: Record<LogLevel, string> = {
  info: "bg-blue-50 text-blue-600",
  warn: "bg-amber-50 text-amber-700",
  error: "bg-rose-50 text-rose-600",
};

export function LogsTab() {
  const logs = useAppStore((s) => s.logs);
  const setLogs = useAppStore((s) => s.setLogs);
  const setError = useAppStore((s) => s.setError);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | LogLevel>("all");

  async function clear() {
    try {
      setLogs(await window.api.clearLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (level !== "all" && log.level !== level) return false;
      if (!q) return true;
      return (
        log.message.toLowerCase().includes(q) ||
        log.level.toLowerCase().includes(q) ||
        formatDate(log.timestamp).toLowerCase().includes(q)
      );
    });
  }, [logs, query, level]);

  return (
    <div className="app-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter logs..."
          aria-label="Filter logs"
          className="h-9 min-h-9 max-w-xs flex-1"
        />
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value as "all" | LogLevel)}
          aria-label="Filter by log level"
          className="h-9 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm text-[var(--text)] shadow-[var(--shadow-sm)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        >
          {LEVELS.map((item) => (
            <option key={item} value={item}>
              {item === "all" ? "All levels" : item}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Button onClick={clear} disabled={logs.length === 0}>
            Clear
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-1 font-mono text-[12px] leading-5">
        {logs.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-[var(--muted)]">No log entries.</div>
        ) : filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-[var(--muted)]">No matching logs.</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]/70">
            {filtered.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-6 px-1 py-1 hover:bg-slate-50/80"
              >
                <span className="shrink-0 text-[11px] leading-4 whitespace-nowrap text-[var(--muted)] tabular-nums">
                  {formatDate(log.timestamp)}
                </span>
                <span
                  className={cn(
                    "inline-flex w-11 shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    LEVEL_BADGE[log.level] ?? LEVEL_BADGE.info,
                  )}
                >
                  {log.level}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-4 text-[var(--text)]">
                  {log.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
