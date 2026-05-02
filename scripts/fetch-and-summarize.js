import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CATEGORIES, generateSite, ensureSlugs } from './lib/html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/papers.json');
const PUBLIC_DIR = path.join(__dirname, '../public');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchArxivPapers(category, count = 25) {
  const url = `https://export.arxiv.org/api/query?search_query=cat:${category}&sortBy=submittedDate&sortOrder=descending&max_results=${count}`;
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
    const rawId = extractTag(entry, 'id') ?? '';
    const id = rawId.replace(/https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '').trim();
    const title = (extractTag(entry, 'title') ?? '').replace(/\$([^$]*)\$/g, '$1').replace(/\s+/g, ' ').trim();
    const abstract = (extractTag(entry, 'summary') ?? '').replace(/\s+/g, ' ').trim();
    const published = (extractTag(entry, 'published') ?? '').trim();
    const authors = [...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map(m => m[1].trim());
    if (id && title && abstract) entries.push({ id, title, abstract, authors, published });
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

  // Always pull 1 AI paper + 1 each from 2 randomly chosen non-AI categories
  // (prefer non-AI categories not covered in the 8 most recent papers)
  const aiCat = CATEGORIES.find(c => c.label === 'AI');
  const otherCats = CATEGORIES.filter(c => c.label !== 'AI');
  const recentCats = new Set(papers.slice(0, 8).map(p => p.categoryLabel));
  const otherPool = otherCats.filter(c => !recentCats.has(c.label));
  const otherSelected = (otherPool.length >= 2 ? otherPool : otherCats)
    .sort(() => Math.random() - 0.5).slice(0, 2);
  const selected = [aiCat, ...otherSelected];

  const newPapers = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (const cat of selected) {
    try {
      console.log(`Fetching from ${cat.arxivCat}...`);
      const candidates = (await fetchArxivPapers(cat.arxivCat, 25))
        .filter(p => new Date(p.published) >= cutoff)
        .filter(p => !existingIds.has(p.id));
      if (!candidates.length) { console.log(`  No new papers in ${cat.arxivCat}`); continue; }

      const candidate = candidates[0];
      console.log(`  Summarizing: ${candidate.title.slice(0, 70)}...`);
      const { subtitle, summary, whyItMatters } = await summarizePaper(candidate, cat.label);
      const authorsStr = candidate.authors.slice(0, 3).join(', ') + (candidate.authors.length > 3 ? ' et al.' : '');

      newPapers.push({
        id: candidate.id, title: candidate.title, authors: authorsStr,
        categoryLabel: cat.label, categoryDisplay: cat.displayCat,
        published: candidate.published, publishedFormatted: formatDate(candidate.published),
        subtitle, summary, whyItMatters, fetchedAt: new Date().toISOString(),
      });
      existingIds.add(candidate.id);
      console.log(`  Done: ${cat.label}`);
    } catch (err) {
      console.error(`  Error (${cat.label}):`, err.message);
    }
  }

  if (!newPapers.length) { console.log('No new papers this run.'); return; }

  papers = [...newPapers, ...papers].slice(0, 40);
  ensureSlugs(papers);
  await fs.writeFile(DATA_PATH, JSON.stringify(papers, null, 2));
  console.log(`\nAdded ${newPapers.length} paper(s). Total: ${papers.length}`);

  const fileCount = await generateSite(papers, PUBLIC_DIR);
  console.log(`Generated ${fileCount} HTML file(s).`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
