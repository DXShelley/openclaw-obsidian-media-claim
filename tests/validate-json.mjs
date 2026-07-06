import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const pluginJson = JSON.parse(await readFile(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));
const websitePackageJson = JSON.parse(await readFile(new URL("../website/package.json", import.meta.url), "utf8"));
const npmPublishWorkflow = await readFile(new URL("../.github/workflows/npm-publish.yml", import.meta.url), "utf8");
const pagesWorkflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
const websiteConfig = await readFile(new URL("../website/src/config/site.ts", import.meta.url), "utf8");
const websiteMain = await readFile(new URL("../website/src/main.ts", import.meta.url), "utf8");

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
assert.match(npmPublishWorkflow, /npm install -g npm@latest/);
assert.match(npmPublishWorkflow, /npm run verify/);
assert.match(npmPublishWorkflow, /working-directory:\s*website/);
assert.match(npmPublishWorkflow, /npm ci && npm run build/);
assert.doesNotMatch(npmPublishWorkflow, /secrets\.NPM_TOKEN/);
assert.doesNotMatch(npmPublishWorkflow, /NODE_AUTH_TOKEN/);
assert.match(npmPublishWorkflow, /id-token:\s*write/);
assert.match(npmPublishWorkflow, /npm publish --access public --registry https:\/\/registry\.npmjs\.org\/ --provenance/);
assert.equal(websitePackageJson.name, "obsidian-media-claim-site");
assert.equal(websitePackageJson.private, true);
assert.equal(websitePackageJson.version, packageJson.version);
assert.match(pagesWorkflow, /name:\s*Deploy Website/);
assert.match(pagesWorkflow, /branches:\s*\n\s+- dev/);
assert.doesNotMatch(pagesWorkflow, /tags:\s*\n\s+- "v\*\.\*\.\*"/);
assert.match(pagesWorkflow, /website\/\*\*/);
assert.match(pagesWorkflow, /npm run build/);
assert.match(pagesWorkflow, /uses:\s*actions\/deploy-pages@v4/);
assert.match(websiteConfig, /SiteLocale = 'zh-CN' \| 'en'/);
assert.match(websiteConfig, new RegExp(`const VERSION = 'v${packageJson.version}'`));
assert.match(websiteConfig, /ariaLabel: 'Page navigation'/);
assert.match(websiteConfig, /ariaLabel: '页面导航'/);
assert.match(websiteConfig, /只上传媒体，不惊动模型，把 token 省下来。/);
assert.match(websiteConfig, /Upload media without waking the model\. Save the tokens\./);
assert.match(websiteConfig, /Note Image Manager/);
assert.match(websiteConfig, /obsidian-image-manager\/\?lang=en/);
assert.match(websiteConfig, /Obsidian Media Claim/);
assert.match(websiteConfig, /obsidian-cli-plugins/);
assert.match(websiteConfig, /obsidian-cli-plugins-skill\/\?lang=en/);
assert.match(websiteConfig, /support\/weixin\.png/);
assert.match(websiteConfig, /support\/zanshangma\.png/);
assert.match(websiteConfig, /support\/zhifubao\.png/);
assert.match(websiteMain, /language-switch/);
assert.match(websiteMain, /config\.nav\.ariaLabel/);
assert.match(websiteMain, /linkCards/);
assert.match(websiteMain, /config\.sections\.install/);

console.log("json validation passed");
