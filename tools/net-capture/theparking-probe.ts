// Deep network probe of theparking.eu: drive real Chrome through listing → filter →
// paginate → detail, capturing ALL first-party XHR/fetch/document to find internal
// APIs, the ajax pagination/filter endpoint, and the detail-page gallery/outbound link.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const NOISE = ['google', 'doubleclick', 'seedtag', 'pubmatic', 'fuseplatform', 'sportslocalmedia',
  'viously', 'criteo', 'id5', 'rubicon', 'facebook', 'cloudflareinsights', 'sentry', 'hotjar',
  'consent', 'onetrust', 'sourcepoint', 'prebid', 'adservice', 'ads4all.fr/', 'carvertical', 'stripe'];
const isNoise = (u: string) => NOISE.some((n) => u.includes(n));

interface ApiRecord {
  phase: string;
  method: string;
  url: string;
  type: string;
  post: string | null;
  status: number | null;
  ct: string | null;
  resp: string | null;
}

const api: ApiRecord[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();

page.on('request', (req) => {
  const url = req.url();
  if (!/theparking|leparking|ads4all/.test(url)) return;
  if (!['xhr', 'fetch'].includes(req.resourceType())) return;
  if (isNoise(url)) return;
  let post: string | null = null; try { post = req.postData()?.slice(0, 500) ?? null; } catch {}
  api.push({ phase: current, method: req.method(), url, type: req.resourceType(), post, status: null, ct: null, resp: null });
});
page.on('response', async (r) => {
  const url = r.request().url();
  const rec = api.find((a) => a.url === url && a.status === null);
  if (!rec) return;
  rec.status = r.status();
  const ct = r.headers()['content-type'] || '';
  rec.ct = ct;
  if (/json/i.test(ct)) { try { rec.resp = (await r.body()).toString('utf8').slice(0, 1200); } catch {} }
});

let current = 'init';
const log = (m: string) => console.log(m);
async function consent() { for (const t of ['Aceitar', 'Accept', 'Accepteren', 'Accepter', 'I agree', 'Agree', 'OK']) { try { const b = page.getByRole('button', { name: t, exact: false }); if (await b.first().isVisible({ timeout: 800 })) { await b.first().click(); await page.waitForTimeout(700); return; } } catch {} } }
const sleep = (ms: number) => page.waitForTimeout(ms);

current = 'listing';
log('→ listing (belgium)');
await page.goto('https://www.theparking.eu/used-cars/belgium.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
await consent();
await sleep(3500);

current = 'paginate';
log('→ paginate via UI (page 2)');
try { await page.evaluate(() => { const w = window as unknown as { ctrl?: { set_pageReload?: (n: number) => void } }; w.ctrl?.set_pageReload?.(2); }); } catch (e) { log('pageReload err: ' + (e instanceof Error ? e.message : String(e))); }
await sleep(4000);

current = 'filter';
log('→ apply a filter (open filter UI / pick a make if present)');
try {
  // try to trigger a criteria change via the controller (mirrors UI filter)
  await page.evaluate(() => { const w = window as unknown as { ctrl?: { set_criteria?: (a: string, b: number, c: string) => void } }; w.ctrl?.set_criteria?.('id_marque', 74, 'BMW'); });
} catch (e) { log('filter err: ' + (e instanceof Error ? e.message : String(e))); }
await sleep(4000);

current = 'detail';
log('→ open a detail page');
try {
  const href = await page.locator('a[href*="used-cars-detail/"]').first().getAttribute('href');
  if (href) { await page.goto(new URL(href, 'https://www.theparking.eu').href, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
} catch (e) { log('detail nav err: ' + (e instanceof Error ? e.message : String(e))); }
await sleep(3500);
// count gallery images + look for outbound "see the ad" link
const detailInfo = await page.evaluate(() => {
  const imgs = new Set([...document.querySelectorAll('img')].map((i) => i.src).filter((s) => /cloud\.leparking|photo|vehicle/i.test(s)));
  const outbound = [...document.querySelectorAll('a')].map((a) => ({ t: (a.textContent ?? '').trim().slice(0, 40), href: a.href }))
    .filter((a) => /extlink|redir|voir|see|annonce|source|original|website|site/i.test(a.t + a.href)).slice(0, 8);
  const leadBtn = [...document.querySelectorAll('a,button')].map((e) => (e.textContent ?? '').trim()).filter((t) => /lead|contact|phone|tel|voir l|see the/i.test(t)).slice(0, 6);
  return { imgCount: imgs.size, imgs: [...imgs].slice(0, 3), outbound, leadBtn };
}).catch(() => ({}));
log('detail: ' + JSON.stringify(detailInfo, null, 2));

writeFileSync(`${OUT}theparking-api.json`, JSON.stringify(api, null, 2));
log(`\ncaptured ${api.length} first-party XHR/fetch → out/theparking-api.json`);
// print unique endpoints grouped
const uniq: Record<string, { count: number; ct: string | null; status: number | null; sample: ApiRecord }> = {};
for (const a of api) { const key = a.method + ' ' + a.url.split('?')[0]; (uniq[key] ||= { count: 0, ct: a.ct, status: a.status, sample: a }); uniq[key].count++; }
log('\n=== endpoints ===');
for (const [k, v] of Object.entries(uniq)) log(`[${v.status}] ${k}  (x${v.count}) ${v.ct || ''}`);
await browser.close();
