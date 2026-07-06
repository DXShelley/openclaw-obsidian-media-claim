import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pluginJson = JSON.parse(await readFile(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));

assert.equal(pluginJson.version, packageJson.version);
assert.deepEqual(pluginJson.hooks, [
  "reply_dispatch",
  "inbound_claim",
  "before_dispatch",
  "before_agent_reply",
  "before_prompt_build"
]);

console.log("json validation passed");
