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
3. Click **Save settings**. The app checks **Bitbucket** and **Copilot** connections.
4. Use **Dashboard** → **Refresh**, then **Review** on a PR.

## Notes

- Diffs larger than **200KB** (after ignore filters) are rejected with an error; they are not truncated.
- Existing tokens cannot gain new scopes. If review fails with a missing-scope error, create a **new** token and paste it in Settings.
- The token is stored with OS secure storage (Windows DPAPI via Electron `safeStorage`), not in plain settings JSON.
- App data (settings metadata, history, logs) lives under the Electron `userData` directory for this app.
- Review results are written only to the results directory you choose.
