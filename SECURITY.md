# Security notes

This repository is public and the site is deployed through GitHub Pages. Do not commit tokens, private customer messages, phone lists, exports, or local `.env` files.

## What is protected now

- GitHub Pages artifact is built into `_site` and excludes `bot/`, `.github/`, `_archive/`, and repository documentation. Runtime bot files and `bot/state.json` should not be published as web pages anymore after the next deploy.
- `bot/state.json` is redacted by default. It keeps only operational offsets and public admin/banned lists; leads, chats, dialogs, and logs are written as empty collections.
- If repository secret `STATE_SECRET` is configured, the bot writes the full runtime state encrypted to `bot/state.json`. Without it, leads/chats stay only in memory until the current bot run restarts.
- `robots.txt` disallows bot/workflow/archive paths for crawlers. This is only an indexing hint, not access control.

## Required operator actions

1. Rotate any GitHub PAT that was ever pasted into chat or logs.
2. Add a strong GitHub Actions secret named `STATE_SECRET` if encrypted chat/lead persistence is needed across bot restarts.
3. After changing `STATE_SECRET` or the bridge inbox, manually restart the `Telegram admin bot` workflow.
4. Check GitHub Pages custom domain HTTPS: the certificate must be issued for `eurotour.pp.ua`, not only for `*.github.io`.

## Generate STATE_SECRET locally

Use a password manager or run locally:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
```

Add the generated value in GitHub: Settings → Secrets and variables → Actions → New repository secret → `STATE_SECRET`.
