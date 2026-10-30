'use strict';
// Command-line parsing without dependencies.

const DEFAULT_FAIL_ON = 'not_found,server_error,client_error';

const HELP = `Usage: sitemap-url-health-check <site-or-sitemap-url...> [options]

Checks every URL listed in a sitemap (404s, 5xx, redirects, redirect chains,
https-to-http downgrades, X-Robots-Tag noindex) by running the Apify Actor
lineagersiui/sitemap-url-health-checker on YOUR Apify account.

Arguments
  A site address (example.com) finds the sitemap via robots.txt or /sitemap.xml.
  A URL ending in .xml, .xml.gz or .txt is used as a direct sitemap URL.

Options
  --sitemap <url>        Direct sitemap URL (repeatable or comma-separated)
  --max-urls <n>         Max URLs to check, 1-5000 (default 500; each checked URL is billed $0.0005)
  --fail-on <flags>      Comma-separated flags that make the exit code 1
                         (default ${DEFAULT_FAIL_ON}; "none" never fails)
  --all                  Return healthy URLs too (default: only problem URLs)
  --time-limit <secs>    Actor time limit, 60-3600 (default 1500)
  --max-wait <secs>      Give up waiting for the run after this (default 4200)
  --json                 Print the result as JSON instead of a table
  -h, --help             Show this help
  -v, --version          Show the version

Environment
  APIFY_TOKEN            Your Apify API token (required). Runs are billed to your account.

Permission
  The Actor only checks sites you own or have permission to check. This CLI always
  sends confirmPermission: true. Running it on a site is your confirmation that you
  own that site or have permission to check it.

Exit codes: 0 ok, 1 URLs matched --fail-on, 2 usage error, 3 Apify/run error.`;

class UsageError extends Error {}

function isSitemapLike(value) {
  return /\.(xml|xml\.gz|txt)(\?.*)?$/i.test(String(value).trim());
}

function splitList(value) {
  return String(value)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toInt(name, value, min, max) {
  if (!/^\d+$/.test(String(value))) throw new UsageError(`${name} must be a whole number from ${min} to ${max} (got '${value}').`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`${name} must be a whole number from ${min} to ${max} (got '${value}').`);
  return n;
}

/** Parses argv (without node and script). Returns {help, version, input, failOn, json, maxWaitSecs}. */
function parseArgs(argv) {
  const out = {
    help: false,
    version: false,
    json: false,
    siteUrls: [],
    sitemapUrls: [],
    maxUrls: 500,
    failOn: DEFAULT_FAIL_ON,
    onlyProblems: true,
    timeLimitSecs: undefined,
    maxWaitSecs: 4200,
  };
  const takesValue = new Set(['--sitemap', '--max-urls', '--fail-on', '--time-limit', '--max-wait']);
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let value;
    if (arg.startsWith('--') && arg.includes('=')) {
      value = arg.slice(arg.indexOf('=') + 1);
      arg = arg.slice(0, arg.indexOf('='));
    }
    if (takesValue.has(arg) && value === undefined) {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value.`);
      value = argv[++i];
    }
    switch (arg) {
      case '-h':
      case '--help': out.help = true; break;
      case '-v':
      case '--version': out.version = true; break;
      case '--json': out.json = true; break;
      case '--all': out.onlyProblems = false; break;
      case '--only-problems': out.onlyProblems = true; break;
      case '--sitemap': out.sitemapUrls.push(...splitList(value)); break;
      case '--max-urls': out.maxUrls = toInt('--max-urls', value, 1, 5000); break;
      case '--fail-on': out.failOn = value; break;
      case '--time-limit': out.timeLimitSecs = toInt('--time-limit', value, 60, 3600); break;
      case '--max-wait': out.maxWaitSecs = toInt('--max-wait', value, 60, 86400); break;
      default:
        if (arg.startsWith('-')) throw new UsageError(`Unknown option ${arg}. Run with --help.`);
        for (const v of splitList(arg)) (isSitemapLike(v) ? out.sitemapUrls : out.siteUrls).push(v);
    }
  }
  if (out.help || out.version) return out;
  if (out.siteUrls.length + out.sitemapUrls.length === 0) throw new UsageError('Give a site address or a sitemap URL. Run with --help.');
  if (out.siteUrls.length > 10 || out.sitemapUrls.length > 10) throw new UsageError('At most 10 site URLs and 10 sitemap URLs per run.');
  return out;
}

/** Builds the Actor input. confirmPermission is always true (see HELP). */
function buildInput(opts) {
  const input = { confirmPermission: true, maxUrls: opts.maxUrls, onlyProblems: opts.onlyProblems };
  if (opts.siteUrls.length) input.siteUrls = opts.siteUrls;
  if (opts.sitemapUrls.length) input.sitemapUrls = opts.sitemapUrls;
  if (opts.timeLimitSecs !== undefined) input.timeLimitSecs = opts.timeLimitSecs;
  return input;
}

module.exports = { parseArgs, buildInput, isSitemapLike, UsageError, HELP, DEFAULT_FAIL_ON };
