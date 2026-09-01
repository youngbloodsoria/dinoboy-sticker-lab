const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const inputPdf = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "content/five-lessons/Five-Lessons-From-Brighton.pdf");
const outputRoot = path.join(root, "public/five-lessons");
const pagesDir = path.join(outputRoot, "pages");
const popplerBin = "/Users/alexandersoria/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin";
const pdftoppm = process.env.PDFTOPPM || path.join(popplerBin, "pdftoppm");
const pdfinfo = process.env.PDFINFO || path.join(popplerBin, "pdfinfo");
const dpi = Number(process.env.FIVE_LESSONS_DPI || 180);

const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: "utf8",
  stdio: options.stdio || ["ignore", "pipe", "pipe"]
});

const commandExists = (command) => {
  try {
    execFileSync("command", ["-v", command], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
};

const parsePdfInfo = (text) => {
  const pagesMatch = text.match(/^Pages:\s+(\d+)/m);
  const sizeMatch = text.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);
  return {
    pageCount: pagesMatch ? Number(pagesMatch[1]) : 0,
    pointWidth: sizeMatch ? Number(sizeMatch[1]) : null,
    pointHeight: sizeMatch ? Number(sizeMatch[2]) : null
  };
};

const imageSize = (filePath) => {
  try {
    const output = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
    const width = output.match(/pixelWidth:\s+(\d+)/)?.[1];
    const height = output.match(/pixelHeight:\s+(\d+)/)?.[1];
    return {
      width: width ? Number(width) : null,
      height: height ? Number(height) : null
    };
  } catch {
    return { width: null, height: null };
  }
};

if (!fs.existsSync(inputPdf)) {
  console.error(`Missing source PDF: ${inputPdf}`);
  process.exit(1);
}

fs.rmSync(pagesDir, { recursive: true, force: true });
fs.mkdirSync(pagesDir, { recursive: true });

const infoText = run(pdfinfo, [inputPdf]);
const pdf = parsePdfInfo(infoText);
if (!pdf.pageCount) {
  console.error("Could not determine PDF page count.");
  process.exit(1);
}

const prefix = path.join(pagesDir, "raw-page");
run(pdftoppm, ["-r", String(dpi), "-png", inputPdf, prefix], { stdio: "inherit" });

const rawPages = fs.readdirSync(pagesDir)
  .filter((file) => /^raw-page-\d+\.png$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const pages = rawPages.map((file, index) => {
  const pageNumber = index + 1;
  const padded = String(pageNumber).padStart(3, "0");
  const finalName = `page-${padded}.png`;
  const from = path.join(pagesDir, file);
  const to = path.join(pagesDir, finalName);
  fs.renameSync(from, to);
  const size = imageSize(to);

  return {
    pageNumber,
    src: `/public/five-lessons/pages/${finalName}`,
    width: size.width,
    height: size.height
  };
});

const manifest = {
  title: "Five Lessons from Brighton",
  sourcePdf: "content/five-lessons/Five-Lessons-From-Brighton.pdf",
  canonicalUrl: "https://dinoboysc.com/five-lessons",
  generatedAt: new Date().toISOString(),
  dpi,
  pageCount: pages.length,
  pagePointSize: {
    width: pdf.pointWidth,
    height: pdf.pointHeight
  },
  pages
};

fs.writeFileSync(
  path.join(outputRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(`Built ${pages.length} Five Lessons page image${pages.length === 1 ? "" : "s"}.`);
