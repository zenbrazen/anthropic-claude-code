import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CATEGORIES, generateSite, ensureSlugs } from './lib/html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/papers.json');
const FILTER_LOG_PATH = path.join(__dirname, '../data/filter-log.jsonl');
const PUBLIC_DIR = path.join(__dirname, '../public');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VENUE_KEYWORDS = [
  'NeurIPS', 'ICML', 'ICLR', 'ACL', 'EMNLP', 'CVPR', 'Nature', 'Science',
  'PNAS', 'accepted at', 'to appear in',
];

async function fetchArxivPapers(arxivCat, count) {
  const url = `https://export.arxiv.org/api/query?search_query=cat:${arxivCat}&sortBy=submittedDate&sortOrder=descending&max_results=${count}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv API error: ${res.status}`);
  return parseAtomFeed(await res.text());
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}

function parseAtomFeed(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = match[1];
    const rawId = (extractTag(entry, 'id') ?? '').replace(/https?:\/\/arxiv\.org\/abs\//, '').trim();
    const versionMatch = rawId.match(/v(\d+)$/);
    const version = versionMatch ? parseInt(versionMatch[1]) : 1;
    const id = rawId.replace(/v\d+$/, '').trim();
    const title = (extractTag(entry, 'title') ?? '').replace(/\$([^$]*)\$/g, '$1').replace(/\s+/g, ' ').trim();
    const abstract = (extractTag(entry, 'summary') ?? '').replace(/\s+/g, ' ').trim();
    const published = (extractTag(entry, 'published') ?? '').trim();
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map(m => m[1].trim());
    const comment = (extractTag(entry, 'arxiv:comment') ?? '').replace(/\s+/g, ' ').trim();
    const categories = [...entry.matchAll(/<category\s+term="([^"]+)"/g)].map(m => m[1]);
    if (id && title && abstract) entries.push({ id, title, abstract, authors, published, version, comment, categories });
  }
  return entries;
}

async function fetchCategoryPool(cat, cutoff, existingIds) {
  const seen = new Map(); // id → { paper, querySources: Set }

  for (const { cat: arxivCat, count } of cat.sources) {
    let results;
    try {
      results = await fetchArxivPapers(arxivCat, count);
    } catch (err) {
      console.error(`    fetch error (${arxivCat}):`, err.message);
      continue;
    }
    for (const p of results) {
      if (new Date(p.published) < cutoff) continue;
      if (existingIds.has(p.id)) continue;
      if (seen.has(p.id)) {
        seen.get(p.id).querySources.add(arxivCat);
      } else {
        seen.set(p.id, { paper: p, querySources: new Set([arxivCat]) });
      }
    }
  }

  return [...seen.values()].map(({ paper, querySources }) => ({
    ...paper,
    _querySources: [...querySources],
    _crossListedFromFetch: querySources.size >= 2,
  }));
}

function parsePageCount(comment) {
  const m = comment.match(/(\d+)\s*pages?/i);
  return m ? parseInt(m[1]) : null;
}

function applyTierZeroFilter(papers) {
  const kept = [], dropped = [];
  for (const p of papers) {
    if (p.version > 1) {
      dropped.push({ id: p.id, title: p.title, reason: `version v${p.version}` });
      continue;
    }
    const wordCount = p.abstract.split(/\s+/).length;
    if (wordCount < 100) {
      dropped.push({ id: p.id, title: p.title, reason: `abstract too short (${wordCount}w)` });
      continue;
    }
    if (wordCount > 500) {
      dropped.push({ id: p.id, title: p.title, reason: `abstract too long (${wordCount}w)` });
      continue;
    }
    const pageCount = parsePageCount(p.comment);
    if (pageCount !== null && pageCount < 6) {
      dropped.push({ id: p.id, title: p.title, reason: `page count ${pageCount} < 6` });
      continue;
    }
    const venueMatch = VENUE_KEYWORDS.some(kw => p.comment.includes(kw));
    const crossListed = p._crossListedFromFetch || p.categories.length >= 2;
    const goodPageCount = pageCount !== null && pageCount >= 8 && pageCount <= 30;
    const score = (2 * +venueMatch) + +crossListed + +goodPageCount;
    kept.push({ ...p, _signals: { venueMatch, crossListed, goodPageCount, score, pageCount, wordCount } });
  }
  return { kept, dropped };
}

