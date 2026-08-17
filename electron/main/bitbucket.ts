import { bitbucketOrigin, formatBitbucketRestApiBaseUrl } from "./bitbucket-url";
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
  updated_on?: string;
  updatedDate?: number | string;
  author?: {
    display_name?: string;
    displayName?: string;
    nickname?: string;
    name?: string;
    user?: {
      displayName?: string;
      display_name?: string;
      nickname?: string;
      name?: string;
    };
  };
  source?: { branch?: { name?: string }; commit?: { hash?: string } };
  destination?: { branch?: { name?: string } };
  fromRef?: { displayId?: string; latestCommit?: string };
  toRef?: { displayId?: string };
}

function repoApiBaseUrl(auth: BitbucketAuth): string {
  return formatBitbucketRestApiBaseUrl(auth.bitbucketUrl, auth.project, auth.repository).replace(/\/+$/, "");
}

function resolveBitbucketUrl(auth: BitbucketAuth, apiPath: string): string {
  if (/^https?:\/\//i.test(apiPath)) return apiPath;
  const origin = (bitbucketOrigin(auth.bitbucketUrl) || "https://bitbucket.org").replace(/\/+$/, "");
  if (apiPath.startsWith("/rest/")) return `${origin}${apiPath}`;
  const base = repoApiBaseUrl(auth);
  if (!apiPath || apiPath === "/") return base;
  return `${base}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
}

function looksLikeHtmlPage(contentType: string | null, body: string): boolean {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("text/html")) return true;
  const head = body.slice(0, 512).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
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
  const contentType = response.headers.get("content-type");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    appendLog("error", `Bitbucket ${method} ${url} → ${response.status}`);
    throw new Error(formatBitbucketError(response.status, text || response.statusText, method, url));
  }
  if (looksLikeHtmlPage(contentType, "")) {
    appendLog("error", `Bitbucket ${method} ${url} → HTML login page`);
    throw new Error(
      "Bitbucket returned an HTML login page instead of API data. Check the REST URL in Logs.",
    );
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

function parseBitbucketErrorBody(text: string): {
  message: string;
  required: string[];
  granted: string[];
} {
  try {
    const body = JSON.parse(text) as {
      error?: {
        message?: string;
        detail?: { required?: string[]; granted?: string[] };
      };
      errors?: Array<{ message?: string }>;
      message?: string;
    };
    const message = (
      body.error?.message ||
      body.errors?.find((item) => item.message)?.message ||
      body.message ||
      ""
    ).trim();
    return {
      message,
      required: body.error?.detail?.required ?? [],
      granted: body.error?.detail?.granted ?? [],
    };
  } catch {
    return { message: "", required: [], granted: [] };
  }
}

function isCommentWrite(method: string, url: string): boolean {
  return method === "POST" && /\/pull-requests\/\d+\/comments(?:\?|$)/i.test(url);
}

function looksLikePermissionIssue(message: string): boolean {
  return /permission|not permitted|not allowed|read-?only|forbidden|unauthorized|insufficient|scope|access denied/i.test(
    message,
  );
}

function commentWriteHint(): string {
  return (
    "This token can read the pull request but cannot post comments. " +
    "In Settings, set Write mode to Local, or create a token with Pull requests: Write and paste it in Settings."
  );
}

function formatBitbucketError(status: number, text: string, method: string, url: string): string {
  const parsed = parseBitbucketErrorBody(text);
  const writingComments = isCommentWrite(method, url);
  const serverNote = parsed.message && !looksLikeHtmlPage("application/json", parsed.message)
    ? ` Bitbucket said: ${parsed.message.replace(/Bearer\s+\S+/gi, "[REDACTED]")}`
    : "";

  if (status === 403 && parsed.required.length) {
    const missing = parsed.required.filter((scope) => !parsed.granted.includes(scope));
    const names = (missing.length ? missing : parsed.required).map(humanScope).join(", ");
    const extra = writingComments ? ` ${commentWriteHint()}` : "";
    return (
      `Bitbucket denied access (HTTP 403): the token is missing ${names}. ` +
      `Create a new Repository Access Token with Repositories: Read and Pull requests: Read. ` +
      `Add Pull requests: Write only if posting comments. Paste the new token in Settings and save.` +
      extra
    );
  }

  if (writingComments && (status === 400 || status === 403)) {
    return `Could not post a comment on the pull request (HTTP ${status}). ${commentWriteHint()}${serverNote}`;
  }

  switch (status) {
    case 400:
      return (
        `Bitbucket rejected the request (HTTP 400). The REST URL or request body is invalid. ` +
        `Check the URL in Logs, and confirm project and repository in Settings.` +
        serverNote
      );
    case 401:
      return (
        `Bitbucket did not accept the token (HTTP 401). The token is missing, expired, or invalid. ` +
        `Paste a valid Repository Access Token in Settings and save.` +
        serverNote
      );
    case 403:
      if (looksLikePermissionIssue(parsed.message) || !parsed.message) {
        return (
          `Bitbucket denied access (HTTP 403). The token does not have permission for this action. ` +
          `Listing PRs needs Pull requests: Read. Fetching a diff needs Repositories: Read. ` +
          `Posting comments needs Pull requests: Write.` +
          serverNote
        );
      }
      return `Bitbucket denied access (HTTP 403).${serverNote}`;
    case 404:
      return (
        `Bitbucket could not find this resource (HTTP 404). ` +
        `Check Bitbucket URL, project, and repository in Settings. The REST URL is in Logs.` +
        serverNote
      );
    case 405:
      return (
        `Bitbucket does not allow this HTTP method (HTTP 405). Check the REST URL in Logs.` +
        serverNote
      );
    case 409:
      return (
        `Bitbucket reported a conflict (HTTP 409). The pull request may have changed. Refresh and try again.` +
        serverNote
      );
    case 429:
      return `Bitbucket rate-limited the request (HTTP 429). Wait a minute and try again.${serverNote}`;
    case 500:
    case 502:
    case 503:
    case 504:
      return `Bitbucket server error (HTTP ${status}). Try again later.${serverNote}`;
    default:
      break;
  }

  const fallback = text.slice(0, 160).replace(/Bearer\s+\S+/gi, "[REDACTED]").replace(/\s+/g, " ").trim();
  const extra = serverNote || (fallback && !looksLikeHtmlPage(null, fallback) ? ` Details: ${fallback}` : "");
  return `Bitbucket request failed (HTTP ${status}).${extra}`;
}

export async function checkBitbucketConnection(auth: BitbucketAuth): Promise<void> {
  await bbFetch(auth, "/pull-requests?state=OPEN&pagelen=1");
  await bbFetch(auth, "");
}

export async function listOpenPullRequests(auth: BitbucketAuth): Promise<BbPullRequest[]> {
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
  if (looksLikeHtmlPage(res.headers.get("content-type"), raw)) {
    throw new Error("Bitbucket returned an HTML login page instead of a PR diff. Check the REST URL in Logs.");
  }
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
      body: JSON.stringify({ text: markdown }),
    },
  );
}

export async function postInlineComment(
  auth: BitbucketAuth,
  prId: number,
  filePath: string,
  line: number,
  message: string,
  lineType: "ADDED" | "CONTEXT" = "ADDED",
): Promise<void> {
  const types: Array<"ADDED" | "CONTEXT"> =
    lineType === "ADDED" ? ["ADDED", "CONTEXT"] : ["CONTEXT", "ADDED"];
  let lastError: unknown;
  for (const type of types) {
    try {
      await bbFetch(
        auth,
        `/pull-requests/${prId}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            text: message,
            anchor: {
              path: filePath,
              line: Math.max(1, Math.floor(line)),
              lineType: type,
              fileType: "TO",
            },
          }),
        },
      );
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
