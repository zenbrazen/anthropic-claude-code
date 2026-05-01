import fs from 'fs/promises';
import path from 'path';

export const PAPERS_PER_PAGE = 12;
const DOMAIN = 'https://paperplaine.com';

export const CATEGORIES = [
  { label: 'AI',          slug: 'ai',          arxivCat: 'cs.AI',    displayCat: 'Computer Science · cs.AI',     fullName: 'AI' },
  { label: 'Comp Sci',    slug: 'comp-sci',    arxivCat: 'cs.LG',    displayCat: 'Computer Science · cs.LG',     fullName: 'Computer Science' },
  { label: 'Physics',     slug: 'physics',     arxivCat: 'cond-mat', displayCat: 'Physics · cond-mat',           fullName: 'Physics' },
  { label: 'Math',        slug: 'math',        arxivCat: 'math.CO',  displayCat: 'Mathematics · math.CO',        fullName: 'Mathematics' },
  { label: 'Biology',     slug: 'biology',     arxivCat: 'q-bio.NC', displayCat: 'Quantitative Biology · q-bio.NC', fullName: 'Biology' },
  { label: 'Finance',     slug: 'finance',     arxivCat: 'q-fin.GN', displayCat: 'Quantitative Finance · q-fin.GN', fullName: 'Finance' },
  { label: 'Statistics',  slug: 'statistics',  arxivCat: 'stat.ML',  displayCat: 'Statistics · stat.ML',         fullName: 'Statistics' },
  { label: 'Engineering', slug: 'engineering', arxivCat: 'eess.SP',  displayCat: 'Engineering · eess.SP',        fullName: 'Engineering' },
  { label: 'Economics',   slug: 'economics',   arxivCat: 'econ.GN',  displayCat: 'Economics · econ.GN',          fullName: 'Economics' },
];

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPageMeta(page, totalPages, activeSlug) {
  const cat = CATEGORIES.find(c => c.slug === activeSlug);

  if (cat) {
    return {
      title: `${cat.fullName} Research — Paper Plaine`,
      description: `Recent ${cat.fullName.toLowerCase()} research from arXiv, explained in plain English. Updated twice daily on Paper Plaine.`,
      canonical: `${DOMAIN}/${cat.slug}`,
    };
  }

  if (page === 1) {
    return {
      title: 'Paper Plaine — arXiv Research, Plain and Simple',
      description: 'Fresh research from arXiv explained in plain English, updated twice daily. Covering AI, physics, math, biology, economics, and more.',
      canonical: DOMAIN,
    };
  }

  return {
    title: `Archive, Page ${page} — Paper Plaine`,
    description: `Page ${page} of the Paper Plaine archive — recent arXiv research explained in plain English.`,
    canonical: `${DOMAIN}/page/${page}`,
  };
}

function getJsonLd(papers, meta, page, totalPages, activeSlug) {
  const hasPart = papers.map(p => ({
    '@type': 'ScholarlyArticle',
    headline: p.title,
    author: p.authors,
    url: `https://arxiv.org/abs/${p.id}`,
    datePublished: p.published,
    description: p.summary,
    isPartOf: { '@type': 'WebSite', name: 'Paper Plaine', url: DOMAIN },
  }));

  const isHome = activeSlug === null && page === 1;

  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${DOMAIN}/#website`,
      name: 'Paper Plaine',
      url: DOMAIN,
      description: 'arXiv research papers explained in plain English, updated twice daily.',
      inLanguage: 'en',
    },
    {
      '@type': 'CollectionPage',
      '@id': `${meta.canonical}#page`,
      name: meta.title,
      url: meta.canonical,
      description: meta.description,
      isPartOf: { '@id': `${DOMAIN}/#website` },
      hasPart,
      ...(isHome && {
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: DOMAIN }],
        },
      }),
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function renderEntry(paper, isLast) {
  const border = isLast
    ? 'border-bottom: 6px double var(--rule);'
    : 'border-bottom: 3px solid var(--rule);';
  return `
  <article class="entry" style="${border}">
    <div class="entry-meta">
      <span class="category">${escapeHtml(paper.categoryDisplay)}</span>
      <span>${escapeHtml(paper.publishedFormatted)}</span>
    </div>
    <h2 class="entry-title">${escapeHtml(paper.title)}</h2>
    ${paper.subtitle ? `<p class="entry-subtitle"><svg class="entry-plane" aria-hidden="true"><use href="#plane"/></svg>${escapeHtml(paper.subtitle)}</p>` : ''}
    <p class="byline">
      ${escapeHtml(paper.authors)}
      <br><span class="arxiv-id">arXiv:${escapeHtml(paper.id)}</span>
    </p>
    <div class="entry-body">
      <div class="col-summary">
        <div class="section-label">Summary</div>
        <p class="summary-text">${escapeHtml(paper.summary)}</p>
      </div>
      <div class="col-divider"></div>
      <div class="col-matters">
        <div class="section-label">Why it matters</div>
        <p class="matters-text">${escapeHtml(paper.whyItMatters)}</p>
      </div>
    </div>
    <div class="entry-footer">
      <a href="https://arxiv.org/abs/${escapeHtml(paper.id)}" class="read-link" target="_blank" rel="noopener">Read on arXiv</a>
      <span class="stamp">Posted on arXiv · ${escapeHtml(paper.publishedFormatted)}</span>
    </div>
  </article>`;
}

