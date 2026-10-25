// Shared Mermaid settings for the PDF and PNG builds, so both look identical.
module.exports = {
  MERMAID_URL: "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js",
  MARKED_URL: "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
  MERMAID_CONFIG: {
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      fontFamily: "Segoe UI, Helvetica, Arial, sans-serif",
      fontSize: "15px",
      primaryColor: "#eef2ff",
      primaryBorderColor: "#6366f1",
      primaryTextColor: "#1e1b4b",
      lineColor: "#64748b",
      secondaryColor: "#f8fafc",
      tertiaryColor: "#f8fafc",
      clusterBkg: "#f8fafc",
      clusterBorder: "#cbd5e1",
      noteBkgColor: "#fef9c3",
      noteBorderColor: "#ca8a04",
      actorBkg: "#eef2ff",
      actorBorder: "#6366f1",
    },
    flowchart: { curve: "basis", padding: 12, nodeSpacing: 28, rankSpacing: 34 },
    sequence: { mirrorActors: false, messageMargin: 26, actorMargin: 36, width: 120, noteMargin: 8, boxMargin: 6 },
    er: { layoutDirection: "TB" },
  },
  // Every figure in ARCHITECTURE.md is "#### Figure N · Title" followed by a mermaid block.
  extractFigures(md) {
    const re = /#### Figure (\d+) · ([^\n]+)\n\n```mermaid\n([\s\S]*?)```/g;
    const figures = [];
    let m;
    while ((m = re.exec(md))) {
      const slug = m[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      figures.push({ n: Number(m[1]), title: m[2], slug, code: m[3] });
    }
    return figures;
  },
};
