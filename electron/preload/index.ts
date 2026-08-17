import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  AutomationSettings,
  ConnectionCheckResult,
  DashboardStats,
  HistoryEntry,
  LogEntry,
  PullRequestItem,
  RefreshPullRequestsResult,
  ReviewResultPayload,
  SaveSettingsResult,
  SettingsInput,
} from "../main/types";

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("get_settings"),
  saveSettings: (input: SettingsInput): Promise<SaveSettingsResult> =>
    ipcRenderer.invoke("save_settings", input),
  saveAutomation: (input: AutomationSettings): Promise<AppSettings> =>
    ipcRenderer.invoke("save_automation", input),
  checkConnection: (): Promise<ConnectionCheckResult> => ipcRenderer.invoke("check_connection"),
  listPullRequests: (): Promise<PullRequestItem[]> => ipcRenderer.invoke("list_pull_requests"),
  getDashboardStats: (): Promise<DashboardStats> => ipcRenderer.invoke("get_dashboard_stats"),
  refreshPullRequests: (): Promise<RefreshPullRequestsResult> =>
    ipcRenderer.invoke("refresh_pull_requests"),
  reviewPullRequest: (prId: number): Promise<ReviewResultPayload> =>
    ipcRenderer.invoke("review_pull_request", prId),
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("get_history"),
  openReviewFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke("open_review_file", filePath),
  getLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke("get_logs"),
  clearLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke("clear_logs"),
  pickPromptFile: (): Promise<string | null> => ipcRenderer.invoke("pick_prompt_file"),
  pickResultsDir: (): Promise<string | null> => ipcRenderer.invoke("pick_results_dir"),
};

contextBridge.exposeInMainWorld("api", api);

export type DesktopApi = typeof api;