function renderPagination(page, totalPages, baseUrl) {
  if (totalPages <= 1) return '';

  const pageUrl = p => p === 1 ? (baseUrl || '/') : `${baseUrl || ''}/page/${p}`;

  const newer = page > 1
    ? `<a href="${pageUrl(page - 1)}" class="page-nav">← Newer</a>`
    : `<span class="page-nav page-nav--off">← Newer</span>`;

  const older = page < totalPages
    ? `<a href="${pageUrl(page + 1)}" class="page-nav">Older →</a>`
    : `<span class="page-nav page-nav--off">Older →</span>`;

  const nums = Array.from({ length: totalPages }, (_, i) => i + 1).map(p =>
    p === page
      ? `<span class="page-num page-num--active">${p}</span>`
      : `<a href="${pageUrl(p)}" class="page-num">${p}</a>`
  ).join('');

  return `
  <nav class="pagination" aria-label="Page navigation">
    ${newer}
    <div class="page-numbers">${nums}</div>
    ${older}
  </nav>`;
}

export function generateHTML(papers, { page = 1, totalPages = 1, activeSlug = null, baseUrl = '' } = {}) {
  const meta = getPageMeta(page, totalPages, activeSlug);
  const jsonLd = getJsonLd(papers, meta, page, totalPages, activeSlug);

  const prevUrl = page > 1
    ? (page === 2 ? (baseUrl || '/') : `${baseUrl || ''}/page/${page - 1}`)
    : null;
  const nextUrl = page < totalPages ? `${baseUrl || ''}/page/${page + 1}` : null;

  const navLinks = CATEGORIES.map(cat => {
    const active = cat.slug === activeSlug ? ' class="active"' : '';
    return `<a href="/${cat.slug}"${active}>${escapeHtml(cat.label)}</a>`;
  }).join('\n    ');

  const archiveActive = activeSlug === null ? ' active' : '';
  const archiveLink = `<a href="/" class="nav-archive${archiveActive}">Archive</a>`;

  const entriesHTML = papers.map((p, i) => renderEntry(p, i === papers.length - 1)).join('\n');
  const paginationHTML = renderPagination(page, totalPages, baseUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${escapeHtml(meta.canonical)}">
${prevUrl ? `<link rel="prev" href="${escapeHtml(DOMAIN + prevUrl)}">` : ''}
${nextUrl ? `<link rel="next" href="${escapeHtml(DOMAIN + nextUrl)}">` : ''}

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Paper Plaine">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:url" content="${escapeHtml(meta.canonical)}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">

<!-- JSON-LD structured data -->
<script type="application/ld+json">${jsonLd}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Newsreader:ital,wght@0,400..600;1,400..600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f1ebdc; --ink: #1d1812; --ink-soft: #3d3528;
    --muted: #7a6b54; --rule: #1d1812; --accent: #9a3a2a; --icon-grey: #8c857a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-font-smoothing: antialiased; }
  body {
    background: var(--bg); color: var(--ink);
    font-family: 'Newsreader', Georgia, serif; font-size: 18px; line-height: 1.55;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(154,58,42,.04), transparent 40%),
      radial-gradient(circle at 80% 60%, rgba(0,0,0,.03), transparent 40%);
  }
  .page { max-width: 760px; margin: 0 auto; padding: 56px 24px 80px; }
  .plane-symbol { display: none; }

  /* Masthead */
  .masthead { text-align: center; padding: 0 0 56px; border-bottom: 1px solid var(--rule); }
  .title {
    display: flex; justify-content: space-between; align-items: center; width: 100%;
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(40px, 9.4vw, 78px); line-height: .95;
    letter-spacing: -.01em; color: var(--ink); padding: 0 0 6px;
  }
  .title .letter { display: inline-block; text-transform: uppercase; font-variation-settings: 'opsz' 96; }
  .title .letter--grey { color: #888; }
  .title-plane { width: .62em; height: .62em; color: var(--icon-grey); transform: rotate(-12deg); flex-shrink: 0; }
  .tagline {
    font-family: 'Newsreader', serif; font-style: italic; font-size: 20px;
    color: var(--icon-grey); max-width: 540px; margin-left: auto; margin-right: auto;
  }

  /* Nav */
  .nav {
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center;
    gap: 10px 14px; padding: 18px 0; border-bottom: 1px solid var(--rule);
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
    text-transform: uppercase; letter-spacing: .1em;
  }
  .nav a {
    color: var(--ink-soft); text-decoration: none; padding: 4px 2px;
    border-bottom: 2px solid transparent; white-space: nowrap;
    transition: border-color .2s, color .2s;
  }
  .nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }
  .nav a.active { color: var(--ink); border-bottom-color: var(--ink); }
  .nav-archive {
    flex-basis: 100%; text-align: center;
    border-top: 1px dotted var(--muted); padding-top: 14px !important; margin-top: 4px;
    border-bottom: none !important;
  }
  .nav-archive:hover { border-bottom: none !important; }

  /* Entries */
  .entry { padding: 50px 0 44px; }
  .entry-meta {
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: .16em; color: var(--muted); margin-bottom: 16px;
  }
  .category { color: var(--accent); font-weight: 500; }
  .entry-title {
    font-family: 'Newsreader', serif; font-weight: 600;
    font-size: clamp(26px, 5.2vw, 34px); line-height: 1.15;
    letter-spacing: -.015em; color: var(--ink); margin-bottom: 6px;
  }
  .entry-subtitle {
    font-family: 'Newsreader', serif; font-style: italic; font-size: 20px;
    color: var(--icon-grey); margin-bottom: 14px; line-height: 1.3;
  }
  .entry-plane {
    width: .82em; height: .82em; color: var(--icon-grey);
    margin-right: .34em; vertical-align: -.1em; transform: rotate(-12deg); display: inline-block;
  }
  .byline {
    font-family: 'Newsreader', serif; font-style: italic; font-size: 15px;
    color: var(--ink-soft); margin-bottom: 30px; padding-bottom: 18px;
    border-bottom: 1px dotted var(--muted);
  }
  .byline .arxiv-id {
    font-family: 'JetBrains Mono', monospace; font-style: normal;
    font-size: 11px; color: var(--muted); letter-spacing: .05em;
  }
  .entry-body { display: grid; grid-template-columns: 1fr 1px 1fr; column-gap: 26px; align-items: start; }
  .col-divider { background: var(--muted); opacity: .3; align-self: stretch; }
  .section-label {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: .2em; color: var(--accent);
    margin-bottom: 10px; display: flex; align-items: center; gap: 10px;
  }
  .section-label::before { content: ""; display: inline-block; width: 16px; height: 1px; background: var(--accent); }
  .summary-text { font-size: 16.5px; font-weight: 600; line-height: 1.55; color: var(--ink); }
  .matters-text { font-size: 16px; line-height: 1.6; color: var(--ink); }
  .entry-footer {
    margin-top: 32px; padding-top: 18px; border-top: 1px dotted var(--muted);
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: .12em;
  }
  .read-link { color: var(--ink); text-decoration: none; border-bottom: 1.5px solid var(--accent); padding-bottom: 2px; transition: color .2s; }
  .read-link:hover { color: var(--accent); }
  .read-link::after { content: " →"; }
  .stamp { color: var(--muted); font-size: 10px; }

  /* Pagination */
  .pagination {
    display: flex; justify-content: space-between; align-items: center;
    padding: 36px 0 0; border-top: 1px solid var(--rule);
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: .12em;
  }
  .page-nav { color: var(--ink); text-decoration: none; border-bottom: 1.5px solid var(--accent); padding-bottom: 2px; transition: color .2s; }
  .page-nav:hover { color: var(--accent); }
  .page-nav--off { color: var(--muted); border-bottom: none; cursor: default; }
  .page-numbers { display: flex; gap: 16px; }
  .page-num { color: var(--muted); text-decoration: none; letter-spacing: .12em; }
  .page-num:hover { color: var(--accent); }
  .page-num--active { color: var(--ink); font-weight: 500; }

  /* Footer */
  .site-footer {
    text-align: center; padding: 40px 0 0;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: .2em; color: var(--muted); line-height: 1.8;
  }

  @media (max-width: 640px) {
    .page { padding: 32px 18px 60px; }
    body { font-size: 17px; }
    .title { font-size: 38px; letter-spacing: -.02em; }
    .nav { gap: 6px 12px; }
    .entry-meta { flex-direction: column; gap: 4px; }
    .entry-body { grid-template-columns: 1fr; row-gap: 28px; }
    .col-divider { display: none; }
    .entry-footer { flex-direction: column; gap: 10px; align-items: flex-start; }
    .pagination { flex-direction: column; gap: 16px; align-items: center; }
  }
</style>
</head>
<body>
<svg class="plane-symbol" xmlns="http://www.w3.org/2000/svg">
  <symbol id="plane" viewBox="0 0 24 24">
    <path d="M22 2 L2 9 L11 13 Z" fill="currentColor" opacity="0.65"/>
    <path d="M22 2 L11 13 L15 22 Z" fill="currentColor" opacity="1"/>
  </symbol>
</svg>
<div class="page">
  <header class="masthead">
    <h1 class="title">
      <span class="letter">P</span><span class="letter">A</span><span class="letter">P</span><span class="letter">E</span><span class="letter">R</span>
      <svg class="title-plane" aria-hidden="true"><use href="#plane"/></svg>
      <span class="letter">P</span><span class="letter">L</span><span class="letter letter--grey">A</span><span class="letter letter--grey">I</span><span class="letter">N</span><span class="letter">E</span>
    </h1>
    <p class="tagline">Fresh research, plain and simple. Updated twice daily.</p>
  </header>
  <nav class="nav" aria-label="Categories">
    ${navLinks}
    ${archiveLink}
  </nav>
  <main id="entries">
    ${entriesHTML}
  </main>
  ${paginationHTML}
  <footer class="site-footer">
    <div>Paper Plaine &middot; Updated twice daily</div>
    <div>Source &middot; arXiv.org &middot; Cornell University</div>
  </footer>
</div>
</body>
</html>`;
}

function buildSitemap(urls) {
  const items = urls.map(({ url, lastmod }) =>
    `  <url>\n    <loc>${url}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`;
}

function buildRobotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`;
}

