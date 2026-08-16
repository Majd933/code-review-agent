import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings, SettingsInput, WriteMode } from "./types";
import { clearToken, hasStoredToken, loadToken, saveToken } from "./secrets";

interface StoredSettings {
  bitbucketUrl: string;
  workspace: string;
  repository: string;
  promptPath: string;
  resultsDir: string;
  writeMode: WriteMode | "";
}

const EMPTY: StoredSettings = {
  bitbucketUrl: "",
  workspace: "",
  repository: "",
  promptPath: "",
  resultsDir: "",
  writeMode: "",
};

export function parseBitbucketRepoUrl(input: string): {
  bitbucketUrl: string;
  workspace?: string;
  repository?: string;
} {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const origin = `${url.protocol}//${url.host}`;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return {
        bitbucketUrl: origin,
        workspace: parts[0],
        repository: parts[1].replace(/\.git$/i, ""),
      };
    }
    return { bitbucketUrl: origin };
  } catch {
    return { bitbucketUrl: trimmed };
  }
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readStored(): StoredSettings {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { ...EMPTY };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StoredSettings>;
    return {
      bitbucketUrl: raw.bitbucketUrl ?? "",
      workspace: raw.workspace ?? "",
      repository: raw.repository ?? "",
      promptPath: raw.promptPath ?? "",
      resultsDir: raw.resultsDir ?? "",
      writeMode: raw.writeMode === "bitbucket" || raw.writeMode === "local" ? raw.writeMode : "",
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
      settings.workspace.trim() &&
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
  const workspace = (parsed.workspace || input.workspace).trim();
  const repository = (parsed.repository || input.repository).trim();
  const promptPath = input.promptPath.trim();
  const resultsDir = input.resultsDir.trim();
  const writeMode = input.writeMode;
  const token = input.token.trim();

  if (!bitbucketUrl || !workspace || !repository || !promptPath || !resultsDir || !writeMode) {
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

  writeStored({
    bitbucketUrl,
    workspace,
    repository,
    promptPath,
    resultsDir,
    writeMode,
  });

  return getPublicSettings();
}

export function getAuthContext(): {
  workspace: string;
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
    workspace: settings.workspace,
    repository: settings.repository,
    token,
    bitbucketUrl: settings.bitbucketUrl,
    promptPath: settings.promptPath,
    resultsDir: settings.resultsDir,
    writeMode: settings.writeMode as WriteMode,
  };
}
