# Security

Report security issues privately through GitHub security advisories when available, or by opening a minimal issue that does not include sensitive media paths, tokens, vault contents, or private chat transcripts.

## Scope

This plugin only handles OpenClaw inbound metadata and local attachment paths. It does not upload media, call remote APIs, or read Obsidian vault content directly.

## Local Execution

When `stageAttachments` is enabled, the plugin runs `obsidian_workflows.py attachment-stage` with `execFile`, not a shell. The Python executable and workflow path are configurable. Keep those paths trusted, because they run on the OpenClaw host.

## Data Handling

Staged media is copied by `obsidian-cli-plugins` into its private cache. Do not share staged attachment paths or channel metadata in public issues.
