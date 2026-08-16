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
import { appendHistory } from "./history";
import { appendLog } from "./logger";
import type {
  DashboardStats,
  HistoryEntry,
  PullRequestItem,
  ReviewResultPayload,
  ReviewStatus,
} from "./types";

const reviewStatusByPr = new Map<number, { status: ReviewStatus; lastError?: string; commitHash?: string }>();
let cachedPrs: PullRequestItem[] = [];
let lastListRefresh: string | null = null;
let lastReviewAt: string | null = null;
const running = new Set<number>();

function mapPr(pr: BbPullRequest): PullRequestItem {
  const commitHash = pr.source?.commit?.hash ?? "";
  const prev = reviewStatusByPr.get(pr.id);
  return {
    id: pr.id,
    title: pr.title,
    author: pr.author?.display_name || pr.author?.nickname || "Unknown",
    state: pr.state,
    sourceBranch: pr.source?.branch?.name ?? "",
    destinationBranch: pr.destination?.branch?.name ?? "",
    updatedOn: pr.updated_on,
    commitHash,
    reviewStatus: prev?.status ?? "not_reviewed",
    lastError: prev?.lastError,
  };
}

export function getDashboardStats(): DashboardStats {
  return {
    openCount: cachedPrs.length,
    lastListRefresh,
    lastReviewAt,
  };
}

export function getCachedPullRequests(): PullRequestItem[] {
  return cachedPrs;
}

export async function refreshPullRequests(): Promise<PullRequestItem[]> {
  const auth = getAuthContext();
  appendLog("info", `Refreshing open pull requests for ${auth.workspace}/${auth.repository}`);
  const list = await listOpenPullRequests({
    workspace: auth.workspace,
    repository: auth.repository,
    token: auth.token,
  });
  cachedPrs = list.map(mapPr);
  lastListRefresh = new Date().toISOString();
  appendLog("info", `Loaded ${cachedPrs.length} open pull requests`);
  return cachedPrs;
}

function buildPrompt(template: string, pr: PullRequestItem, diff: string): string {
  return `${template.trim()}

---
Pull request #${pr.id}: ${pr.title}
Author: ${pr.author}
Source: ${pr.sourceBranch} -> ${pr.destinationBranch}

Respond with a single JSON object (optionally inside a json code fence) using this shape:
{
  "summary": "markdown summary",
  "findings": [
    { "severity": "high|medium|low|info", "file": "path/to/file", "line": 1, "message": "issue description" }
  ]
}

Diff:
\`\`\`diff
${diff}
\`\`\`
`;
}

export async function reviewPullRequest(prId: number): Promise<ReviewResultPayload> {
  if (running.has(prId)) {
    throw new Error(`Review already running for PR #${prId}`);
  }

  const auth = getAuthContext();
  const pr =
    cachedPrs.find((p) => p.id === prId) ??
    (await refreshPullRequests()).find((p) => p.id === prId);

  if (!pr) {
    throw new Error(`Pull request #${prId} not found in open list`);
  }

  running.add(prId);
  reviewStatusByPr.set(prId, { status: "running", commitHash: pr.commitHash });
  cachedPrs = cachedPrs.map((p) =>
    p.id === prId ? { ...p, reviewStatus: "running", lastError: undefined } : p,
  );

  const started = Date.now();
  try {
    appendLog("info", `Review started for PR #${prId}`);
    const promptTemplate = fs.readFileSync(auth.promptPath, "utf8");
    const diff = await fetchPullRequestDiff(
      { workspace: auth.workspace, repository: auth.repository, token: auth.token },
      prId,
    );

    const prompt = buildPrompt(promptTemplate, pr, diff);
    const rawOutput = await runCopilotReview(prompt);
    const parsed = parseCopilotOutput(rawOutput);

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
  parsed.findings.length
    ? parsed.findings
        .map((f) => `- **${f.severity}** \`${f.file}:${f.line}\` — ${f.message}`)
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
          findings: parsed.findings,
          // raw intentionally omitted from disk JSON to reduce sensitive sprawl; full text is in .md summary section when unparsed
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
      const commentBody = `## AI Code Review\n\n${parsed.summary}\n\n---\n_Generated by Code Review Agent_`;
      await postGeneralComment(
        { workspace: auth.workspace, repository: auth.repository, token: auth.token },
        prId,
        commentBody,
      );
      if (parsed.parsed) {
        for (const finding of parsed.findings) {
          try {
            await postInlineComment(
              { workspace: auth.workspace, repository: auth.repository, token: auth.token },
              prId,
              finding.file,
              finding.line,
              `**${finding.severity}:** ${finding.message}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            appendLog("warn", `Inline comment failed for ${finding.file}:${finding.line}: ${msg}`);
          }
        }
      } else {
        appendLog("warn", `PR #${prId}: JSON parse failed; posted general comment only`);
      }
      posted = true;
      appendLog("info", `Posted review comments to Bitbucket PR #${prId}`);
    } else {
      appendLog("info", `Saved review locally only for PR #${prId}`);
    }

    const durationMs = Date.now() - started;
    lastReviewAt = new Date().toISOString();
    reviewStatusByPr.set(prId, { status: "reviewed", commitHash: pr.commitHash });
    cachedPrs = cachedPrs.map((p) =>
      p.id === prId ? { ...p, reviewStatus: "reviewed", lastError: undefined } : p,
    );

    const historyEntry: HistoryEntry = {
      id: randomUUID(),
      prId,
      prTitle: pr.title,
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
    reviewStatusByPr.set(prId, { status: "failed", lastError: message, commitHash: pr.commitHash });
    cachedPrs = cachedPrs.map((p) =>
      p.id === prId ? { ...p, reviewStatus: "failed", lastError: message } : p,
    );
    appendLog("error", `Review failed for PR #${prId}: ${message}`);
    appendHistory({
      id: randomUUID(),
      prId,
      prTitle: pr.title,
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
