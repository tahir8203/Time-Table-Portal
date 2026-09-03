import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import chromiumBinary from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";
import { PDFDocument } from "pdf-lib";

export const config = { maxDuration: 300 };

const ALLOWED_MODES = new Set([
  "gate", "cmaster", "tmaster", "ccards", "tcards", "all", "coverday", "covermonth",
]);

const FILE_NAMES = {
  gate: "gate-time-division.pdf",
  cmaster: "class-wise-all-classes.pdf",
  tmaster: "teacher-wise-all-teachers.pdf",
  ccards: "class-timetables.pdf",
  tcards: "teacher-timetables.pdf",
  all: "complete-timetable-book.pdf",
  coverday: "alternative-period-order.pdf",
  covermonth: "alternative-period-statement.pdf",
};

const PDF_CSS = String.raw`
  @page portrait { size: A4 portrait; margin: 5mm; }
  @page landscape { size: A4 landscape; margin: 5mm; }
  :root { --k: 8; --xp: 0rem; color: #000; background: #fff; }
  * { box-sizing: border-box; font-size: 1rem; }
  html { font-size: calc(var(--k) * 1pt); background: #fff; }
  body { margin: 0; color: #000; background: #fff; font-family: "Arial Narrow", Arial, Helvetica, sans-serif; font-size: 1rem; }
  .psheet { page: landscape; width: 286.8mm; height: 199.8mm; margin: 0; padding: 0; overflow: hidden; color: #000; background: #fff; break-after: page; page-break-after: always; }
  .psheet.pp { page: portrait; width: 199.8mm; height: 286.8mm; }
  .psheet:last-child { break-after: auto; page-break-after: auto; }
  .ptitle, .pbig { color: #fff; background: #000; border: .18rem solid #000; text-align: center; font-weight: 900; line-height: 1.02; }
  .ptitle { padding: calc(.18rem + var(--xp)) 1.2mm; font-size: 1.65rem; }
  .pbig { padding: calc(.35rem + var(--xp)) 1.2mm; font-size: 3.2rem; }
  .psub, .pinfo, .psum { color: #000; background: #fff; border: .18rem solid #000; text-align: center; font-weight: 900; line-height: 1.08; }
  .psub { padding: calc(.14rem + var(--xp)) 1.1mm; font-size: 1.15rem; }
  .pinfo { padding: calc(.18rem + var(--xp)) 1.1mm; font-size: 1.1rem; }
  .psum { margin-top: .35rem; padding: calc(.18rem + var(--xp)) 1.1mm; font-size: 1.05rem; }
  .pfoot { margin-top: .22rem; color: #000; background: #fff; text-align: center; font-size: 1.05rem; font-weight: 700; line-height: 1.05; }
  .meta-foot { margin: .28rem 0; }
  .top-gap { margin-top: .28rem; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #000; background: #fff; font-size: 1rem; }
  table.pt, table.pcard { margin-top: .28rem; }
  th, td { border: .12rem solid #000; padding: calc(.08rem + var(--xp)) .65mm; color: #000; background: #fff; text-align: center; vertical-align: middle; font-size: 1rem; font-weight: 700; line-height: 1.03; overflow-wrap: normal; word-break: normal; hyphens: none; }
  th { color: #fff; background: #000; font-size: 1.42rem; font-weight: 900; line-height: 1.02; white-space: nowrap; }
  th.t2 { color: #fff; background: #000; font-size: 1.4rem; font-weight: 900; }
  td.k { font-size: 1.05rem; font-weight: 900; }
  td.void { color: #000; background: #fff; font-size: 1rem; font-weight: 800; font-style: italic; }
  td.brkc, th.brkc { width: 3.2mm; padding-left: .25mm; padding-right: .25mm; }
  td.brkc { color: #000; background: #fff; font-size: 1.1rem; font-weight: 900; }
  td.brkc span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 1.1rem; font-weight: 900; }
  th.brkc { color: #fff; background: #000; font-size: 1.1rem; }
  td .dayline { display: block; padding: .02rem 0; border-bottom: .08rem solid #000; font-size: 1rem; line-height: 1.01; }
  td .dayline:last-child { border-bottom: 0; }
  td .daytag { display: block; color: #000; background: #fff; font-size: 1rem; font-weight: 900; line-height: 1; text-transform: uppercase; white-space: nowrap; }
  td .s { display: block; color: #000; background: #fff; font-size: 1.06rem; font-weight: 900; line-height: 1.01; }
  td .t { display: block; color: #000; background: #fff; font-size: 1rem; font-weight: 750; line-height: 1.01; }
  td .cardtext { display: block; color: #000; background: #fff; font-size: 1rem; font-weight: 800; line-height: 1.01; }
  td .lessonpair { display: inline; color: #000; background: #fff; font-size: 1.06rem; font-weight: 850; line-height: 1.01; }
  tr.asm td, tr.brk td { color: #000; background: #fff; font-size: .98rem; font-weight: 900; }
  tr.brk td { border-top-width: .2rem; border-bottom-width: .2rem; }
  tr.free td.mainv { color: #000; background: #fff; font-size: 1.05rem; font-style: italic; }
  .dash { color: #000; background: #fff; font-size: 1rem; font-style: italic; font-weight: 800; }
  .ctname, .desig, .free-count { color: #000; background: #fff; font-size: 1.05rem; }
  .desig { font-weight: 500; }
  .free-count { font-weight: 800; }
  .cover-title { font-size: 2.45rem; }
  .cover-table { margin-top: .42rem; }
  .cover-time { font-size: 1rem; }
  .cover-class, .cover-teacher { font-size: 1.18rem; }
  .cover-subject { font-size: 1.05rem; }
  .cover-absent, .not-covered { font-size: 1.05rem; font-weight: 900; }
  .cover-summary { font-size: 1.05rem; }
  .sign-space { width: 7rem; }
  .psign { margin-top: 1.6rem; color: #000; background: #fff; font-size: 1.05rem; }
  .split-signatures { display: flex; justify-content: space-between; }
  .right-signature { text-align: right; }
  .left-text { text-align: left; }
  .number-value { font-weight: 700; }
  .date-list { font-size: .96rem; }
  table.pcard th { font-size: 1.2rem; }
  table.pcard td { font-size: 1.08rem; }
  table.pcard td.p { font-size: 1.16rem; font-weight: 900; }
  table.pcard td.mainv { font-size: 1.18rem; font-weight: 900; }
  table.pcard td.card-time { font-size: 1.05rem; white-space: nowrap; }
  .master-onepage table.pt th { font-size: 1.42rem; }
  .master-onepage table.pt th.t2 { font-size: 1.4rem; }
  .master-onepage table.pt td { font-size: .96rem; }
  .master-onepage table.pt td.ctname { font-size: 1.05rem; }
  .master-onepage table.pt td .lessonpair { font-size: 1rem; }
  .teacher-master table.pt th { font-size: 1.42rem; }
  .teacher-master table.pt th.t2 { font-size: 1.4rem; }
  .teacher-master table.pt td { font-size: 1rem; }
  .teacher-master table.pt td.k { font-size: 1.1rem; }
  .teacher-master table.pt td.ctname, .teacher-master table.pt td.free-count { font-size: 1.05rem; }
  .teacher-master table.pt td.k .desig { font-size: 1.05rem; }
  .teacher-master table.pt td .lessonpair { font-size: 1.05rem; }
  .teacher-master table.pt td .daytag { font-size: 1.08rem; }
  col.m-name { width: 8%; }
  col.m-class-teacher { width: 12%; }
  col.m-break { width: 2.4%; }
  .teacher-master col.m-name { width: 11%; }
  .teacher-master col.m-class-teacher { width: 5%; }
  .teacher-master col.m-total, .teacher-master col.m-free { width: 5.2%; }
  .problem { outline: .2rem solid #000; outline-offset: -.2rem; }
`;

