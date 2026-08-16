import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LogEntry, LogLevel } from "./types";

const MAX_LOGS = 500;
let logs: LogEntry[] = [];

function logsPath(): string {
  return path.join(app.getPath("userData"), "logs.json");
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(logsPath()), { recursive: true });
    fs.writeFileSync(logsPath(), JSON.stringify(logs, null, 2), "utf8");
  } catch {
    // ignore persistence failures for logs
  }
}

export function loadLogsFromDisk(): void {
  const file = logsPath();
  if (!fs.existsSync(file)) {
    logs = [];
    return;
  }
  try {
    logs = JSON.parse(fs.readFileSync(file, "utf8")) as LogEntry[];
  } catch {
    logs = [];
  }
}

function redact(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-/=+]+/gi, "Bearer [REDACTED]")
    .replace(/Authorization:\s*[^\s]+/gi, "Authorization: [REDACTED]")
    .replace(/x-token:\s*[^\s]+/gi, "x-token: [REDACTED]");
}

export function appendLog(level: LogLevel, message: string): LogEntry {
  const entry: LogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message: redact(message),
  };
  logs = [entry, ...logs].slice(0, MAX_LOGS);
  persist();
  return entry;
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs = [];
  persist();
}
