/**
 * Default source discovery.
 *
 * The sideband does not need a hand-written topic list: it searches a small set
 * of open-access / metadata providers from the project objective, then imports
 * the best matching records as research content. Paywalled journal records are
 * kept as metadata/abstract; full text is fetched only when the provider offers
 * an open-access link.
 */
import { asString, htmlToText, truncate } from './util.js';

export const CHANNELS = [
  { id: 'arxiv', title: 'arXiv', access: 'open', note: '预印本 / 开放全文' },
  { id: 'openalex', title: 'OpenAlex', access: 'open', note: '开放获取与元数据' },
  { id: 'crossref', title: 'Crossref', access: 'meta', note: '期刊元数据 / 摘要' },
  { id: 'europepmc', title: 'Europe PMC', access: 'open', note: 'PubMed / PMC 全文' },
  { id: 'doaj', title: 'DOAJ', access: 'open', note: '开放获取期刊' },
  { id: 'semanticscholar', title: 'Semantic Scholar', access: 'open', note: '开放获取与引用' },
];

export const DEFAULT_CHANNEL_IDS = CHANNELS.map((channel) => channel.id);

const CHANNEL_IDS = new Set(DEFAULT_CHANNEL_IDS);

export function channelCatalog() {
  return CHANNELS;
}

export function normalizeChannels(value) {
  const list = Array.isArray(value) ? value : [];
  const ids = [...new Set(list.map((item) => String(item || '').trim()).filter((id) => CHANNEL_IDS.has(id)))];
  return ids.length ? ids : [...DEFAULT_CHANNEL_IDS];
}