function cleanFragment(html) {
  if (typeof html !== "string" || html.length < 20 || html.length > 2_500_000) {
    throw new Error("The printable document is empty or too large.");
  }
  if (/url\s*\(|expression\s*\(|javascript\s*:|@import|<\s*(script|iframe|img|link|object|embed)/i.test(html)) {
    throw new Error("The printable document contains unsupported content.");
  }
  return html;
}

function documentHtml(sheetHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_CSS}</style></head><body>${sheetHtml}</body></html>`;
}

function localBrowserPath() {
  const candidates = [
    process.env.LOCAL_CHROME_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function launchBrowser() {
  const local = process.platform === "win32" ? localBrowserPath() : null;
  const executablePath = local || await chromiumBinary.executablePath();
  const persistent = !local || process.env.PDF_PERSISTENT_CONTEXT_TEST === "1";
  const userDataDir = persistent ? path.join(os.tmpdir(), `pw-${randomUUID()}`) : null;
  const args = local ? ["--no-sandbox", "--disable-dev-shm-usage"] : chromiumBinary.args;
  try {
    const browser = persistent
      ? await playwright.launchPersistentContext(userDataDir, { executablePath, headless: true, args })
      : await playwright.launch({ executablePath, headless: true, args });
    if (persistent) {
      for (const page of browser.pages()) await page.close();
    }
    return { browser, userDataDir };
  } catch (error) {
    if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

async function verifyFirebaseUser(authorization) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!token || !apiKey) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return Array.isArray(result.users) && result.users.length === 1;
}

async function extractSheets(browser, html) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent('<main id="source"></main>', { waitUntil: "domcontentloaded" });
    await page.locator("#source").evaluate((source, rawHtml) => {
      const parsed = new DOMParser().parseFromString(rawHtml, "text/html");
      const allowedTags = new Set(["DIV", "TABLE", "COLGROUP", "COL", "THEAD", "TBODY", "TR", "TH", "TD", "SPAN", "BR", "B", "STRONG", "EM", "I"]);
      const spanTags = new Set(["TD", "TH", "COL"]);
      const cloneSafe = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        const container = allowedTags.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
        if (container.nodeType === Node.ELEMENT_NODE) {
          if (node.hasAttribute("class")) container.setAttribute("class", node.getAttribute("class"));
          if (spanTags.has(node.tagName)) {
            for (const name of ["rowspan", "colspan", "span"]) {
              if (!node.hasAttribute(name)) continue;
              const value = Number.parseInt(node.getAttribute(name), 10);
              if (Number.isInteger(value) && value >= 1 && value <= 80) container.setAttribute(name, String(value));
            }
          }
        }
        for (const child of node.childNodes) container.appendChild(cloneSafe(child));
        return container;
      };
      for (const child of parsed.body.childNodes) source.appendChild(cloneSafe(child));
    }, html);
    const sheets = await page.locator("#source > .psheet").evaluateAll((nodes) => nodes.map((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(/\b([A-Za-z]+) \(([A-Z])\)/g, "$1\u00a0($2)");
      }
      node.querySelectorAll(".master-onepage .dayline").forEach((line) => {
        const main = line.querySelector(":scope > .s");
        const secondary = line.querySelector(":scope > .t");
        if (!main || !secondary) return;
        const pair = document.createElement("span");
        pair.className = "lessonpair";
        pair.textContent = `${main.textContent} / ${secondary.textContent}`;
        main.replaceWith(pair);
        secondary.remove();
      });
      node.querySelectorAll("table.pcard td:not(.card-time)").forEach((cell) => {
        if (cell.children.length || !cell.textContent.includes(":")) return;
        const parts = cell.textContent.split(" / ");
        if (!parts.some((part) => /^[^:]{1,30}:\s*/.test(part))) return;
        cell.replaceChildren(...parts.flatMap((part, index) => {
          const match = part.match(/^([^:]{1,30}):\s*(.*)$/);
          const line = document.createElement("span");
          line.className = "dayline";
          if (match) {
            const tag = document.createElement("span");
            tag.className = "daytag";
            tag.textContent = match[1];
            const text = document.createElement("span");
            text.className = "cardtext";
            text.textContent = match[2];
            line.append(tag, text);
          } else {
            line.textContent = part;
          }
          return index ? [line] : [line];
        }));
      });
      node.querySelectorAll(".card-time").forEach((cell) => {
        if (!cell.children.length) cell.textContent = cell.textContent.replace(/ /g, "\u00a0");
      });
      return { html: node.outerHTML, portrait: node.classList.contains("pp") };
    }));
    if (!sheets.length || sheets.length > 80) throw new Error("The printable document has an invalid sheet count.");
    return sheets;
  } finally {
    await page.close();
  }
}

async function measure(page) {
  return page.locator(".psheet").evaluate((sheet) => {
    const rect = sheet.getBoundingClientRect();
    const children = Array.from(sheet.children).map((element) => element.getBoundingClientRect());
    const contentBottom = children.length ? Math.max(...children.map((item) => item.bottom)) : rect.top;
    const contentRight = children.length ? Math.max(...children.map((item) => item.right)) : rect.left;
    const contentLeft = children.length ? Math.min(...children.map((item) => item.left)) : rect.left;
    const clipped = Array.from(sheet.querySelectorAll("td,th")).filter((cell) => {
      const style = getComputedStyle(cell);
      const horizontalTolerance = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + .5;
      const verticalTolerance = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + .5;
      return cell.scrollWidth > cell.clientWidth + horizontalTolerance || cell.scrollHeight > cell.clientHeight + verticalTolerance;
    });
    const pageClip = contentBottom > rect.bottom + .5 || contentRight > rect.right + .5 || contentLeft < rect.left - .5;
    const visibleText = Array.from(sheet.querySelectorAll("*"))
      .filter((element) => element.children.length === 0 && element.textContent.trim() && getComputedStyle(element).display !== "none");
    const darkText = Array.from(sheet.querySelectorAll("th,.ptitle,.pbig"))
      .filter((element) => element.textContent.trim());
    const fontEntries = visibleText.map((element) => ({
      element,
      points: parseFloat(getComputedStyle(element).fontSize) * 72 / 96,
    }));
    const fontSizes = fontEntries.map((entry) => entry.points);
    const darkFontSizes = darkText.map((element) => parseFloat(getComputedStyle(element).fontSize) * 72 / 96);
    const rowHeights = Array.from(sheet.querySelectorAll("tbody tr")).map((row) => Number(row.getBoundingClientRect().height.toFixed(2)));
    const heightOf = (selector) => Array.from(sheet.querySelectorAll(selector)).reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
    return {
      fits: !pageClip && clipped.length === 0,
      pageClip,
      clippedCells: clipped.length,
      clippedExamples: clipped.slice(0, 5).map((cell) => ({
        text: cell.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
        className: cell.className,
        scrollWidth: cell.scrollWidth,
        clientWidth: cell.clientWidth,
        scrollHeight: cell.scrollHeight,
        clientHeight: cell.clientHeight,
      })),
      heightOverflowPx: Number(Math.max(0, contentBottom - rect.bottom).toFixed(2)),
      widthOverflowPx: Number(Math.max(0, contentRight - rect.right, rect.left - contentLeft).toFixed(2)),
      heightFill: Number(Math.min(100, Math.max(0, (contentBottom - rect.top) / rect.height * 100)).toFixed(2)),
      widthFill: Number(Math.min(100, Math.max(0, (contentRight - contentLeft) / rect.width * 100)).toFixed(2)),
      minFontPt: fontSizes.length ? Number(Math.min(...fontSizes).toFixed(2)) : 0,
      minFontExamples: fontEntries
        .filter((entry) => entry.points <= Math.min(...fontSizes) + .05)
        .slice(0, 5)
        .map((entry) => ({ tag: entry.element.tagName, className: entry.element.className, text: entry.element.textContent.trim().replace(/\s+/g, " ").slice(0, 80) })),
      minDarkFontPt: darkFontSizes.length ? Number(Math.min(...darkFontSizes).toFixed(2)) : 0,
      mastheadPx: Number(heightOf(".ptitle,.pbig,.psub,.pinfo").toFixed(2)),
      theadPx: Number(heightOf("thead").toFixed(2)),
      tbodyPx: Number(heightOf("tbody").toFixed(2)),
      footnotePx: Number(heightOf(".pfoot,.psum").toFixed(2)),
      rowHeights,
    };
  });
}

async function setScale(page, k, xp) {
  await page.evaluate(({ nextK, nextXp }) => {
    document.documentElement.style.setProperty("--k", String(nextK));
    document.documentElement.style.setProperty("--xp", `${nextXp}rem`);
  }, { nextK: k, nextXp: xp });
}

async function maximizeSheet(page) {
  let low = 3;
  let high = 30;
  let best = 0;
  let scaleLimit = null;
  await setScale(page, low, 0);
  if (!(await measure(page)).fits) throw new Error("A sheet cannot fit even at the minimum safe scale.");
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const middle = (low + high) / 2;
    await setScale(page, middle, 0);
    const probe = await measure(page);
    if (probe.fits) {
      best = middle;
      low = middle;
    } else {
      scaleLimit = probe;
      high = middle;
    }
  }
  const roundedK = Math.floor(best * 100) / 100;
  await setScale(page, roundedK, 0);

  let xpLow = 0;
  let xpHigh = 10;
  let bestXp = 0;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const middle = (xpLow + xpHigh) / 2;
    await setScale(page, roundedK, middle);
    if ((await measure(page)).fits) {
      bestXp = middle;
      xpLow = middle;
    } else {
      xpHigh = middle;
    }
  }
  const roundedXp = Math.floor(bestXp * 1000) / 1000;
  await setScale(page, roundedK, roundedXp);
  const metrics = await measure(page);
  if (!metrics.fits || metrics.clippedCells) throw new Error("Final PDF verification detected clipped content.");
  if (metrics.heightFill < 99) throw new Error("A sheet did not fill at least 99% of the usable page height.");
  if (metrics.minDarkFontPt < 7.8) {
    throw new Error(`Dark header text fell below the 8pt print-safety floor (${metrics.minDarkFontPt}pt at --k ${roundedK}; limiting test: page clip ${scaleLimit?.pageClip}, clipped cells ${scaleLimit?.clippedCells}, height overflow ${scaleLimit?.heightOverflowPx}px, width overflow ${scaleLimit?.widthOverflowPx}px; examples ${JSON.stringify(scaleLimit?.clippedExamples || [])}).`);
  }
  return { k: roundedK, xp: roundedXp, ...metrics };
}

async function renderSheet(browser, sheet) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  try {
    await page.route("**/*", (route) => route.abort());
    await page.setContent(documentHtml(sheet.html), { waitUntil: "domcontentloaded" });
    await page.emulateMedia({ media: "print" });
    const metrics = await maximizeSheet(page);
    const pdf = await page.pdf({
      format: "A4",
      landscape: !sheet.portrait,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const check = await PDFDocument.load(pdf);
    if (check.getPageCount() !== 1) throw new Error("A printable sheet spilled onto a second PDF page.");
    return { pdf, metrics };
  } finally {
    await page.close();
  }
}

async function buildPdf(html, mode) {
  const { browser, userDataDir } = await launchBrowser();
  try {
    const sheets = await extractSheets(browser, html);
    const output = await PDFDocument.create();
    const metrics = [];
    for (let index = 0; index < sheets.length; index += 1) {
      try {
        const rendered = await renderSheet(browser, sheets[index]);
        const source = await PDFDocument.load(rendered.pdf);
        const [page] = await output.copyPages(source, [0]);
        output.addPage(page);
        metrics.push(rendered.metrics);
      } catch (error) {
        throw new Error(`Sheet ${index + 1} of ${sheets.length}: ${error.message}`);
      }
    }
    if (output.getPageCount() !== sheets.length) throw new Error("The PDF page-count assertion failed.");
    output.setTitle(FILE_NAMES[mode].replace(/\.pdf$/i, ""));
    output.setSubject(`Verified A4 timetable PDF; ${sheets.length} sheet(s), one page per sheet.`);
    output.setProducer("GES Timetable Portal - Playwright/Chromium");
    output.setCreationDate(new Date());
    return { bytes: await output.save(), metrics, pageCount: sheets.length };
  } finally {
    await browser.close();
    if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
  }
}

export { buildPdf, cleanFragment };

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to generate a PDF." });
  }
  try {
    if (!(await verifyFirebaseUser(request.headers.authorization))) {
      return response.status(401).json({ error: "Please sign in to generate PDFs." });
    }
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const mode = String(body?.mode || "");
    if (!ALLOWED_MODES.has(mode)) return response.status(400).json({ error: "Unknown PDF type." });
    const html = cleanFragment(body?.html);
    const result = await buildPdf(html, mode);
    const minFill = Math.min(...result.metrics.map((item) => item.heightFill));
    const minFont = Math.min(...result.metrics.map((item) => item.minFontPt));
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${FILE_NAMES[mode]}"`);
    response.setHeader("X-PDF-Pages", String(result.pageCount));
    response.setHeader("X-PDF-Min-Height-Fill", String(minFill));
    response.setHeader("X-PDF-Min-Font-PT", String(minFont));
    return response.status(200).send(Buffer.from(result.bytes));
  } catch (error) {
    console.error("PDF generation failed", error);
    return response.status(500).json({ error: error?.message || "PDF generation failed." });
  }
}
