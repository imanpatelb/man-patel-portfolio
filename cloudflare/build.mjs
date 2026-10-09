// Builds dist/, the static half of the Cloudflare deploy. It's an allow-list,
// so source files, config and anything secret (.env.local) can never ship.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const OUT = "dist";
const FILES = ["index.html", "privacy.html", "terms.html", "factsheet.html", "admin.html", "robots.txt", "sitemap.xml"];
const DIRS = ["assets", "data"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) cpSync(f, `${OUT}/${f}`);
for (const d of DIRS) cpSync(d, `${OUT}/${d}`, { recursive: true });
cpSync("cloudflare/_headers", `${OUT}/_headers`);
console.log(`dist/: ${FILES.length} pages and files, ${DIRS.join(" + ")}`);