function buildLlmsTxt(allPapers) {
  const catLines = CATEGORIES
    .filter(c => allPapers.some(p => p.categoryLabel === c.label))
    .map(c => `- [${c.fullName}](${DOMAIN}/${c.slug}): Recent ${c.fullName.toLowerCase()} papers from arXiv, explained in plain English.`)
    .join('\n');

  const recentTitles = allPapers.slice(0, 5).map(p => `- "${p.title}" (arXiv:${p.id})`).join('\n');

  return `# Paper Plaine

> arXiv research papers explained in plain English, updated twice daily.

Paper Plaine summarizes recent academic research from Cornell's arXiv database. Each paper receives a plain-English summary and a "why it matters" explanation. The site updates automatically at 7 AM and 7 PM UTC with new papers across 9 subject areas.

## Categories

${catLines}

## Archive

The full archive of all papers is paginated at 12 per page, starting at ${DOMAIN}.

## Recent papers

${recentTitles}

## About

- Source data: arXiv.org (Cornell University)
- Summaries generated by: Claude AI (Anthropic)
- Update frequency: Twice daily
- Content license: summaries are original; linked papers are © their respective authors
`;
}

export async function generateSite(allPapers, publicDir) {
  const sitemapUrls = [];
  const today = new Date().toISOString().split('T')[0];

  // Clean up old generated directories
  await fs.rm(path.join(publicDir, 'page'), { recursive: true, force: true });
  for (const cat of CATEGORIES) {
    await fs.rm(path.join(publicDir, cat.slug), { recursive: true, force: true });
  }

  // Archive — paginated all-papers view
  const totalPages = Math.max(1, Math.ceil(allPapers.length / PAPERS_PER_PAGE));
  for (let page = 1; page <= totalPages; page++) {
    const slice = allPapers.slice((page - 1) * PAPERS_PER_PAGE, page * PAPERS_PER_PAGE);
    const html = generateHTML(slice, { page, totalPages, activeSlug: null, baseUrl: '' });
    if (page === 1) {
      await fs.writeFile(path.join(publicDir, 'index.html'), html);
      sitemapUrls.push({ url: DOMAIN, lastmod: today });
    } else {
      const dir = path.join(publicDir, 'page', String(page));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'index.html'), html);
      sitemapUrls.push({ url: `${DOMAIN}/page/${page}`, lastmod: today });
    }
  }

  // Per-category pages
  for (const cat of CATEGORIES) {
    const catPapers = allPapers.filter(p => p.categoryLabel === cat.label);
    if (catPapers.length === 0) continue;
    const dir = path.join(publicDir, cat.slug);
    await fs.mkdir(dir, { recursive: true });
    const html = generateHTML(catPapers, { page: 1, totalPages: 1, activeSlug: cat.slug, baseUrl: `/${cat.slug}` });
    await fs.writeFile(path.join(dir, 'index.html'), html);
    sitemapUrls.push({ url: `${DOMAIN}/${cat.slug}`, lastmod: today });
  }

  // sitemap.xml, robots.txt, llms.txt
  await fs.writeFile(path.join(publicDir, 'sitemap.xml'), buildSitemap(sitemapUrls));
  await fs.writeFile(path.join(publicDir, 'robots.txt'), buildRobotsTxt());
  await fs.writeFile(path.join(publicDir, 'llms.txt'), buildLlmsTxt(allPapers));

  return totalPages + CATEGORIES.filter(c => allPapers.some(p => p.categoryLabel === c.label)).length;
}
