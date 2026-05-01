import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/papers.json');
const HTML_PATH = path.join(__dirname, '../public/index.html');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  { label: 'AI',          arxivCat: 'cs.AI',    displayCat: 'Computer Science · cs.AI' },
  { label: 'Comp Sci',    arxivCat: 'cs.LG',    displayCat: 'Computer Science · cs.LG' },
  { label: 'Physics',     arxivCat: 'cond-mat', displayCat: 'Physics · cond-mat' },
  { label: 'Math',        arxivCat: 'math.CO',  displayCat: 'Mathematics · math.CO' },
  { label: 'Biology',     arxivCat: 'q-bio.NC', displayCat: 'Quantitative Biology · q-bio.NC' },
  { label: 'Finance',     arxivCat: 'q-fin.GN', displayCat: 'Quantitative Finance · q-fin.GN' },
  { label: 'Statistics',  arxivCat: 'stat.ML',  displayCat: 'Statistics · stat.ML' },
  { label: 'Engineering', arxivCat: 'eess.SP',  displayCat: 'Engineering · eess.SP' },
  { label: 'Economics',   arxivCat: 'econ.GN',  displayCat: 'Economics · econ.GN' },
];

const NAV_LABELS = CATEGORIES.map(c => c.label);

async function fetchArxivPapers(category, count = 25) {
  const url = `https://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${count}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv API error: ${res.status}`);
  const xml = await res.text();
  return parseAtomFeed(xml);
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}

function parseAtomFeed(xml) {
  const entries = [];
  const entryMatches = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  for (const match of entryMatches) {
    const entry = match[1];

    const rawId = extractTag(entry, 'id') ?? '';
    const id = rawId.replace(/https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '').trim();
    const title = (extractTag(entry, 'title') ?? '').replace(/\s+/g, ' ').trim();
    const abstract = (extractTag(entry, 'summary') ?? '').replace(/\s+/g, ' ').trim();
    const published = (extractTag(entry, 'published') ?? '').trim();

    const authorMatches = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)];
    const authors = authorMatches.map(m => m[1].trim());

    if (id && title && abstract) {
      entries.push({ id, title, abstract, authors, published });
    }
  }

  return entries;
}

