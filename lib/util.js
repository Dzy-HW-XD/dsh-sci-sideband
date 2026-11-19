import { randomUUID } from 'node:crypto';

/** Create a short, sortable enough identifier with a readable prefix. */
export function newId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function asString(value, max = 20000) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function truncate(text, max) {
  const value = typeof text === 'string' ? text : '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  middot: '\u00b7',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Reduce an HTML document to readable, reasonably dense plain text. */
export function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, ''),
  );
}

/** Extract the first JSON object from a model answer, tolerating fences and prose. */
export function parseJsonObject(text) {
  if (typeof text !== 'string') return null;
  let value = text.trim().replace(/^\uFEFF/, '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(value);
  if (fence) value = fence[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const candidate = value.slice(start, end + 1);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function toStringArray(value, max = 12, itemMax = 500) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return asString(item.text ?? item.label ?? item.claim ?? '', itemMax);
      return '';
    })
    .map((item) => asString(item, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

export function normalizeConfidence(value) {
  return oneOf(String(value || '').toLowerCase(), ['high', 'medium', 'low'], 'medium');
}

export function normalizeRelevance(value) {
  return oneOf(String(value || '').toLowerCase(), ['high', 'medium', 'low'], 'low');
}
