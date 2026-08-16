import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { checkBitbucketConnection } from "./bitbucket";
import { checkCopilotConnection } from "./copilot";
import { getHistory } from "./history";
import { appendLog, clearLogs, getLogs, loadLogsFromDisk } from "./logger";
import {
  getAuthContext,
  getPublicSettings,
  saveAutomation,
  saveSettings,
  settingsAreComplete,
} from "./settings";
import {
  getCachedPullRequests,
  getDashboardStats,
  loadPersistedReviewState,
  markExistingPullRequestsKnown,
  refreshPullRequests,
  reviewPullRequest,
} from "./review";
import type { AutomationSettings, ConnectionState, SettingsInput } from "./types";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: "Code Review Agent",
    backgroundColor: "#f4f6f9",
    autoHideMenuBar: true,
    show: true,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  };

  if (process.platform === "win32") {
    windowOptions.titleBarOverlay = {
      color: "#f4f6f9",
      symbolColor: "#0f172a",
      height: 40,
    };
  }

  mainWindow = new BrowserWindow(windowOptions);

  const showWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once("ready-to-show", showWindow);
  mainWindow.webContents.once("did-finish-load", showWindow);
  mainWindow.webContents.once("did-fail-load", (_event, _code, desc) => {
    appendLog("error", `Window failed to load: ${desc}`);
    showWindow();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("http://localhost:5173") ||
      url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function runConnectionCheck(): Promise<ConnectionState> {
  const state: ConnectionState = {
    bitbucket: "checking",
    copilot: "checking",
  };

  if (!settingsAreComplete()) {
    state.bitbucket = "disconnected";
    state.bitbucketMessage = "Complete and save settings first";
  } else {
    try {
      const auth = getAuthContext();
      await checkBitbucketConnection({
        workspace: auth.workspace,
        repository: auth.repository,
        token: auth.token,
      });
      state.bitbucket = "connected";
      state.bitbucketMessage = "Connected";
      appendLog("info", "Bitbucket connection OK");
    } catch (err) {
      state.bitbucket = "disconnected";
      state.bitbucketMessage = err instanceof Error ? err.message : String(err);
      appendLog("error", `Bitbucket connection failed: ${state.bitbucketMessage}`);
    }
  }

  try {
    await checkCopilotConnection();
    state.copilot = "connected";
    state.copilotMessage = "Connected";
    appendLog("info", "Copilot CLI connection OK");
  } catch (err) {
    state.copilot = "disconnected";
    state.copilotMessage = err instanceof Error ? err.message : String(err);
    appendLog("error", `Copilot connection failed: ${state.copilotMessage}`);
  }

  return state;
}

function registerIpc(): void {
  ipcMain.handle("get_settings", () => getPublicSettings());

  ipcMain.handle("save_settings", async (_evt, input: SettingsInput) => {
    const saved = saveSettings(input);
    appendLog("info", "Settings saved");
    const connection = await runConnectionCheck();
    return { settings: saved, connection };
  });

  ipcMain.handle("save_automation", (_evt, input: AutomationSettings) => {
    const prev = getPublicSettings();
    const saved = saveAutomation(input);
    if (saved.autoReviewNew && !prev.autoReviewNew) {
      markExistingPullRequestsKnown();
    }
    appendLog(
      "info",
      `Automation updated: auto refresh ${saved.autoRefresh ? `every ${saved.autoRefreshMinutes} min` : "off"}, auto-review new PRs ${saved.autoReviewNew ? "on" : "off"}`,
    );
    return saved;
  });

  ipcMain.handle("check_connection", async () => runConnectionCheck());

  ipcMain.handle("list_pull_requests", () => getCachedPullRequests());
  ipcMain.handle("get_dashboard_stats", () => getDashboardStats());

  ipcMain.handle("refresh_pull_requests", async () => {
    if (!settingsAreComplete()) {
      throw new Error("Settings are incomplete");
    }
    const { prs, newPrIds } = await refreshPullRequests();
    return { prs, stats: getDashboardStats(), newPrIds };
  });

  ipcMain.handle("review_pull_request", async (_evt, prId: number) => {
    return reviewPullRequest(prId);
  });

  ipcMain.handle("get_history", () => getHistory());

  ipcMain.handle("open_review_file", async (_evt, filePath: string) => {
    if (!filePath) throw new Error("No file path");
    const err = await shell.openPath(filePath);
    if (err) throw new Error(err);
  });

  ipcMain.handle("get_logs", () => getLogs());
  ipcMain.handle("clear_logs", () => {
    clearLogs();
    appendLog("info", "Logs cleared");
    return getLogs();
  });

  ipcMain.handle("pick_prompt_file", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Select prompt file",
      properties: ["openFile"],
      filters: [{ name: "Prompt", extensions: ["md", "txt", "prompt"] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("pick_results_dir", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Select results directory",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadLogsFromDisk();
  loadPersistedReviewState();
  registerIpc();
  createWindow();
  appendLog("info", "Application started");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
