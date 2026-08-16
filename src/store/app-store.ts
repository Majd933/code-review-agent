import { create } from "zustand";
import {
  DEFAULT_AUTO_REFRESH_MINUTES,
  type AppSettings,
  type ConnectionState,
  type DashboardStats,
  type HistoryEntry,
  type LogEntry,
  type PullRequestItem,
  type WriteMode,
} from "../../electron/main/types";

interface AppState {
  tab: "dashboard" | "history" | "logs" | "settings";
  settings: AppSettings;
  draft: {
    bitbucketUrl: string;
    workspace: string;
    repository: string;
    token: string;
    promptPath: string;
    resultsDir: string;
    writeMode: WriteMode | "";
  };
  connection: ConnectionState;
  prs: PullRequestItem[];
  stats: DashboardStats;
  history: HistoryEntry[];
  logs: LogEntry[];
  connecting: boolean;
  reviewing: boolean;
  busy: boolean;
  error: string | null;
  setTab: (tab: AppState["tab"]) => void;
  setError: (error: string | null) => void;
  setDraftField: <K extends keyof AppState["draft"]>(key: K, value: AppState["draft"][K]) => void;
  hydrateSettings: (settings: AppSettings) => void;
  applySettings: (settings: AppSettings) => void;
  resetDraftFromSettings: () => void;
  setConnection: (connection: ConnectionState) => void;
  setPrs: (prs: PullRequestItem[]) => void;
  setStats: (stats: DashboardStats) => void;
  setHistory: (history: HistoryEntry[]) => void;
  setLogs: (logs: LogEntry[]) => void;
  setConnecting: (connecting: boolean) => void;
  setReviewing: (reviewing: boolean) => void;
  setBusy: (busy: boolean) => void;
}

const emptySettings: AppSettings = {
  bitbucketUrl: "",
  workspace: "",
  repository: "",
  promptPath: "",
  resultsDir: "",
  writeMode: "",
  hasToken: false,
  autoRefresh: false,
  autoRefreshMinutes: DEFAULT_AUTO_REFRESH_MINUTES,
  autoReviewNew: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  tab: "dashboard",
  settings: emptySettings,
  draft: {
    bitbucketUrl: "",
    workspace: "",
    repository: "",
    token: "",
    promptPath: "",
    resultsDir: "",
    writeMode: "",
  },
  connection: {
    bitbucket: "disconnected",
    copilot: "disconnected",
  },
  prs: [],
  stats: { openCount: 0, lastListRefresh: null, lastReviewAt: null },
  history: [],
  logs: [],
  connecting: false,
  reviewing: false,
  busy: false,
  error: null,
  setTab: (tab) => set({ tab }),
  setError: (error) => set({ error }),
  setDraftField: (key, value) =>
    set((state) => ({ draft: { ...state.draft, [key]: value } })),
  hydrateSettings: (settings) =>
    set({
      settings,
      draft: {
        bitbucketUrl: settings.bitbucketUrl,
        workspace: settings.workspace,
        repository: settings.repository,
        token: "",
        promptPath: settings.promptPath,
        resultsDir: settings.resultsDir,
        writeMode: settings.writeMode,
      },
    }),
  applySettings: (settings) => set({ settings }),
  resetDraftFromSettings: () => {
    const { settings } = get();
    set({
      draft: {
        bitbucketUrl: settings.bitbucketUrl,
        workspace: settings.workspace,
        repository: settings.repository,
        token: "",
        promptPath: settings.promptPath,
        resultsDir: settings.resultsDir,
        writeMode: settings.writeMode,
      },
      error: null,
    });
  },
  setConnection: (connection) => set({ connection }),
  setPrs: (prs) => set({ prs }),
  setStats: (stats) => set({ stats }),
  setHistory: (history) => set({ history }),
  setLogs: (logs) => set({ logs }),
  setConnecting: (connecting) => set({ connecting }),
  setReviewing: (reviewing) => set({ reviewing }),
  setBusy: (busy) => set({ busy }),
}));

export function settingsComplete(settings: AppSettings): boolean {
  return Boolean(
    settings.bitbucketUrl &&
      settings.workspace &&
      settings.repository &&
      settings.promptPath &&
      settings.resultsDir &&
      settings.writeMode &&
      settings.hasToken,
  );
}
