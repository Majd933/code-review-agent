import {
  DEFAULT_AUTO_REFRESH_MINUTES,
  MAX_AUTO_REFRESH_MINUTES,
  MIN_AUTO_REFRESH_MINUTES,
  type AutomationSettings,
} from "../../electron/main/types";
import { settingsComplete, useAppStore } from "@/store/app-store";

let refreshInFlight = false;

export function clampAutoRefreshMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REFRESH_MINUTES;
  return Math.min(MAX_AUTO_REFRESH_MINUTES, Math.max(MIN_AUTO_REFRESH_MINUTES, Math.round(value)));
}

export async function refreshPullRequestsAction(opts?: { background?: boolean }) {
  const store = useAppStore.getState();
  if (!settingsComplete(store.settings) || store.connection.bitbucket !== "connected") {
    if (!opts?.background) {
      store.setError("Bitbucket must be connected. Complete Settings first.");
    }
    return null;
  }
  if (refreshInFlight) return null;
  if (opts?.background && (store.busy || store.reviewing || store.connecting)) return null;

  refreshInFlight = true;
  if (!opts?.background) {
    store.setBusy(true);
    store.setError(null);
  }
  try {
    const result = await window.api.refreshPullRequests();
    store.setPrs(result.prs);
    store.setStats(result.stats);
    store.setLogs(await window.api.getLogs());
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts?.background) store.setError(message);
    try {
      store.setLogs(await window.api.getLogs());
    } catch {
      /* ignore */
    }
    return null;
  } finally {
    refreshInFlight = false;
    if (!opts?.background) store.setBusy(false);
  }
}

export async function reviewPullRequestAction(prId: number) {
  const store = useAppStore.getState();
  if (
    !settingsComplete(store.settings) ||
    store.connection.bitbucket !== "connected" ||
    store.connection.copilot !== "connected"
  ) {
    store.setError("Bitbucket and Copilot must both be connected before review.");
    return;
  }
  store.setReviewing(true);
  store.setError(null);
  store.setPrs(
    store.prs.map((pr) =>
      pr.id === prId ? { ...pr, reviewStatus: "running" as const, lastError: undefined } : pr,
    ),
  );
  try {
    const result = await window.api.reviewPullRequest(prId);
    const [nextPrs, nextStats, nextHistory, nextLogs] = await Promise.all([
      window.api.listPullRequests(),
      window.api.getDashboardStats(),
      window.api.getHistory(),
      window.api.getLogs(),
    ]);
    store.setPrs(nextPrs);
    store.setStats(nextStats);
    store.setHistory(nextHistory);
    store.setLogs(nextLogs);
    if (!result.success) store.setError(result.message);
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    try {
      store.setPrs(await window.api.listPullRequests());
    } catch {
      /* ignore */
    }
  } finally {
    store.setReviewing(false);
  }
}

export async function maybeAutoReviewNew(newPrIds: number[]) {
  const { settings } = useAppStore.getState();
  if (!settings.autoReviewNew || newPrIds.length === 0) return;
  for (const id of newPrIds) {
    const pr = useAppStore.getState().prs.find((item) => item.id === id);
    if (pr?.reviewStatus === "not_reviewed") {
      await reviewPullRequestAction(id);
    }
  }
}

export async function saveAutomationAction(patch: Partial<AutomationSettings>) {
  const { settings } = useAppStore.getState();
  const next: AutomationSettings = {
    autoRefresh: patch.autoRefresh ?? settings.autoRefresh,
    autoRefreshMinutes: clampAutoRefreshMinutes(
      patch.autoRefreshMinutes ?? settings.autoRefreshMinutes,
    ),
    autoReviewNew: patch.autoReviewNew ?? settings.autoReviewNew,
  };
  const saved = await window.api.saveAutomation(next);
  useAppStore.getState().applySettings(saved);
}
