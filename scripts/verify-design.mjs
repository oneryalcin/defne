import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/defne-design";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();

async function loginAs(username) {
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', username);
  await Promise.all([
    page.waitForURL((url) => !url.toString().endsWith("/"), { timeout: 8000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
}

async function shot(name) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () => {
      const imgs = Array.from(document.images || []);
      return imgs.length === 0 || imgs.every((i) => i.complete);
    },
    { timeout: 5000 }
  ).catch(() => null);
  await page.waitForTimeout(1200);
  const path = `${OUT}/${name}.jpeg`;
  await page.screenshot({ path, type: "jpeg", quality: 85, fullPage: true });
  console.log(`saved ${path} (url=${page.url()})`);
}

console.log("== Map cover (defne) ==");
await loginAs("defne");
await page.goto("http://localhost:3000/child", { waitUntil: "domcontentloaded" });
await shot("01-map-cover");

console.log("== Start round, walk learn cards ==");
await page.locator('main .cover-actions button[type="submit"]').first().click();
await page.waitForURL(/\/child\/session\//, { timeout: 8000 });
await page.waitForLoadState("domcontentloaded");

for (let i = 0; i < 25; i++) {
  if ((await page.locator('.choice-row').count()) > 0) break;
  if (page.url() === "http://localhost:3000/" || page.url().includes("error=")) {
    console.log(`  bailed: redirected to ${page.url()}`);
    break;
  }
  const submit = page.locator('main form button[type="submit"]').first();
  if ((await submit.count()) === 0) {
    console.log(`  no submit at ${page.url()}`);
    break;
  }
  const txt = (await submit.textContent())?.trim() ?? "";
  console.log(`  step ${i}: clicking "${txt}" at ${page.url()}`);
  await submit.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
}
await shot("02-practice");

console.log("== Toggle a hint rung, screenshot ==");
const firstRung = page.locator(".rung--card").first();
if ((await firstRung.count()) > 0) {
  await firstRung.click();
  await shot("03-practice-hint-open");
}

console.log("== Pick choice and submit ==");
const choices = page.locator(".choice-row");
const choiceCount = await choices.count();
if (choiceCount > 0) {
  await choices.first().click();
  await shot("04-practice-choice-selected");
  const submit = page.locator('main button[type="submit"]').last();
  if ((await submit.count()) > 0) {
    await submit.click();
    await page.waitForLoadState("domcontentloaded");
    await shot("05-practice-after-submit");
  }
}

console.log("== End spread (visit /summary directly) ==");
const m = page.url().match(/\/child\/session\/([^?/]+)/);
if (m) {
  await page.goto(`http://localhost:3000/child/session/${m[1]}/summary`, {
    waitUntil: "domcontentloaded",
  });
  await shot("07-end-spread");
} else {
  console.log(`  no session id found in ${page.url()}`);
}

console.log("== Parent dashboard (daria) ==");
await context.clearCookies();
await loginAs("daria");
await page.goto("http://localhost:3000/parent", { waitUntil: "domcontentloaded" });
await shot("06-parent-dashboard");

await browser.close();
console.log("done");
