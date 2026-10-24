# One-time deployment setup

Everything here creates accounts or handles credentials, so it is done by the repository owner.
It takes about 15 minutes. Everything after it runs from GitHub Actions.

Dashboard labels change over time; if a name differs slightly, look for the closest match.

## 1. Cloudflare account and Account ID

1. Sign up for a free account at https://dash.cloudflare.com/sign-up.
2. Open **Workers & Pages**. If asked, pick a free `workers.dev` subdomain (any name). The app
   will live at `https://dealerdesk.<your-subdomain>.workers.dev`.
3. Copy your **Account ID**. It is shown on the account home page and on the Workers & Pages
   overview, usually in the right-hand column.

## 2. Cloudflare API token

1. Profile icon (top right) → **My Profile** → **API Tokens** → **Create Token**.
2. Use the **Edit Cloudflare Workers** template.
3. Add one permission row: **Account → Hyperdrive → Edit**, so a deploy can attach the
   Hyperdrive binding.
4. Account resources: your account. Zone resources: leave the template default.
5. **Continue to summary** → **Create Token**, then copy the token. It is shown only once.

## 3. Neon Postgres

1. Sign up for the free plan at https://neon.tech and create a project. Pick the region closest
   to you; Postgres 16 or newer.
2. In **Connection details**, turn **off** "Connection pooling" so you get the **direct**
   connection string. It looks like
   `postgresql://user:password@ep-....neon.tech/neondb?sslmode=require`. Copy it.

## 4. Hyperdrive config

1. Cloudflare dashboard → **Storage & databases** → **Postgres & MySQL (Hyperdrive)** →
   **Connect database**.
2. Name it `dealerdesk-neon` and paste the Neon **direct** connection string. Its host must not
   contain `-pooler`. If it does, delete the config and create it again: editing the
   connection details froze the Cloudflare dashboard during setup.
3. **Turn caching off.** Hyperdrive caches read queries for up to 60 seconds by default. That
   would let a page reload or a conflict message show values from before a save.
4. Create it and copy the configuration **ID**. The ID is not secret.

## 5. GitHub secrets and variables

Repository → **Settings** → **Secrets and variables** → **Actions**.

On the **Secrets** tab, add:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from step 1 |
| `DATABASE_URL` | Neon direct connection string from step 3 |

**Paste values in GitHub's web page, not in a terminal prompt.** In Windows terminals,
pasting into `gh secret set`'s hidden "Paste your secret" prompt can silently save an empty
value. Alternatively copy the value, then run
`gh secret set NAME --repo aneeq178/dealership-inventory --body ((Get-Clipboard) -join '').Trim()`.
A Cloudflare API token is one line (the current format starts with `cfut_`, about 53
characters). Copy it with the button beside the token itself, not the example `curl` command.
Never paste a token into a chat or screenshot.

Create `JWT_SECRET` with this command. It generates a random value and stores it without
printing it:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48), end='')" | gh secret set JWT_SECRET --repo aneeq178/dealership-inventory
```

On the **Variables** tab, add:

| Name | Value |
|---|---|
| `HYPERDRIVE_ID` | Hyperdrive configuration ID from step 4 |

Optional: `PASSWORD_HASH_ITERATIONS` (default 10000). See the README's CPU budget section.

## 6. Deploy

Merge the deployment pull request into `main`, or run **Actions → CI/CD → Run workflow** on
`main`. The deploy job:

1. Waits for every check to pass.
2. Builds the frontend, migrates Neon, and seeds the demo accounts if the database is empty.
3. Deploys the Worker and stores `JWT_SECRET` on it.
4. Waits for `/api/health` to report the new version, then runs the smoke test.

The deployed URL appears on the run's summary page and on the repository's **Environments →
production** page.

## 7. Reviewer access

The repository is private. Either make it public (Settings → General → Danger Zone → Change
visibility), which also lets branch protection be enforced on a free plan, or invite the
reviewers as collaborators.
