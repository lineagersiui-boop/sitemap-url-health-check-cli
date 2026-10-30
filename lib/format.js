'use strict';
// Plain-text summary table for the terminal.

function clip(value, width) {
  const s = value === null || value === undefined ? '' : String(value).replace(/[\r\n]+/g, ' ');
  return s.length > width ? s.slice(0, width - 1) + '~' : s;
}

function pad(s, w) {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

function formatTable(result, runId, maxRows = 100) {
  const lines = [];
  lines.push('Sitemap URL Health Check');
  lines.push('');
  lines.push(`URLs checked:      ${result.checked}`);
  lines.push(`With problems:     ${result.problems}`);
  lines.push(`Matching fail-on:  ${result.failing}  (${result.failOn.length ? result.failOn.join(', ') : 'none'})`);
  lines.push(`Billed URL checks: ${result.billed === null ? 'n/a' : result.billed}`);
  if (runId) lines.push(`Apify run:         ${runId}`);
  lines.push('');
  const rows = result.problemRows;
  if (rows.length === 0) {
    lines.push('No problem URLs were returned.');
  } else {
    const shown = rows.slice(0, maxRows).map((r) => [
      r.fail ? 'FAIL' : '',
      clip(r.status === null || r.status === undefined ? '-' : r.status, 6),
      clip((r.flags || []).join(', '), 30),
      clip(r.url, 70),
      clip(r.finalUrl && r.finalUrl !== r.url ? r.finalUrl : '', 60),
    ]);
    const head = ['', 'Status', 'Flags', 'URL', 'Final URL'];
    const widths = head.map((h, i) => Math.max(h.length, ...shown.map((r) => r[i].length)));
    lines.push(head.map((h, i) => pad(h, widths[i])).join('  ').trimEnd());
    lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const r of shown) lines.push(r.map((c, i) => pad(c, widths[i])).join('  ').trimEnd());
    if (rows.length > maxRows) lines.push(`...and ${rows.length - maxRows} more problem URLs in the Apify run's dataset.`);
  }
  if (result.blockedByRobots > 0) lines.push('', `${result.blockedByRobots} URL(s) were skipped because robots.txt disallows them (not billed).`);
  if (result.note) lines.push('', `Note: ${clip(result.note, 300)}`);
  return lines.join('\n');
}

module.exports = { formatTable };
