import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { buildPdf, cleanFragment } from "../api/pdf.js";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const browserPath = process.env.LOCAL_CHROME_PATH || "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir = path.resolve("output/pdf");
const tempDir = path.resolve("tmp/pdfs");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(tempDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const source = await page.evaluate(() => {
    const modes = ["all", "coverday", "covermonth"];
    const documents = Object.fromEntries(modes.map((mode) => [mode, buildPrint(mode)]));
    const textOf = (html) => {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
      const parts = [];
      while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
      return parts.join(" ");
    };
    const classEvents = [];
    S.classes.forEach((schoolClass) => {
      WEEKDAYS.forEach((day) => {
        for (let period = 1; period <= schoolClass.periods; period += 1) {
          if (!dayPeriodRuns(day.id, period)) continue;
          const lesson = cell(schoolClass.id, period, day.id);
          if (lesson) classEvents.push(`${day.id}|${period}|${schoolClass.id}|${lesson.s}|${lesson.t}`);
        }
      });
    });
    const teacherEvents = [];
    S.teachers.forEach((teacher) => {
      WEEKDAYS.forEach((day) => {
        for (let period = 1; period <= NP(); period += 1) {
          if (!dayPeriodRuns(day.id, period)) continue;
          (analyse(day.id).byTP[`${teacher.id}|${period}`] || []).forEach((lesson) => {
            teacherEvents.push(`${day.id}|${period}|${lesson.c}|${lesson.s}|${teacher.id}`);
          });
        }
      });
    });
    const sortedClass = classEvents.slice().sort();
    const sortedTeacher = teacherEvents.slice().sort();
    const teacherCounts = {};
    classEvents.forEach((event) => {
      const [day, period, , , teacher] = event.split("|");
      const key = `${teacher}|${day}|${period}`;
      teacherCounts[key] = (teacherCounts[key] || 0) + 1;
    });
    const classTeacherMap = Object.fromEntries(S.classes.map((schoolClass) => [schoolClass.id, schoolClass.ct]));
    const reverseClassTeacherMap = {};
    S.teachers.forEach((teacher) => {
      reverseClassTeacherMap[teacher.id] = S.classes.filter((schoolClass) => schoolClass.ct === teacher.id).map((schoolClass) => schoolClass.id).sort();
    });
    return {
      documents,
      sourceText: Object.fromEntries(modes.map((mode) => [mode, textOf(documents[mode])])),
      validation: {
        classes: S.classes.length,
        teachers: S.teachers.length,
        classLessonEvents: sortedClass.length,
        teacherLessonEvents: sortedTeacher.length,
        bidirectionalDifferences: sortedClass.filter((item, index) => item !== sortedTeacher[index]).length + Math.abs(sortedClass.length - sortedTeacher.length),
        doubleBookings: Object.values(teacherCounts).filter((count) => count > 1).length,
        classTeachers: Object.keys(classTeacherMap).length,
        classTeacherAssignments: Object.values(reverseClassTeacherMap).reduce((sum, classes) => sum + classes.length, 0),
      },
    };
  });

  const all = await buildPdf(cleanFragment(source.documents.all), "all");
  const coverDay = await buildPdf(cleanFragment(source.documents.coverday), "coverday");
  const coverMonth = await buildPdf(cleanFragment(source.documents.covermonth), "covermonth");

  await fs.writeFile(path.join(outputDir, "complete-timetable-book.pdf"), all.bytes);
  await fs.writeFile(path.join(tempDir, "alternative-period-order.pdf"), coverDay.bytes);
  await fs.writeFile(path.join(tempDir, "alternative-period-statement.pdf"), coverMonth.bytes);
  await fs.writeFile(path.join(tempDir, "source-text.json"), JSON.stringify(source.sourceText, null, 2));
  await fs.writeFile(path.join(tempDir, "qa-report.json"), JSON.stringify({
    validation: source.validation,
    documents: {
      all: { pages: all.pageCount, metrics: all.metrics },
      coverday: { pages: coverDay.pageCount, metrics: coverDay.metrics },
      covermonth: { pages: coverMonth.pageCount, metrics: coverMonth.metrics },
    },
  }, null, 2));
  process.stdout.write(`${JSON.stringify({ validation: source.validation, pages: { all: all.pageCount, coverday: coverDay.pageCount, covermonth: coverMonth.pageCount } }, null, 2)}\n`);
} finally {
  await browser.close();
}
