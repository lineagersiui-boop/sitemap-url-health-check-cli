'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { parseArgs, buildInput, isSitemapLike, UsageError } = require('../lib/args');
const { evaluate, parseFlagList } = require('../lib/evaluate');
const { formatTable } = require('../lib/format');
const { main } = require('../bin/cli');

const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-items.json'), 'utf8'));
const summary = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-summary.json'), 'utf8'));

// ---- argument parsing ----
test('parses the documented example', () => {
  const o = parseArgs(['example.com', '--max-urls', '200', '--fail-on', 'not_found,server_error']);
  assert.deepEqual(o.siteUrls, ['example.com']);
  assert.deepEqual(o.sitemapUrls, []);
  assert.equal(o.maxUrls, 200);
  assert.equal(o.failOn, 'not_found,server_error');
  assert.equal(o.onlyProblems, true);
});

test('defaults', () => {
  const o = parseArgs(['example.com']);
  assert.equal(o.maxUrls, 500);
  assert.equal(o.failOn, 'not_found,server_error,client_error');
  assert.equal(o.timeLimitSecs, undefined);
});

test('--opt=value form, --all, --sitemap and sitemap-like positionals', () => {
  const o = parseArgs(['https://example.com/sitemap_index.xml', '--max-urls=50', '--all', '--sitemap', 'https://a.test/s.xml.gz,https://b.test/list.txt', 'shop.example.com']);
  assert.deepEqual(o.sitemapUrls, ['https://example.com/sitemap_index.xml', 'https://a.test/s.xml.gz', 'https://b.test/list.txt']);
  assert.deepEqual(o.siteUrls, ['shop.example.com']);
  assert.equal(o.maxUrls, 50);
  assert.equal(o.onlyProblems, false);
});

test('isSitemapLike', () => {
  assert.equal(isSitemapLike('https://x.test/sitemap.xml'), true);
  assert.equal(isSitemapLike('https://x.test/sitemap.xml.gz'), true);
  assert.equal(isSitemapLike('https://x.test/sitemap.xml?v=2'), true);
  assert.equal(isSitemapLike('example.com'), false);
});

test('rejects bad input', () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(['example.com', '--max-urls', '0']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--max-urls', '5001']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--max-urls', '2.5']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--time-limit', '30']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--bogus']), UsageError);
  assert.throws(() => parseArgs(['example.com', '--fail-on']), UsageError);
  const eleven = Array.from({ length: 11 }, (_, i) => `s${i}.example.com`);
  assert.throws(() => parseArgs(eleven), UsageError);
});

test('help and version need no target', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('buildInput always confirms permission and omits empty lists', () => {
  const input = buildInput(parseArgs(['example.com', '--time-limit', '600']));
  assert.deepEqual(input, { confirmPermission: true, maxUrls: 500, onlyProblems: true, siteUrls: ['example.com'], timeLimitSecs: 600 });
});

// ---- evaluation (mirrors the GitHub Action's evaluate.jq test) ----
test('parseFlagList trims and ignores empty or none', () => {
  assert.deepEqual(parseFlagList('not_found, server_error,client_error'), ['not_found', 'server_error', 'client_error']);
  assert.deepEqual(parseFlagList(''), []);
  assert.deepEqual(parseFlagList('none'), []);
});

test('evaluate counts like evaluate.jq', () => {
  const r = evaluate(items, parseFlagList('not_found, server_error,client_error'), summary);
  assert.equal(r.failing, 2);
  assert.equal(r.problems, 5);
  assert.equal(r.checked, 6);
  assert.equal(r.billed, 5);
  assert.deepEqual(r.failingRows.map((x) => x.status), [404, 503]);
  assert.equal(r.problemRows[0].fail, true);
  assert.equal(r.problemRows[1].fail, true);
  assert.equal(r.problemRows.length, 5);
});

test('empty fail-on never fails', () => {
  assert.equal(evaluate(items, parseFlagList(''), summary).failing, 0);
});

test('falls back to item counts without SUMMARY', () => {
  const r = evaluate(items, ['not_found'], {});
  assert.equal(r.checked, 6);
  assert.equal(r.problems, 5);
  assert.equal(r.failing, 1);
  assert.equal(r.billed, null);
  assert.equal(evaluate(items, ['not_found'], null).checked, 6);
});

test('formatTable lists FAIL rows first and keeps pipes', () => {
  const t = formatTable(evaluate(items, ['not_found', 'server_error'], summary), 'RUN1');
  assert.match(t, /URLs checked:\s+6/);
  assert.match(t, /Matching fail-on:\s+2/);
  assert.match(t, /blog\|pipe/);
  const lines = t.split('\n');
  const first = lines.findIndex((l) => l.startsWith('FAIL'));
  const healthyProblem = lines.findIndex((l) => l.includes('noindex_header'));
  assert.ok(first > 0 && first < healthyProblem);
});

// ---- end-to-end with a fake Apify API (no network) ----
function fakeFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    const reply = (status, body) => ({ status, text: async () => JSON.stringify(body) });
    if (url.endsWith('/runs') && init.method === 'POST') return reply(201, { data: { id: 'RUN1', status: 'READY' } });
    if (url.includes('/actor-runs/RUN1')) return reply(200, { data: { id: 'RUN1', status: 'SUCCEEDED', defaultDatasetId: 'DS', defaultKeyValueStoreId: 'KV' } });
    if (url.includes('/records/SUMMARY')) return reply(200, summary);
    if (url.includes('/datasets/DS/items')) return reply(200, items);
    return reply(404, { error: { message: 'not found' } });
  };
}

function sink() {
  let s = '';
  return { write: (x) => { s += x; }, get text() { return s; } };
}

test('main: exit 1 on fail-on match, sends confirmPermission and bearer token', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls);
  try {
    const out = sink(); const err = sink();
    const code = await main(['example.com', '--max-urls', '200', '--fail-on', 'not_found,server_error'], { APIFY_TOKEN: 'test-token' }, out, err);
    assert.equal(code, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.confirmPermission, true);
    assert.equal(body.maxUrls, 200);
    assert.match(calls[0].url, /\/v2\/acts\/lineagersiui~sitemap-url-health-checker\/runs$/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
    assert.ok(!out.text.includes('test-token') && !err.text.includes('test-token'));
    assert.match(out.text, /Matching fail-on:\s+2/);
  } finally { globalThis.fetch = orig; }
});

test('main: exit 0 with --fail-on none, JSON output', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = fakeFetch([]);
  try {
    const out = sink();
    const code = await main(['example.com', '--fail-on', 'none', '--json'], { APIFY_TOKEN: 't' }, out, sink());
    assert.equal(code, 0);
    assert.equal(JSON.parse(out.text).checked, 6);
  } finally { globalThis.fetch = orig; }
});

test('main: exit 3 without token, exit 2 on usage error', async () => {
  const err = sink();
  assert.equal(await main(['example.com'], {}, sink(), err), 3);
  assert.match(err.text, /APIFY_TOKEN is not set/);
  assert.equal(await main(['--max-urls', 'x'], {}, sink(), sink()), 2);
});
