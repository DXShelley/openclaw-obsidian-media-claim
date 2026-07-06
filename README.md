# OpenClaw Obsidian Media Claim

OpenClaw plugin that intercepts media-only inbound messages before they reach the LLM. If the channel provides readable local attachment paths, the plugin stages them through `obsidian-cli-plugins` so a later text message can create one Obsidian file-mode record with all staged media.

This is an OpenClaw runtime plugin, not a general-purpose npm library. It depends on OpenClaw typed hooks (`reply_dispatch`, `inbound_claim`, `before_dispatch`, `before_agent_reply`, and `before_prompt_build`) and is useful only inside an OpenClaw plugin runtime that supports those hooks.

## Relationship to `obsidian-cli-plugins`

`obsidian-cli-plugins` is the required capability for Obsidian records. Install the skill first; it owns vault discovery, Git preflight, record creation, attachment copying, staged-attachment consumption, and sync.

This plugin is optional. It does not replace the skill and does not write Obsidian notes directly. Its main job is to guard media-only channel uploads before model dispatch, stage readable media paths for the skill, and avoid unnecessary LLM token spend on uploads that only need to be saved for a later record instruction.

With only the skill installed, normal text records and explicit local attachment records still work. Without the skill, this plugin can at most claim/stage media; it cannot complete the Obsidian record workflow.

## Why

Some channels deliver several images or videos as separate media-only events before the user sends the actual instruction, for example:

```text
[image]
[image]
把上面两张图记录到 ob
```

Without a pre-model guard, each media-only event can be sent to the model and waste tokens. This plugin claims those events, replies with a short acknowledgement, and keeps the media available for the later Obsidian record workflow handled by `obsidian-cli-plugins`.

## Behavior

- Claims only media-only inbound messages.
- Does not claim messages that contain user text, `bodyForAgent`, or transcript text.
- Registers `reply_dispatch` as the primary pre-model guard. In OpenClaw 2026.6.11 this hook receives the finalized channel context, including `MediaPaths`, `MediaUrls`, and `MediaTypes`, before the default LLM reply path runs.
- Registers `inbound_claim` for plugin-owned conversation bindings.
- Registers `before_dispatch` as an early compatibility fallback for attachment-marker messages.
- Registers `before_agent_reply` as a late compatibility fallback that returns a synthetic reply for media-only prompts not handled earlier.
- Registers `before_prompt_build` to inject staged-media workflow guidance into later text turns such as `将两条视频记录一下`, so the Agent uses `attachment-pending` and `--staged-attachment` instead of searching the current directory.
- Detects generic `[Attachment: /path/to/file]` markers.
- Detects OpenClaw media placeholders such as `[media attached: ...]` and `<media:video>` without treating them as user text.
- Prefers `bodyForAgent` and structured hook fields over deprecated plaintext channel envelopes.
- Detects common metadata paths: `mediaPaths`, `MediaPaths`, `localMediaPaths`, `mediaPath`, `MediaPath`, and `mediaList`.
- Detects structured local paths from `attachments`, `media`, `mediaRefs`, `files`, `images`, `videos`, `audios`, and `documents`.
- Stages readable local files with `obsidian_workflows.py attachment-stage`.
- Prunes staged attachments older than 48 hours before saving newly uploaded media.
- Uses a stable short hashed batch key so later commands can list pending media without relying on model-inferred attachment ids.
- On later media-record text turns, looks up pending staged media with a trusted runtime batch key and injects the safe selector into the prompt. This does not run media understanding and does not expose media contents to the LLM.
- Supports optional channel allow/deny lists.
- Does not write Obsidian notes or media files directly; Obsidian-side effects are delegated to `obsidian-cli-plugins/scripts/obsidian_workflows.py`.
- May still claim media-only messages when only remote media URLs are present, but it cannot stage attachments unless the channel/runtime exposes readable local file paths.

## Requirements

- OpenClaw 2026.6.11 or a compatible version with `reply_dispatch`, `inbound_claim`, `before_dispatch`, `before_agent_reply`, and `before_prompt_build` typed hooks.
- Node.js 22.19 or newer.
- `obsidian-cli-plugins` installed as an OpenClaw, Codex, or cc-switch skill. The skill is required for the actual Obsidian record workflow; this plugin is only the optional pre-model media guard and staged-handoff helper.

