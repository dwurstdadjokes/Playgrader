// Browser test for the Playgrader frontend. Starts the mock server, drives Chromium via Playwright.
// Run: node scripts/test-ui.mjs   (writes evidence to scripts/evidence/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = _require("playwright")); } catch { ({ chromium } = _require(process.env.PLAYWRIGHT_GLOBAL || "/home/claude/.npm-global/lib/node_modules/playwright")); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE = path.join(__dirname, "evidence");
fs.mkdirSync(EVIDENCE, { recursive: true });
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function assert(cond, msg) { if (cond) console.log("  PASS", msg); else { failures++; console.log("  FAIL", msg); } }

// A tiny valid JPEG-ish test image: draw a PNG with canvas would need a browser, so ship a 1x1 PNG.
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const testImg = path.join(EVIDENCE, "test-upload.png");
fs.writeFileSync(testImg, PNG_1x1);

const server = spawn("node", [path.join(__dirname, "mock-server.mjs"), String(PORT), "ok"], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

try {
  console.log("Load home");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(EVIDENCE, "01-home.png"), fullPage: true });
  const title = await page.title();
  assert(!title.includes("\u2014"), "title has no em dash: " + title);
  assert(await page.locator(".tagline").textContent() === "Snap. Grade. Parent like a pro.", "brand tagline present");
  const fbHref = await page.locator("#feedback-link").getAttribute("href");
  assert(fbHref && !fbHref.includes("REPLACE_WITH"), "feedback link is real: " + fbHref);

  console.log("PWA checks");
  const manifest = await (await page.request.get(BASE + "/manifest.json")).json();
  const icons = manifest.icons || [];
  assert(icons.some((i) => i.sizes === "192x192") && icons.some((i) => i.sizes === "512x512"), "manifest lists 192 and 512 icons");
  for (const i of icons) {
    const r = await page.request.get(BASE + i.src);
    assert(r.status() === 200, `icon ${i.src} returns 200`);
  }
  const swState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
    return reg ? "ready" : "timeout";
  });
  assert(swState === "ready", "service worker ready: " + swState);

  console.log("Scan flow");
  await page.setInputFiles("#file-input", testImg);
  await page.waitForSelector("#screen-result:not(.hidden)", { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(EVIDENCE, "02-result.png"), fullPage: true });
  const grade = (await page.locator("#grade-letter").textContent()).trim();
  assert(/^[A-F][+-]?$/.test(grade), "grade letter rendered: " + grade);
  const catCount = await page.locator("#categories-list .category-row").count();
  assert(catCount >= 3, "3+ category rows: " + catCount);
  const altVisible = await page.locator("#alts-section").isVisible();
  const altCount = await page.locator("#alts-list .alt-card").count();
  assert(altVisible && altCount >= 2, "2+ alternatives visible: " + altCount);
  assert((await page.locator("#grade-headline").textContent()).trim().length > 0, "headline rendered");

  console.log("Share report card");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.click("#share-btn"),
  ]);
  const dlPath = path.join(EVIDENCE, "03-report-card.png");
  await download.saveAs(dlPath);
  const size = fs.statSync(dlPath).size;
  assert(size > 20 * 1024, "report card PNG > 20KB: " + size + " bytes");
  const blobSize = await page.evaluate(() => window.__lastReportCardSize);
  assert(blobSize && blobSize === size, "blob size matches saved file");

  console.log("History persists across reload");
  await page.click(".back-btn");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const histVisible = await page.locator("#history-section").isVisible();
  const histCount = await page.locator("#history-list .history-item").count();
  assert(histVisible && histCount >= 1, "history visible after reload with items: " + histCount);
  await page.screenshot({ path: path.join(EVIDENCE, "04-home-with-history.png"), fullPage: true });
  await page.click("#history-list .history-item >> nth=0");
  await page.waitForSelector("#screen-result:not(.hidden)");
  assert((await page.locator("#result-name").textContent()).length > 0, "history item reopens result");

  console.log("Console errors (app-origin only; Google Fonts is blocked by this sandbox's proxy)");
  const appErrors = consoleErrors.filter((t) => !/ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com/.test(t));
  assert(appErrors.length === 0, "zero console errors" + (appErrors.length ? ": " + appErrors.join(" | ") : ""));
  if (consoleErrors.length !== appErrors.length) console.log("  note: ignored " + (consoleErrors.length - appErrors.length) + " font-proxy resource error(s) from the sandbox");

  console.log("Error path shows friendly copy");
  await page.route("**/api/grade", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "We could not read that grade. Try a clearer photo?" }) }));
  await page.click(".back-btn");
  await page.setInputFiles("#file-input", testImg);
  await page.waitForSelector("#error-banner:not(.hidden)", { timeout: 15000 });
  const errText = await page.locator("#error-text").textContent();
  assert(/clearer photo/.test(errText), "friendly error shown: " + errText);
  await page.unroute("**/api/grade");

} catch (e) {
  failures++;
  console.log("  FAIL exception:", e.message);
  await page.screenshot({ path: path.join(EVIDENCE, "99-failure.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} UI FAILURE(S)` : "\nALL UI TESTS PASSED");
process.exit(failures ? 1 : 0);