function cleanText(value, max = 4000) {
  return truncate(htmlToText(String(value || '')).replace(/\s+/g, ' ').trim(), max);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function xmlTag(block, tag) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  return match ? decodeXml(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function normalizeDoi(value) {
  const text = asString(value, 500)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim();
  return text || '';
}

function titleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function withUrl(candidate) {
  const url = asString(candidate.url, 3000);
  if (url) return url;
  const doi = normalizeDoi(candidate.doi);
  return doi ? `https://doi.org/${doi}` : '';
}

function normalizeCandidate(raw, channel, access) {
  const title = cleanText(raw.title, 500);
  if (!title) return null;
  const doi = normalizeDoi(raw.doi);
  const candidate = {
    title,
    authors: cleanText(raw.authors, 600),
    year: raw.year == null ? '' : String(raw.year).trim(),
    venue: cleanText(raw.venue, 300),
    doi,
    url: withUrl({ url: raw.url, doi }),
    abstract: cleanText(raw.abstract, 5000),
    type: raw.type || 'paper',
    provider: channel,
    access: access || 'meta',
    externalId: asString(raw.externalId, 300),
  };
  if (!candidate.url && !candidate.doi) return null;
  return candidate;
}

async function readText(lab, url, signal) {
  const web = lab.pickService('web');
  if (web && typeof web.fetch === 'function') {
    const result = await web.fetch({ url }, signal);
    const status = Number(result && result.statusCode) || 0;
    if (status && (status < 200 || status >= 300)) throw new Error(`HTTP ${status}`);
    const body = (result && result.body) || {};
    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) throw new Error('empty response');
    return content;
  }
  if (typeof fetch !== 'function') throw new Error('no HTTP fetch available');
  const response = await fetch(url, { signal, headers: { accept: 'application/json, application/atom+xml, text/xml, */*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function readJson(lab, url, signal) {
  const text = await readText(lab, url, signal);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('response is not JSON');
  }
}

async function searchArxiv(lab, query, limit, signal) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${Math.max(limit * 2, 4)}&sortBy=relevance`;
  const xml = await readText(lab, url, signal);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, limit);
  return entries
    .map((match) => {
      const block = match[1];
      const id = xmlTag(block, 'id');
      const published = xmlTag(block, 'published');
      const authors = [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
        .map((author) => decodeXml(author[1]).trim())
        .filter(Boolean)
        .join('; ');
      return normalizeCandidate(
        {
          title: xmlTag(block, 'title'),
          authors,
          year: published.slice(0, 4),
          venue: 'arXiv',
          doi: xmlTag(block, 'arxiv:doi'),
          url: id.replace('http://', 'https://'),
          abstract: xmlTag(block, 'summary'),
          type: 'preprint',
          externalId: id,
        },
        'arxiv',
        'open',
      );
    })
    .filter(Boolean);
}

function abstractFromInverted(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of Array.isArray(positions) ? positions : []) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

async function searchOpenAlex(lab, query, limit, signal) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${Math.max(limit * 2, 4)}&select=id,doi,title,publication_year,authorships,primary_location,open_access,best_oa_location,abstract_inverted_index`;
  const data = await readJson(lab, url, signal);
  return (Array.isArray(data.results) ? data.results : [])
    .slice(0, limit)
    .map((row) => {
      const authors = (Array.isArray(row.authorships) ? row.authorships : [])
        .map((author) => (author && author.author ? author.author.display_name : ''))
        .filter(Boolean)
        .join('; ');
      const landing = row.primary_location && row.primary_location.landing_page_url;
      const openUrl = (row.best_oa_location && row.best_oa_location.pdf_url) || (row.open_access && row.open_access.oa_url);
      return normalizeCandidate(
        {
          title: row.title,
          authors,
          year: row.publication_year,
          venue: row.primary_location && row.primary_location.source && row.primary_location.source.display_name,
          doi: row.doi,
          url: openUrl || landing,
          abstract: abstractFromInverted(row.abstract_inverted_index),
          externalId: row.id,
        },
        'openalex',
        openUrl ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchCrossref(lab, query, limit, signal) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${Math.max(limit * 2, 4)}&select=DOI,title,author,issued,container-title,URL,abstract,link`;
  const data = await readJson(lab, url, signal);
  const rows = data && data.message && Array.isArray(data.message.items) ? data.message.items : [];
  return rows
    .slice(0, limit)
    .map((row) => {
      const authors = (Array.isArray(row.author) ? row.author : [])
        .map((author) => [author.given, author.family].filter(Boolean).join(' '))
        .filter(Boolean)
        .join('; ');
      const year = row.issued && row.issued['date-parts'] && row.issued['date-parts'][0] ? row.issued['date-parts'][0][0] : '';
      const link = (Array.isArray(row.link) ? row.link : []).find((item) => /pdf/i.test(String(item['content-type'] || '')));
      return normalizeCandidate(
        {
          title: Array.isArray(row.title) ? row.title[0] : row.title,
          authors,
          year,
          venue: Array.isArray(row['container-title']) ? row['container-title'][0] : row['container-title'],
          doi: row.DOI,
          url: (link && link.URL) || row.URL,
          abstract: row.abstract,
        },
        'crossref',
        link ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchEuropePmc(lab, query, limit, signal) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${Math.max(limit * 2, 4)}&resultType=core`;
  const data = await readJson(lab, url, signal);
  const rows = data && data.resultList && Array.isArray(data.resultList.result) ? data.resultList.result : [];
  return rows
    .slice(0, limit)
    .map((row) => {
      const doi = normalizeDoi(row.doi);
      const urlValue = row.pmcid
        ? `https://europepmc.org/article/PMC/${row.pmcid}`
        : doi
          ? `https://doi.org/${doi}`
          : `https://europepmc.org/article/${row.source || 'MED'}/${row.id || ''}`;
      const open = Boolean(row.pmcid) || row.isOpenAccess === 'Y';
      return normalizeCandidate(
        {
          title: row.title,
          authors: row.authorString,
          year: row.pubYear,
          venue: (row.journalInfo && row.journalInfo.journal && row.journalInfo.journal.title) || row.journalTitle,
          doi,
          url: urlValue,
          abstract: row.abstractText,
          externalId: row.pmcid || row.id,
        },
        'europepmc',
        open ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchDoaj(lab, query, limit, signal) {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${Math.max(limit * 2, 4)}`;
  const data = await readJson(lab, url, signal);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .slice(0, limit)
    .map((row) => {
      const bib = row.bibjson || {};
      const identifiers = Array.isArray(bib.identifier) ? bib.identifier : [];
      const doiRow = identifiers.find((item) => String(item.type || '').toLowerCase() === 'doi');
      const links = Array.isArray(bib.link) ? bib.link : [];
      const fulltext = links.find((item) => /fulltext/i.test(String(item.type || ''))) || links[0];
      const authors = (Array.isArray(bib.author) ? bib.author : [])
        .map((author) => (author && (author.name || author)) || '')
        .filter(Boolean)
        .join('; ');
      return normalizeCandidate(
        {
          title: bib.title,
          authors,
          year: bib.year,
          venue: bib.journal && bib.journal.title,
          doi: doiRow && doiRow.id,
          url: fulltext && fulltext.url,
          abstract: bib.abstract,
          externalId: row.id,
        },
        'doaj',
        fulltext ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

async function searchSemanticScholar(lab, query, limit, signal) {
  const fields = 'title,authors,year,venue,abstract,externalIds,openAccessPdf,url';
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.max(limit * 2, 4)}&fields=${fields}`;
  const data = await readJson(lab, url, signal);
  const rows = data && Array.isArray(data.data) ? data.data : [];
  return rows
    .slice(0, limit)
    .map((row) => {
      const authors = (Array.isArray(row.authors) ? row.authors : [])
        .map((author) => author && author.name)
        .filter(Boolean)
        .join('; ');
      const doi = normalizeDoi(row.externalIds && row.externalIds.DOI);
      const pdf = row.openAccessPdf && row.openAccessPdf.url;
      return normalizeCandidate(
        {
          title: row.title,
          authors,
          year: row.year,
          venue: row.venue,
          doi,
          url: pdf || row.url,
          abstract: row.abstract,
          externalId: row.paperId,
        },
        'semanticscholar',
        pdf ? 'open' : 'meta',
      );
    })
    .filter(Boolean);
}

const SEARCHERS = {
  arxiv: searchArxiv,
  openalex: searchOpenAlex,
  crossref: searchCrossref,
  europepmc: searchEuropePmc,
  doaj: searchDoaj,
  semanticscholar: searchSemanticScholar,
};

export function buildSearchQuery(task) {
  const objective = asString(task.objective, 500);
  const title = asString(task.title, 200);
  const field = asString(task.field, 120);
  const currentState = asString(task.currentState, 200);
  // Prefer an English objective: most default providers index English metadata.
  // A Chinese title/currentState is still useful, but mixing it into the query
  // dilutes recall, so only add it when no Latin-script objective exists.
  const hasLatinObjective = /[A-Za-z]{3,}/.test(objective);
  const parts = hasLatinObjective ? [objective, field] : [title, field];
  if (!hasLatinObjective && /[A-Za-z]{3,}/.test(currentState)) parts.push(currentState);
  return truncate(parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), 600) || 'research';
}

export async function discoverSources(lab, task, channelIds, perProvider = 2) {
  const channels = normalizeChannels(channelIds);
  const count = Math.max(1, Math.min(4, Number(perProvider) || 2));
  const query = buildSearchQuery(task);
  const items = [];
  const errors = [];

  await Promise.all(
    channels.map(async (channel) => {
      const searcher = SEARCHERS[channel];
      if (!searcher) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const rows = await searcher(lab, query, count, controller.signal);
        for (const row of rows) items.push({ ...row, provider: channel });
      } catch (error) {
        errors.push({
          channel,
          message: String((error && error.message) || error || 'unknown error'),
        });
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = item.doi ? `doi:${item.doi.toLowerCase()}` : `title:${titleKey(item.title)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { query, channels, items: unique.slice(0, 12), errors };
}

export function candidateKey(candidate) {
  return candidate && candidate.doi ? `doi:${candidate.doi.toLowerCase()}` : `title:${titleKey(candidate && candidate.title)}`;
}

export function sourceKey(source) {
  return source && source.doi ? `doi:${String(source.doi).toLowerCase()}` : `title:${titleKey(source && source.title)}`;
}
