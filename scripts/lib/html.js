import fs from 'fs/promises';
import path from 'path';

export const PAPERS_PER_PAGE = 12;
const DOMAIN = 'https://paperplaine.com';

export const CATEGORIES = [
  { label: 'AI',          slug: 'ai',          displayCat: 'Computer Science · AI',       fullName: 'AI',
    sources: [{ cat: 'cs.AI', count: 15 }, { cat: 'cs.LG', count: 15 }, { cat: 'cs.CL', count: 10 }] },
  { label: 'Comp Sci',    slug: 'comp-sci',    displayCat: 'Computer Science',            fullName: 'Computer Science',
    sources: [{ cat: 'cs.CR', count: 10 }, { cat: 'cs.CV', count: 5 }] },
  { label: 'Physics',     slug: 'physics',     displayCat: 'Physics',                     fullName: 'Physics',
    sources: [{ cat: 'quant-ph', count: 10 }, { cat: 'physics.soc-ph', count: 5 }] },
  { label: 'Math',        slug: 'math',        displayCat: 'Mathematics',                 fullName: 'Mathematics',
    sources: [{ cat: 'math.OC', count: 10 }, { cat: 'math.CO', count: 5 }] },
  { label: 'Biology',     slug: 'biology',     displayCat: 'Quantitative Biology',        fullName: 'Biology',
    sources: [{ cat: 'q-bio.NC', count: 8 }, { cat: 'q-bio.QM', count: 7 }] },
  { label: 'Finance',     slug: 'finance',     displayCat: 'Quantitative Finance',        fullName: 'Finance',
    sources: [{ cat: 'q-fin.GN', count: 7 }, { cat: 'q-fin.TR', count: 5 }] },
  { label: 'Statistics',  slug: 'statistics',  displayCat: 'Statistics',                  fullName: 'Statistics',
    sources: [{ cat: 'stat.ML', count: 10 }, { cat: 'stat.AP', count: 5 }] },
  { label: 'Engineering', slug: 'engineering', displayCat: 'Engineering',                 fullName: 'Engineering',
    sources: [{ cat: 'eess.SP', count: 6 }, { cat: 'eess.IV', count: 6 }] },
  { label: 'Economics',   slug: 'economics',   displayCat: 'Economics',                   fullName: 'Economics',
    sources: [{ cat: 'econ.GN', count: 7 }, { cat: 'econ.EM', count: 5 }] },
];

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateSlug(title, existingSlugs = new Set()) {
  let base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  if (base.length > 80) {
    base = base.slice(0, 80).replace(/-[^-]*$/, '');
  }
  if (!existingSlugs.has(base)) return base;
  let n = 2;
  while (existingSlugs.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function ensureSlugs(papers) {
  const used = new Set(papers.filter(p => p.slug).map(p => p.slug));
  for (const p of papers) {
    if (!p.slug) {
      p.slug = generateSlug(p.title, used);
      used.add(p.slug);
    }
  }
}

function truncateDesc(str, max = 155) {
  if (str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, '') + '…';
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
    url: p.slug ? `${DOMAIN}/papers/${p.slug}` : `https://arxiv.org/abs/${p.id}`,
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

const CSS = `
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
  .nav-bottom {
    flex-basis: 100%; display: flex; justify-content: space-between; align-items: center;
    border-top: 1px dotted var(--muted); padding-top: 14px; margin-top: 4px;
  }
  .nav-archive { border-bottom: none !important; }
  .nav-archive:hover { border-bottom: none !important; }
  .nav-rss {
    display: flex; align-items: center; gap: 5px; color: var(--muted);
    border-bottom: none !important;
  }
  .nav-rss:hover { color: var(--accent); border-bottom: none !important; }

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
  .entry-title-link { color: inherit; text-decoration: none; transition: color .2s; }
  .entry-title-link:hover { color: var(--accent); }
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

  /* Paper back-link */
  .paper-back {
    padding: 28px 0 0; display: flex; gap: 24px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: .12em;
  }
  .paper-back a { color: var(--ink-soft); text-decoration: none; border-bottom: 1.5px solid var(--accent); padding-bottom: 2px; transition: color .2s; }
  .paper-back a:hover { color: var(--accent); }

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

  /* Stats sidebar */
  .site-sidebar {
    display: none;
    position: fixed;
    left: calc(50% - 524px);
    top: 248px;
    width: 120px;
  }
  @media (min-width: 1100px) { .site-sidebar { display: block; } }
  .sidebar-stat { margin-bottom: 28px; }
  .sidebar-num {
    display: block;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 800; font-size: 34px; line-height: 1;
    color: var(--ink); font-variation-settings: 'opsz' 96;
  }
  .sidebar-label {
    display: block; margin-top: 5px;
    font-family: 'Newsreader', serif; font-style: italic;
    font-size: 13.5px; line-height: 1.35; color: var(--muted);
  }

  /* About page */
  .about-page { padding: 48px 0 0; }
  .about-heading {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800;
    font-size: clamp(24px, 4vw, 34px); color: var(--ink); margin-bottom: 32px;
    letter-spacing: -.01em;
  }
  .about-body p {
    font-size: 18px; line-height: 1.7; color: var(--ink); margin-bottom: 22px;
  }
  .about-subheading {
    font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700;
    font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--ink); margin: 32px 0 10px;
  }
  .about-list { padding-left: 1.4em; margin-bottom: 22px; }
  .about-list li { font-size: 18px; line-height: 1.7; color: var(--ink); margin-bottom: 4px; }
  .about-link { color: var(--ink); border-bottom: 1.5px solid var(--accent); text-decoration: none; padding-bottom: 1px; transition: color .2s; }
  .about-link:hover { color: var(--accent); }
  .about-contact {
    margin-top: 48px; padding-top: 28px; border-top: 1px dotted var(--muted);
    display: flex; align-items: center; gap: 16px;
  }
  .about-email {
    font-family: 'JetBrains Mono', monospace; font-size: 14px;
    color: var(--ink); text-decoration: none; letter-spacing: .04em;
    border-bottom: 1.5px solid var(--accent); padding-bottom: 2px;
    align-self: flex-start; transition: color .2s;
  }
  .about-email:hover { color: var(--accent); }

  /* Empty category */
  .empty-cat {
    padding: 72px 0; text-align: center; color: var(--muted);
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    text-transform: uppercase; letter-spacing: .14em;
  }

  /* Footer */
  .site-footer {
    padding: 40px 0 0; border-top: 1px solid var(--rule);
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: .2em; color: var(--muted);
    line-height: 1.8; text-align: center;
  }
  .footer-nav {
    display: flex; justify-content: center; gap: 28px;
    padding: 18px 0; margin-bottom: 14px;
    border-bottom: 1px dotted var(--muted); font-size: 11.5px; letter-spacing: .1em;
  }
  .footer-nav a {
    color: var(--ink-soft); text-decoration: none; padding: 4px 2px;
    border-bottom: 2px solid transparent; white-space: nowrap;
    transition: border-color .2s, color .2s;
  }
  .footer-nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }

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
`;

function buildSidebarHTML(allPapers) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStr = new Date().toISOString().slice(0, 7);
  const total = allPapers.length;
  const today = allPapers.filter(p => (p.fetchedAt || '').startsWith(todayStr)).length;
  const month = allPapers.filter(p => (p.fetchedAt || '').startsWith(monthStr)).length;
  const stat = (num, label) => `
  <div class="sidebar-stat">
    <span class="sidebar-num">${num}</span>
    <span class="sidebar-label">${label}</span>
  </div>`;
  return `<aside class="site-sidebar" aria-label="Site statistics">${stat(total, 'Total Posts')}${stat(today, 'New Posts Today')}${stat(month, 'New Posts This Month')}</aside>`;
}

function buildPage({ title, description, canonical, prevUrl = null, nextUrl = null, jsonLd, activeSlug, ogType = 'website', sidebarHTML = '', mainHTML }) {
  const navLinks = CATEGORIES.map(cat => {
    const active = cat.slug === activeSlug ? ' class="active"' : '';
    return `<a href="/${cat.slug}"${active}>${escapeHtml(cat.label)}</a>`;
  }).join('\n    ');
  const archiveActive = activeSlug === null ? ' active' : '';
  const bottomRow = `<div class="nav-bottom">
    <a href="/" class="nav-archive${archiveActive}">Archive/All</a>
    <a href="/feed.xml" class="nav-rss" title="RSS feed"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><circle cx="2" cy="10" r="1.5"/><path d="M1 6.5a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M1 2.5a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> RSS</a>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
${prevUrl ? `<link rel="prev" href="${escapeHtml(DOMAIN + prevUrl)}">` : ''}
${nextUrl ? `<link rel="next" href="${escapeHtml(DOMAIN + nextUrl)}">` : ''}

<!-- Open Graph -->
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Paper Plaine">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">

<!-- RSS autodiscovery -->
<link rel="alternate" type="application/rss+xml" title="Paper Plaine" href="${DOMAIN}/feed.xml">

<!-- JSON-LD structured data -->
<script type="application/ld+json">${jsonLd}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Newsreader:ital,wght@0,400..600;1,400..600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<svg class="plane-symbol" xmlns="http://www.w3.org/2000/svg">
  <symbol id="plane" viewBox="0 0 24 24">
    <path d="M22 2 L2 9 L11 13 Z" fill="currentColor" opacity="0.65"/>
    <path d="M22 2 L11 13 L15 22 Z" fill="currentColor" opacity="1"/>
  </symbol>
</svg>
${sidebarHTML}
<div class="page">
  <header class="masthead">
    <h1 class="title">
      <span class="letter">P</span><span class="letter">A</span><span class="letter">P</span><span class="letter">E</span><span class="letter">R</span>
      <svg class="title-plane" aria-hidden="true"><use href="#plane"/></svg>
      <span class="letter">P</span><span class="letter">L</span><span class="letter letter--grey">A</span><span class="letter letter--grey">I</span><span class="letter">N</span><span class="letter">E</span>
    </h1>
    <p class="tagline">Fresh research, simply explained. Updates twice daily.</p>
  </header>
  <nav class="nav" aria-label="Categories">
    ${navLinks}
    ${bottomRow}
  </nav>
  <main id="entries">
    ${mainHTML}
  </main>
  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Site links">
      <a href="/about">About/Contact</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
    <div>Paper Plaine &middot; Updated twice daily</div>
    <div>Source &middot; arXiv.org &middot; Cornell University</div>
  </footer>
</div>
</body>
</html>`;
}

function renderEntry(paper, isLast, { detail = false } = {}) {
  const border = isLast
    ? 'border-bottom: 6px double var(--rule);'
    : 'border-bottom: 3px solid var(--rule);';
  const titleContent = detail || !paper.slug
    ? escapeHtml(paper.title)
    : `<a href="/papers/${escapeHtml(paper.slug)}" class="entry-title-link">${escapeHtml(paper.title)}</a>`;
  return `
  <article class="entry" style="${border}">
    <div class="entry-meta">
      <span class="category">${escapeHtml(paper.categoryDisplay)}</span>
      <span>${paper.fetchedAt ? new Date(paper.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : escapeHtml(paper.publishedFormatted)}</span>
    </div>
    <h2 class="entry-title">${titleContent}</h2>
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

export function generateHTML(papers, { page = 1, totalPages = 1, activeSlug = null, baseUrl = '', sidebarHTML = '' } = {}) {
  const meta = getPageMeta(page, totalPages, activeSlug);
  const jsonLd = getJsonLd(papers, meta, page, totalPages, activeSlug);

  const prevUrl = page > 1
    ? (page === 2 ? (baseUrl || '/') : `${baseUrl || ''}/page/${page - 1}`)
    : null;
  const nextUrl = page < totalPages ? `${baseUrl || ''}/page/${page + 1}` : null;

  const entriesHTML = papers.length > 0
    ? papers.map((p, i) => renderEntry(p, i === papers.length - 1)).join('\n')
    : '<p class="empty-cat">No papers yet in this category — check back soon.</p>';
  const paginationHTML = renderPagination(page, totalPages, baseUrl);

  return buildPage({
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical,
    prevUrl,
    nextUrl,
    jsonLd,
    activeSlug,
    ogType: 'website',
    sidebarHTML,
    mainHTML: entriesHTML + paginationHTML,
  });
}

export function generatePaperHTML(paper, sidebarHTML = '') {
  const cat = CATEGORIES.find(c => c.label === paper.categoryLabel);
  const description = truncateDesc(paper.summary);
  const canonical = `${DOMAIN}/papers/${paper.slug}`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${DOMAIN}/#website`,
        name: 'Paper Plaine',
        url: DOMAIN,
        description: 'arXiv research papers explained in plain English, updated twice daily.',
        inLanguage: 'en',
      },
      {
        '@type': 'ScholarlyArticle',
        '@id': `${canonical}#article`,
        headline: paper.title,
        description: paper.summary,
        author: paper.authors,
        url: `https://arxiv.org/abs/${paper.id}`,
        datePublished: paper.published,
        isPartOf: { '@id': `${DOMAIN}/#website` },
      },
    ],
  });

  const backLinks = cat
    ? `<div class="paper-back"><a href="/${cat.slug}">← ${escapeHtml(cat.label)}</a><a href="/">Archive</a></div>`
    : `<div class="paper-back"><a href="/">← Archive</a></div>`;

  return buildPage({
    title: `${paper.title} — Paper Plaine`,
    description,
    canonical,
    jsonLd,
    activeSlug: cat?.slug ?? null,
    ogType: 'article',
    sidebarHTML,
    mainHTML: backLinks + renderEntry(paper, true, { detail: true }),
  });
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

