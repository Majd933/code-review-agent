# Setup

## Requirements

- **Node.js** 20+ (npm included)
- **GitHub Copilot CLI** (`copilot`) installed and signed in with a **Copilot Business** account
- **Bitbucket Cloud Repository Access Token** with:
  - **Repositories: Read** (required to fetch the PR diff)
  - **Pull requests: Read** (required to list PRs)
  - **Pull requests: Write** (only if the app posts comments to Bitbucket)

## Install

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

This starts Vite and opens the Electron window.

## Windows installer (no `npm run dev`)

Build a Start Menu installer and a portable `.exe`:

```bash
npm run dist
```

Output is in `release/` (gitignored):

- NSIS installer — `Code Review Agent Setup 1.0.0.exe`
- Portable — `CodeReviewAgent-portable.exe` (double-click, no install)

If `npm run dist` fails with `EPERM` while unpacking Electron into `release/`, Windows may be locking that folder. Run the same command in a normal PowerShell window, or pause antivirus briefly.

Copilot CLI must still be installed and signed in on that machine. Settings (token, paths) stay in the OS user data folder, same as in development.

## First launch

1. Open the **Settings** tab.
2. Fill every required field (all start empty):
   - Bitbucket URL (example: `https://bitbucket.org`)
   - Workspace
   - Repository slug
   - Repository Access Token (Repositories: Read + Pull requests: Read; add Write for comments)
   - Prompt file path (select `prompts/code-review.md` in this project, or `assets/default-prompt.md`)
   - Results directory (local folder for review output)
   - Write mode: post to Bitbucket PR, or save locally only
3. Click **Save settings**. The app checks **Bitbucket** (PR list + repository read) and **Copilot**. A missing token scope is shown in the UI.
4. Use **Dashboard** → **Refresh**, then **Review** on a PR.

## Notes

- Diffs larger than **200KB** (after ignore filters) are rejected with an error; they are not truncated.
- Existing tokens cannot gain new scopes. If review fails with a missing-scope error, create a **new** token and paste it in Settings.
- The token is stored with OS secure storage (Windows DPAPI via Electron `safeStorage`), not in plain settings JSON.
- App data (settings metadata, history, review status, logs) lives under the Electron `userData` directory for this app.
- Review status for each PR is remembered after restart (until the PR source commit changes).
- Review results are written only to the results directory you choose. Prefer a folder outside this git repo. If you use `result/` or `results/` inside the project, those paths are gitignored and will not be committed.
