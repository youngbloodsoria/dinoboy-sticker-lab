#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const csvPath = process.argv[2]
  ? path.resolve(rootDir, process.argv[2])
  : path.join(rootDir, "data", "updates-template.csv");
const jsonPath = process.argv[3]
  ? path.resolve(rootDir, process.argv[3])
  : path.join(rootDir, "data", "updates.json");

const requiredColumns = [
  "date",
  "sortDate",
  "title",
  "category",
  "image",
  "imageAlt",
  "excerpt",
  "body",
  "hearts",
  "comments",
  "published"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function makeExcerpt(body) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= 150) {
    return compact;
  }
  return `${compact.slice(0, 147).trim()}...`;
}

function normalizeBody(value) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function validateSortDate(value, rowNumber) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Row ${rowNumber}: sortDate must look like 2026-06-15.`);
  }
}

const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(csvText);

if (rows.length < 2) {
  throw new Error("CSV needs a header row and at least one update row.");
}

const headers = rows[0].map((header) => header.trim());
const missing = requiredColumns.filter((column) => !headers.includes(column));

if (missing.length) {
  throw new Error(`Missing required column(s): ${missing.join(", ")}`);
}

const updates = rows.slice(1).flatMap((row, index) => {
  const rowNumber = index + 2;
  const record = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] || ""]));
  const published = String(record.published || "yes").trim().toLowerCase();

  if (!record.title.trim() && !record.body.trim()) {
    return [];
  }

  if (["no", "n", "false", "draft"].includes(published)) {
    return [];
  }

  validateSortDate(record.sortDate.trim(), rowNumber);

  const body = normalizeBody(record.body);

  return [{
    date: record.date.trim(),
    sortDate: record.sortDate.trim(),
    title: record.title.trim(),
    category: record.category.trim() || "Big Moments",
    image: record.image.trim(),
    imageAlt: record.imageAlt.trim() || record.title.trim(),
    excerpt: record.excerpt.trim() || makeExcerpt(record.body),
    body,
    hearts: record.hearts.trim() || "0",
    comments: record.comments.trim() || "0"
  }];
});

updates.sort((first, second) => Date.parse(second.sortDate) - Date.parse(first.sortDate));
fs.writeFileSync(jsonPath, `${JSON.stringify(updates, null, 2)}\n`);

console.log(`Wrote ${updates.length} updates to ${path.relative(rootDir, jsonPath)}`);

