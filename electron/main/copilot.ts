import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { COPILOT_TIMEOUT_MS } from "./types";
import { appendLog } from "./logger";

const MISSING_MESSAGE = "Copilot CLI not found. Install `copilot` and sign in with your Business account.";

let resolvedCommand: string | null = null;

function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; input?: string } = { timeoutMs: 30_000 },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Command timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    if (options.input != null) {
      child.stdin.write(options.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

function localCopilotExe(): string | null {
  const localApp = process.env.LOCALAPPDATA;
  if (!localApp) return null;
  const exe = path.join(localApp, "GitHub CLI", "copilot", "copilot.exe");
  return fs.existsSync(exe) ? exe : null;
}

function isMissing(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /ENOENT|not recognized|not found/i.test(message);
}

async function probe(command: string): Promise<boolean> {
  try {
    const result = await runCommand(command, ["--help"], { timeoutMs: 20_000 });
    return Boolean(result.stdout || result.stderr);
  } catch (err) {
    return !isMissing(err);
  }
}

async function resolveCopilot(): Promise<string> {
  if (resolvedCommand) return resolvedCommand;
  const commands = ["copilot", localCopilotExe()].filter((value): value is string => Boolean(value));
  for (const command of commands) {
    if (await probe(command)) {
      resolvedCommand = command;
      appendLog("info", `Using Copilot CLI: ${command}`);
      return command;
    }
  }
  throw new Error(MISSING_MESSAGE);
}

export async function checkCopilotConnection(): Promise<void> {
  try {
    await resolveCopilot();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(isMissing(err) || message === MISSING_MESSAGE ? MISSING_MESSAGE : `Copilot check failed: ${message}`);
  }
}

export async function runCopilotReview(prompt: string): Promise<string> {
  appendLog("info", "Starting Copilot CLI review");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-prompt-"));
  const promptFile = path.join(tempDir, "review-prompt.md");
  fs.writeFileSync(promptFile, prompt, { encoding: "utf8", mode: 0o600 });
  try {
    const command = await resolveCopilot();
    const instruction =
      `Read the file "${promptFile}" and follow its instructions exactly. ` +
      `Respond with only the JSON object it requests. Do not edit files or run shell commands.`;
    const result = await runCommand(
      command,
      [
        "-C",
        tempDir,
        "-p",
        instruction,
        "-s",
        "--no-ask-user",
        "--add-dir",
        tempDir,
        "--allow-all-tools",
      ],
      { timeoutMs: COPILOT_TIMEOUT_MS },
    );
    const output = (result.stdout || result.stderr || "").trim();
    if (!output) {
      throw new Error("Copilot returned empty output");
    }
    if (result.code !== 0) {
      appendLog("warn", `Copilot exited with code ${result.code}`);
    }
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissing(err) || message === MISSING_MESSAGE) {
      throw new Error(MISSING_MESSAGE);
    }
    if (/timed out/i.test(message)) {
      throw new Error("Copilot review timed out after 5 minutes");
    }
    throw new Error(`Copilot review failed: ${message}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export interface ParsedReview {
  summary: string;
  findings: Array<{ severity: string; file: string; line: number; message: string }>;
  raw: string;
  parsed: boolean;
}

export function parseCopilotOutput(raw: string): ParsedReview {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidates = [fenceMatch?.[1]?.trim(), raw.trim()].filter(Boolean) as string[];

  for (const candidate of jsonCandidates) {
    try {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start < 0 || end <= start) continue;
      const jsonText = candidate.slice(start, end + 1);
      const data = JSON.parse(jsonText) as {
        summary?: string;
        findings?: Array<{ severity?: string; file?: string; line?: number; message?: string }>;
      };
      const findings = (data.findings ?? [])
        .filter((f) => f.file && f.message && typeof f.line === "number")
        .map((f) => ({
          severity: f.severity ?? "info",
          file: String(f.file),
          line: Number(f.line),
          message: String(f.message),
        }));
      return {
        summary: data.summary?.trim() || raw.trim(),
        findings,
        raw,
        parsed: true,
      };
    } catch {
      // try next candidate
    }
  }

  return {
    summary: raw.trim(),
    findings: [],
    raw,
    parsed: false,
  };
}
