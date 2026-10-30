# sitemap-url-health-check

A command-line tool that checks every URL listed in your XML sitemap and exits non-zero when it finds broken ones: 404/410s, other 4xx errors and 5xx server errors. It also reports redirects, redirect chains, https-to-http downgrades and `X-Robots-Tag: noindex` headers. Use it before and after a migration, after a CMS update, or in any CI pipeline.

```sh
export APIFY_TOKEN=your-apify-token
npx sitemap-url-health-check example.com --max-urls 200 --fail-on not_found,server_error
```

The checking runs in the Apify Actor [`lineagersiui/sitemap-url-health-checker`](https://apify.com/lineagersiui/sitemap-url-health-checker) on **your own Apify account**, using your API token. The CLI starts the run, waits for it, prints a summary table and sets the exit code. It has no dependencies and needs Node.js 18 or newer.

## Cost

The Actor is pay-per-event: **$0.0005 per URL checked** (1,000 URLs = $0.50), plus Apify platform usage, billed to your Apify account. URLs skipped by robots.txt, timeouts and network errors aren't billed. `--max-urls` (default 500, at most 5,000) is the hard cap per run.

## Permission

Only check sites you own or have permission to check. The Actor refuses non-demo runs unless `confirmPermission` is `true`, and **this CLI always sends `confirmPermission: true`. Running it on a site is your confirmation that you own that site or have permission to check it.** The checker respects robots.txt.

## Setup

1. Create an Apify account and copy your API token from Apify Console > Settings > Integrations.
2. Set it as the `APIFY_TOKEN` environment variable (in CI, from a secret). The CLI never prints it.

## Usage

```
sitemap-url-health-check <site-or-sitemap-url...> [options]
```

A site address (`example.com`) finds the sitemap via robots.txt or `/sitemap.xml`. A URL ending in `.xml`, `.xml.gz` or `.txt` is used as a direct sitemap URL. Up to 10 of each.

| Option | Default | Description |
|---|---|---|
| `--sitemap <url>` | | Direct sitemap URL (repeatable or comma-separated) |
| `--max-urls <n>` | `500` | Max URLs to check, 1 to 5,000 |
| `--fail-on <flags>` | `not_found,server_error,client_error` | Flags that make the exit code 1. `none` never fails |
| `--all` | off | Return healthy URLs too (they are checked and billed either way) |
| `--time-limit <secs>` | `1500` | Actor time limit, 60 to 3,600 |
| `--max-wait <secs>` | `4200` | Stop waiting for the run after this |
| `--json` | off | Print the result as JSON |

Exit codes: `0` no URL matched `--fail-on`, `1` at least one did, `2` usage error, `3` Apify or run error.

### Flags

| Flag | Meaning |
|---|---|
| `not_found` | 404 or 410 |
| `client_error` | Another 4xx |
| `server_error` | 5xx |
| `redirected` / `redirect_chain` / `too_many_redirects` | Redirects once, more than once, or more than 5 times |
| `https_downgrade` | An https URL redirects to http |
| `noindex_header` | Sends `X-Robots-Tag: noindex` |
| `blocked_by_robots` | robots.txt disallows the URL for this checker; skipped, not billed |
| `timeout` / `network_error` / `blocked_private_address` | Couldn't be checked; not billed |
| `ok` | 2xx with no redirect |

### Example output

With sample data (not a real site):

```
Sitemap URL Health Check

URLs checked:      6
With problems:     5
Matching fail-on:  2  (not_found, server_error)
Billed URL checks: 5
Apify run:         RUN1

      Status  Flags                       URL                           Final URL
----  ------  --------------------------  ----------------------------  ----------------------------
FAIL  404     not_found                   https://example.com/old-page
FAIL  503     server_error                https://example.com/api-down
      200     redirected, redirect_chain  https://example.com/blog      https://www.example.com/blog
      -       timeout                     https://example.com/slow
      200     noindex_header              https://example.com/private
```

### In CI

```yaml
- run: npx -y sitemap-url-health-check@0 example.com --fail-on not_found,server_error
  env:
    APIFY_TOKEN: ${{ secrets.APIFY_TOKEN }}
```

On GitHub you can also use the [Sitemap URL Health Check Action](https://github.com/lineagersiui-boop/sitemap-url-health-check), which writes a job summary.

## Disclosure

We built and maintain the Apify Actor this CLI calls, and we earn its pay-per-event fees ($0.0005 per URL checked). There are no affiliate or referral parameters. This package was written with AI assistance under the author's direction. It is not affiliated with or endorsed by Apify.

## License

MIT
