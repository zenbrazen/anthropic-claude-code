import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CATEGORIES, generateSite } from './lib/html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/papers.json');
const PUBLIC_DIR = path.join(__dirname, '../public');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PAPERS_PER_CATEGORY = 2;

async function fetchArxivPapers(category, count = 30) {
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
    const title = (extractTag(entry, 'title') ?? '').replace(/\s+/g, ' ').trim();
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

Write two sections about this paper:

SUMMARY: 2–3 sentences. What did the researchers do and find? Plain English only — no jargon.

WHY IT MATTERS: 2–4 sentences. What changes if this research is right? Who benefits? What does it connect to in everyday life?

Paper title: ${paper.title}
Authors: ${authorsStr}
Category: ${categoryLabel}
Abstract: ${paper.abstract}

Respond ONLY with valid JSON: {"summary": "...", "whyItMatters": "..."}`
    }]
  });
  const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  let papers = [];
  try {
    papers = JSON.parse(await fs.readFile(DATA_PATH, 'utf-8'));
  } catch { papers = []; }

  const existingIds = new Set(papers.map(p => p.id));
  const newPapers = [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const cat of CATEGORIES) {
    console.log(`\nFetching ${PAPERS_PER_CATEGORY} papers from ${cat.arxivCat}...`);
    try {
      const candidates = (await fetchArxivPapers(cat.arxivCat, 30))
        .filter(p => new Date(p.published) >= cutoff)
        .filter(p => !existingIds.has(p.id))
        .slice(0, PAPERS_PER_CATEGORY);
      if (!candidates.length) { console.log(`  No new papers in ${cat.arxivCat}`); continue; }

      for (const candidate of candidates) {
        console.log(`  Summarizing: ${candidate.title.slice(0, 70)}...`);
        const { summary, whyItMatters } = await summarizePaper(candidate, cat.label);
        const authorsStr = candidate.authors.slice(0, 3).join(', ') + (candidate.authors.length > 3 ? ' et al.' : '');

        newPapers.push({
          id: candidate.id, title: candidate.title, authors: authorsStr,
          categoryLabel: cat.label, categoryDisplay: cat.displayCat,
          published: candidate.published, publishedFormatted: formatDate(candidate.published),
          summary, whyItMatters, fetchedAt: new Date().toISOString(),
        });
        existingIds.add(candidate.id);
        await sleep(500);
      }
    } catch (err) {
      console.error(`  Error (${cat.label}):`, err.message);
    }
  }

  if (!newPapers.length) { console.log('\nNo new papers added.'); return; }

  papers = [...newPapers, ...papers].slice(0, 40);
  await fs.writeFile(DATA_PATH, JSON.stringify(papers, null, 2));
  console.log(`\nAdded ${newPapers.length} papers. Total: ${papers.length}`);

  const fileCount = await generateSite(papers, PUBLIC_DIR);
  console.log(`Generated ${fileCount} HTML file(s).`);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
