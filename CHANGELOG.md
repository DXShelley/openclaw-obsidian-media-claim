# Changelog

## Unreleased

- Add a GitHub Actions npm publish workflow for stable `vX.Y.Z` tags, with version matching, verification, duplicate-version skip, and npm provenance.

## 0.1.12 - 2026-07-06

- Scope pending-media prompt injection to trusted runtime batch keys, skip injection when the key cannot be built, and escape staged attachment ids and labels before adding them to model context.
- Await asynchronous `reply_dispatch` final replies and fail open from hook wrapper errors after writing debug diagnostics.
- Document QQ channel staging failures caused by OpenClaw resolving `python3` to a Python version older than 3.10, including the debug-log symptom and the recommended absolute Python path configuration.
- Include explicit staged ids in `before_prompt_build` context and instruct Agents to retry with those ids if a returned `batch:<key>` selector is not consumed by `record-sync`.
- Query `attachment-pending` with a trusted runtime `--batch-key` when conversation metadata is available, reducing stale-batch ambiguity without using prompt text as an attachment lookup authority.
- Document skill-only compatibility: normal Obsidian record workflows work with `obsidian-cli-plugins` alone, while media-only-then-text channel staging requires this plugin or manual `attachment-stage`.
- Add a `before_prompt_build` staged-media prompt injection for later text turns that ask to record earlier videos/media/attachments. It looks up `attachment-pending --ttl-hours 48` and tells the Agent to use the returned `batch:<key>` selector instead of searching the current directory.
- Add `pendingMediaPromptInjection` config, enabled by default.
- Use stable short hashed batch keys for staged media so QQBot conversation keys are not truncated into the same queue.
- Prune staged attachments older than 48 hours before saving newly uploaded media.
- Document command-based media lookup with `attachment-pending --ttl-hours 48` so later record turns do not rely on model-inferred staged ids.
- Add `reply_dispatch` as the primary media-only guard for OpenClaw 2026.6.11 so channel media with `MediaPaths`, `MediaUrls`, or `MediaTypes` is claimed before default media understanding and model dispatch.
- Keep `inbound_claim`, `before_dispatch`, and `before_agent_reply` as compatibility fallbacks for plugin-owned bindings, attachment-marker messages, and older cleaned-prompt paths.
- Treat OpenClaw media-only placeholders such as `[media attached: ...]` and `<media:video>` as media signals rather than user text.
- Fix register-time debug logging so `api.pluginConfig.debugLogging=true` can record the `register` event.

## 0.1.8

- Prefer `bodyForAgent` and structured media fields over legacy plaintext channel envelopes when detecting media-only inbound events.
- Detect local attachment paths from top-level `attachments`, `media`, `mediaRefs`, and related structured arrays.
- Treat remote media URLs as media signals without trying to stage them as local files.
- Default `debugLogging` to `false` so conversation-aware hooks do not write raw event diagnostics unless explicitly enabled.

## 0.1.7

- Replace the `before_agent_run` fallback with `before_agent_reply` so media-only fallback handling returns a normal synthetic reply instead of an input-gate blocked-message error.
- Add `agentReplyFallback` while keeping `agentRunFallback=false` as a compatibility way to disable the fallback.

## 0.1.6

- Strip OpenClaw runtime metadata blocks from `before_agent_run` prompts before deciding whether a message is media-only.
- Treat channel timestamp prefixes plus attachments as media-only when no real user text remains.

## 0.1.5

- Add detailed JSONL diagnostics for `register`, `inbound_claim`, `before_agent_run`, media detection, attachment staging, and hook return values.
- Add `debugLogging` and `debugLogPath` config fields for troubleshooting channel hook behavior.

## 0.1.4

- Replace the `before_dispatch` fallback with a `before_agent_run` safety guard.
- Stop claiming empty-body dispatch events without an attachment signal.
- Use `inbound_claim` as the primary pre-routing interception path and `before_agent_run` only as the final pre-model fallback.

## 0.1.3

- Claim empty-body `before_dispatch` events from media-capable channels, covering QQBot media events whose attachment marker is only added later in the session transcript.

## 0.1.2

- Register a `before_dispatch` fallback hook so media-only messages from normal channel dispatch are claimed before the LLM, even when they are not routed through a plugin-owned conversation binding.
- Keep the runtime export version aligned with `package.json`.

## 0.1.1

- Clarify that this package is an OpenClaw `inbound_claim` typed-hook plugin, not a general npm library.
- Clarify that attachment staging is delegated to `obsidian-cli-plugins/scripts/obsidian_workflows.py`.
- Document the remote-media-URL limitation and trusted local Python script boundary.
- Fix README Node.js requirement to match `package.json` (`>=22.19`).

## 0.1.0

- Initial OpenClaw `inbound_claim` plugin.
- Detect media-only messages by generic attachment markers and common metadata fields.
- Optionally stage readable attachments through `obsidian-cli-plugins`.
