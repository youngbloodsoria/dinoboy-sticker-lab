#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const draftsDir = process.argv[2]
  ? path.resolve(rootDir, process.argv[2])
  : path.join(rootDir, "update-drafts");
const jsonPath = process.argv[3]
  ? path.resolve(rootDir, process.argv[3])
  : path.join(rootDir, "data", "updates.json");

function parseDraft(text, filename) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const separator = normalized.indexOf("\n---");

  if (separator === -1) {
    throw new Error(`${filename}: add a line with --- between the fields and the update text.`);
  }

  const metaText = normalized.slice(0, separator).trim();
  const bodyText = normalized.slice(separator).replace(/^\n?---\s*\n?/, "").trim();
  const meta = {};

  for (const line of metaText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`${filename}: metadata line needs a colon: ${line}`);
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    meta[key] = value;
  }

  if (!meta.title) {
    throw new Error(`${filename}: missing title.`);
  }

  if (!meta.sortDate || !/^\d{4}-\d{2}-\d{2}$/.test(meta.sortDate)) {
    throw new Error(`${filename}: sortDate must look like 2026-06-15.`);
  }

  const published = String(meta.published || "yes").toLowerCase();
  const body = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const fallbackExcerpt = body.join(" ").slice(0, 147).trim();

  return {
    published,
    update: {
      date: meta.date || meta.sortDate,
      sortDate: meta.sortDate,
      title: meta.title,
      category: meta.category || "Big Moments",
      image: meta.image || "",
      imageAlt: meta.imageAlt || meta.title,
      excerpt: meta.excerpt || (fallbackExcerpt ? `${fallbackExcerpt}${body.join(" ").length > 147 ? "..." : ""}` : ""),
      body,
      hearts: meta.hearts || "0",
      comments: meta.comments || "0"
    }
  };
}

const files = fs.readdirSync(draftsDir)
  .filter((file) => /\.(md|txt)$/i.test(file))
  .filter((file) => !/^readme\.(md|txt)$/i.test(file))
  .sort();

if (!files.length) {
  throw new Error(`No .md or .txt update drafts found in ${path.relative(rootDir, draftsDir)}.`);
}

const updates = files.flatMap((file) => {
  const fullPath = path.join(draftsDir, file);
  const parsed = parseDraft(fs.readFileSync(fullPath, "utf8"), file);

  if (["no", "n", "false", "draft"].includes(parsed.published)) {
    return [];
  }

  return [parsed.update];
});

updates.sort((first, second) => Date.parse(second.sortDate) - Date.parse(first.sortDate));
fs.writeFileSync(jsonPath, `${JSON.stringify(updates, null, 2)}\n`);

console.log(`Wrote ${updates.length} updates to ${path.relative(rootDir, jsonPath)}`);
