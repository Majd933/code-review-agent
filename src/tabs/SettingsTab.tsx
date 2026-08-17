import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  Building2,
  FileText,
  FolderGit2,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  MessageSquareText,
  PenLine,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";
import { formatBitbucketRepoPageUrl, parseBitbucketRepoUrl } from "../../electron/main/bitbucket-url";
import type { WriteMode } from "../../electron/main/types";
import { cn } from "@/lib/utils";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export function SettingsTab() {
  const draft = useAppStore((s) => s.draft);
  const settings = useAppStore((s) => s.settings);
  const setDraftField = useAppStore((s) => s.setDraftField);
  const hydrateSettings = useAppStore((s) => s.hydrateSettings);
  const resetDraftFromSettings = useAppStore((s) => s.resetDraftFromSettings);
  const setConnection = useAppStore((s) => s.setConnection);
  const setConnecting = useAppStore((s) => s.setConnecting);
  const setError = useAppStore((s) => s.setError);
  const setLogs = useAppStore((s) => s.setLogs);
  const setPrs = useAppStore((s) => s.setPrs);
  const setStats = useAppStore((s) => s.setStats);
  const connecting = useAppStore((s) => s.connecting);
  const reviewing = useAppStore((s) => s.reviewing);
  const settingsLocked = connecting || reviewing;

  async function save() {
    if (
      !draft.bitbucketUrl.trim() ||
      !draft.project.trim() ||
      !draft.repository.trim() ||
      !draft.promptPath.trim() ||
      !draft.resultsDir.trim() ||
      !draft.writeMode
    ) {
      setError("All settings fields are required");
      return;
    }
    if (!draft.token.trim() && !settings.hasToken) {
      setError("Repository Access Token is required");
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      const result = await window.api.saveSettings({
        bitbucketUrl: draft.bitbucketUrl.trim(),
        project: draft.project.trim(),
        repository: draft.repository.trim(),
        token: draft.token,
        promptPath: draft.promptPath.trim(),
        resultsDir: draft.resultsDir.trim(),
        writeMode: draft.writeMode as WriteMode,
      });
      hydrateSettings(result.settings);
      setConnection(result.connection);
      if (result.prs && result.stats) {
        setPrs(result.prs);
        setStats(result.stats);
      }
      setLogs(await window.api.getLogs());
      setDraftField("token", "");
      if (result.connection.bitbucket === "disconnected" && result.connection.bitbucketMessage) {
        setError(result.connection.bitbucketMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="app-panel overflow-hidden">
      <div className="form-stack px-4 py-4">
        <div className="form-stack">
          <Field label="Bitbucket URL" icon={Globe}>
            <Input
              value={draft.bitbucketUrl}
              onChange={(e) => {
                const value = e.target.value;
                const parsed = parseBitbucketRepoUrl(value);
                useAppStore.setState({
                  draft: {
                    ...draft,
                    bitbucketUrl: value,
                    project: parsed.project || draft.project,
                    repository: parsed.repository || draft.repository,
                  },
                });
              }}
              placeholder="https://bitbucket.org"
              spellCheck={false}
            />
          </Field>
          <div className="space-y-2.5">
            <div className="form-grid-2">
              <Field label="Project" icon={Building2}>
                <Input
                  value={draft.project}
                  onChange={(e) => setDraftField("project", e.target.value)}
                  placeholder="acme-workspace"
                  spellCheck={false}
                />
              </Field>
              <Field label="Repository" icon={FolderGit2}>
                <Input
                  value={draft.repository}
                  onChange={(e) => setDraftField("repository", e.target.value)}
                  placeholder="payments-api"
                  spellCheck={false}
                />
              </Field>
            </div>
            <RepoUrlPreview
              bitbucketUrl={draft.bitbucketUrl}
              project={draft.project}
              repository={draft.repository}
            />
          </div>
          <Field
            icon={KeyRound}
            label="Repository Access Token"
            labelExtra={<TokenScopesInfo />}
            hint={
              settings.hasToken
                ? "A token is saved. Enter a new one only to replace it."
                : "Create a new token if review fails. Existing tokens cannot gain scopes."
            }
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft.token}
              onChange={(e) => setDraftField("token", e.target.value)}
              placeholder={settings.hasToken ? "••••••••••••" : "Enter repository access token"}
            />
          </Field>
          <Field label="Prompt file" icon={FileText}>
            <div className="flex gap-2.5">
              <Input
                value={draft.promptPath}
                onChange={(e) => setDraftField("promptPath", e.target.value)}
                placeholder="Select prompt file"
                spellCheck={false}
              />
              <Button
                type="button"
                onClick={async () => {
                  const path = await window.api.pickPromptFile();
                  if (path) setDraftField("promptPath", path);
                }}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Browse
              </Button>
            </div>
          </Field>
          <Field label="Results directory" icon={FolderOpen}>
            <div className="flex gap-2.5">
              <Input
                value={draft.resultsDir}
                onChange={(e) => setDraftField("resultsDir", e.target.value)}
                placeholder="Select results folder"
                spellCheck={false}
              />
              <Button
                type="button"
                onClick={async () => {
                  const path = await window.api.pickResultsDir();
                  if (path) setDraftField("resultsDir", path);
                }}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Browse
              </Button>
            </div>
          </Field>
          <Field label="Write mode" icon={PenLine}>
            <div className="form-grid-2" role="radiogroup" aria-label="Write mode">
              {(
                [
                  {
                    value: "bitbucket" as const,
                    label: "Write review to Bitbucket PR",
                    hint: "Posts the summary and inline comments.",
                    icon: MessageSquareText,
                  },
                  {
                    value: "local" as const,
                    label: "Save locally only",
                    hint: "Keeps the review on this machine.",
                    icon: HardDrive,
                  },
                ]
              ).map((option) => {
                const selected = draft.writeMode === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDraftField("writeMode", option.value)}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition",
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                        : "border-[var(--border)] bg-white hover:border-[var(--accent)]/50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                        selected
                          ? "bg-white text-[var(--accent)] shadow-[var(--shadow-sm)]"
                          : "bg-[var(--bg-soft)] text-[var(--muted)]",
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-[var(--muted)]">
                        {option.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="flex gap-3 border-t border-[var(--border)] pt-5">
          <Button variant="primary" disabled={settingsLocked} onClick={save}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save settings
          </Button>
          <Button variant="secondary" disabled={settingsLocked} onClick={resetDraftFromSettings}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-[#6B7280]">
          Internal use only. On Review, the PR diff is sent to Copilot Business through the local CLI.
          Token is stored in OS secure storage.
        </p>
      </div>
    </div>
  );
}

function RepoUrlPreview({
  bitbucketUrl,
  project,
  repository,
}: {
  bitbucketUrl: string;
  project: string;
  repository: string;
}) {
  const url = formatBitbucketRepoPageUrl(bitbucketUrl, project, repository);
  const complete = Boolean(bitbucketUrl.trim() && project.trim() && repository.trim());
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3.5 py-3">
      <div className="text-xs font-semibold text-[var(--text)]">Repository URL</div>
      <p className="mt-1 font-mono text-xs leading-relaxed break-all text-[var(--accent)]">{url}</p>
      {!complete ? (
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Built from Bitbucket URL, project, and repository. Example:
          https://bitbucket.org/projects/acme-workspace/repos/payments-api
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  labelExtra,
  hint,
  children,
}: {
  label: string;
  icon?: IconType;
  labelExtra?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <div className="inline-flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" /> : null}
        <span>{label}</span>
        {labelExtra}
      </div>
      {children}
      {hint ? <span className="form-hint">{hint}</span> : null}
    </div>
  );
}

function TokenScopesInfo() {
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[var(--muted)]",
          "hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        )}
        aria-label="Token scopes required"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+8px)] z-30 w-72 rounded-xl border border-[var(--border)] bg-white p-3 text-left shadow-[var(--shadow-md)]"
          onClick={(event) => event.preventDefault()}
        >
          <div className="text-xs font-semibold text-[var(--text)]">Token scopes required</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--muted)]">
            <li>
              <span className="font-medium text-[var(--text)]">Repositories: Read</span> — fetch the PR
              diff
            </li>
            <li>
              <span className="font-medium text-[var(--text)]">Pull requests: Read</span> — list open PRs
            </li>
            <li>
              <span className="font-medium text-[var(--text)]">Pull requests: Write</span> — only if posting
              comments
            </li>
          </ul>
        </span>
      ) : null}
    </span>
  );
}