## Install

From a local checkout:

```bash
openclaw plugins install /path/to/openclaw-obsidian-media-claim --force
```

From npm after publishing:

```bash
openclaw plugins install obsidian-media-claim
```

From ClawHub after publishing:

```bash
openclaw plugins install clawhub:obsidian-media-claim
```

Then enable the plugin with conversation access for the compatibility fallbacks:

```json
{
  "plugins": {
    "entries": {
      "obsidian-media-claim": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true,
          "allowPromptInjection": true,
          "timeoutMs": 15000
        },
        "config": {
          "stageAttachments": true,
          "replyDispatchGuard": true,
          "beforeDispatchFallback": true,
          "agentReplyFallback": true,
          "pendingMediaPromptInjection": true,
          "replyContent": "收到媒体，已保存。"
        }
      }
    }
  }
}
```

`allowConversationAccess=true` is required for non-bundled OpenClaw plugins that register conversation-aware typed hooks. `allowPromptInjection=true` keeps the later-text staged-media guidance available if your OpenClaw config uses explicit hook policies.

## Configuration

```json
{
  "stageAttachments": true,
  "replyContent": "收到媒体，已保存。",
  "python": "/Users/you/.pyenv/versions/3.12.13/bin/python3",
  "obsidianWorkflowsPath": "/Users/you/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py",
  "stagedAttachmentTtlHours": 48,
  "onlyChannels": ["qqbot", "wecom", "webchat"],
  "ignoredChannels": ["telegram"],
  "replyDispatchGuard": true,
  "beforeDispatchFallback": true,
  "agentReplyFallback": true,
  "pendingMediaPromptInjection": true,
  "debugLogging": false,
  "debugLogPath": "/tmp/obsidian-media-claim-debug.jsonl"
}
```

Fields:

- `stageAttachments`: set `false` to claim media-only messages without staging files.
- `replyContent`: synthetic reply for claimed messages.
- `python`: Python executable used for `obsidian_workflows.py`. Use Python 3.10 or newer, and prefer an absolute path because the OpenClaw Gateway or LaunchAgent environment can resolve `python3` differently from your interactive shell.
- `obsidianWorkflowsPath`: explicit path to the Obsidian workflow launcher. This script is executed locally with `execFile`; configure only trusted paths because its behavior controls the real attachment-staging side effects.
- `stagedAttachmentTtlHours`: staged media older than this is pruned before each new media save. Defaults to `48`.
- `onlyChannels`: optional channel allowlist.
- `ignoredChannels`: optional channel denylist.
- `replyDispatchGuard`: primary OpenClaw 2026.6.11 guard. Set `false` only when another plugin owns `reply_dispatch` media handling.
- `beforeDispatchFallback`: early fallback for runtimes/channels that expose attachment markers before full reply dispatch.
- `agentReplyFallback`: late fallback for runtimes/channels that only expose media markers in the cleaned prompt. It is not the preferred guard because OpenClaw can run media understanding before this phase.
- `pendingMediaPromptInjection`: inject staged-media workflow guidance into later text turns that ask to record earlier videos, media, files, or attachments. Defaults to `true`. Injection requires trusted runtime conversation metadata that can build the same scoped batch key used during staging; prompt text metadata is not trusted for attachment lookup.
- `debugLogging`: write detailed hook diagnostics. Defaults to `false`; enable only while debugging because conversation-aware hooks can expose raw event fields.
- `debugLogPath`: JSONL diagnostics path. It can also be set with `OBSIDIAN_MEDIA_CLAIM_DEBUG_LOG`.

During debugging, watch the log while sending a media-only message:

```bash
tail -f /tmp/obsidian-media-claim-debug.jsonl
```

Each line records the hook label, key event fields, context fields, media detection result, staging result, and final hook return value.

## Usage notes

