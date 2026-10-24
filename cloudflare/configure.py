"""Render wrangler.jsonc from wrangler.template.json and copy the backend app into src/.

Usage (from the repo root; CI runs this before every deploy):
    python cloudflare/configure.py --hyperdrive-id <id> --app-version <git sha> \
        --password-hash-iterations <n>

- wrangler.jsonc is generated, not committed (pywrangler only reads wrangler.jsonc or
  wrangler.toml; plain JSON is valid JSONC): it carries per-deploy values (the git SHA shown
  by /api/health) and the account-specific Hyperdrive config id.
- backend/app is copied to cloudflare/src/app because Cloudflare uploads the .py files under
  the entry module's folder. backend/ stays a normal FastAPI project for local dev and tests.
"""

import argparse
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hyperdrive-id", required=True)
    parser.add_argument("--app-version", required=True)
    parser.add_argument("--password-hash-iterations", required=True, type=int)
    args = parser.parse_args()

    template = (HERE / "wrangler.template.json").read_text(encoding="utf-8")
    rendered = (
        template.replace("__HYPERDRIVE_ID__", args.hyperdrive_id)
        .replace("__APP_VERSION__", args.app_version)
        .replace("__PASSWORD_HASH_ITERATIONS__", str(args.password_hash_iterations))
    )
    config = json.loads(rendered)  # fail fast on a broken template
    (HERE / "wrangler.jsonc").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    target = HERE / "src" / "app"
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(
        ROOT / "backend" / "app",
        target,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    print(f"wrote {HERE / 'wrangler.jsonc'} and copied backend/app -> {target}")


if __name__ == "__main__":
    main()
