# Changelog

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