async function summarizePaper(paper, categoryLabel) {
  const authorsStr = paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' et al.' : '');
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `You write for Paper Plaine, a website presenting academic research in plain English for general audiences.

Write three sections about this paper:

SUBTITLE: 8–12 words. A single plain-English phrase that captures what the paper is really about — written for a curious non-expert. Concrete and human, no jargon. It sits below the paper's formal title as a plain-language translation. Examples: "Designing agreements that hold up even when groups cheat together" · "Why Bitcoin's biggest theoretical sell-off probably wouldn't crash the market" · "Teaching self-driving cars to predict when their sensors will go dark."

SUMMARY: 2–3 sentences. Lead with what was discovered or shown, not what was studied. Plain English only — no jargon. If the finding has a number, name it. If it has a counterintuitive angle, surface it. Never open with "Researchers studied," "This work explores," or similar. Use "could" and "might" only when the paper itself is genuinely speculative.

WHY IT MATTERS: 2–4 sentences. Explain the real-world consequence directly — don't open with "This matters because." If there's a concrete impact, state it. Bad: "This research could potentially lead to better outcomes." Good: "Cuts CO2 by 10% and nearly eliminates worst-case fuel waste."

Paper title: ${paper.title}
Authors: ${authorsStr}
Category: ${categoryLabel}
Abstract: ${paper.abstract}

Respond ONLY with valid JSON: {"subtitle": "...", "summary": "...", "whyItMatters": "..."}`
    }]
  });
  const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function run() {
  let papers = [];
  try {
    papers = JSON.parse(await fs.readFile(DATA_PATH, 'utf-8'));
  } catch { papers = []; }

  const existingIds = new Set(papers.map(p => p.id));

  const aiCat = CATEGORIES.find(c => c.label === 'AI');
  const otherCats = CATEGORIES.filter(c => c.label !== 'AI');
  const recentCats = new Set(papers.slice(0, 8).map(p => p.categoryLabel));
  const otherPool = otherCats.filter(c => !recentCats.has(c.label));
  const otherSelected = (otherPool.length >= 2 ? otherPool : otherCats)
    .sort(() => Math.random() - 0.5).slice(0, 2);
  const selected = [aiCat, ...otherSelected];

  const runLog = { runAt: new Date().toISOString(), categories: [] };
  const newPapers = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const cat of selected) {
    try {
      const sourceList = cat.sources.map(s => `${s.cat}(${s.count})`).join(', ');
      console.log(`Fetching ${cat.label} from [${sourceList}]...`);

      const pool = await fetchCategoryPool(cat, cutoff, existingIds);
      const { kept, dropped } = applyTierZeroFilter(pool);
      console.log(`  Tier-0: ${pool.length} candidates → ${kept.length} kept, ${dropped.length} dropped`);

      runLog.categories.push({ category: cat.label, fetched: pool.length, kept: kept.length, dropped: dropped.length, droppedDetails: dropped });

      if (!kept.length) { console.log(`  No candidates after filter for ${cat.label}`); continue; }

      const best = kept.sort((a, b) => b._signals.score - a._signals.score)[0];
      console.log(`  Summarizing: ${best.title.slice(0, 70)}...`);
      const { subtitle, summary, whyItMatters } = await summarizePaper(best, cat.label);
      const authorsStr = best.authors.slice(0, 3).join(', ') + (best.authors.length > 3 ? ' et al.' : '');

      newPapers.push({
        id: best.id, title: best.title, authors: authorsStr,
        categoryLabel: cat.label, categoryDisplay: cat.displayCat,
        published: best.published, publishedFormatted: formatDate(best.published),
        subtitle, summary, whyItMatters, fetchedAt: new Date().toISOString(),
        signals: best._signals,
      });
      existingIds.add(best.id);
      console.log(`  Done: ${cat.label} (score=${best._signals.score})`);
    } catch (err) {
      console.error(`  Error (${cat.label}):`, err.message);
    }
  }

  await fs.appendFile(FILTER_LOG_PATH, JSON.stringify(runLog) + '\n');

  if (!newPapers.length) { console.log('No new papers this run.'); return; }

  papers = [...newPapers, ...papers].slice(0, 40);
  ensureSlugs(papers);
  await fs.writeFile(DATA_PATH, JSON.stringify(papers, null, 2));
  console.log(`\nAdded ${newPapers.length} paper(s). Total: ${papers.length}`);

  const fileCount = await generateSite(papers, PUBLIC_DIR);
  console.log(`Generated ${fileCount} HTML file(s).`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
