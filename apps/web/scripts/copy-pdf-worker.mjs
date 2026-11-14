import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
copyFileSync(source, new URL("../public/pdf.worker.min.mjs", import.meta.url));
console.log("copied", source, "-> apps/web/public/pdf.worker.min.mjs");