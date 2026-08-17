import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { parseBitbucketRepoUrl } from "./bitbucket-url";
import type { AppSettings, AutomationSettings, SettingsInput, WriteMode } from "./types";
import {
  DEFAULT_AUTO_REFRESH_MINUTES,
  MAX_AUTO_REFRESH_MINUTES,
  MIN_AUTO_REFRESH_MINUTES,
} from "./types";
import { clearToken, hasStoredToken, loadToken, saveToken } from "./secrets";

interface StoredSettings {
  bitbucketUrl: string;
  project: string;
  repository: string;
  promptPath: string;
  resultsDir: string;
  writeMode: WriteMode | "";
  autoRefresh: boolean;
  autoRefreshMinutes: number;
  autoReviewNew: boolean;
}

const EMPTY: StoredSettings = {
  bitbucketUrl: "",
  project: "",
  repository: "",
  promptPath: "",
  resultsDir: "",
  writeMode: "",
  autoRefresh: false,
  autoRefreshMinutes: DEFAULT_AUTO_REFRESH_MINUTES,
  autoReviewNew: false,
};

export function clampAutoRefreshMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_REFRESH_MINUTES;
  return Math.min(MAX_AUTO_REFRESH_MINUTES, Math.max(MIN_AUTO_REFRESH_MINUTES, Math.round(value)));
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readStored(): StoredSettings {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { ...EMPTY };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StoredSettings> & {
      workspace?: string;
    };
    return {
      bitbucketUrl: raw.bitbucketUrl ?? "",
      project: (raw.project || raw.workspace || "").trim(),
      repository: raw.repository ?? "",
      promptPath: raw.promptPath ?? "",
      resultsDir: raw.resultsDir ?? "",
      writeMode: raw.writeMode === "bitbucket" || raw.writeMode === "local" ? raw.writeMode : "",
      autoRefresh: Boolean(raw.autoRefresh),
      autoRefreshMinutes: clampAutoRefreshMinutes(
        typeof raw.autoRefreshMinutes === "number" ? raw.autoRefreshMinutes : DEFAULT_AUTO_REFRESH_MINUTES,
      ),
      autoReviewNew: Boolean(raw.autoReviewNew),
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeStored(settings: StoredSettings): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

export function getPublicSettings(): AppSettings {
  const stored = readStored();
  return {
    ...stored,
    hasToken: hasStoredToken(),
  };
}

export function settingsAreComplete(settings: AppSettings = getPublicSettings()): boolean {
  return Boolean(
    settings.bitbucketUrl.trim() &&
      settings.project.trim() &&
      settings.repository.trim() &&
      settings.promptPath.trim() &&
      settings.resultsDir.trim() &&
      (settings.writeMode === "bitbucket" || settings.writeMode === "local") &&
      settings.hasToken,
  );
}

export function saveSettings(input: SettingsInput): AppSettings {
  const parsed = parseBitbucketRepoUrl(input.bitbucketUrl);
  const bitbucketUrl = parsed.bitbucketUrl;
  const project = (input.project || parsed.project || "").trim();
  const repository = (input.repository || parsed.repository || "").trim();
  const promptPath = input.promptPath.trim();
  const resultsDir = input.resultsDir.trim();
  const writeMode = input.writeMode;
  const token = input.token.trim();

  if (!bitbucketUrl || !project || !repository || !promptPath || !resultsDir || !writeMode) {
    throw new Error("All settings fields are required");
  }
  if (writeMode !== "bitbucket" && writeMode !== "local") {
    throw new Error("Write mode must be selected");
  }
  if (!token && !hasStoredToken()) {
    throw new Error("Repository Access Token is required");
  }
  if (!fs.existsSync(promptPath) || !fs.statSync(promptPath).isFile()) {
    throw new Error("Prompt file path is invalid");
  }
  if (!fs.existsSync(resultsDir) || !fs.statSync(resultsDir).isDirectory()) {
    throw new Error("Results directory path is invalid");
  }

  if (token) {
    saveToken(token);
  }

  const prev = readStored();
  writeStored({
    bitbucketUrl,
    project,
    repository,
    promptPath,
    resultsDir,
    writeMode,
    autoRefresh: prev.autoRefresh,
    autoRefreshMinutes: prev.autoRefreshMinutes,
    autoReviewNew: prev.autoReviewNew,
  });

  return getPublicSettings();
}

export function saveAutomation(input: AutomationSettings): AppSettings {
  const stored = readStored();
  writeStored({
    ...stored,
    autoRefresh: Boolean(input.autoRefresh),
    autoRefreshMinutes: clampAutoRefreshMinutes(input.autoRefreshMinutes),
    autoReviewNew: Boolean(input.autoReviewNew),
  });
  return getPublicSettings();
}

export function getAuthContext(): {
  project: string;
  repository: string;
  token: string;
  bitbucketUrl: string;
  promptPath: string;
  resultsDir: string;
  writeMode: WriteMode;
} {
  const settings = getPublicSettings();
  if (!settingsAreComplete(settings)) {
    throw new Error("Settings are incomplete. Save all required settings first.");
  }
  const token = loadToken();
  if (!token) {
    clearToken();
    throw new Error("Stored token is missing. Re-enter the Repository Access Token.");
  }
  return {
    project: settings.project,
    repository: settings.repository,
    token,
    bitbucketUrl: settings.bitbucketUrl,
    promptPath: settings.promptPath,
    resultsDir: settings.resultsDir,
    writeMode: settings.writeMode as WriteMode,
  };
}
