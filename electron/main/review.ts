import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getAuthContext } from "./settings";
import {
  fetchPullRequestDiff,
  listOpenPullRequests,
  postGeneralComment,
  postInlineComment,
  type BbPullRequest,
} from "./bitbucket";
import { parseCopilotOutput, runCopilotReview } from "./copilot";
import { annotateDiff, resolveFindingLocation } from "./diff-annotate";
import { appendHistory } from "./history";
import { appendLog } from "./logger";
import {
  loadReviewState,
  prStatusKey,
  saveReviewState,
  type PersistedPrStatus,
} from "./review-status";
import type {
  DashboardStats,
  HistoryEntry,
  PullRequestItem,
  ReviewResultPayload,
  ReviewStatus,
} from "./types";

const reviewStatusByPr = new Map<
  string,
  { status: ReviewStatus; lastError?: string; commitHash?: string; updatedAt: string }
>();
let cachedPrs: PullRequestItem[] = [];
let lastListRefresh: string | null = null;
let lastReviewAt: string | null = null;
const running = new Set<number>();
let statusLoaded = false;
let knownPrIdsByRepo: Record<string, number[]> = {};

const MAX_KNOWN_IDS = 500;

function repoPrKey(workspace: string, repository: string): string {
  return `${workspace}/${repository}`;
}

function ensureStatusLoaded(): void {
  if (statusLoaded) return;
  const stored = loadReviewState();
  lastListRefresh = stored.lastListRefresh;
  lastReviewAt = stored.lastReviewAt;
  knownPrIdsByRepo = { ...(stored.knownPrIds ?? {}) };
  for (const [key, value] of Object.entries(stored.byPr)) {
    reviewStatusByPr.set(key, value);
  }
  statusLoaded = true;
}

function persistStatus(): void {
  const byPr: Record<string, PersistedPrStatus> = {};
  for (const [key, value] of reviewStatusByPr) {
    if (value.status !== "reviewed" && value.status !== "failed") continue;
    byPr[key] = {
      status: value.status,
      lastError: value.lastError,
      commitHash: value.commitHash,
      updatedAt: value.updatedAt,
    };
  }
  saveReviewState({ lastListRefresh, lastReviewAt, byPr, knownPrIds: knownPrIdsByRepo });
}

function setPrStatus(
  workspace: string,
  repository: string,
  prId: number,
  update: { status: ReviewStatus; lastError?: string; commitHash?: string },
): void {
  const key = prStatusKey(workspace, repository, prId);
  if (update.status === "not_reviewed") {
    reviewStatusByPr.delete(key);
  } else {
    reviewStatusByPr.set(key, {
      status: update.status,
      lastError: update.lastError,
      commitHash: update.commitHash,
      updatedAt: new Date().toISOString(),
    });
  }
  if (update.status !== "running") persistStatus();
}

function prAuthor(pr: BbPullRequest): string {
  return (
    pr.author?.display_name ||
    pr.author?.nickname ||
    pr.author?.displayName ||
    pr.author?.user?.displayName ||
    pr.author?.user?.display_name ||
    pr.author?.user?.nickname ||
    pr.author?.user?.name ||
    pr.author?.name ||
    "Unknown"
  );
}

function prSourceBranch(pr: BbPullRequest): string {
  return pr.source?.branch?.name || pr.fromRef?.displayId || "";
}

function prDestinationBranch(pr: BbPullRequest): string {
  return pr.destination?.branch?.name || pr.toRef?.displayId || "";
}

function prCommitHash(pr: BbPullRequest): string {
  return pr.source?.commit?.hash || pr.fromRef?.latestCommit || "";
}

