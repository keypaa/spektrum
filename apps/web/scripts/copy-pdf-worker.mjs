import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
copyFileSync(source, "public/pdf.worker.min.mjs");
console.log("copied", source, "-> public/pdf.worker.min.mjs");