import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { ReviewStatus } from "./types";

export interface PersistedPrStatus {
  status: Exclude<ReviewStatus, "not_reviewed" | "running">;
  lastError?: string;
  commitHash?: string;
  updatedAt: string;
}

interface StoredReviewState {
  lastListRefresh: string | null;
  lastReviewAt: string | null;
  byPr: Record<string, PersistedPrStatus>;
}

const EMPTY: StoredReviewState = {
  lastListRefresh: null,
  lastReviewAt: null,
  byPr: {},
};

const MAX_ENTRIES = 500;

function statePath(): string {
  return path.join(app.getPath("userData"), "review-status.json");
}

export function prStatusKey(workspace: string, repository: string, prId: number): string {
  return `${workspace}/${repository}#${prId}`;
}

export function loadReviewState(): StoredReviewState {
  const file = statePath();
  if (!fs.existsSync(file)) return { ...EMPTY, byPr: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StoredReviewState>;
    const byPr: Record<string, PersistedPrStatus> = {};
    for (const [key, value] of Object.entries(raw.byPr ?? {})) {
      if (value?.status === "reviewed" || value?.status === "failed") {
        byPr[key] = {
          status: value.status,
          lastError: value.lastError,
          commitHash: value.commitHash,
          updatedAt: value.updatedAt ?? new Date().toISOString(),
        };
      }
    }
    return {
      lastListRefresh: raw.lastListRefresh ?? null,
      lastReviewAt: raw.lastReviewAt ?? null,
      byPr,
    };
  } catch {
    return { ...EMPTY, byPr: {} };
  }
}

export function saveReviewState(state: StoredReviewState): void {
  const entries = Object.entries(state.byPr)
    .filter(([, value]) => value.status === "reviewed" || value.status === "failed")
    .sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1))
    .slice(0, MAX_ENTRIES);
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(
    statePath(),
    JSON.stringify(
      {
        lastListRefresh: state.lastListRefresh,
        lastReviewAt: state.lastReviewAt,
        byPr: Object.fromEntries(entries),
      } satisfies StoredReviewState,
      null,
      2,
    ),
    "utf8",
  );
}
