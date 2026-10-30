#!/usr/bin/env node
'use strict';

const { parseArgs, buildInput, UsageError, HELP } = require('../lib/args');
const { evaluate, parseFlagList } = require('../lib/evaluate');
const { createClient, ApifyError } = require('../lib/apify');
const { formatTable } = require('../lib/format');
const pkg = require('../package.json');

async function main(argv, env, out = process.stdout, err = process.stderr) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) { err.write(`Error: ${e.message}\n`); return 2; }
    throw e;
  }
  if (opts.help) { out.write(HELP + '\n'); return 0; }
  if (opts.version) { out.write(pkg.version + '\n'); return 0; }

  const failOn = parseFlagList(opts.failOn);
  const input = buildInput(opts);
  try {
    const client = createClient({ token: env.APIFY_TOKEN, baseUrl: env.APIFY_API_BASE || undefined, userAgent: `${pkg.name}/${pkg.version}` });
    const run = await client.startRun(input);
    err.write(`Started Apify run ${run.id} (max ${input.maxUrls} URLs, $0.0005 per URL checked, billed to your Apify account).\n`);
    const done = await client.waitForRun(run.id, { maxWaitSecs: opts.maxWaitSecs, onStatus: (s) => err.write(`Run status: ${s}\n`) });
    if (done.status !== 'SUCCEEDED') {
      throw new ApifyError(`Apify run ${run.id} ended with status ${done.status}. ${String(done.statusMessage || '').slice(0, 300)}`);
    }
    const summary = await client.getSummary(done.defaultKeyValueStoreId);
    const items = await client.getItems(done.defaultDatasetId);
    const result = evaluate(items, failOn, summary);
    if (opts.json) {
      out.write(JSON.stringify({ runId: run.id, ...result }, null, 2) + '\n');
    } else {
      out.write(formatTable(result, run.id) + '\n');
    }
    if (result.failing > 0) {
      err.write(`${result.failing} sitemap URL(s) matched --fail-on (${failOn.join(', ')}).\n`);
      return 1;
    }
    return 0;
  } catch (e) {
    if (e instanceof ApifyError) { err.write(`Error: ${e.message}\n`); return 3; }
    throw e;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then(
    (code) => { process.exitCode = code; },
    (e) => { process.stderr.write(`Unexpected error: ${e && e.message ? e.message : e}\n`); process.exitCode = 3; },
  );
}

module.exports = { main };
