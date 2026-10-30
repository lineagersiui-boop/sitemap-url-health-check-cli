'use strict';
// Turns the Actor's dataset items into counts and summary rows.
// Mirrors evaluate.jq of the GitHub Action (lineagersiui-boop/sitemap-url-health-check).

function parseFlagList(value) {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'none');
}

function flagsOf(item) {
  return Array.isArray(item && item.flags) ? item.flags : [];
}

function isProblem(item) {
  return !flagsOf(item).includes('ok');
}

/**
 * @param {object[]} items  dataset items {url, status, finalUrl, redirects, redirectStatuses, flags, lastmod, sitemap}
 * @param {string[]} failOn flags that count as failing
 * @param {object} [summary] the run's SUMMARY record (may be missing)
 */
function evaluate(items, failOn, summary) {
  const list = Array.isArray(items) ? items : [];
  const s = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
  const fail = new Set(failOn || []);
  const marked = list.map((it) => ({ item: it, fail: flagsOf(it).some((f) => fail.has(f)) }));
  const failingRows = marked.filter((m) => m.fail).map((m) => m.item);
  const problemRows = marked
    .filter((m) => isProblem(m.item))
    .sort((a, b) => (a.fail === b.fail ? 0 : a.fail ? -1 : 1))
    .map((m) => ({ ...m.item, fail: m.fail }));
  const checked = typeof s.checked === 'number' ? s.checked : list.length;
  const problems = typeof s.problems === 'number' ? s.problems : problemRows.length;
  return {
    checked,
    problems,
    failing: failingRows.length,
    billed: typeof s.billed === 'number' ? s.billed : null,
    blockedByRobots: typeof s.blockedByRobots === 'number' ? s.blockedByRobots : 0,
    note: typeof s.note === 'string' ? s.note : null,
    failOn: [...fail],
    failingRows,
    problemRows,
  };
}

module.exports = { evaluate, parseFlagList, isProblem };
