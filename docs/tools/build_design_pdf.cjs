// Build docs/DealerDesk-System-Design.pdf from docs/ARCHITECTURE.md.
//
// Usage (from the repo root, after `npm ci` in frontend/ and `npx playwright install chromium`):
//   node docs/tools/build_design_pdf.cjs [--preview out.png]
//
// The Markdown is converted in a headless browser (marked + Mermaid), then printed to A4 PDF
// with a cover page, contents and page numbers. --preview also saves a full-page PNG of the
// print layout for a quick visual check.
const fs = require("fs");
const path = require("path");
const { MERMAID_URL, MARKED_URL, MERMAID_CONFIG } = require("./mermaid-config.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const { chromium } = require(path.join(ROOT, "frontend", "node_modules", "@playwright", "test"));
const OUT = path.join(ROOT, "docs", "DealerDesk-System-Design.pdf");
const previewArg = process.argv.indexOf("--preview");
const PREVIEW = previewArg > 0 ? process.argv[previewArg + 1] : null;

const md = fs.readFileSync(path.join(ROOT, "docs", "ARCHITECTURE.md"), "utf8");
// The cover page replaces the Markdown title block.
const body = md.slice(md.indexOf("## How to read this document"));

const CSS = `
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10.5pt;
         line-height: 1.5; margin: 0; }
  .cover { height: 260mm; display: flex; flex-direction: column; justify-content: space-between;
           padding: 18mm 6mm 6mm; break-after: page;
           background: linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%);
           color: #fff; border-radius: 6px; }
  .cover .tag { font-size: 10pt; letter-spacing: .14em; text-transform: uppercase; color: #c7d2fe; }
  .cover h1 { font-size: 34pt; line-height: 1.1; margin: 10mm 0 4mm; }
  .cover p.sub { font-size: 14pt; color: #e0e7ff; margin: 0; }
  .cover dl { display: grid; grid-template-columns: 34mm 1fr; gap: 2.5mm 6mm; font-size: 10pt;
              color: #e0e7ff; margin: 0; }
  .cover dt { color: #a5b4fc; }
  .cover dd { margin: 0; }
  .cover .parts { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cover .part { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18);
                 border-radius: 6px; padding: 5mm; font-size: 10pt; color: #e0e7ff; }
  .cover .part b { display: block; color: #fff; font-size: 12pt; margin-bottom: 1.5mm; }
  .toc { break-after: page; }
  .toc h2 { border: 0; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 1.6mm 0; border-bottom: 1px dotted #cbd5e1; }
  .toc li.l3 { padding-left: 7mm; color: #334155; font-size: 10pt; }
  .toc li.fig { padding-left: 14mm; color: #64748b; font-size: 9pt; border-bottom: 0; padding-top: .4mm; padding-bottom: .4mm; }
  h2 { font-size: 19pt; color: #1e1b4b; border-bottom: 2px solid #6366f1; padding-bottom: 2mm;
       margin: 0 0 5mm; break-before: page; }
  h3 { font-size: 13.5pt; color: #312e81; margin: 7mm 0 2.5mm; break-after: avoid; }
  h4 { font-size: 10.5pt; color: #4338ca; margin: 5mm 0 2mm; text-transform: none; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; background: #f1f5f9;
         padding: .3mm 1.2mm; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.2pt; break-inside: avoid; }
  th { background: #eef2ff; color: #1e1b4b; text-align: left; }
  th, td { border: 1px solid #cbd5e1; padding: 1.8mm 2.4mm; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  hr { display: none; }
  a { color: #4338ca; text-decoration: none; }
  figure.diagram { margin: 2mm 0 5mm; padding: 4mm; border: 1px solid #e2e8f0; border-radius: 6px;
                   break-inside: avoid; text-align: center; background: #fff; }
  figure.diagram svg { max-width: 100%; height: auto; max-height: 222mm; }
  /* Wide figures get their own landscape page (CSS named pages). */
  @page wide { size: A4 landscape; margin: 12mm 14mm 16mm 14mm; }
  .landscape { page: wide; break-before: page; break-after: page; }
  .landscape figure.diagram { border: 0; padding: 0; margin: 0; }
  .landscape figure.diagram svg { max-height: 158mm; }
  .landscape h4 { margin-top: 0; }
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style>
  <script src="${MARKED_URL}"></script><script src="${MERMAID_URL}"></script></head><body>
  <section class="cover">
    <div>
      <div class="tag">System design document</div>
      <h1>DealerDesk</h1>
      <p class="sub">Dealership inventory: high-level and low-level design</p>
    </div>
    <div class="parts">
      <div class="part"><b>Part 1 · High-level design</b>System context, deployment on Cloudflare
        and Neon, edge routing, the user journey, and the CI/CD pipeline.</div>
      <div class="part"><b>Part 2 · Low-level design</b>Backend layers, login, token validation,
        the atomic vehicle update, concurrency, the frontend edit flow, the data model and the API contract.</div>
    </div>
    <dl>
      <dt>Live application</dt><dd>https://dealerdesk.aneeq02025.workers.dev</dd>
      <dt>Repository</dt><dd>github.com/aneeq178/dealership-inventory</dd>
      <dt>Stack</dt><dd>Next.js 16 · FastAPI on Cloudflare Python Workers · PostgreSQL (Neon) via Hyperdrive · GitHub Actions</dd>
      <dt>Generated</dt><dd>${new Date().toISOString().slice(0, 10)} from docs/ARCHITECTURE.md</dd>
    </dl>
  </section>
  <section class="toc"><h2 style="break-before:auto">Contents</h2><ol id="toc"></ol></section>
  <main id="doc"></main></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => window.marked && window.mermaid);

  const errors = await page.evaluate(async ({ markdown, cfg }) => {
    const doc = document.getElementById("doc");
    doc.innerHTML = window.marked.parse(markdown);

    // Each "#### Figure" heading and the mermaid block after it become one figure.
    for (const code of doc.querySelectorAll("pre > code.language-mermaid")) {
      const pre = code.parentElement;
      const fig = document.createElement("figure");
      fig.className = "diagram";
      const div = document.createElement("div");
      div.className = "mermaid";
      div.textContent = code.textContent;
      fig.appendChild(div);
      pre.replaceWith(fig);
    }

    window.mermaid.initialize(cfg);
    const problems = [];
    let i = 0;
    for (const div of doc.querySelectorAll("div.mermaid")) {
      try {
        const { svg } = await window.mermaid.render(`m${i++}`, div.textContent);
        div.innerHTML = svg;
      } catch (e) {
        problems.push(String((e && e.message) || e).split("\n")[0]);
      }
    }

    // A figure much wider than the portrait text column (about 680 px) moves to its own
    // landscape page, together with its "Figure N" heading.
    for (const fig of doc.querySelectorAll("figure.diagram")) {
      const svg = fig.querySelector("svg");
      const vb = svg && svg.viewBox && svg.viewBox.baseVal;
      if (!vb || vb.width < 1100 || vb.width / vb.height < 1.25) continue;
      const wrap = document.createElement("section");
      wrap.className = "landscape";
      const heading = fig.previousElementSibling;
      fig.replaceWith(wrap);
      if (heading && heading.tagName === "H4") wrap.appendChild(heading);
      wrap.appendChild(fig);
    }

    // Contents: parts, sections, and figures.
    const toc = document.getElementById("toc");
    for (const h of doc.querySelectorAll("h2, h3, h4")) {
      if (h.tagName === "H4" && !h.textContent.startsWith("Figure")) continue;
      const li = document.createElement("li");
      li.className = h.tagName === "H2" ? "l2" : h.tagName === "H3" ? "l3" : "fig";
      li.textContent = h.textContent;
      if (h.tagName === "H2") li.style.fontWeight = "600";
      toc.appendChild(li);
    }
    return problems;
  }, { markdown: body, cfg: MERMAID_CONFIG });

  if (errors.length) {
    console.log("Mermaid errors:\n  " + errors.join("\n  "));
    await browser.close();
    process.exit(1);
  }

  await page.emulateMedia({ media: "print" });
  if (PREVIEW) await page.screenshot({ path: PREVIEW, fullPage: true });
  await page.pdf({
    path: OUT,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font-size:8px;color:#64748b;padding:0 15mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial">
      <span>DealerDesk · System design</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
  });
  await browser.close();
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})();
