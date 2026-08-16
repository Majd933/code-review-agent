import { useEffect } from "react";
import { LayoutDashboard, History, ScrollText, Settings } from "lucide-react";
import { ConnectionBadges } from "@/components/ConnectionBadges";
import { settingsComplete, useAppStore } from "@/store/app-store";
import { DashboardTab } from "@/tabs/DashboardTab";
import { HistoryTab } from "@/tabs/HistoryTab";
import { LogsTab } from "@/tabs/LogsTab";
import { SettingsTab } from "@/tabs/SettingsTab";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "history", label: "History", icon: History },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export default function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const connection = useAppStore((s) => s.connection);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const hydrateSettings = useAppStore((s) => s.hydrateSettings);
  const setConnection = useAppStore((s) => s.setConnection);
  const setPrs = useAppStore((s) => s.setPrs);
  const setStats = useAppStore((s) => s.setStats);
  const setHistory = useAppStore((s) => s.setHistory);
  const setLogs = useAppStore((s) => s.setLogs);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsData, history, logs, prs, stats] = await Promise.all([
          window.api.getSettings(),
          window.api.getHistory(),
          window.api.getLogs(),
          window.api.listPullRequests(),
          window.api.getDashboardStats(),
        ]);
        if (cancelled) return;
        hydrateSettings(settingsData);
        setHistory(history);
        setLogs(logs);
        setPrs(prs);
        setStats(stats);

        setBusy(true);
        const conn = await window.api.checkConnection();
        if (!cancelled) setConnection(conn);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hydrateSettings,
    setBusy,
    setConnection,
    setError,
    setHistory,
    setLogs,
    setPrs,
    setStats,
  ]);

  async function recheck() {
    setBusy(true);
    setError(null);
    try {
      const conn = await window.api.checkConnection();
      setConnection(conn);
      setLogs(await window.api.getLogs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="titlebar">
        <span className="text-lg font-semibold tracking-tight">Code Review Agent</span>
      </div>

      <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-4">
        <nav
          className="inline-flex w-fit gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-[var(--border)]"
          role="tablist"
          aria-label="Main"
        >
          {tabs.map((item) => {
            const selected = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  selected
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--text)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="no-drag flex min-w-0 items-center gap-3">
          {settingsComplete(settings) ? (
            <span className="hidden max-w-[200px] truncate text-xs text-[var(--muted)] lg:inline">
              {settings.workspace}/{settings.repository}
            </span>
          ) : null}
          <ConnectionBadges
            bitbucket={connection.bitbucket}
            copilot={connection.copilot}
            bitbucketMessage={connection.bitbucketMessage}
            copilotMessage={connection.copilotMessage}
            onCheck={recheck}
            checking={busy}
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto px-5 pb-5">
        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-[var(--radius)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-[var(--danger)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words">{error}</span>
              <button
                type="button"
                className="shrink-0 cursor-pointer text-xs font-semibold"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        {tab === "dashboard" ? <DashboardTab /> : null}
        {tab === "history" ? <HistoryTab /> : null}
        {tab === "logs" ? <LogsTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </main>
    </div>
  );
}
