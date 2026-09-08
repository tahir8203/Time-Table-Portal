import fs from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const candidates = [
  process.env.LOCAL_CHROME_PATH,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
let browserPath = "";
for (const candidate of candidates) {
  try { await fs.access(candidate); browserPath = candidate; break; } catch {}
}
if (!browserPath) throw new Error("No local Chromium browser was found for PDF Preview QA.");

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let requests = 0;
  const fixture = await fs.readFile("output/pdf/complete-timetable-book.pdf");
  await page.route("**/api/pdf", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "X-PDF-Pages": "33",
        "X-PDF-Min-Height-Fill": "100",
        "X-PDF-Min-Font-PT": "6.07",
      },
      body: fixture,
    });
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.CloudPortal = { getIdToken: async () => "qa-token", requiresSignIn: () => false };
    VIEW = "print";
    render();
  });

  await page.locator('[data-pv="all"]').click();
  await page.locator("#pdfPreviewFrame").waitFor();
  const previewUrl = (await page.locator("#pdfPreviewFrame").getAttribute("src"))?.split("#")[0];
  const previewMessage = await page.locator("[data-preview-mode=all]").textContent();
  const afterPreview = requests;
  if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });

  const firstDownload = await page.evaluate(() => doPrint("all"));
  const afterDownload = requests;

  await page.evaluate(() => { S.meta.school = "Changed QA School"; DIRTY = true; });
  await page.evaluate(() => doPrint("all"));
  const afterChange = requests;

  const result = {
    previewUsesPdfFrame: Boolean(previewUrl?.startsWith("blob:")),
    previewExplainsExactMatch: previewMessage?.includes("exact verified PDF used by Download A4 PDF") === true,
    previewRequestedOnePdf: afterPreview === 1,
    downloadReusedPreviewPdf: afterDownload === 1 && firstDownload.url === previewUrl,
    downloadFilenameCorrect: firstDownload.fileName === "complete-timetable-book.pdf",
    changedDataBuildsNewPdf: afterChange === 2,
  };
  if (Object.values(result).some((value) => value !== true)) {
    throw new Error(`PDF Preview QA failed: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
