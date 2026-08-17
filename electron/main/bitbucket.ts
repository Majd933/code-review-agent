import { formatBitbucketRepoPageUrl } from "./bitbucket-url";
import { DIFF_SIZE_LIMIT_BYTES } from "./types";
import { appendLog } from "./logger";

const IGNORE_PATTERNS = [
  /(^|\/)package-lock\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)composer\.lock$/i,
  /(^|\/)Cargo\.lock$/i,
  /(^|\/)go\.sum$/i,
  /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tar|7z|rar|exe|dll|so|dylib|bin|wasm|mp4|mp3|mov)$/i,
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)node_modules\//i,
  /(^|\/)\.next\//i,
  /(^|\/)coverage\//i,
];

export interface BitbucketAuth {
  bitbucketUrl: string;
  project: string;
  repository: string;
  token: string;
}

export interface BbPullRequest {
  id: number;
  title: string;
  state: string;
  updated_on: string;
  author?: { display_name?: string; nickname?: string };
  source?: { branch?: { name?: string }; commit?: { hash?: string } };
  destination?: { branch?: { name?: string } };
}

function repoBaseUrl(auth: BitbucketAuth): string {
  return formatBitbucketRepoPageUrl(auth.bitbucketUrl, auth.project, auth.repository).replace(/\/+$/, "");
}

function resolveBitbucketUrl(auth: BitbucketAuth, apiPath: string): string {
  if (/^https?:\/\//i.test(apiPath)) return apiPath;
  const base = repoBaseUrl(auth);
  if (!apiPath || apiPath === "/") return base;
  return `${base}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
}

async function bbFetch(
  auth: BitbucketAuth,
  apiPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = resolveBitbucketUrl(auth, apiPath);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${auth.token}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const method = (init.method || "GET").toUpperCase();
  appendLog("info", `Bitbucket ${method} ${url}`);

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    appendLog("error", `Bitbucket ${method} ${url} → ${response.status}`);
    throw new Error(formatBitbucketError(response.status, text || response.statusText));
  }
  return response;
}

function humanScope(scope: string): string {
  if (scope.includes("read:repository")) return "Repositories: Read";
  if (scope.includes("write:repository")) return "Repositories: Write";
  if (scope.includes("read:pullrequest")) return "Pull requests: Read";
  if (scope.includes("write:pullrequest")) return "Pull requests: Write";
  return scope;
}

function formatBitbucketError(status: number, text: string): string {
  try {
    const body = JSON.parse(text) as {
      error?: {
        message?: string;
        detail?: { required?: string[]; granted?: string[] };
      };
    };
    const required = body.error?.detail?.required ?? [];
    const granted = body.error?.detail?.granted ?? [];
    if (status === 403 && required.length) {
      const missing = required.filter((scope) => !granted.includes(scope));
      const names = (missing.length ? missing : required).map(humanScope).join(", ");
      return (
        `Bitbucket token is missing ${names}. Create a new Repository Access Token with ` +
        `Repositories: Read and Pull requests: Read. Add Pull requests: Write only if posting comments. ` +
        `Paste the new token in Settings and save.`
      );
    }
    if (body.error?.message) {
      return `Bitbucket API ${status}: ${body.error.message}`;
    }
  } catch {
    // not JSON; use a redacted snippet
  }
  const safe = text.slice(0, 200).replace(/Bearer\s+\S+/gi, "[REDACTED]");
  return `Bitbucket API ${status}: ${safe || "request failed"}`;
}

export async function checkBitbucketConnection(auth: BitbucketAuth): Promise<void> {
  await bbFetch(auth, "/pull-requests?state=OPEN&pagelen=1");
  await bbFetch(auth, "");
}

export async function listOpenpull-requests(auth: BitbucketAuth): Promise<BbPullRequest[]> {
  const values: BbPullRequest[] = [];
  let nextPath: string | null = "/pull-requests?state=OPEN&pagelen=50";

  while (nextPath) {
    const res = await bbFetch(auth, nextPath);
    const data = (await res.json()) as { values?: BbPullRequest[]; next?: string };
    values.push(...(data.values ?? []));
    nextPath = data.next ?? null;
  }
  return values;
}

function shouldIgnoreFile(filePath: string): boolean {
  return IGNORE_PATTERNS.some((re) => re.test(filePath.replace(/\\/g, "/")));
}

/** Filter unified diff by dropping ignored file sections. */
export function filterDiff(rawDiff: string): string {
  const lines = rawDiff.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/diff --git a\/(.+?) b\/(.+)$/);
      const filePath = match?.[2] ?? match?.[1] ?? "";
      skipping = shouldIgnoreFile(filePath);
      if (!skipping) out.push(line);
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").trim();
}

export async function fetchPullRequestDiff(auth: BitbucketAuth, prId: number): Promise<string> {
  const res = await bbFetch(
    auth,
    `/pull-requests/${prId}/diff`,
    { headers: { Accept: "text/plain" } },
  );
  const raw = await res.text();
  const filtered = filterDiff(raw);
  const size = Buffer.byteLength(filtered, "utf8");
  if (size > DIFF_SIZE_LIMIT_BYTES) {
    const kb = Math.round(size / 1024);
    const limitKb = DIFF_SIZE_LIMIT_BYTES / 1024;
    const msg = `PR #${prId} diff is ${kb}KB (limit ${limitKb}KB). Review rejected.`;
    appendLog("warn", msg);
    throw new Error(msg);
  }
  if (!filtered) {
    throw new Error(`PR #${prId} has no reviewable diff after filtering ignored files`);
  }
  return filtered;
}

export async function postGeneralComment(
  auth: BitbucketAuth,
  prId: number,
  markdown: string,
): Promise<void> {
  await bbFetch(
    auth,
    `/pull-requests/${prId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ content: { raw: markdown } }),
    },
  );
}

export async function postInlineComment(
  auth: BitbucketAuth,
  prId: number,
  filePath: string,
  line: number,
  message: string,
): Promise<void> {
  await bbFetch(
    auth,
    `/pull-requests/${prId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({
        content: { raw: message },
        inline: { path: filePath, to: line },
      }),
    },
  );
}
