import collections
import html
import json
import pathlib
import re
import sys

import pdfplumber


ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMP = ROOT / "tmp" / "pdfs"


def normalize(value: str) -> collections.Counter:
    value = html.unescape(value).replace("\u00a0", " ")
    value = re.sub(r"(?i)\bB\s+R\s+E\s+A\s+K\b", "BREAK", value)
    value = re.sub(
        r"\b(\d)\s+(\d):\s+(\d)\s+(\d)\s*-\s*(\d)\s+(\d):\s+(\d)\s+(\d)\b",
        lambda match: f"{match[1]}{match[2]}:{match[3]}{match[4]} - {match[5]}{match[6]}:{match[7]}{match[8]}",
        value,
    )
    value = re.sub(r"(?i)\b(?:https?://\S+|\d{1,2}/\d{1,2}/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)|\d+/\d+)\b", " ", value)
    return collections.Counter(re.findall(r"[A-Za-z0-9]+(?:[.][A-Za-z0-9]+)*|—", value.casefold()))


def pdf_cells_and_text(path: pathlib.Path) -> tuple[str, list[dict]]:
    comparison_words = []
    structured_pages = []
    with pdfplumber.open(path) as document:
        for page_number, page in enumerate(document.pages, start=1):
            tables = page.find_tables()
            page_tables = []
            for table in tables:
                rows = [[cell or "" for cell in row] for row in table.extract()]
                page_tables.append(rows)

            outside_words = []
            page_words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
            comparison_words.extend(word["text"] for word in page_words)
            for word in page_words:
                center_x = (word["x0"] + word["x1"]) / 2
                center_y = (word["top"] + word["bottom"]) / 2
                inside_table = any(
                    table.bbox[0] <= center_x <= table.bbox[2]
                    and table.bbox[1] <= center_y <= table.bbox[3]
                    for table in tables
                )
                if not inside_table:
                    outside_words.append(word["text"])
            structured_pages.append({
                "page": page_number,
                "tables": page_tables,
                "outside_table_text": outside_words,
            })
    return "\n".join(comparison_words), structured_pages


source = json.loads((TEMP / "source-text.json").read_text(encoding="utf-8"))
targets = {
    "all": ROOT / "output" / "pdf" / "complete-timetable-book.pdf",
    "coverday": TEMP / "alternative-period-order.pdf",
    "covermonth": TEMP / "alternative-period-statement.pdf",
}

report = {}
structured_extraction = {}
failed = False
for mode, target in targets.items():
    expected = normalize(source[mode])
    extracted_text, extracted_pages = pdf_cells_and_text(target)
    structured_extraction[mode] = extracted_pages
    actual = normalize(extracted_text)
    missing = expected - actual
    extra = actual - expected
    report[mode] = {
        "expected_tokens": sum(expected.values()),
        "actual_tokens": sum(actual.values()),
        "missing_tokens": sum(missing.values()),
        "extra_tokens": sum(extra.values()),
        "missing_examples": list(missing.items())[:20],
        "extra_examples": list(extra.items())[:20],
    }
    failed = failed or bool(missing or extra)

(TEMP / "integrity-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
(TEMP / "table-extraction.json").write_text(json.dumps(structured_extraction, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
sys.exit(1 if failed else 0)
