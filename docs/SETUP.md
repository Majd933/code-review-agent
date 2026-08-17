# Setup

What to install on the machine, how to get project libraries, and how to run the app.

This app does **not** need extra npm packages added by hand. `npm install` in the project folder installs everything listed in `package.json`.

## 1. Install on the machine (once)

Do this before the first run. None of these come from this repo.

| What | Why | How |
| --- | --- | --- |
| **Node.js 22.12+** (includes **npm**) | Required by Electron 43. Builds and `npm run dev`. | [nodejs.org](https://nodejs.org/) LTS 22, or `winget install OpenJS.NodeJS.LTS` |
| **Git** | Clone the repo. | [git-scm.com](https://git-scm.com/) |
| **GitHub Copilot CLI** (`copilot`) | Reviews run through this local CLI, not a website. | See [Copilot CLI](#github-copilot-cli) below |
| **Copilot Business** sign-in | The CLI must be authenticated with a Business account. | `copilot` then follow the login prompt |
| **Bitbucket Cloud token** | List PRs and fetch diffs. | Create a **Repository Access Token** (scopes below) |

Check Node:

```bash
node -v
npm -v
```

`node -v` must be **v22.12.0 or newer**.

### GitHub Copilot CLI

The app looks for `copilot` on **PATH**, then `%LOCALAPPDATA%\GitHub CLI\copilot\copilot.exe`.

Install the **Copilot CLI** (`copilot.exe`), not `gh copilot`.

Typical Windows options:

```bash
winget install GitHub.Copilot
```

or:

```bash
npm install -g @github/copilot
```

Then sign in (Copilot **Business**):

```bash
copilot
```

Confirm it works:

```bash
copilot --help
```

### Bitbucket token scopes

Create a **new** Repository Access Token. Existing tokens cannot gain scopes.

- **Repositories: Read** — fetch the PR diff (required to review)
- **Pull requests: Read** — list open PRs
- **Pull requests: Write** — only if write mode posts comments on the PR

## 2. Get the project and libraries

```bash
git clone <repo-url>
cd code-review-agent
npm install
```

`npm install` downloads all app libraries (React, Electron, Vite, Tailwind, and the rest). You do not add them one by one.

If `npm install` fails on Node version, upgrade Node to 22.12+ and retry.

## 3. Run (development)

```bash
npm run dev
```

This starts Vite and opens the Electron window.

## 4. First launch (in the app)

1. Open the **Settings** tab.
2. Fill every required field (all start empty):
   - Bitbucket URL (example: `https://bitbucket.org`)
   - Workspace
   - Repository slug
   - Repository Access Token (scopes above)
   - Prompt file path (select `prompts/code-review.md` in this project, or `assets/default-prompt.md`)
   - Results directory (local folder for review output)
   - Write mode: post to Bitbucket PR, or save locally only
3. Click **Save settings**. The app checks **Bitbucket** (PR list + repository read) and **Copilot**. A missing token scope is shown in the UI.
4. Use **Dashboard** → **Refresh**, then **Review** on a PR.
5. Optional Dashboard automation: **Auto refresh** (interval in minutes) and **Auto-review new PRs** (only PRs that appear after you turn it on).

## Windows installer (no `npm run dev`)

The machine still needs **Copilot CLI** installed and signed in. Node/Git are only for development.

Build a Start Menu installer and a portable `.exe`:

```bash
npm run dist
```

Output is in `release/` (gitignored):

- NSIS installer — `Code Review Agent Setup 1.0.0.exe`
- Portable — `CodeReviewAgent-portable.exe` (double-click, no install)

If `npm run dist` fails with `EPERM` while unpacking Electron into `release/`, Windows may be locking that folder. Run the same command in a normal PowerShell window, or pause antivirus briefly.

Settings (token, paths) stay in the OS user data folder, same as in development.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm install` | Install / refresh project libraries |
| `npm run dev` | Run the desktop app for development |
| `npm run typecheck` | TypeScript check (no window) |
| `npm run build` | Production UI + Electron main/preload |
| `npm run dist` | Windows installer + portable exe |
| `npm audit` | Dependency vulnerability report |

## Notes

- Diffs larger than **200KB** (after ignore filters) are rejected with an error; they are not truncated.
- Existing tokens cannot gain new scopes. If review fails with a missing-scope error, create a **new** token and paste it in Settings.
- The token is stored with OS secure storage (Windows DPAPI via Electron `safeStorage`), not in plain settings JSON.
- App data (settings metadata, history, review status, logs) lives under the Electron `userData` directory for this app.
- Review status for each PR is remembered after restart (until the PR source commit changes).
- Review results are written only to the results directory you choose. Prefer a folder outside this git repo. If you use `result/` or `results/` inside the project, those paths are gitignored and will not be committed.
