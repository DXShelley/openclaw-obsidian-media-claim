import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pluginJson = JSON.parse(await readFile(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
const npmPublishWorkflow = await readFile(new URL("../.github/workflows/npm-publish.yml", import.meta.url), "utf8");

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
assert.match(npmPublishWorkflow, /name:\s*Publish npm package/);
assert.match(npmPublishWorkflow, /tags:\s*\n\s+- "v\*\.\*\.\*"/);
assert.match(npmPublishWorkflow, /node-version:\s*"22\.19\.0"/);
assert.match(npmPublishWorkflow, /npm run verify/);
assert.doesNotMatch(npmPublishWorkflow, /secrets\.NPM_TOKEN/);
assert.doesNotMatch(npmPublishWorkflow, /NODE_AUTH_TOKEN/);
assert.match(npmPublishWorkflow, /id-token:\s*write/);
assert.match(npmPublishWorkflow, /npm publish --access public --registry https:\/\/registry\.npmjs\.org\/ --provenance/);

console.log("json validation passed");