function buildRssFeed(allPapers) {
  const items = allPapers.map(p => {
    const link = p.slug ? `${DOMAIN}/papers/${p.slug}` : `https://arxiv.org/abs/${p.id}`;
    const subtitle = p.subtitle ? escapeHtml(p.subtitle) : escapeHtml(p.title);
    const fullContent = `<![CDATA[<p><em>${p.subtitle || ''}</em></p><p>${p.summary}</p><p><strong>Why it matters:</strong> ${p.whyItMatters}</p>]]>`;
    return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.published).toUTCString()}</pubDate>
      <author>${escapeHtml(p.authors)}</author>
      <category>${escapeHtml(p.categoryLabel)}</category>
      <description>${subtitle}</description>
      <content:encoded>${fullContent}</content:encoded>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Paper Plaine</title>
    <link>${DOMAIN}</link>
    <description>Fresh research from arXiv explained in plain English, updated twice daily.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${DOMAIN}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
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

function generateTermsHTML(sidebarHTML = '') {
  const mainHTML = `
  <article class="about-page">
    <h2 class="about-heading">Terms of Use</h2>
    <div class="about-body">
      <p>By using Paper Plaine (&ldquo;the site&rdquo;), you agree to these Terms of Use. If you do not agree, please do not use the site.</p>

      <h3 class="about-subheading">AI-generated content</h3>
      <p>A significant portion of the content on Paper Plaine &mdash; including paper subtitles, summaries, and &ldquo;Why It Matters&rdquo; sections &mdash; is generated by Claude, an AI system made by Anthropic. While we select papers using quality filters and the source research is drawn from Cornell University&rsquo;s arXiv database, the plain-English descriptions are produced automatically by a large language model without human editorial review of each item.</p>
      <p>AI-generated content can contain errors, omissions, oversimplifications, or misrepresentations of the underlying research. Paper Plaine makes no warranty, express or implied, that any summary, subtitle, or description accurately reflects the content, findings, or conclusions of the original paper. You should read the original paper before relying on any information presented here.</p>

      <h3 class="about-subheading">No professional advice</h3>
      <p>Nothing on Paper Plaine constitutes scientific, medical, financial, legal, or any other form of professional advice. The site is intended for general informational and educational purposes only. Do not make decisions based solely on content found here.</p>

      <h3 class="about-subheading">Accuracy &amp; liability</h3>
      <p>Paper Plaine is provided &ldquo;as is&rdquo; without any representations or warranties of any kind. To the fullest extent permitted by law, Paper Plaine and its operators disclaim all liability for any inaccuracies, errors, or omissions in the content, and for any loss or damage of any kind arising from your use of or reliance on the site or its content &mdash; including content that is the result of AI error or hallucination.</p>

      <h3 class="about-subheading">Source papers &amp; external links</h3>
      <p>All research papers linked on this site are published on arXiv and remain the work of their respective authors, subject to their original licences. Paper Plaine is not affiliated with arXiv or Cornell University. We are not responsible for the content of any external site, including arXiv or any other link that appears on this site.</p>

      <h3 class="about-subheading">Intellectual property</h3>
      <p>The plain-English summaries, subtitles, and site design are original works produced for Paper Plaine. You may share or quote from them for non-commercial purposes with attribution. Systematic scraping or reproduction of site content without permission is not permitted.</p>

      <h3 class="about-subheading">Changes to these terms</h3>
      <p>We may update these Terms of Use at any time. Changes will be posted on this page. Continued use of the site after changes are posted constitutes your acceptance of the revised terms.</p>

      <h3 class="about-subheading">Contact</h3>
      <p>Questions about these terms? Email us at <a href="mailto:hello@paperplaine.com" class="about-link">hello@paperplaine.com</a>.</p>
    </div>
  </article>`;

  return buildPage({
    title: 'Terms of Use — Paper Plaine',
    description: 'Terms of use for Paper Plaine, including an important notice about AI-generated content and limitations on accuracy.',
    canonical: `${DOMAIN}/terms`,
    jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Terms of Use — Paper Plaine', url: `${DOMAIN}/terms` }),
    activeSlug: null,
    sidebarHTML,
    mainHTML,
  });
}

function generatePrivacyHTML(sidebarHTML = '') {
  const mainHTML = `
  <article class="about-page">
    <h2 class="about-heading">Privacy Policy</h2>
    <div class="about-body">
      <p>This Privacy Policy describes how Paper Plaine (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) handles information when you visit paperplaine.com. We have tried to keep this as plain and simple as the rest of the site.</p>

      <h3 class="about-subheading">What we do not collect</h3>
      <p>Paper Plaine does not ask you to create an account, log in, or provide any personal information. There are no sign-up forms, comment sections, or user profiles. We do not collect, store, or sell personal data.</p>

      <h3 class="about-subheading">Hosting &amp; server logs</h3>
      <p>Paper Plaine is hosted on <a href="https://vercel.com" class="about-link">Vercel</a>. Like all web hosts, Vercel automatically collects standard server log data when you visit the site — including your IP address, browser type, referring URL, and pages visited. This data is used for security and operational purposes and is governed by <a href="https://vercel.com/legal/privacy-policy" class="about-link">Vercel&rsquo;s Privacy Policy</a>. We do not have access to individually identifiable log data.</p>

      <h3 class="about-subheading">Cookies</h3>
      <p>Paper Plaine does not set any cookies of its own. Vercel may set a cookie for performance and security purposes. This site loads fonts from Google Fonts; Google may collect data in connection with that request, subject to <a href="https://policies.google.com/privacy" class="about-link">Google&rsquo;s Privacy Policy</a>.</p>

      <h3 class="about-subheading">Third-party services</h3>
      <p>Paper Plaine uses the following third-party services to operate:</p>
      <ul class="about-list">
        <li><strong>Vercel</strong> &mdash; hosting and content delivery</li>
        <li><strong>Anthropic (Claude)</strong> &mdash; AI-generated summaries and subtitles for each paper</li>
        <li><strong>arXiv / Cornell University</strong> &mdash; source of all research papers</li>
        <li><strong>Google Fonts</strong> &mdash; web font delivery</li>
      </ul>
      <p>Each of these services operates under its own privacy policy. We encourage you to review them if you have concerns.</p>

      <h3 class="about-subheading">RSS feed</h3>
      <p>Paper Plaine offers an <a href="/feed.xml" class="about-link">RSS feed</a>. If you subscribe through a third-party RSS reader, that service may collect data about your reading habits according to its own privacy policy.</p>

      <h3 class="about-subheading">Email contact</h3>
      <p>If you contact us at <a href="mailto:hello@paperplaine.com" class="about-link">hello@paperplaine.com</a>, we will use your email address only to respond to your message. We do not add you to any mailing list or share your address with third parties.</p>

      <h3 class="about-subheading">Changes to this policy</h3>
      <p>We may update this policy from time to time. Any changes will be posted on this page. Continued use of the site after changes are posted constitutes your acceptance of the updated policy.</p>

      <h3 class="about-subheading">Contact</h3>
      <p>Questions about this policy? Email us at <a href="mailto:hello@paperplaine.com" class="about-link">hello@paperplaine.com</a>.</p>
    </div>
  </article>`;

  return buildPage({
    title: 'Privacy Policy — Paper Plaine',
    description: 'Privacy policy for Paper Plaine. We do not collect personal data. Learn how hosting, fonts, and third-party services handle information.',
    canonical: `${DOMAIN}/privacy`,
    jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Privacy Policy — Paper Plaine', url: `${DOMAIN}/privacy` }),
    activeSlug: null,
    sidebarHTML,
    mainHTML,
  });
}

function generateAboutHTML(sidebarHTML = '') {
  const mainHTML = `
  <article class="about-page">
    <h2 class="about-heading">About / Contact</h2>
    <div class="about-body">
      <p>PAPER PLAINE surfaces fresh academic research from Cornell University's arXiv database and explains it in plain English. Twice each day, a minimum of 6 new papers from the last 30 days are automatically fetched across nine subject areas: AI, Computer Science, Physics, Mathematics, Biology, Finance, Statistics, Engineering, and Economics.</p>
      <p>Before any paper reaches the site, it passes through a series of quality filters. Only first-version submissions are considered (revisions are excluded). Abstracts must fall within a normal length range, and papers are scored for positive signals: venue acceptance (NeurIPS, ICML, Nature, PNAS, and others), cross-disciplinary listings, and appropriate page counts. The highest-scoring papers per category each run are the ones that are posted.</p>
      <p>The layman's term paper subtitles, the two-to-three sentence Summary, and the Why It Matters section are generated by Claude, Anthropic's AI. The site was built and is maintained using <a href="https://claude.ai/code" class="about-link">Claude Code</a> and is hosted on <a href="https://vercel.com" class="about-link">Vercel</a>.</p>
    </div>
    <div class="about-contact">
      <span class="section-label">Contact</span>
      <a href="mailto:hello@paperplaine.com" class="about-email">hello@paperplaine.com</a>
    </div>
  </article>`;

  return buildPage({
    title: 'About — Paper Plaine',
    description: 'Paper Plaine surfaces fresh arXiv research and explains it in plain English, updated twice daily. Built with Claude Code and hosted on Vercel.',
    canonical: `${DOMAIN}/about`,
    jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About — Paper Plaine', url: `${DOMAIN}/about` }),
    activeSlug: null,
    sidebarHTML,
    mainHTML,
  });
}

export async function generateSite(allPapers, publicDir) {
  const sitemapUrls = [];
  const today = new Date().toISOString().split('T')[0];

  // Clean up old generated directories
  await fs.rm(path.join(publicDir, 'page'), { recursive: true, force: true });
  await fs.rm(path.join(publicDir, 'papers'), { recursive: true, force: true });
  for (const cat of CATEGORIES) {
    await fs.rm(path.join(publicDir, cat.slug), { recursive: true, force: true });
  }

  const sidebarHTML = buildSidebarHTML(allPapers);

  // Archive — paginated all-papers view
  const totalPages = Math.max(1, Math.ceil(allPapers.length / PAPERS_PER_PAGE));
  for (let page = 1; page <= totalPages; page++) {
    const slice = allPapers.slice((page - 1) * PAPERS_PER_PAGE, page * PAPERS_PER_PAGE);
    const html = generateHTML(slice, { page, totalPages, activeSlug: null, baseUrl: '', sidebarHTML });
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
    const dir = path.join(publicDir, cat.slug);
    await fs.mkdir(dir, { recursive: true });
    const html = generateHTML(catPapers, { page: 1, totalPages: 1, activeSlug: cat.slug, baseUrl: `/${cat.slug}`, sidebarHTML });
    await fs.writeFile(path.join(dir, 'index.html'), html);
    sitemapUrls.push({ url: `${DOMAIN}/${cat.slug}`, lastmod: today });
  }

  // Per-paper pages
  for (const paper of allPapers) {
    if (!paper.slug) continue;
    const dir = path.join(publicDir, 'papers', paper.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), generatePaperHTML(paper, sidebarHTML));
    sitemapUrls.push({ url: `${DOMAIN}/papers/${paper.slug}`, lastmod: today });
  }

  // About/Contact page
  const aboutDir = path.join(publicDir, 'about');
  await fs.mkdir(aboutDir, { recursive: true });
  await fs.writeFile(path.join(aboutDir, 'index.html'), generateAboutHTML(sidebarHTML));
  sitemapUrls.push({ url: `${DOMAIN}/about`, lastmod: today });

  // Privacy page
  const privacyDir = path.join(publicDir, 'privacy');
  await fs.mkdir(privacyDir, { recursive: true });
  await fs.writeFile(path.join(privacyDir, 'index.html'), generatePrivacyHTML(sidebarHTML));
  sitemapUrls.push({ url: `${DOMAIN}/privacy`, lastmod: today });

  // Terms page
  const termsDir = path.join(publicDir, 'terms');
  await fs.mkdir(termsDir, { recursive: true });
  await fs.writeFile(path.join(termsDir, 'index.html'), generateTermsHTML(sidebarHTML));
  sitemapUrls.push({ url: `${DOMAIN}/terms`, lastmod: today });

  // sitemap.xml, robots.txt, llms.txt, feed.xml
  await fs.writeFile(path.join(publicDir, 'sitemap.xml'), buildSitemap(sitemapUrls));
  await fs.writeFile(path.join(publicDir, 'robots.txt'), buildRobotsTxt());
  await fs.writeFile(path.join(publicDir, 'llms.txt'), buildLlmsTxt(allPapers));
  await fs.writeFile(path.join(publicDir, 'feed.xml'), buildRssFeed(allPapers));

  const paperPageCount = allPapers.filter(p => p.slug).length;
  return totalPages + CATEGORIES.filter(c => allPapers.some(p => p.categoryLabel === c.label)).length + paperPageCount + 3;
}
