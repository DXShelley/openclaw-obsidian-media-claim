# OpenClaw Obsidian Media Claim

OpenClaw plugin that intercepts media-only inbound messages before they reach the LLM. If the channel provides readable local attachment paths, the plugin stages them through `obsidian-cli-plugins` so a later text message can create one Obsidian file-mode record with all staged media.

This is an OpenClaw runtime plugin, not a general-purpose npm library. It depends on OpenClaw typed hooks (`inbound_claim` and `before_dispatch`) and is useful only inside an OpenClaw plugin runtime that supports those hooks.

## Why

Some channels deliver several images or videos as separate media-only events before the user sends the actual instruction, for example:

```text
[image]
[image]
把上面两张图记录到 ob
```

Without an early `inbound_claim` guard, each media-only event can be sent to the model and waste tokens. This plugin claims those events, replies with a short acknowledgement, and keeps the media available for the later Obsidian record workflow.

## Behavior

- Claims only media-only inbound messages.
- Does not claim messages that contain user text, `bodyForAgent`, or transcript text.
- Registers both `inbound_claim` and a `before_dispatch` fallback, because current OpenClaw dispatch only targets `inbound_claim` for plugin-owned conversation bindings.
- Treats empty-body dispatch events from configured media-capable channels as media-only events. This covers QQBot media messages where the session transcript later gets an `[Attachment: ...]` marker, but the `before_dispatch` hook event itself has no media metadata.
- Detects generic `[Attachment: /path/to/file]` markers.
- Detects common metadata paths: `mediaPaths`, `MediaPaths`, `localMediaPaths`, `mediaPath`, `MediaPath`, and `mediaList`.
- Stages readable local files with `obsidian_workflows.py attachment-stage`.
- Supports optional channel allow/deny lists.
- Does not write Obsidian notes or media files directly; Obsidian-side effects are delegated to `obsidian-cli-plugins/scripts/obsidian_workflows.py`.
- May still claim media-only messages when only remote media URLs are present, but it cannot stage attachments unless the channel/runtime exposes readable local file paths.

## Requirements

- OpenClaw 2026.6.11 or a compatible version with `inbound_claim` and `before_dispatch` typed hooks.
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

Then enable the plugin with conversation access for `inbound_claim`:

```json
{
  "plugins": {
    "entries": {
      "obsidian-media-claim": {
        "enabled": true,
        "hooks": {
          "allowConversationAccess": true,
          "timeoutMs": 15000
        },
        "config": {
          "stageAttachments": true,
          "replyContent": "收到媒体，已保存。"
        }
      }
    }
  }
}
```

`allowConversationAccess=true` is required for non-bundled OpenClaw plugins that register conversation-aware typed hooks.

## Configuration

```json
{
  "stageAttachments": true,
  "replyContent": "收到媒体，已保存。",
  "python": "python3",
  "obsidianWorkflowsPath": "/Users/you/.openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py",
  "onlyChannels": ["qqbot", "wecom", "webchat"],
  "ignoredChannels": ["telegram"],
  "claimEmptyBodyMediaEvents": true,
  "emptyBodyMediaChannels": ["qqbot", "wecom", "webchat", "telegram", "feishu"]
}
```

Fields:

- `stageAttachments`: set `false` to claim media-only messages without staging files.
- `replyContent`: synthetic reply for claimed messages.
- `python`: Python executable used for `obsidian_workflows.py`.
- `obsidianWorkflowsPath`: explicit path to the Obsidian workflow launcher. This script is executed locally with `execFile`; configure only trusted paths because its behavior controls the real attachment-staging side effects.
- `onlyChannels`: optional channel allowlist.
- `ignoredChannels`: optional channel denylist.
- `claimEmptyBodyMediaEvents`: claim empty `before_dispatch` events from media-capable channels. Disable this if one of your channels legitimately sends empty text-only messages that should reach the agent.
- `emptyBodyMediaChannels`: channel ids where empty `before_dispatch` bodies are treated as media-only events.

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
