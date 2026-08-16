import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/app-store";
import type { WriteMode } from "../../electron/main/types";

export function SettingsTab() {
  const draft = useAppStore((s) => s.draft);
  const settings = useAppStore((s) => s.settings);
  const setDraftField = useAppStore((s) => s.setDraftField);
  const hydrateSettings = useAppStore((s) => s.hydrateSettings);
  const resetDraftFromSettings = useAppStore((s) => s.resetDraftFromSettings);
  const setConnection = useAppStore((s) => s.setConnection);
  const setBusy = useAppStore((s) => s.setBusy);
  const setError = useAppStore((s) => s.setError);
  const setLogs = useAppStore((s) => s.setLogs);
  const busy = useAppStore((s) => s.busy);

  async function save() {
    if (
      !draft.bitbucketUrl.trim() ||
      !draft.workspace.trim() ||
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

    setBusy(true);
    setError(null);
    try {
      const result = await window.api.saveSettings({
        bitbucketUrl: draft.bitbucketUrl.trim(),
        workspace: draft.workspace.trim(),
        repository: draft.repository.trim(),
        token: draft.token,
        promptPath: draft.promptPath.trim(),
        resultsDir: draft.resultsDir.trim(),
        writeMode: draft.writeMode as WriteMode,
      });
      hydrateSettings(result.settings);
      setConnection(result.connection);
      setLogs(await window.api.getLogs());
      setDraftField("token", "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          All fields are required. First launch starts empty. Token is stored in OS secure storage.
        </p>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Internal use only. On Review, the PR diff is sent to Copilot Business through the local CLI.
        </div>

        <div className="mt-6 grid gap-4">
          <Field
            label="Bitbucket URL"
            hint="You can paste a repo link such as https://bitbucket.org/workspace/repo/src/develop/"
          >
            <Input
              value={draft.bitbucketUrl}
              onChange={(e) => {
                const value = e.target.value;
                let workspace = draft.workspace;
                let repository = draft.repository;
                try {
                  const url = new URL(value.includes("://") ? value : `https://${value}`);
                  const parts = url.pathname.split("/").filter(Boolean);
                  if (parts.length >= 2) {
                    workspace = parts[0];
                    repository = parts[1].replace(/\.git$/i, "");
                  }
                } catch {
                  // keep typed workspace/repo when the URL is incomplete
                }
                useAppStore.setState({
                  draft: { ...draft, bitbucketUrl: value, workspace, repository },
                });
              }}
              placeholder="https://bitbucket.org/workspace/repo"
              spellCheck={false}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace">
              <Input
                value={draft.workspace}
                onChange={(e) => setDraftField("workspace", e.target.value)}
                placeholder="my-workspace"
                spellCheck={false}
              />
            </Field>
            <Field label="Repository">
              <Input
                value={draft.repository}
                onChange={(e) => setDraftField("repository", e.target.value)}
                placeholder="my-repo"
                spellCheck={false}
              />
            </Field>
          </div>
          <Field
            label="Repository Access Token"
            hint={
              settings.hasToken
                ? "A token is saved. Enter a new one only to replace it. Required: Repositories Read + Pull requests Read. Add Pull requests Write only if posting comments."
                : "Create a Repository Access Token with Repositories: Read and Pull requests: Read. Add Pull requests: Write only if posting comments."
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
          <Field label="Prompt file">
            <div className="flex gap-2">
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
                Browse
              </Button>
            </div>
          </Field>
          <Field label="Results directory">
            <div className="flex gap-2">
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
                Browse
              </Button>
            </div>
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Write mode</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Write mode">
              {(
                [
                  ["bitbucket", "Write review to Bitbucket PR", "Posts the summary and inline comments."],
                  ["local", "Save locally only", "Keeps the review on this machine."],
                ] as const
              ).map(([value, label, hint]) => {
                const selected = draft.writeMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDraftField("writeMode", value)}
                    className={`cursor-pointer rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                        : "border-[var(--border)] bg-white hover:border-[var(--accent)]/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="primary" disabled={busy} onClick={save}>
            Save settings
          </Button>
          <Button disabled={busy} onClick={resetDraftFromSettings}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}
