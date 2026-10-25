// Render every figure in docs/ARCHITECTURE.md to docs/diagrams/fig-NN-<title>.png.
//
// Usage (from the repo root, after `npm ci` in frontend/ and `npx playwright install chromium`):
//   node docs/tools/render_diagrams.cjs
const fs = require("fs");
const path = require("path");
const { MERMAID_URL, MERMAID_CONFIG, extractFigures } = require("./mermaid-config.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const { chromium } = require(path.join(ROOT, "frontend", "node_modules", "@playwright", "test"));

(async () => {
  const figures = extractFigures(fs.readFileSync(path.join(ROOT, "docs", "ARCHITECTURE.md"), "utf8"));
  const outDir = path.join(ROOT, "docs", "diagrams");
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".png")) fs.unlinkSync(path.join(outDir, f));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 1800 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">
    <div id="out" style="display:inline-block;padding:28px;background:#fff"></div>
    <script src="${MERMAID_URL}"></script></body></html>`);
  await page.waitForFunction(() => window.mermaid);
  await page.evaluate((cfg) => window.mermaid.initialize(cfg), MERMAID_CONFIG);

  let failures = 0;
  for (const fig of figures) {
    const result = await page.evaluate(async ({ code, id }) => {
      try {
        const { svg } = await window.mermaid.render(id, code);
        const out = document.getElementById("out");
        out.innerHTML = svg;
        const el = out.querySelector("svg");
        const vb = el.viewBox.baseVal;
        el.style.maxWidth = "none";
        el.setAttribute("width", String(Math.round(vb.width)));
        el.setAttribute("height", String(Math.round(vb.height)));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    }, { code: fig.code, id: `fig${fig.n}` });
    const file = `fig-${String(fig.n).padStart(2, "0")}-${fig.slug}.png`;
    if (!result.ok) {
      failures++;
      console.log(`FAIL ${file}: ${result.error.split("\n").slice(0, 3).join(" | ")}`);
      continue;
    }
    await page.locator("#out").screenshot({ path: path.join(outDir, file) });
    console.log(`ok   ${file}`);
  }
  await browser.close();
  console.log(`${figures.length - failures}/${figures.length} figures rendered`);
  process.exit(failures ? 1 : 0);
})();
