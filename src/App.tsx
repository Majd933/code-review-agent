import { useEffect } from "react";
import { LayoutDashboard, History, ScrollText, Settings } from "lucide-react";
import { ConnectionBadges } from "@/components/ConnectionBadges";
import { clampAutoRefreshMinutes, maybeAutoReviewNew, refreshPullRequestsAction } from "@/lib/review-actions";
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
  const connecting = useAppStore((s) => s.connecting);
  const setConnecting = useAppStore((s) => s.setConnecting);
  const reviewing = useAppStore((s) => s.reviewing);

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

        setConnecting(true);
        const conn = await window.api.checkConnection();
        if (cancelled) return;
        setConnection(conn);

        let bootNewPrIds: number[] = [];
        if (conn.bitbucket === "connected") {
          try {
            const refreshed = await window.api.refreshPullRequests();
            if (cancelled) return;
            setPrs(refreshed.prs);
            setStats(refreshed.stats);
            bootNewPrIds = refreshed.newPrIds;
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }
        }
        if (!cancelled) setLogs(await window.api.getLogs());
        if (!cancelled) setConnecting(false);
        if (!cancelled) await maybeAutoReviewNew(bootNewPrIds);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setConnecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    hydrateSettings,
    setConnecting,
    setConnection,
    setError,
    setHistory,
    setLogs,
    setPrs,
    setStats,
  ]);

  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    if (!settings.autoRefresh) return;
    if (!settingsComplete(settings) || connection.bitbucket !== "connected") return;
    const minutes = clampAutoRefreshMinutes(settings.autoRefreshMinutes);
    const timer = window.setInterval(() => {
      void (async () => {
        const result = await refreshPullRequestsAction({ background: true });
        if (result) await maybeAutoReviewNew(result.newPrIds);
      })();
    }, minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [
    settings.autoRefresh,
    settings.autoRefreshMinutes,
    settings.bitbucketUrl,
    settings.workspace,
    settings.repository,
    settings.hasToken,
    settings.writeMode,
    connection.bitbucket,
  ]);

  return (
    <div className="app-shell">
      <div className="titlebar" aria-hidden="true" />

      <div className="app-topbar no-drag">
        <div className="flex min-w-0 items-center gap-5">
          <h1 className="app-brand shrink-0">
            Code Review <span>Agent</span>
          </h1>
          <nav className="app-nav" role="tablist" aria-label="Main">
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
                  className={cn("app-nav-item", selected && "is-active")}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <ConnectionBadges
          bitbucket={connection.bitbucket}
          copilot={connection.copilot}
          bitbucketMessage={connection.bitbucketMessage}
          copilotMessage={connection.copilotMessage}
          connecting={connecting}
          reviewing={reviewing}
        />
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-5">
        {error ? (
          <div
            role="alert"
            className="mb-4 shrink-0 rounded-[var(--radius)] border border-rose-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
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
        <div
          className={cn(
            "min-h-0 flex-1",
            tab === "logs" ? "overflow-hidden" : "overflow-auto",
          )}
        >
          {tab === "dashboard" ? <DashboardTab /> : null}
          {tab === "history" ? <HistoryTab /> : null}
          {tab === "logs" ? <LogsTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
        </div>
      </main>
    </div>
  );
}
