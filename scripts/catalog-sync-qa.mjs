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
    S = {
      meta: { school: "QA School", head: "QA Head", wef: "", theme: "light" },
      timing: {
        assembly: { label: "Assembly", mt: "8:00", fri: "8:00" },
        periods: [{ mt: "8:15 - 9:00", fri: "8:15 - 9:00" }],
        brk: { mt: "", fri: "" },
        breakAfter: 1,
      },
      teachers: [], classes: [], subjects: [], tt: {}, locks: {}, planLocks: {},
      plan: {}, leave: {}, cover: {}, coverExcluded: {},
      teacherOrderMode: "grouped", teacherOrderVersion: 1,
      rules: { maxConsecutive: 1, defaultMax: 1 },
    };
    VIEWDAY = "mon";
    VIEW = "setup";
    render();

    document.getElementById("addT").click();
    document.getElementById("tN").value = "NEW TEACHER";
    document.getElementById("tD").value = "EST (Science)";
    document.getElementById("tOk").click();
    const teacherId = S.teachers[0].id;

    document.getElementById("addS").click();
    document.getElementById("sN").value = "NEW SUBJECT";
    document.getElementById("sOk").click();
    const subjectId = S.subjects[0].id;

    document.getElementById("addC").click();
    document.getElementById("cN").value = "NEW CLASS";
    document.getElementById("cT").value = teacherId;
    document.getElementById("cP").value = "1";
    document.getElementById("cOk").click();
    const classId = S.classes[0].id;

    const result = {
      setupHasAllEntries: document.getElementById("pane").textContent.includes("NEW TEACHER")
        && document.getElementById("pane").textContent.includes("NEW SUBJECT")
        && document.getElementById("pane").textContent.includes("NEW CLASS"),
      classTeacherConnected: S.classes[0].ct === teacherId,
      classPlanCreatedImmediately: Array.isArray(S.plan[classId]),
    };

    VIEW = "gen";
    render();
    result.autoBuildShowsClass = document.getElementById("pane").textContent.includes("NEW CLASS");
    document.getElementById("genAddRow").click();
    result.autoBuildListsNewCatalog = Array.from(document.getElementById("nrC").options).some((o) => o.value === classId)
      && Array.from(document.getElementById("nrS").options).some((o) => o.value === subjectId)
      && Array.from(document.getElementById("nrT").options).some((o) => o.value === teacherId);
    document.getElementById("nrC").value = classId;
    document.getElementById("nrS").value = subjectId;
    document.getElementById("nrT").value = teacherId;
    document.getElementById("nrOk").click();
    result.autoBuildPlanSaved = S.plan[classId].length === 1
      && S.plan[classId][0].s === subjectId && S.plan[classId][0].t === teacherId;
    runSolver();
    result.autoBuildUsesNewEntries = cell(classId, 1)?.s === subjectId && cell(classId, 1)?.t === teacherId;

    VIEW = "grid";
    render();
    const classText = document.getElementById("pane").textContent;
    result.classWiseUpdated = classText.includes("NEW CLASS")
      && classText.includes("NEW SUBJECT") && classText.includes("NEW TEACHER");

    VIEW = "tw";
    render();
    const teacherText = document.getElementById("pane").textContent;
    result.teacherWiseUpdated = teacherText.includes("NEW TEACHER")
      && teacherText.includes("NEW CLASS") && teacherText.includes("NEW SUBJECT");

    VIEW = "per";
    SEL = 1;
    render();
    result.periodViewUpdated = document.getElementById("pane").textContent.includes("NEW CLASS")
      && document.getElementById("pane").textContent.includes("NEW TEACHER")
      && document.getElementById("pane").textContent.includes("NEW SUBJECT");

    VIEW = "cover";
    render();
    result.coverListsNewTeacher = Boolean(document.querySelector(`.cvex[value="${teacherId}"]`));

    const printText = new DOMParser().parseFromString(
      pClassMaster() + pTeacherMaster() + pClassCard(C(classId)) + pTeacherCard(T(teacherId)),
      "text/html",
    ).body.textContent;
    result.printViewsUpdated = printText.includes("NEW CLASS")
      && printText.includes("NEW TEACHER") && printText.includes("NEW SUBJECT");
    const completeBook = new DOMParser().parseFromString(buildPrint("all"), "text/html");
    result.completeBookIncludesNewPages = completeBook.querySelectorAll(".psheet").length === 5
      && completeBook.body.textContent.includes("NEW CLASS")
      && completeBook.body.textContent.includes("NEW TEACHER")
      && completeBook.body.textContent.includes("NEW SUBJECT");

    const exported = {};
    const originalDownload = window.dl;
    window.dl = (name, content) => { exported[name] = content; };
    exportClassCsv();
    exportTeacherCsv();
    exportListCsv();
    window.dl = originalDownload;
    result.exportsUpdated = Object.values(exported).length === 3
      && Object.values(exported).every((content) => content.includes("NEW CLASS")
        || content.includes("NEW TEACHER") || content.includes("NEW SUBJECT"))
      && Object.values(exported).join("\n").includes("NEW CLASS")
      && Object.values(exported).join("\n").includes("NEW TEACHER")
      && Object.values(exported).join("\n").includes("NEW SUBJECT");

    const imported = JSON.parse(JSON.stringify(S));
    delete imported.plan[classId];
    ensureCatalogSync(imported);
    result.loadedStateRepairsMissingClassPlan = Array.isArray(imported.plan[classId]);
    const legacy = JSON.parse(JSON.stringify(S));
    legacy.plan[classId] = [];
    delete legacy.planCatalogVersion;
    ensureCatalogSync(legacy);
    result.legacyEmptyPlanRecovered = legacy.plan[classId].length === 1
      && legacy.plan[classId][0].s === subjectId && legacy.plan[classId][0].t === teacherId;
    legacy.plan[classId] = [];
    ensureCatalogSync(legacy);
    result.intentionalEmptyPlanStaysEmpty = legacy.plan[classId].length === 0;

    S.plan[classId] = [];
    S.planCatalogVersion = 2;
    VIEW = "gen";
    render();
    const restoreButton = document.querySelector(`[data-rload="${classId}"]`);
    result.classRecoveryButtonVisible = Boolean(restoreButton);
    restoreButton?.click();
    result.classRecoveryButtonWorks = S.plan[classId].length === 1
      && S.plan[classId][0].s === subjectId && S.plan[classId][0].t === teacherId;
    result.firebasePayloadContainsCatalog = JSON.stringify(S).includes("NEW TEACHER")
      && JSON.stringify(S).includes("NEW CLASS") && JSON.stringify(S).includes("NEW SUBJECT");

    const school = buildSeed();
    const thirdB = school.classes.find((item) => item.name === "3rd B");
    school.plan[thirdB.id] = [];
    delete school.planCatalogVersion;
    ensureCatalogSync(school);
    result.thirdBPlanRecovered = school.plan[thirdB.id].reduce((sum, row) => sum + row.n, 0) === 8;
    return result;
  });

  if (Object.values(result).some((value) => value !== true)) {
    throw new Error(`Catalogue synchronization QA failed: ${JSON.stringify(result)}`);
  }
  if (process.env.QA_SCREENSHOT) {
    await page.evaluate(() => {
      S = buildSeed();
      const thirdB = S.classes.find((item) => item.name === "3rd B");
      S.plan[thirdB.id] = [];
      delete S.planCatalogVersion;
      VIEW = "gen";
      render();
    });
    await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
