import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const browserPath = process.env.LOCAL_CHROME_PATH || "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(() => {
    const iso = "2026-09-07";
    S = {
      meta: { school: "QA School", head: "QA Head", wef: "", theme: "light" },
      timing: {
        assembly: { label: "Assembly", mt: "8:00", fri: "8:00" },
        periods: [{ mt: "8:15 - 9:00", fri: "8:15 - 9:00" }],
        brk: { mt: "", fri: "" },
        breakAfter: 1,
      },
      teachers: [
        { id: "t1", name: "ONE", desig: "EST", max: 1, unavail: [] },
        { id: "t2", name: "TWO", desig: "PST", max: 1, unavail: [] },
        { id: "t3", name: "THREE", desig: "PST", max: 1, unavail: [] },
      ],
      classes: [{ id: "c1", name: "6th", ct: "t1", periods: 1 }],
      subjects: [{ id: "s1", name: "MATH" }],
      tt: { "c1|1": { s: "s1", t: "t1" } },
      locks: {}, planLocks: {}, plan: { c1: [] },
      leave: { [iso]: ["t1"] },
      cover: {},
      coverExcluded: { [iso]: ["t2"] },
      teacherOrderMode: "grouped", teacherOrderVersion: 1,
      rules: { maxConsecutive: 1, defaultMax: 1 },
    };
    CDATE = iso;
    CMONTH = iso.slice(0, 7);
    VIEW = "cover";
    render();

    const coverSelect = document.querySelector("[data-cv]");
    const result = {
      exclusionVisible: Boolean(document.querySelector('.cvex[value="t2"]:checked')),
      absentCannotBeExcluded: Boolean(document.querySelector('.cvex[value="t1"]:disabled')),
      manualChoiceFiltered: !Array.from(coverSelect.options).some((option) => option.value === "t2")
        && Array.from(coverSelect.options).some((option) => option.value === "t3"),
    };

    const assigned = autoAssign(iso, { basis: "month", maxDay: 2, sameClass: false }, true);
    result.autoAssignedEligibleTeacher = assigned.placed === 1 && S.cover[iso]["c1|1"] === "t3";
    result.autoSkippedExcludedTeacher = !Object.values(S.cover[iso]).includes("t2");
    const printed = new DOMParser().parseFromString(pCoverDay(), "text/html").body.textContent;
    result.printListsExclusion = printed.includes("Not available for extra cover: TWO");
    result.printListsAssignment = printed.includes("THREE");

    render();
    document.querySelector('.cvex[value="t3"]').click();
    result.newExclusionRemovesAssignment = !S.cover[iso]["c1|1"];
    result.exclusionsSavedInState = S.coverExcluded[iso].length === 2
      && S.coverExcluded[iso].includes("t2") && S.coverExcluded[iso].includes("t3");
    const missed = autoAssign(iso, { basis: "month", maxDay: 2, sameClass: false }, true);
    result.allExcludedLeavesUncovered = missed.missed === 1 && !S.cover[iso]["c1|1"];
    result.dateSpecific = coverExcludedOf("2026-09-08").length === 0;
    return result;
  });

  if (Object.values(result).some((value) => value !== true)) {
    throw new Error(`Cover exclusion QA failed: ${JSON.stringify(result)}`);
  }
  if (process.env.QA_SCREENSHOT) {
    await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
