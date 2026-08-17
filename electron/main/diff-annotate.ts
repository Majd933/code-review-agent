export type DiffLineKind = "ADDED" | "CONTEXT";

export interface DiffLineIndex {
  files: Map<string, Map<number, DiffLineKind>>;
}

const SNAP_DISTANCE = 2;
const HUNK_RE = /^@{2,3}\s+(?:-\d+(?:,\d+)?\s+)*\+(\d+)(?:,\d+)?/;

export function normalizeDiffPath(filePath: string): string {
  return filePath
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\t.*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^[ab]\//, "")
    .replace(/:\d+$/, "");
}

function recordLine(
  files: Map<string, Map<number, DiffLineKind>>,
  filePath: string,
  line: number,
  kind: DiffLineKind,
): void {
  if (!filePath || line < 1) return;
  let lines = files.get(filePath);
  if (!lines) {
    lines = new Map();
    files.set(filePath, lines);
  }
  const prev = lines.get(line);
  if (prev === "ADDED") return;
  lines.set(line, kind);
}

function matchIndexedFile(files: Map<string, Map<number, DiffLineKind>>, filePath: string): string | null {
  const want = normalizeDiffPath(filePath);
  if (!want) return null;
  if (files.has(want)) return want;
  const keys = [...files.keys()];
  if (keys.length === 1) return keys[0];
  const ignoreCase = keys.find((key) => key.toLowerCase() === want.toLowerCase());
  if (ignoreCase) return ignoreCase;
  const suffixHits = keys.filter(
    (key) => key.endsWith(`/${want}`) || want.endsWith(`/${key}`) || key.toLowerCase().endsWith(`/${want.toLowerCase()}`),
  );
  if (suffixHits.length === 1) return suffixHits[0];
  const base = want.split("/").pop()?.toLowerCase();
  if (base) {
    const baseHits = keys.filter((key) => key.split("/").pop()?.toLowerCase() === base);
    if (baseHits.length === 1) return baseHits[0];
  }
  return null;
}

export function resolveFindingLocation(
  index: DiffLineIndex,
  filePath: string,
  line: number,
): { file: string; line: number; lineType: DiffLineKind } | null {
  if (!Number.isFinite(line)) return null;
  const wanted = Math.floor(line);
  if (wanted < 1) return null;

  const file = matchIndexedFile(index.files, filePath);
  if (!file) return null;
  const lines = index.files.get(file);
  if (!lines || lines.size === 0) return null;

  const exact = lines.get(wanted);
  if (exact) return { file, line: wanted, lineType: exact };

  let best: { line: number; kind: DiffLineKind; dist: number } | null = null;
  for (const [candidate, kind] of lines) {
    const dist = Math.abs(candidate - wanted);
    if (dist > SNAP_DISTANCE) continue;
    if (!best || dist < best.dist || (dist === best.dist && kind === "ADDED" && best.kind !== "ADDED")) {
      best = { line: candidate, kind, dist };
    }
  }
  return best ? { file, line: best.line, lineType: best.kind } : null;
}

function jsonFilePath(entry: {
  toString?: string;
  name?: string;
  parent?: string;
  components?: string[];
} | null | undefined): string {
  if (!entry) return "";
  if (entry.toString) return normalizeDiffPath(String(entry.toString));
  if (entry.components?.length) return normalizeDiffPath(entry.components.join("/"));
  if (entry.parent && entry.name) return normalizeDiffPath(`${entry.parent}/${entry.name}`);
  if (entry.name) return normalizeDiffPath(entry.name);
  return "";
}

