export type WriteMode = "bitbucket" | "local";

export type ConnectionStatus = "checking" | "connected" | "disconnected";

export type ReviewStatus = "not_reviewed" | "reviewed" | "running" | "failed";

export interface AppSettings {
  bitbucketUrl: string;
  workspace: string;
  repository: string;
  promptPath: string;
  resultsDir: string;
  writeMode: WriteMode | "";
  hasToken: boolean;
}

export interface SettingsInput {
  bitbucketUrl: string;
  workspace: string;
  repository: string;
  token: string;
  promptPath: string;
  resultsDir: string;
  writeMode: WriteMode;
}

export interface ConnectionState {
  bitbucket: ConnectionStatus;
  copilot: ConnectionStatus;
  bitbucketMessage?: string;
  copilotMessage?: string;
}

export interface PullRequestItem {
  id: number;
  title: string;
  author: string;
  state: string;
  sourceBranch: string;
  destinationBranch: string;
  updatedOn: string;
  commitHash: string;
  reviewStatus: ReviewStatus;
  lastError?: string;
}

export interface DashboardStats {
  openCount: number;
  lastListRefresh: string | null;
  lastReviewAt: string | null;
}

export interface HistoryEntry {
  id: string;
  prId: number;
  prTitle: string;
  reviewedAt: string;
  durationMs: number;
  result: "success" | "failed";
  summary: string;
  resultPath: string;
  postedToBitbucket: boolean;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ReviewResultPayload {
  prId: number;
  success: boolean;
  message: string;
  resultPath?: string;
}

export const DIFF_SIZE_LIMIT_BYTES = 200 * 1024;
export const COPILOT_TIMEOUT_MS = 5 * 60 * 1000;