async function summarizePaper(paper, categoryLabel) {
  const authorsStr = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `You write for Paper Plain, a website presenting academic research in plain English for general audiences.

Write two sections about this paper:

SUMMARY: 2–3 sentences. What did the researchers do and find? Plain English only — no jargon. Write as if explaining to a smart friend with no academic background.

WHY IT MATTERS: 2–4 sentences. What changes if this research is right? Who benefits? What does it connect to in everyday life or the broader world?

Paper title: ${paper.title}
Authors: ${authorsStr}
Category: ${categoryLabel}
Abstract: ${paper.abstract}

Respond ONLY with valid JSON in this exact format:
{"summary": "...", "whyItMatters": "..."}`
    }]
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEntry(paper, isLast) {
  const borderStyle = isLast ? 'border-bottom: 6px double var(--rule);' : 'border-bottom: 3px solid var(--rule);';
  return `
  <article class="entry" data-category="${escapeHtml(paper.categoryLabel)}" style="${borderStyle}">
    <div class="entry-meta">
      <span class="category">${escapeHtml(paper.categoryDisplay)}</span>
      <span>${escapeHtml(paper.publishedFormatted)}</span>
    </div>
    <h2 class="entry-title">
      <svg class="entry-plane" aria-hidden="true"><use href="#plane"/></svg>${escapeHtml(paper.title)}
    </h2>
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

function generateHTML(papers) {
  const navLinks = NAV_LABELS.map(label =>
    `<a href="#" data-filter="${escapeHtml(label)}">${escapeHtml(label)}</a>`
  ).join('\n    ');

  const entriesHTML = papers.map((p, i) => renderEntry(p, i === papers.length - 1)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Paper Plain — arXiv, made readable</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800&family=Newsreader:ital,wght@0,400..600;1,400..600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f1ebdc;
    --bg-deep: #ebe3d0;
    --ink: #1d1812;
    --ink-soft: #3d3528;
    --muted: #7a6b54;
    --rule: #1d1812;
    --accent: #9a3a2a;
    --accent-soft: #c97a5d;
    --icon-grey: #8c857a;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-font-smoothing: antialiased; }

  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Newsreader', Georgia, serif;
    font-size: 18px;
    line-height: 1.55;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(154, 58, 42, 0.04), transparent 40%),
      radial-gradient(circle at 80% 60%, rgba(0, 0, 0, 0.03), transparent 40%);
  }

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 24px 80px;
  }

  .plane-symbol { display: none; }

  .masthead {
    text-align: center;
    padding: 0 0 22px;
    border-bottom: 1px solid var(--rule);
  }

  .title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    font-family: 'Bricolage Grotesque', sans-serif;
    font-weight: 800;
    font-size: clamp(40px, 9.4vw, 78px);
    line-height: 0.95;
    letter-spacing: -0.01em;
    color: var(--ink);
    padding: 0 0 14px;
  }

  .title .letter {
    display: inline-block;
    text-transform: uppercase;
    font-variation-settings: 'opsz' 96;
  }

  .title-plane {
    width: 0.62em;
    height: 0.62em;
    color: var(--icon-grey);
    transform: rotate(-12deg);
    flex-shrink: 0;
  }

  .tagline {
    font-family: 'Newsreader', serif;
    font-style: italic;
    font-size: 20px;
    color: var(--icon-grey);
    margin-top: 18px;
    max-width: 540px;
    margin-left: auto;
    margin-right: auto;
  }

  .nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 10px 14px;
    padding: 18px 0;
    border-bottom: 1px solid var(--rule);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .nav a {
    color: var(--ink-soft);
    text-decoration: none;
    padding: 4px 2px;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: border-color 0.2s, color 0.2s;
    cursor: pointer;
  }

  .nav a:hover { color: var(--accent); border-bottom-color: var(--accent); }
  .nav a.active { color: var(--ink); border-bottom-color: var(--ink); }

  .entry {
    padding: 50px 0 44px;
  }

  .entry.hidden { display: none; }

  .entry-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--muted);
    margin-bottom: 16px;
  }

  .category {
    color: var(--accent);
    font-weight: 500;
  }

  .entry-title {
    font-family: 'Newsreader', serif;
    font-weight: 600;
    font-size: clamp(26px, 5.2vw, 34px);
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: var(--ink);
    margin-bottom: 14px;
  }

  .entry-plane {
    width: 0.82em;
    height: 0.82em;
    color: var(--icon-grey);
    margin-right: 0.34em;
    vertical-align: -0.04em;
    transform: rotate(-12deg);
    display: inline-block;
  }

  .byline {
    font-family: 'Newsreader', serif;
    font-style: italic;
    font-size: 15px;
    color: var(--ink-soft);
    margin-bottom: 30px;
    padding-bottom: 18px;
    border-bottom: 1px dotted var(--muted);
  }

  .byline .arxiv-id {
    font-family: 'JetBrains Mono', monospace;
    font-style: normal;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.05em;
  }

  .entry-body {
    display: grid;
    grid-template-columns: 1fr 1px 1fr;
    column-gap: 26px;
    align-items: start;
  }

  .col-divider {
    background: var(--muted);
    opacity: 0.3;
    align-self: stretch;
  }

  .section-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--accent);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-label::before {
    content: "";
    display: inline-block;
    width: 16px;
    height: 1px;
    background: var(--accent);
  }

  .summary-text {
    font-size: 16.5px;
    font-weight: 600;
    line-height: 1.55;
    color: var(--ink);
  }

  .matters-text {
    font-size: 16px;
    line-height: 1.6;
    color: var(--ink);
  }

  .entry-footer {
    margin-top: 32px;
    padding-top: 18px;
    border-top: 1px dotted var(--muted);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .read-link {
    color: var(--ink);
    text-decoration: none;
    border-bottom: 1.5px solid var(--accent);
    padding-bottom: 2px;
    transition: color 0.2s;
  }

  .read-link:hover { color: var(--accent); }
  .read-link::after { content: " →"; }

  .stamp {
    color: var(--muted);
    font-size: 10px;
  }

  .empty-state {
    padding: 60px 0;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
    display: none;
  }

  .site-footer {
    text-align: center;
    padding: 40px 0 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--muted);
    line-height: 1.8;
  }

  .site-footer em {
    font-family: 'Newsreader', serif;
    font-style: italic;
    text-transform: none;
    letter-spacing: 0;
    font-size: 13px;
    color: var(--ink-soft);
    display: block;
    margin-top: 12px;
  }

  @media (max-width: 640px) {
    .page { padding: 32px 18px 60px; }
    body { font-size: 17px; }
    .entry-meta { flex-direction: column; gap: 4px; }
    .entry-footer { flex-direction: column; gap: 10px; align-items: flex-start; }
    .nav { gap: 6px 12px; }
    .title { font-size: 38px; letter-spacing: -0.02em; }
    .entry-body {
      grid-template-columns: 1fr;
      row-gap: 28px;
    }
    .col-divider { display: none; }
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
      <span class="letter">P</span>
      <span class="letter">A</span>
      <span class="letter">P</span>
      <span class="letter">E</span>
      <span class="letter">R</span>
      <svg class="title-plane" aria-hidden="true"><use href="#plane"/></svg>
      <span class="letter">P</span>
      <span class="letter">L</span>
      <span class="letter">A</span>
      <span class="letter">I</span>
      <span class="letter">N</span>
      <span class="letter">E</span>
    </h1>
    <p class="tagline">Fresh research, plain and simple / Updated twice daily</p>
  </header>

  <nav class="nav" id="cat-nav">
    <a href="#" data-filter="all" class="active">All</a>
    ${navLinks}
  </nav>

  <div id="entries">
    ${entriesHTML}
  </div>
  <div class="empty-state" id="empty-state">No papers in this category yet.</div>

  <footer class="site-footer">
    <div>Paper Plaine · Updated twice daily</div>
    <div>Source · arXiv.org · Cornell University</div>
    <em>"Make it as simple as possible, but no simpler."</em>
  </footer>

</div>

<script>
  const nav = document.getElementById('cat-nav');
  const entries = document.querySelectorAll('.entry');
  const emptyState = document.getElementById('empty-state');

  nav.addEventListener('click', e => {
    const link = e.target.closest('a[data-filter]');
    if (!link) return;
    e.preventDefault();

    nav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');

    const filter = link.dataset.filter;
    let visible = 0;

    entries.forEach(entry => {
      const match = filter === 'all' || entry.dataset.category === filter;
      entry.classList.toggle('hidden', !match);
      if (match) visible++;
    });

    emptyState.style.display = visible === 0 ? 'block' : 'none';

    // Re-apply double-border to last visible entry
    entries.forEach(entry => entry.style.borderBottom = '');
    const visibleEntries = [...entries].filter(e => !e.classList.contains('hidden'));
    if (visibleEntries.length > 0) {
      visibleEntries.forEach((e, i) => {
        e.style.borderBottom = i === visibleEntries.length - 1
          ? '6px double var(--rule)'
          : '3px solid var(--rule)';
      });
    }
  });
</script>

</body>
</html>`;
}