- Media download success is not the same as staged-attachment success. A reply such as `收到媒体，已保存。但暂存失败，后续记录可能无法自动关联该媒体。` means the channel delivered a readable local media file, but `obsidian_workflows.py` failed while pruning or staging the attachment.
- Keep `debugLogging=false` during normal use. Enable it only while troubleshooting and inspect `debugLogPath` for entries such as `handleInboundClaim.stage.error`.
- If OpenClaw runs as a service or LaunchAgent, configure `python` as an absolute Python 3.10+ executable instead of relying on `python3` from `PATH`.
- Restart or refresh the OpenClaw gateway after changing plugin config; existing gateway processes will not necessarily pick up the new Python path.
- After uploading media, `attachment-pending --ttl-hours 48` should show the staged files. If the count is `0`, the media was not staged and later text turns cannot automatically attach it.
- Later text-turn prompt injection is scoped by trusted runtime fields such as channel, conversation, sender, and session. If those fields are unavailable, the plugin skips injection instead of running a global pending-media lookup.
- Staged attachment ids and upload labels are injected as escaped JSON strings. Treat labels as untrusted display names because they can originate from user-controlled filenames.

Use the configured Python interpreter when checking the staging backend:

```bash
<configured-python> <obsidianWorkflowsPath> attachment-prune --ttl-hours 48
<configured-python> <obsidianWorkflowsPath> attachment-pending --ttl-hours 48
```

For example:

```bash
/Users/you/.pyenv/versions/3.12.13/bin/python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-prune --ttl-hours 48
/Users/you/.pyenv/versions/3.12.13/bin/python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --ttl-hours 48
```

If the debug log or command output contains an error like `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` near a type annotation such as `pathlib.Path | None`, the configured Python is too old for `obsidian-cli-plugins`. Set `python` to an absolute Python 3.10+ path and restart the gateway.

## Safety boundaries

The plugin treats channel message text, prompt text, uploaded filenames, staged labels, and prompt-embedded metadata as untrusted input. In particular:

- `before_prompt_build` uses only trusted runtime `ctx` fields to rebuild the scoped batch key. It does not parse `Conversation info (untrusted metadata)` from prompt text for attachment lookup.
- If channel, conversation, and sender fields are not available from trusted runtime metadata, the plugin skips prompt injection instead of querying all pending attachments.
- Attachment ids, selectors, batch keys, and display labels are injected into model context as escaped JSON strings. Labels are for display only and should not be treated as instructions.
- Hook wrapper failures are logged when `debugLogging=true` and then fail open, so a plugin-side diagnostic or dispatcher error should not block unrelated OpenClaw message handling.

To consume staged media from a later text turn, list pending media with the Obsidian skill command instead of guessing ids from model context:

```bash
<configured-python> ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --ttl-hours 48
```

For a known conversation batch, include `--batch-key <key>`. The prompt injection includes both the returned `batch:<key>` selector and the explicit staged ids. Agents should first consume the selector; if `record-sync` returns `staged-attachments-not-found`, retry once with every staged id as a separate `--staged-attachment` argument. A successful `record-sync --staged-attachment ...` removes consumed staged files; failed record attempts leave them in place for retry until the 48-hour prune removes them.