function prUpdatedOn(pr: BbPullRequest): string {
  if (pr.updated_on?.trim()) return pr.updated_on;
  if (typeof pr.updatedDate === "number" && Number.isFinite(pr.updatedDate)) {
    return new Date(pr.updatedDate).toISOString();
  }
  if (typeof pr.updatedDate === "string" && pr.updatedDate.trim()) {
    const asNumber = Number(pr.updatedDate);
    if (Number.isFinite(asNumber) && asNumber > 1e11) {
      return new Date(asNumber).toISOString();
    }
    const parsed = new Date(pr.updatedDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function mapPr(pr: BbPullRequest, workspace: string, repository: string): PullRequestItem {
  const commitHash = prCommitHash(pr);
  const key = prStatusKey(workspace, repository, pr.id);
  const prev = reviewStatusByPr.get(key);
  const stale = Boolean(prev?.commitHash && commitHash && prev.commitHash !== commitHash);
  const status: ReviewStatus =
    !prev || stale || prev.status === "running" ? "not_reviewed" : prev.status;
  return {
    id: pr.id,
    title: pr.title,
    author: prAuthor(pr),
    state: pr.state,
    sourceBranch: prSourceBranch(pr),
    destinationBranch: prDestinationBranch(pr),
    updatedOn: prUpdatedOn(pr),
    commitHash,
    reviewStatus: status,
    lastError: stale || status === "not_reviewed" ? undefined : prev?.lastError,
  };
}

export function loadPersistedReviewState(): void {
  ensureStatusLoaded();
}

export function getDashboardStats(): DashboardStats {
  ensureStatusLoaded();
  return {
    openCount: cachedPrs.length,
    lastListRefresh,
    lastReviewAt,
  };
}

export function getCachedPullRequests(): PullRequestItem[] {
  ensureStatusLoaded();
  return cachedPrs;
}

function rememberPrIds(workspace: string, repository: string, ids: number[], forceSeed = false): number[] {
  const key = repoPrKey(workspace, repository);
  const had = Object.prototype.hasOwnProperty.call(knownPrIdsByRepo, key);
  const prev = knownPrIdsByRepo[key] ?? [];
  const prevSet = new Set(prev);
  const newcomers = had && !forceSeed ? ids.filter((id) => !prevSet.has(id)) : [];
  const currentSet = new Set(ids);
  const older = prev.filter((id) => !currentSet.has(id));
  knownPrIdsByRepo[key] = [...ids, ...older].slice(0, MAX_KNOWN_IDS);
  return newcomers;
}

export async function markExistingPullRequestsKnown(): Promise<void> {
  ensureStatusLoaded();
  try {
    const auth = getAuthContext();
    // Never force-seed an empty cache: that marks the repo as "known" with []
    // and the next refresh treats every open PR as new.
    if (cachedPrs.length === 0) {
      await refreshPullRequests();
    }
    rememberPrIds(
      auth.project,
      auth.repository,
      cachedPrs.map((pr) => pr.id),
      true,
    );
    persistStatus();
  } catch {
    /* settings incomplete or refresh failed; a later refresh seeds without forceSeed */
  }
}

export async function refreshPullRequests(): Promise<{ prs: PullRequestItem[]; newPrIds: number[] }> {
  ensureStatusLoaded();
  const auth = getAuthContext();
  appendLog("info", `Refreshing open pull requests for ${auth.project}/${auth.repository}`);
  const list = await listOpenPullRequests({
    bitbucketUrl: auth.bitbucketUrl,
    project: auth.project,
    repository: auth.repository,
    token: auth.token,
  });
  cachedPrs = list.map((pr) => mapPr(pr, auth.project, auth.repository));
  lastListRefresh = new Date().toISOString();
  const newPrIds = rememberPrIds(
    auth.project,
    auth.repository,
    cachedPrs.map((pr) => pr.id),
  );
  persistStatus();
  appendLog("info", `Loaded ${cachedPrs.length} open pull requests`);
  return { prs: cachedPrs, newPrIds };
}

function buildPrompt(template: string, pr: PullRequestItem, diff: string): string {
  return `${template.trim()}

---
Pull request #${pr.id}: ${pr.title}
Author: ${pr.author}
Source: ${pr.sourceBranch} -> ${pr.destinationBranch}

Each changed line is prefixed with L<n>, where <n> is the line number in the NEW file.
Use that L<n> value as "line". Never count lines in this prompt or in the raw patch.

Respond with a single JSON object (optionally inside a json code fence) using this shape:
{
  "summary": "markdown summary",
  "findings": [
    { "severity": "high|medium|low|info", "file": "path/to/file", "line": 12, "message": "issue description" }
  ]
}

Annotated diff:
\`\`\`
${diff}
\`\`\`
`;
}

function formatFindingBullet(finding: {
  severity: string;
  file: string;
  line: number;
  message: string;
  location?: { file: string; line: number } | null;
}): string {
  const where = finding.location
    ? `\`${finding.location.file}:${finding.location.line}\``
    : `\`${finding.file}\`${Number.isFinite(finding.line) && finding.line > 0 ? ` (reported line ${finding.line}, not verified)` : ""}`;
  return `- **${finding.severity}** ${where} — ${finding.message}`;
}

export async function reviewPullRequest(prId: number): Promise<ReviewResultPayload> {
  if (running.has(prId)) {
    throw new Error(`Review already running for PR #${prId}`);
  }

  const auth = getAuthContext();
  ensureStatusLoaded();
  const pr =
    cachedPrs.find((p) => p.id === prId) ??
    (await refreshPullRequests()).prs.find((p) => p.id === prId);

  if (!pr) {
    throw new Error(`Pull request #${prId} not found in open list`);
  }

  running.add(prId);
  setPrStatus(auth.project, auth.repository, prId, {
    status: "running",
    commitHash: pr.commitHash,
  });
  cachedPrs = cachedPrs.map((p) =>
    p.id === prId ? { ...p, reviewStatus: "running", lastError: undefined } : p,
  );

  const started = Date.now();
  try {
    appendLog("info", `Review started for PR #${prId}`);
    const promptTemplate = fs.readFileSync(auth.promptPath, "utf8");
    const diff = await fetchPullRequestDiff(
      { bitbucketUrl: auth.bitbucketUrl, project: auth.project, repository: auth.repository, token: auth.token },
      prId,
    );
    const { annotated, index } = annotateDiff(diff);
    appendLog(
      "info",
      `Annotated diff has ${index.files.size} file(s) with numbered lines`,
    );

    const prompt = buildPrompt(promptTemplate, pr, annotated);
    const rawOutput = await runCopilotReview(prompt);
    const parsed = parseCopilotOutput(rawOutput);
    const findings = parsed.findings.map((finding) => {
      const location = resolveFindingLocation(index, finding.file, finding.line);
      return { ...finding, location };
    });
    const unverifiedFindings = findings.filter((finding) => !finding.location);
    if (unverifiedFindings.length) {
      appendLog(
        "warn",
        `PR #${prId}: ${unverifiedFindings.length} finding(s) have no verified line and will stay in the general comment`,
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(auth.resultsDir, auth.repository);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `PR-${prId}-${stamp}`);
    const mdPath = `${base}.md`;
    const jsonPath = `${base}.json`;

    const md = `# Review for PR #${prId}: ${pr.title}

Reviewed at: ${new Date().toISOString()}

## Summary

${parsed.summary}

## Findings

${
  findings.length
    ? findings
        .map((f) => {
          const loc = f.location
            ? `${f.location.file}:${f.location.line}`
            : `${f.file}${Number.isFinite(f.line) && f.line > 0 ? `:${f.line}` : ""} (general comment only; line not verified)`;
          return `- **${f.severity}** \`${loc}\` — ${f.message}`;
        })
        .join("\n")
    : "_No structured findings parsed._"
}
`;

    fs.writeFileSync(mdPath, md, "utf8");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          prId,
          title: pr.title,
          parsed: parsed.parsed,
          summary: parsed.summary,
          findings: findings.map(({ location, ...finding }) => ({
            ...finding,
            resolvedFile: location?.file,
            resolvedLine: location?.line,
            verifiedLine: Boolean(location),
            inGeneralComment: !location,
          })),
          rawIncludedInMarkdown: !parsed.parsed,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (!parsed.parsed) {
      fs.appendFileSync(mdPath, `\n\n## Raw Copilot Output\n\n\`\`\`\n${parsed.raw}\n\`\`\`\n`, "utf8");
    }

    let posted = false;
    if (auth.writeMode === "bitbucket") {
      const leftover = [...unverifiedFindings];
      if (parsed.parsed) {
        for (const finding of findings) {
          if (!finding.location) continue;
          try {
            await postInlineComment(
              { bitbucketUrl: auth.bitbucketUrl, project: auth.project, repository: auth.repository, token: auth.token },
              prId,
              finding.location.file,
              finding.location.line,
              `**${finding.severity}:** ${finding.message}`,
              finding.location.lineType,
            );
          } catch (err) {
            leftover.push(finding);
            const msg = err instanceof Error ? err.message : String(err);
            appendLog("warn", `Inline comment failed for ${finding.location.file}:${finding.location.line}: ${msg}`);
          }
        }
      } else {
        appendLog("warn", `PR #${prId}: JSON parse failed; posting general comment only`);
      }

      const leftoverBlock = leftover.length
        ? `\n\n### Findings not attached to a line\n\n${leftover.map(formatFindingBullet).join("\n")}`
        : "";
      await postGeneralComment(
        { bitbucketUrl: auth.bitbucketUrl, project: auth.project, repository: auth.repository, token: auth.token },
        prId,
        `## AI Code Review\n\n${parsed.summary}${leftoverBlock}\n\n---\n_Generated by Code Review Agent_`,
      );
      posted = true;
      appendLog("info", `Posted review comments to Bitbucket PR #${prId}`);
    } else {
      appendLog("info", `Saved review locally only for PR #${prId}`);
    }

    const durationMs = Date.now() - started;
    lastReviewAt = new Date().toISOString();
    setPrStatus(auth.project, auth.repository, prId, {
      status: "reviewed",
      commitHash: pr.commitHash,
    });
    cachedPrs = cachedPrs.map((p) =>
      p.id === prId ? { ...p, reviewStatus: "reviewed", lastError: undefined } : p,
    );

    const historyEntry: HistoryEntry = {
      id: randomUUID(),
      prId,
      sourceBranch: pr.sourceBranch,
      destinationBranch: pr.destinationBranch,
      author: pr.author,
      reviewedAt: lastReviewAt,
      durationMs,
      result: "success",
      summary: parsed.summary.slice(0, 280),
      resultPath: mdPath,
      postedToBitbucket: posted,
    };
    appendHistory(historyEntry);

    return {
      prId,
      success: true,
      message: posted ? "Review saved and posted to Bitbucket" : "Review saved locally",
      resultPath: mdPath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setPrStatus(auth.project, auth.repository, prId, {
      status: "failed",
      lastError: message,
      commitHash: pr.commitHash,
    });
    cachedPrs = cachedPrs.map((p) =>
      p.id === prId ? { ...p, reviewStatus: "failed", lastError: message } : p,
    );
    appendLog("error", `Review failed for PR #${prId}: ${message}`);
    appendHistory({
      id: randomUUID(),
      prId,
      sourceBranch: pr.sourceBranch,
      destinationBranch: pr.destinationBranch,
      author: pr.author,
      reviewedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      result: "failed",
      summary: message,
      resultPath: "",
      postedToBitbucket: false,
    });
    return { prId, success: false, message };
  } finally {
    running.delete(prId);
  }
}