async function run() {
  let papers = [];
  try {
    const data = await fs.readFile(DATA_PATH, 'utf-8');
    papers = JSON.parse(data);
  } catch {
    papers = [];
  }

  const existingIds = new Set(papers.map(p => p.id));

  // Pick 2 categories, avoiding those covered most recently
  const recentCats = new Set(papers.slice(0, 8).map(p => p.categoryLabel));
  const preferred = CATEGORIES.filter(c => !recentCats.has(c.label));
  const pool = preferred.length >= 2 ? preferred : CATEGORIES;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 2);

  const newPapers = [];

  for (const cat of selected) {
    try {
      console.log(`Fetching from ${cat.arxivCat}...`);
      const arxivPapers = await fetchArxivPapers(cat.arxivCat, 25);
      const candidate = arxivPapers.find(p => !existingIds.has(p.id));

      if (!candidate) {
        console.log(`  No new papers found in ${cat.arxivCat}`);
        continue;
      }

      console.log(`  Summarizing: ${candidate.title.slice(0, 80)}...`);
      const { summary, whyItMatters } = await summarizePaper(candidate, cat.label);

      const authorsStr = candidate.authors.slice(0, 3).join(', ') +
        (candidate.authors.length > 3 ? ' et al.' : '');

      newPapers.push({
        id: candidate.id,
        title: candidate.title,
        authors: authorsStr,
        categoryLabel: cat.label,
        categoryDisplay: cat.displayCat,
        published: candidate.published,
        publishedFormatted: formatDate(candidate.published),
        summary,
        whyItMatters,
        fetchedAt: new Date().toISOString(),
      });

      existingIds.add(candidate.id);
      console.log(`  Done: ${cat.label}`);
    } catch (err) {
      console.error(`  Error processing ${cat.label}:`, err.message);
    }
  }

  if (newPapers.length === 0) {
    console.log('No new papers added this run.');
    return;
  }

  papers = [...newPapers, ...papers].slice(0, 40);

  await fs.writeFile(DATA_PATH, JSON.stringify(papers, null, 2));
  console.log(`\nAdded ${newPapers.length} paper(s). Total in feed: ${papers.length}`);

  const html = generateHTML(papers);
  await fs.writeFile(HTML_PATH, html);
  console.log('Regenerated public/index.html');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
