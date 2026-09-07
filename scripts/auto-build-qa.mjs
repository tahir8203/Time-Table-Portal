import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const browserPath = process.env.LOCAL_CHROME_PATH || "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(() => {
    const timing = {
      assembly: { label: "Assembly", mt: "8:00", fri: "8:00" },
      periods: [{ mt: "8:15", fri: "8:15" }, { mt: "9:00", fri: "9:00" }],
      brk: { mt: "", fri: "" },
      breakAfter: 1,
    };
    S = {
      meta: { school: "QA", head: "", wef: "" }, timing,
      teachers: [
        { id: "t1", name: "ONE", desig: "EST", max: 2, unavail: [] },
        { id: "t2", name: "TWO", desig: "PST", max: 2, unavail: [] },
      ],
      classes: [{ id: "c1", name: "A", ct: "", periods: 2 }],
      subjects: [{ id: "s1", name: "MATH" }, { id: "s2", name: "ENGLISH" }],
      tt: {}, locks: {}, planLocks: {}, leave: {}, cover: {},
      teacherOrderMode: "grouped", teacherOrderVersion: 1,
      rules: { maxConsecutive: 2, defaultMax: 2 },
      plan: { c1: [
        { s: "s1", t: "t1", n: 1, p: 2 },
        { s: "s2", t: "t2", n: 1, p: 0 },
      ] },
    };
    VIEW = "gen";
    render();
    const fixedSelectVisible = Boolean(document.querySelector('[data-rf="p"]'));
    runSolver();
    const classCard = new DOMParser().parseFromString(pClassCard(C("c1")), "text/html");
    const printedP2 = Array.from(classCard.querySelectorAll("tbody tr"))
      .find((row) => row.cells[0]?.textContent.trim() === "P2");
    const success = {
      fixedSelectVisible,
      fixedLesson: cell("c1", 2),
      flexibleLesson: cell("c1", 1),
      fixedSlotLocked: isLocked("c1", 2),
      fixedSourceSaved: Boolean(S.planLocks["c1|2"]),
      printReflected: printedP2?.cells[3]?.textContent.trim() === "MATH"
        && printedP2?.cells[4]?.textContent.trim() === "ONE",
    };

    S.classes.push({ id: "c2", name: "B", ct: "", periods: 2 });
    S.plan.c2 = [{ s: "s2", t: "t1", n: 1, p: 2 }];
    S.tt = {}; S.locks = {}; S.planLocks = {};
    render();
    runSolver();
    success.conflictDetected = document.getElementById("genOut").textContent.includes("fixed in both A and B");
    return success;
  });

  if (!result.fixedSelectVisible || result.fixedLesson?.s !== "s1" || result.fixedLesson?.t !== "t1"
      || result.flexibleLesson?.s !== "s2" || !result.fixedSlotLocked || !result.fixedSourceSaved
      || !result.printReflected || !result.conflictDetected) {
    throw new Error(`Fixed-period Auto-build QA failed: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
