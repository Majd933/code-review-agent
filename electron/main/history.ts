import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { HistoryEntry } from "./types";

function historyPath(): string {
  return path.join(app.getPath("userData"), "history.json");
}

export function getHistory(): HistoryEntry[] {
  const file = historyPath();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...getHistory()].slice(0, 200);
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}
