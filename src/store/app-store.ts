import { create } from "zustand";
import type {
  AppSettings,
  ConnectionState,
  DashboardStats,
  HistoryEntry,
  LogEntry,
  PullRequestItem,
  WriteMode,
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
  busy: boolean;
  error: string | null;
  setTab: (tab: AppState["tab"]) => void;
  setError: (error: string | null) => void;
  setDraftField: <K extends keyof AppState["draft"]>(key: K, value: AppState["draft"][K]) => void;
  hydrateSettings: (settings: AppSettings) => void;
  resetDraftFromSettings: () => void;
  setConnection: (connection: ConnectionState) => void;
  setPrs: (prs: PullRequestItem[]) => void;
  setStats: (stats: DashboardStats) => void;
  setHistory: (history: HistoryEntry[]) => void;
  setLogs: (logs: LogEntry[]) => void;
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
