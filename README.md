# OpenClaw Obsidian Media Claim

OpenClaw plugin that intercepts media-only inbound messages before they reach the LLM. If the channel provides readable local attachment paths, the plugin stages them through `obsidian-cli-plugins` so a later text message can create one Obsidian file-mode record with all staged media.

This is an OpenClaw runtime plugin, not a general-purpose npm library. It depends on OpenClaw typed hooks (`reply_dispatch`, `inbound_claim`, `before_dispatch`, `before_agent_reply`, and `before_prompt_build`) and is useful only inside an OpenClaw plugin runtime that supports those hooks.

## Why

Some channels deliver several images or videos as separate media-only events before the user sends the actual instruction, for example:

```text
[image]
[image]
把上面两张图记录到 ob
```

Without a pre-model guard, each media-only event can be sent to the model and waste tokens. This plugin claims those events, replies with a short acknowledgement, and keeps the media available for the later Obsidian record workflow.

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
- On later media-record text turns, looks up pending staged media with `attachment-pending --ttl-hours 48` and injects the safe selector into the prompt. This does not run media understanding and does not expose media-only uploads to the LLM.
- Supports optional channel allow/deny lists.
- Does not write Obsidian notes or media files directly; Obsidian-side effects are delegated to `obsidian-cli-plugins/scripts/obsidian_workflows.py`.
- May still claim media-only messages when only remote media URLs are present, but it cannot stage attachments unless the channel/runtime exposes readable local file paths.

## Requirements

- OpenClaw 2026.6.11 or a compatible version with `reply_dispatch`, `inbound_claim`, `before_dispatch`, `before_agent_reply`, and `before_prompt_build` typed hooks.
- Node.js 22.19 or newer.
- `obsidian-cli-plugins` installed as an OpenClaw, Codex, or cc-switch skill when `stageAttachments` is enabled.

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
  "python": "python3",
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
- `python`: Python executable used for `obsidian_workflows.py`.
- `obsidianWorkflowsPath`: explicit path to the Obsidian workflow launcher. This script is executed locally with `execFile`; configure only trusted paths because its behavior controls the real attachment-staging side effects.
- `stagedAttachmentTtlHours`: staged media older than this is pruned before each new media save. Defaults to `48`.
- `onlyChannels`: optional channel allowlist.
- `ignoredChannels`: optional channel denylist.
- `replyDispatchGuard`: primary OpenClaw 2026.6.11 guard. Set `false` only when another plugin owns `reply_dispatch` media handling.
- `beforeDispatchFallback`: early fallback for runtimes/channels that expose attachment markers before full reply dispatch.
- `agentReplyFallback`: late fallback for runtimes/channels that only expose media markers in the cleaned prompt. It is not the preferred guard because OpenClaw can run media understanding before this phase.
- `pendingMediaPromptInjection`: inject staged-media workflow guidance into later text turns that ask to record earlier videos, media, files, or attachments. Defaults to `true`.
- `debugLogging`: write detailed hook diagnostics. Defaults to `false`; enable only while debugging because conversation-aware hooks can expose raw event fields.
- `debugLogPath`: JSONL diagnostics path. It can also be set with `OBSIDIAN_MEDIA_CLAIM_DEBUG_LOG`.

During debugging, watch the log while sending a media-only message:

```bash
tail -f /tmp/obsidian-media-claim-debug.jsonl
```

Each line records the hook label, key event fields, context fields, media detection result, staging result, and final hook return value.

To consume staged media from a later text turn, list pending media with the Obsidian skill command instead of guessing ids from model context:

```bash
python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --ttl-hours 48
```

For a known conversation batch, include `--batch-key <key>`. The prompt injection includes both the returned `batch:<key>` selector and the explicit staged ids. Agents should first consume the selector; if `record-sync` returns `staged-attachments-not-found`, retry once with every staged id as a separate `--staged-attachment` argument. A successful `record-sync --staged-attachment ...` removes consumed staged files; failed record attempts leave them in place for retry until the 48-hour prune removes them.

If a later text turn replies `视频文件不在当前目录中` or returns OpenClaw's generic `Agent couldn't generate a response` error, check the stored pending media first:

```bash
python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --ttl-hours 48
```

If this returns a selector such as `batch:wecom-...`, the media was staged correctly and the failure is in the later Agent workflow. Ensure this plugin is version `0.1.11` or newer, `before_prompt_build` is listed by `openclaw plugins inspect obsidian-media-claim`, and `pendingMediaPromptInjection` is enabled.

## Skill-only compatibility

This plugin is not required for ordinary Obsidian records. If only `obsidian-cli-plugins` is installed, text records, task records, project records, and file-mode records with explicit local `--attach` paths should continue to work through the skill commands.

The plugin is required only for the channel workflow where a phone client sends media-only messages first and text later. Without the plugin, OpenClaw has no pre-model component that can both claim those media-only turns and stage readable local paths for the later text command. In that setup the compatible fallback is manual or runtime-provided staging:

```bash
python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-stage --path "<local-media-path>" --type video --batch-key "<conversation-key>"
python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py attachment-pending --batch-key "<conversation-key>" --ttl-hours 48
python3 ~/.openclaw/skills/obsidian-cli-plugins/scripts/obs_record_sync.py --mode file --period day --date today --text "<later text>" --type mixed --staged-attachment "batch:<conversation-key>" --require-attachment
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

## Publish

Prepare a package:

```bash
npm run pack:dry-run
```

Publish to npm:

```bash
npm publish
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
