import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const browserPath = process.env.LOCAL_CHROME_PATH || "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(() => {
    S = {
      meta: { school: "Order QA School", head: "QA Head", wef: "", theme: "light" },
      timing: {
        assembly: { label: "Assembly", mt: "8:00", fri: "8:00" },
        periods: [{ mt: "8:15 - 9:00", fri: "8:15 - 9:00" }],
        brk: { mt: "", fri: "" }, breakAfter: 1,
      },
      teachers: [{ id: "t1", name: "QA TEACHER", desig: "EST", max: 1, unavail: [] }],
      classes: [
        { id: "c8", name: "8th", ct: "t1", periods: 1 },
        { id: "c7", name: "7th", ct: "t1", periods: 1 },
        { id: "c6", name: "6th", ct: "t1", periods: 1 },
      ],
      subjects: [{ id: "s1", name: "QA SUBJECT" }],
      tt: {
        "c8|1": { s: "s1", t: "t1" },
        "c7|1": { s: "s1", t: "t1" },
        "c6|1": { s: "s1", t: "t1" },
      },
      locks: {}, planLocks: {}, plan: {
        c8: [{ s: "s1", t: "t1", n: 1, p: 0 }],
        c7: [{ s: "s1", t: "t1", n: 1, p: 0 }],
        c6: [{ s: "s1", t: "t1", n: 1, p: 0 }],
      },
      leave: {}, cover: {}, coverExcluded: {},
      teacherOrderMode: "manual", teacherOrderVersion: 1,
      classOrderMode: "manual", classOrderVersion: 1,
      planCatalogVersion: 2, rules: { maxConsecutive: 0, defaultMax: 1 },
    };
    VIEWDAY = "mon";
    const names = () => S.classes.map((item) => item.name).join(",");
    const output = {};

    VIEW = "setup";
    render();
    const originalRows = Array.from(document.querySelectorAll("[data-order-class]"));
    output.classRowsAreDraggable = originalRows.length === 3
      && originalRows.every((row) => row.draggable && row.tabIndex === 0)
      && document.getElementById("pane").textContent.includes("Class priority: custom order");

    moveClassInRoster("c6", "c8", false);
    render();
    output.customOrderChanged = names() === "6th,8th,7th";
    output.setupUsesOrder = Array.from(document.querySelectorAll("[data-order-class]"))
      .map((row) => row.dataset.orderClass).join(",") === "c6,c8,c7";

    VIEW = "grid";
    render();
    output.classTimetableUsesOrder = Array.from(document.querySelectorAll(".grid tbody tr"))
      .map((row) => row.querySelector(".cls")?.textContent.trim()).filter(Boolean).join(",") === "6th,8th,7th";

    VIEW = "per";
    SEL = 1;
    render();
    const periodText = document.getElementById("pane").textContent;
    output.onePeriodUsesOrder = periodText.indexOf("6th") < periodText.indexOf("8th")
      && periodText.indexOf("8th") < periodText.indexOf("7th");

    VIEW = "gen";
    render();
    const buildText = document.getElementById("pane").textContent;
    output.autoBuildUsesOrder = buildText.indexOf("6th needs") < buildText.indexOf("8th needs")
      && buildText.indexOf("8th needs") < buildText.indexOf("7th needs");

    const master = new DOMParser().parseFromString(pClassMaster(), "text/html");
    const masterText = master.body.textContent;
    output.classMasterPdfUsesOrder = masterText.indexOf("6th") < masterText.indexOf("8th")
      && masterText.indexOf("8th") < masterText.indexOf("7th");
    const cards = new DOMParser().parseFromString(buildPrint("ccards"), "text/html");
    output.classCardPdfUsesOrder = Array.from(cards.querySelectorAll(".psheet"))
      .map((sheet) => sheet.textContent).every((text, index) => text.includes(["6th", "8th", "7th"][index]));

    let classCsv = "";
    const originalDownload = window.dl;
    window.dl = (_name, content) => { classCsv = content; };
    exportClassCsv();
    window.dl = originalDownload;
    output.classCsvUsesOrder = classCsv.indexOf("6th") < classCsv.indexOf("8th")
      && classCsv.indexOf("8th") < classCsv.indexOf("7th");

    VIEW = "setup";
    render();
    const row = document.querySelector('[data-order-class="c7"]');
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }));
    output.keyboardMoveWorks = names() === "6th,7th,8th";

    const legacy = JSON.parse(JSON.stringify(S));
    delete legacy.classOrderMode;
    delete legacy.classOrderVersion;
    const before = legacy.classes.map((item) => item.id).join(",");
    ensureClassOrder(legacy);
    output.legacyOrderPreserved = legacy.classes.map((item) => item.id).join(",") === before
      && legacy.classOrderMode === "manual" && legacy.classOrderVersion === 1;
    output.firebasePayloadContainsOrder = JSON.stringify(S).includes('"classOrderMode":"manual"')
      && JSON.stringify(S).includes('"classOrderVersion":1');
    return output;
  });

  if (Object.values(result).some((value) => value !== true)) {
    throw new Error(`Class ordering QA failed: ${JSON.stringify(result)}`);
  }
  if (process.env.QA_SCREENSHOT) {
    await page.evaluate(() => { VIEW = "setup"; render(); });
    await page.screenshot({ path: process.env.QA_SCREENSHOT, fullPage: true });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
