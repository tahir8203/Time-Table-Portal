import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";

// Runs against a local preview only. Firebase is blocked so this test cannot
// sign in, load a cloud timetable, or save its test state online.
const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const candidates = [
  process.env.LOCAL_CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
let browserPath;
for (const candidate of candidates) {
  try { await fs.access(candidate); browserPath = candidate; break; } catch {}
}
assert.ok(browserPath, "Set LOCAL_CHROME_PATH to a local Chromium browser.");
let fixture = null;
try {
  fixture = JSON.parse(await fs.readFile("tmp/pdfs/recovered-state.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const screenshots = process.env.QA_SCREENSHOT_DIR || "tmp/screen-fit-qa";
await fs.mkdir(screenshots, { recursive: true });

const browser = await chromium.launch({
  executablePath: browserPath, headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const report = { fixture: fixture ? "recovered timetable" : "seed with split slots", checks: {}, layouts: [] };
const failures = [];
const check = (name, value) => {
  report.checks[name] = Boolean(value);
  if (!value) failures.push(name);
};

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
  const scriptErrors = [];
  page.on("pageerror", (error) => scriptErrors.push(error.message));
  await page.route(/\/src\/firebase-portal\.js(?:\?.*)?$/, (route) => route.fulfill({
    contentType: "application/javascript", body: "// Cloud disabled for local UI QA.\n",
  }));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate((saved) => {
    S = saved || buildSeed();
    if (!saved) {
      const sports = S.subjects.find((subject) => subject.name === "SPORTS") || S.subjects[0];
      S.classes.forEach((cl, index) => {
        const lesson = S.tt[cl.id + "|2"];
        if (lesson && index < 10) {
          lesson.days = { thu: { s: sports.id, t: lesson.t }, fri: { s: sports.id, t: lesson.t } };
        }
      });
    }
    ensureCatalogSync(S); ensureTeacherOrder(S); ensureClassOrder(S); ensureCoverCredits(S);
    VIEWDAY = "mon";
    window.__screenQaBaseline = {
      state: JSON.stringify(S),
      classPrint: buildPrint("cmaster"), teacherPrint: buildPrint("tmaster"),
      classes: S.classes.length, teachers: S.teachers.length,
    };
    go("grid");
  }, fixture);

  const settle = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => {
      const fit = document.getElementById("timetableFit");
      return !fit || fit.getAttribute("aria-pressed") !== "true"
        || document.getElementById("pane").dataset.fitReady === "true";
    });
  };
  const setSidebar = async (open) => {
    const toggle = page.locator("#sidebarToggle");
    if ((await toggle.getAttribute("aria-expanded") === "true") !== open) await toggle.click();
    await settle();
    check(`sidebar ${open ? "shown" : "hidden"} at ${page.viewportSize().width}`,
      (await page.locator("#sideNav").isVisible()) === open);
    check(`sidebar accessible label ${open ? "open" : "closed"} at ${page.viewportSize().width}`,
      (await toggle.getAttribute("aria-label")) === (open ? "Hide navigation" : "Show navigation")
      && (await toggle.getAttribute("aria-controls")) === "sideNav");
  };
  const inspectFit = async (view, sidebarOpen) => {
    const metrics = await page.evaluate(() => {
      const table = document.querySelector("#pane table.grid");
      const rect = table.getBoundingClientRect();
      const cells = Array.from(table.querySelectorAll("th,td"));
      const outside = cells.filter((cell) => {
        const box = cell.getBoundingClientRect();
        return box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1;
      }).map((cell) => cell.textContent.trim());
      const clipped = cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1
        || cell.scrollHeight > cell.clientHeight + 1).map((cell) => cell.textContent.trim());
      const text = Array.from(table.querySelectorAll(".s,.t,.daytag,.shared-teacher-label"));
      const visible = (el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return Boolean(box.width && box.height) && style.visibility !== "hidden" && style.display !== "none";
      };
      const hidden = text.filter((el) => !visible(el));
      // In compact split cells the same teacher may be shown once for all day
      // groups. Only permit a hidden duplicate if that exact name is visible
      // elsewhere in this same cell; never permit a missing subject/day/name.
      const duplicateTeacher = (el) => el.classList.contains("t")
        && Array.from(el.closest("td").querySelectorAll(".shared-teacher-label")).some((other) => other !== el
          && visible(other) && other.textContent.trim() === el.textContent.trim());
      const invisibleText = hidden.filter((el) => !duplicateTeacher(el)).map((el) => el.textContent.trim());
      const scale = rect.width / table.offsetWidth;
      const fontSizes = text.filter(visible).map((el) => parseFloat(getComputedStyle(el).fontSize) * scale);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rows: table.tBodies[0].rows.length,
        expectedRows: VIEW === "grid" ? S.classes.length : S.teachers.length,
        table: { left: +rect.left.toFixed(2), top: +rect.top.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2), bottom: +rect.bottom.toFixed(2) },
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        outside, clipped, invisibleText,
        deduplicatedTeacherLabels: hidden.filter(duplicateTeacher).length,
        smallestTextPx: +Math.min(...fontSizes).toFixed(2),
        fitReady: document.getElementById("pane").dataset.fitReady,
      };
    });
    const key = `${view} ${metrics.viewport.width}x${metrics.viewport.height} sidebar ${sidebarOpen ? "shown" : "hidden"}`;
    report.layouts.push({ view, sidebarOpen, ...metrics });
    check(`${key}: all rows`, metrics.rows === metrics.expectedRows);
    check(`${key}: every cell inside viewport`, metrics.outside.length === 0);
    check(`${key}: no clipped cell`, metrics.clipped.length === 0);
    check(`${key}: lesson text visible`, metrics.invisibleText.length === 0);
    check(`${key}: no page horizontal overflow`, !metrics.documentOverflow);
    if (!sidebarOpen) await page.screenshot({ path: `${screenshots}/${view}-${metrics.viewport.width}x${metrics.viewport.height}.png` });
  };

  for (const viewport of [
    { width: 1920, height: 900 }, { width: 1920, height: 835 },
    { width: 1366, height: 768 }, { width: 1366, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    for (const view of ["grid", "tw"]) {
      await page.evaluate((next) => go(next), view);
      await settle();
      const fitToggle = page.locator("#timetableFit");
      check(`${view} ${viewport.width}: fit on by default`, await fitToggle.getAttribute("aria-pressed") === "true");
      for (const sidebarOpen of [true, false]) {
        await setSidebar(sidebarOpen);
        await inspectFit(view, sidebarOpen);
      }
      const textBefore = await page.locator("#pane table.grid").textContent();
      await fitToggle.click();
      await settle();
      check(`${view} ${viewport.width}: full-size mode available`, await fitToggle.getAttribute("aria-pressed") === "false");
      check(`${view} ${viewport.width}: full-size retains every cell`, await page.locator("#pane table.grid").textContent() === textBefore);
      await fitToggle.click();
      await settle();
      if (view === "grid") {
        await page.locator("td.slot[data-c][data-p]").first().click();
        check(`${view} ${viewport.width}: lesson remains editable`, await page.locator("#edOk").isVisible());
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        check(`${view} ${viewport.width}: cancel closes editor`, !(await page.locator("#scrim").getAttribute("class")).includes("on"));
      }
    }
  }

  // A phone keeps a legible, horizontally scrollable timetable rather than
  // making 18 full teacher rows into microscopic text.
  const baseline = await page.evaluate(() => {
    if (JSON.stringify(S) !== window.__screenQaBaseline.state) throw new Error("Desktop UI changed timetable data");
    localStorage.removeItem("timetable-screen-fit");
    localStorage.removeItem("timetable-menu-hidden");
    return window.__screenQaBaseline;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate((saved) => {
    S = JSON.parse(saved.state);
    window.__screenQaBaseline = saved;
    VIEWDAY = "mon";
    go("grid");
  }, baseline);
  for (const view of ["grid", "tw"]) {
    await page.evaluate((next) => go(next), view);
    await settle();
    check(`${view} mobile: full-size default`, await page.locator("#timetableFit").getAttribute("aria-pressed") === "false");
    await setSidebar(false);
    const mobile = await page.evaluate(() => {
      const table = document.querySelector("#pane table.grid");
      const wrap = table.closest(".tw");
      wrap.scrollLeft = wrap.scrollWidth;
      return {
        rows: table.tBodies[0].rows.length,
        expected: VIEW === "grid" ? S.classes.length : S.teachers.length,
        noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        tableScrollable: wrap.scrollLeft > 0 || wrap.scrollWidth <= wrap.clientWidth + 1,
      };
    });
    check(`${view} mobile: no page horizontal overflow`, mobile.noPageOverflow);
    check(`${view} mobile: all rows retained`, mobile.rows === mobile.expected);
    check(`${view} mobile: every period reachable`, mobile.tableScrollable);
    await setSidebar(true);
    await page.screenshot({ path: `${screenshots}/${view}-390x844.png` });
  }
  const integrity = await page.evaluate(() => ({
    stateUnchanged: JSON.stringify(S) === window.__screenQaBaseline.state,
    classPrintUnchanged: buildPrint("cmaster") === window.__screenQaBaseline.classPrint,
    teacherPrintUnchanged: buildPrint("tmaster") === window.__screenQaBaseline.teacherPrint,
  }));
  Object.entries(integrity).forEach(([key, value]) => check(key, value));
  check("no browser script errors", scriptErrors.length === 0);
  report.scriptErrors = scriptErrors;
  report.failures = failures;
  await fs.writeFile(`${screenshots}/report.json`, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  assert.deepEqual(failures, [], "Screen-fit QA failed; inspect the report and screenshots.");
} finally {
  await browser.close();
}