If a later text turn replies `视频文件不在当前目录中` or returns OpenClaw's generic `Agent couldn't generate a response` error, check the stored pending media first:

```bash
<configured-python> ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --ttl-hours 48
```

If this returns a selector such as `batch:wecom-...`, the media was staged correctly and the failure is in the later Agent workflow. Ensure this plugin is version `0.1.12` or newer for scoped prompt injection, `before_prompt_build` is listed by `openclaw plugins inspect obsidian-media-claim`, and `pendingMediaPromptInjection` is enabled.

## Skill-only compatibility

This plugin is not required for ordinary Obsidian records. If only `obsidian-cli-plugins` is installed, text records, task records, project records, and file-mode records with explicit local `--attach` paths should continue to work through the skill commands. This is the supported baseline: the skill is mandatory; the plugin is an optional optimization for channel media uploads.

The plugin is needed only for the channel workflow where a phone client sends media-only messages first and text later, and where you want those uploads to avoid model involvement. Without the plugin, OpenClaw may dispatch media-only uploads to the LLM or fail to stage them automatically. In that setup the compatible fallback is manual or runtime-provided staging:

```bash
<configured-python> ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-stage --path "<local-media-path>" --type video --batch-key "<conversation-key>"
<configured-python> ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --batch-key "<conversation-key>" --ttl-hours 48
<configured-python> ~/.openclaw/skills/obsidian-cli-plugins/scripts/obs_record_sync.py --mode file --period day --date today --text "<later text>" --type mixed --staged-attachment "batch:<conversation-key>" --require-attachment
```

If the runtime cannot provide readable local media paths and the plugin is not installed, the skill should refuse an attachment-backed record rather than creating a text-only fallback.

If `obsidianWorkflowsPath` is omitted, the plugin tries these paths:

```text
~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py
~/.codex/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py
~/.cc-switch/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py
```

## Verify

```bash
npm run verify
```

For a local linked install:

```bash
npm run verify:install
openclaw plugins inspect obsidian-media-claim
```

Restart or refresh the OpenClaw gateway after installing or updating runtime plugins.

## Website

The project website follows the `obsidian-image-manager` style as a single project page:

- `/`: OpenClaw plugin page for media-only interception, staging, prompt injection, and safety boundaries.
- `?lang=en`: English content; Chinese is the default.
- `#links`: friendly links to the image plugin page and Obsidian skill page, which are maintained in their own repositories.
- `#support`: project support section with WeChat Pay, WeChat reward, and Alipay QR images.

Build locally:

```bash
cd website
npm install
npm run build
```

GitHub Pages is deployed by `.github/workflows/pages.yml` from the `dev` branch when `website/**` changes, and from stable `vX.Y.Z` tags during releases. The npm publish workflow also builds `website/` before publishing, so release tags verify the pages before the package is published.

## Publish

Prepare a package:

```bash
npm run pack:dry-run
```

### Automated npm publish

GitHub Actions publishes stable semver tags automatically through npm Trusted Publishing. Configure the package on npm first:

```text
Publisher: GitHub Actions
Repository: DXShelley/openclaw-obsidian-media-claim
Workflow: npm-publish.yml
Permissions: npm publish, npm stage publish
```

Then bump the patch version, sync the plugin runtime/manifest versions, commit it, create a matching tag, and push both the branch and tag:

```bash
npm version patch --no-git-tag-version
VERSION="$(node -p "require('./package.json').version")"
node -e "const fs=require('fs'); const version=require('./package.json').version; const p='openclaw.plugin.json'; const json=JSON.parse(fs.readFileSync(p,'utf8')); json.version=version; fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');"
perl -0pi -e "s/export const version = \"[^\"]+\";/export const version = \"${VERSION}\";/" index.js
git add package.json package-lock.json index.js openclaw.plugin.json CHANGELOG.md
git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}"
git push origin dev
git push origin "v${VERSION}"
```

The workflow accepts tags like `v0.1.14`, requires the tag to match `package.json#version`, runs `npm ci`, updates the runner to npm 11.5.1 or newer for Trusted Publishing, runs `npm run verify`, skips publishing if that exact version already exists on npm, and publishes with npm provenance. It can also be started manually from the GitHub Actions page with `workflow_dispatch`; manual runs publish the current `package.json#version` after the same checks.

Use the automated workflow for normal releases. It uses OpenID Connect and does not require an `NPM_TOKEN` GitHub secret. The local `npm publish` commands below are only for emergency/manual publishing from a logged-in workstation, and may require an npm OTP if the account enforces 2FA.

Publish to npm:

```bash
npm login --registry https://registry.npmjs.org/
npm whoami --registry https://registry.npmjs.org/
npm publish --access public --registry https://registry.npmjs.org/
```

If the npm account requires 2FA for publish, pass the one-time code:

```bash
npm publish --access public --registry https://registry.npmjs.org/ --otp <one-time-code>
```

Publish to ClawHub after logging in with the platform CLI:

```bash
clawhub login
clawhub package publish . --family code-plugin --dry-run
clawhub package publish . --family code-plugin
```

If your ClawHub namespace requires a scoped package name, update `package.json#name` and the install examples before publishing. OpenClaw package publishing requires `package.json#openclaw.compat.pluginApi` and `package.json#openclaw.build.openclawVersion`; both are included in this package.

## License

MIT
