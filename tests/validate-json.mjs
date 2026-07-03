import { readFile } from "node:fs/promises";

for (const file of ["package.json", "openclaw.plugin.json"]) {
  JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
}

console.log("json validation passed");
