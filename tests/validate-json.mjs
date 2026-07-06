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
assert.equal(pluginJson.configSchema.additionalProperties, false);
assert.equal(pluginJson.configSchema.properties.stageAttachments.default, true);
assert.match(pluginJson.configSchema.properties.python.description, /Python 3\.10\+/);
assert.match(pluginJson.configSchema.properties.python.description, /absolute path/i);
assert.equal(pluginJson.configSchema.properties.pendingMediaPromptInjection.default, true);
assert.match(pluginJson.configSchema.properties.pendingMediaPromptInjection.description, /trusted runtime conversation metadata/i);
assert.equal(pluginJson.configSchema.properties.debugLogging.default, false);

console.log("json validation passed");