function annotateBitbucketJsonDiff(data: unknown): { annotated: string; index: DiffLineIndex } | null {
  const root = data as { diffs?: unknown[]; values?: unknown[] };
  const diffs = Array.isArray(data) ? data : root.diffs ?? root.values;
  if (!Array.isArray(diffs) || diffs.length === 0) return null;

  const files = new Map<string, Map<number, DiffLineKind>>();
  const out: string[] = [];
  let recorded = 0;

  for (const rawDiff of diffs) {
    const diff = rawDiff as {
      destination?: { toString?: string; name?: string; parent?: string; components?: string[] };
      source?: { toString?: string; name?: string; parent?: string; components?: string[] };
      hunks?: Array<{
        destinationLine?: number;
        segments?: Array<{
          type?: string;
          lines?: Array<{ line?: string; destination?: number }>;
        }>;
      }>;
    };
    const filePath = jsonFilePath(diff.destination) || jsonFilePath(diff.source);
    if (!filePath || !diff.hunks?.length) continue;
    out.push(`FILE ${filePath}  (use the L<n> numbers below as "line")`);

    for (const hunk of diff.hunks) {
      let newLine = hunk.destinationLine ?? 0;
      for (const segment of hunk.segments ?? []) {
        const type = (segment.type ?? "").toUpperCase();
        for (const entry of segment.lines ?? []) {
          const text = entry.line ?? "";
          if (type === "REMOVED") {
            out.push(`      -${text}`);
            continue;
          }
          const lineNo = entry.destination && entry.destination > 0 ? entry.destination : newLine;
          const kind: DiffLineKind = type === "ADDED" ? "ADDED" : "CONTEXT";
          if (lineNo > 0) {
            recordLine(files, filePath, lineNo, kind);
            recorded += 1;
            out.push(`L${lineNo}: ${kind === "ADDED" ? "+" : " "}${text}`);
            newLine = lineNo + 1;
          }
        }
      }
    }
  }

  if (recorded === 0) return null;
  return { annotated: out.join("\n").trim(), index: { files } };
}

function annotateUnifiedDiff(rawDiff: string): { annotated: string; index: DiffLineIndex } {
  const files = new Map<string, Map<number, DiffLineKind>>();
  const out: string[] = [];
  let currentFile = "";
  let newLine = 0;
  let inHunk = false;

  for (const line of rawDiff.split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git (?:a\/)?(.+?) (?:b\/)?(.+)$/);
    if (gitMatch) {
      currentFile = normalizeDiffPath(gitMatch[2] || gitMatch[1] || "");
      inHunk = false;
      out.push(line);
      if (currentFile) out.push(`FILE ${currentFile}  (use the L<n> numbers below as "line")`);
      continue;
    }

    if (line.startsWith("+++")) {
      const nextPath = normalizeDiffPath(line.replace(/^\+\+\+\s*/, ""));
      if (nextPath && nextPath !== "/dev/null") currentFile = nextPath;
      out.push(line);
      continue;
    }

    if (line.startsWith("---")) {
      out.push(line);
      continue;
    }

    const hunk = line.match(HUNK_RE);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = Boolean(currentFile);
      out.push(line);
      continue;
    }

    if (!inHunk || !currentFile) {
      out.push(line);
      continue;
    }

    if (line.startsWith("\\")) {
      out.push(line);
      continue;
    }

    if (line.startsWith("-")) {
      out.push(`      ${line}`);
      continue;
    }

    if (line.startsWith("+")) {
      recordLine(files, currentFile, newLine, "ADDED");
      out.push(`L${newLine}: ${line}`);
      newLine += 1;
      continue;
    }

    recordLine(files, currentFile, newLine, "CONTEXT");
    out.push(`L${newLine}: ${line}`);
    newLine += 1;
  }

  return { annotated: out.join("\n").trim(), index: { files } };
}

/** Rewrite a PR diff so each new-file line is prefixed with its real line number. */
export function annotateDiff(rawDiff: string): { annotated: string; index: DiffLineIndex } {
  const trimmed = rawDiff.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const fromJson = annotateBitbucketJsonDiff(JSON.parse(trimmed) as unknown);
      if (fromJson) return fromJson;
    } catch {
      /* fall through to unified diff */
    }
  }
  return annotateUnifiedDiff(rawDiff);
}
