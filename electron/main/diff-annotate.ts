export type DiffLineKind = "ADDED" | "CONTEXT";

export interface DiffLineIndex {
  files: Map<string, Map<number, DiffLineKind>>;
}

const SNAP_DISTANCE = 2;
const HUNK_RE = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;

export function normalizeDiffPath(filePath: string): string {
  return filePath
    .trim()
    .replace(/\t.*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^[ab]\//, "");
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
  const ignoreCase = keys.find((key) => key.toLowerCase() === want.toLowerCase());
  if (ignoreCase) return ignoreCase;
  const suffixHits = keys.filter(
    (key) => key.endsWith(`/${want}`) || want.endsWith(`/${key}`) || key.endsWith(want),
  );
  return suffixHits.length === 1 ? suffixHits[0] : null;
}

export function resolveFindingLocation(
  index: DiffLineIndex,
  filePath: string,
  line: number,
): { file: string; line: number; lineType: DiffLineKind } | null {
  const file = matchIndexedFile(index.files, filePath);
  if (!file) return null;
  const lines = index.files.get(file);
  if (!lines || !Number.isFinite(line)) return null;
  const wanted = Math.floor(line);
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

/** Rewrite a unified diff so each new-file line is prefixed with its real line number. */
export function annotateDiff(rawDiff: string): { annotated: string; index: DiffLineIndex } {
  const files = new Map<string, Map<number, DiffLineKind>>();
  const out: string[] = [];
  let currentFile = "";
  let newLine = 0;
  let inHunk = false;

  for (const line of rawDiff.split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) {
      currentFile = normalizeDiffPath(gitMatch[2] || gitMatch[1] || "");
      inHunk = false;
      out.push(line);
      if (currentFile) out.push(`FILE ${currentFile}  (use the L<n> numbers below as "line")`);
      continue;
    }

    if (line.startsWith("+++ ")) {
      const nextPath = normalizeDiffPath(line.slice(4));
      if (nextPath && nextPath !== "/dev/null") currentFile = nextPath;
      inHunk = false;
      out.push(line);
      continue;
    }

    if (line.startsWith("--- ")) {
      inHunk = false;
      out.push(line);
      continue;
    }

    const hunk = line.match(HUNK_RE);
    if (hunk) {
      newLine = Number(hunk[2]);
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
