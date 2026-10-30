'use strict';
// Minimal Apify API client on Node 18+ built-in fetch. The token is only sent in the
// Authorization header and never printed.

const ACTOR_ID = 'lineagersiui~sitemap-url-health-checker';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

class ApifyError extends Error {}

function createClient({ token, baseUrl = 'https://api.apify.com', fetchImpl = globalThis.fetch, userAgent = 'sitemap-url-health-check-cli' }) {
  if (!token) throw new ApifyError('APIFY_TOKEN is not set. Copy your API token from Apify Console > Settings > Integrations and set APIFY_TOKEN.');
  if (typeof fetchImpl !== 'function') throw new ApifyError('This CLI needs Node.js 18 or newer (built-in fetch).');

  async function call(method, path, body, attempt = 1) {
    let res;
    try {
      res = await fetchImpl(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': userAgent,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 5000));
        return call(method, path, body, attempt + 1);
      }
      throw new ApifyError(`Could not reach the Apify API (${e && e.message ? e.message : 'network error'}).`);
    }
    if (res.status >= 500 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 5000));
      return call(method, path, body, attempt + 1);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
    return { status: res.status, json };
  }

  function apiMessage(json) {
    const m = json && json.error && json.error.message;
    return m ? String(m).slice(0, 300) : '';
  }

  return {
    async startRun(input) {
      const r = await call('POST', `/v2/acts/${ACTOR_ID}/runs`, input);
      if (r.status === 201 || r.status === 200) return r.json.data;
      if (r.status === 401) throw new ApifyError('Apify rejected the token (HTTP 401). Check APIFY_TOKEN.');
      if (r.status === 402) throw new ApifyError(`Apify usage limit or credit problem (HTTP 402): ${apiMessage(r.json)}`);
      throw new ApifyError(`Could not start the Actor (HTTP ${r.status}): ${apiMessage(r.json)}`);
    },
    async waitForRun(runId, { maxWaitSecs = 4200, onStatus } = {}) {
      const started = Date.now();
      for (;;) {
        const r = await call('GET', `/v2/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`);
        if (r.status === 200 && r.json && r.json.data) {
          const run = r.json.data;
          if (TERMINAL.has(run.status)) return run;
          if (onStatus) onStatus(run.status);
        } else {
          await new Promise((res) => setTimeout(res, 10000));
        }
        if ((Date.now() - started) / 1000 >= maxWaitSecs) throw new ApifyError(`Gave up waiting for run ${runId} after ${maxWaitSecs}s.`);
      }
    },
    async getSummary(kvsId) {
      const r = await call('GET', `/v2/key-value-stores/${encodeURIComponent(kvsId)}/records/SUMMARY`);
      return r.status === 200 && r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? r.json : {};
    },
    async getItems(datasetId) {
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await call('GET', `/v2/datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true&offset=${offset}&limit=1000`);
        if (r.status !== 200 || !Array.isArray(r.json)) throw new ApifyError(`Could not download results (HTTP ${r.status}).`);
        all.push(...r.json);
        if (r.json.length < 1000) return all;
      }
    },
  };
}

module.exports = { createClient, ApifyError, ACTOR_ID, TERMINAL };
