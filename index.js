import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ATTACHMENT_MARKER_RE = /\[Attachment:\s*([^\]\r\n]+?)\s*\]/g;
const DEFAULT_REPLY = "收到媒体，已保存。";
const DEFAULT_WORKFLOWS_PATHS = [
  join(homedir(), ".openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py"),
  join(homedir(), ".codex/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py"),
  join(homedir(), ".cc-switch/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py")
];

export const id = "obsidian-media-claim";
export const name = "Obsidian Media Claim";
export const description = "Intercept media-only inbound messages before the LLM.";
export const version = "0.1.0";

export function register(api) {
  api.on(
    "inbound_claim",
    async (event, ctx) => handleInboundClaim(event, ctx),
    {
      name: "obsidian-media-claim:inbound-claim",
      description: "Short-circuit media-only messages and stage readable local attachments.",
      timeoutMs: 15000
    }
  );
}

export async function handleInboundClaim(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  if (!isChannelAllowed(event.channel, config)) return;

  const claim = inspectInboundMedia(event);
  if (!claim.mediaOnly) return;

  const readablePaths = claim.paths.filter(isReadableFile);
  let staged = [];
  let stageError = null;

  if (config.stageAttachments && readablePaths.length > 0) {
    try {
      staged = await stageAttachments(readablePaths, event, config);
    } catch (error) {
      stageError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    handled: true,
    reply: {
      content: buildReplyContent({
        configured: config.replyContent,
        detectedCount: claim.paths.length,
        readableCount: readablePaths.length,
        stagedCount: staged.length,
        stageError
      })
    }
  };
}

export function inspectInboundMedia(event) {
  const content = asString(event?.content);
  const metadata = isRecord(event?.metadata) ? event.metadata : {};
  const paths = uniqueStrings([
    ...extractAttachmentPaths(content),
    ...extractMetadataPaths(metadata)
  ]);
  const hasAttachmentSignal =
    hasAttachmentMarker(content) ||
    paths.length > 0 ||
    extractStringArray(metadata.mediaUrls).length > 0 ||
    extractStringArray(metadata.MediaUrls).length > 0 ||
    Boolean(asString(metadata.mediaUrl) || asString(metadata.MediaUrl));

  return {
    mediaOnly: hasAttachmentSignal && !hasUserText(event),
    hasAttachmentSignal,
    paths
  };
}

export function hasUserText(event) {
  const body = stripAttachmentMarkers(asString(event?.body)).trim();
  const bodyForAgent = stripAttachmentMarkers(asString(event?.bodyForAgent)).trim();
  const transcript = asString(event?.transcript).trim();
  const content = stripAttachmentMarkers(asString(event?.content)).trim();

  return Boolean(body || bodyForAgent || transcript || content);
}

export function hasAttachmentMarker(content) {
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  return ATTACHMENT_MARKER_RE.test(content);
}

export function extractAttachmentPaths(content) {
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  const paths = [];
  for (const match of content.matchAll(ATTACHMENT_MARKER_RE)) {
    const value = cleanAttachmentPath(match[1]);
    if (value) paths.push(value);
  }
  return paths;
}

export function stripAttachmentMarkers(content) {
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  return content.replace(ATTACHMENT_MARKER_RE, "").replace(/\(download failed\)/gi, "");
}

export function extractMetadataPaths(metadata) {
  return uniqueStrings([
    ...extractStringArray(metadata.mediaPaths),
    ...extractStringArray(metadata.MediaPaths),
    ...extractStringArray(metadata.localMediaPaths),
    ...extractStringArray(metadata.LocalMediaPaths),
    ...extractStringValue(metadata.mediaPath),
    ...extractStringValue(metadata.MediaPath),
    ...extractMediaListPaths(metadata.mediaList),
    ...extractMediaListPaths(metadata.MediaList)
  ]);
}

export function buildBatchKey(event) {
  const parts = [
    event?.channel,
    event?.accountId,
    event?.conversationId,
    event?.senderId,
    event?.threadId
  ].map(asString).filter(Boolean);
  return parts.length > 0 ? parts.join("@") : "default";
}

export function detectMediaType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".avif"].includes(ext)) {
    return "image";
  }
  if ([".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"].includes(ext)) {
    return "video";
  }
  if ([".mp3", ".m4a", ".wav", ".ogg", ".opus", ".flac", ".aac"].includes(ext)) {
    return "audio";
  }
  return "file";
}

function normalizeConfig(value) {
  const config = isRecord(value) ? value : {};
  return {
    stageAttachments: config.stageAttachments !== false,
    replyContent: asString(config.replyContent) || DEFAULT_REPLY,
    python: asString(config.python) || "python3",
    obsidianWorkflowsPath: asString(config.obsidianWorkflowsPath) || findDefaultWorkflowsPath(),
    onlyChannels: extractStringArray(config.onlyChannels),
    ignoredChannels: extractStringArray(config.ignoredChannels)
  };
}

function isChannelAllowed(channel, config) {
  const normalized = asString(channel);
  if (config.onlyChannels.length > 0 && !config.onlyChannels.includes(normalized)) return false;
  return !config.ignoredChannels.includes(normalized);
}

async function stageAttachments(paths, event, config) {
  if (!config.obsidianWorkflowsPath || !existsSync(config.obsidianWorkflowsPath)) {
    throw new Error("obsidian_workflows.py not found");
  }

  const batchKey = buildBatchKey(event);
  const staged = [];
  for (const filePath of paths) {
    const { stdout } = await execFileAsync(
      config.python,
      [
        config.obsidianWorkflowsPath,
        "attachment-stage",
        "--path",
        filePath,
        "--type",
        detectMediaType(filePath),
        "--label",
        basename(filePath),
        "--batch-key",
        batchKey
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    if (!parsed?.ok) {
      throw new Error(asString(parsed?.reason) || "attachment-stage failed");
    }
    staged.push(parsed);
  }
  return staged;
}

function buildReplyContent({ configured, detectedCount, readableCount, stagedCount, stageError }) {
  if (stageError) {
    return `${configured} 但暂存失败，后续记录可能无法自动关联该媒体。`;
  }
  if (detectedCount > 0 && readableCount === 0) {
    return "收到媒体，但当前渠道没有提供可读的本地文件路径。";
  }
  if (stagedCount > 1) {
    return `${configured} 已暂存 ${stagedCount} 个文件。`;
  }
  return configured;
}

function findDefaultWorkflowsPath() {
  return DEFAULT_WORKFLOWS_PATHS.find((candidate) => existsSync(candidate)) || DEFAULT_WORKFLOWS_PATHS[0];
}

function extractMediaListPaths(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    return [
      item.path,
      item.localPath,
      item.filePath,
      item.localFile,
      item.downloadPath
    ].flatMap(extractStringValue);
  });
}

function extractStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(extractStringValue);
}

function extractStringValue(value) {
  const text = asString(value).trim();
  return text ? [text] : [];
}

function cleanAttachmentPath(value) {
  return asString(value)
    .replace(/\s+\(download failed\)\s*$/i, "")
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    const text = asString(value).trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }
  return unique;
}

function isReadableFile(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export default {
  id,
  name,
  description,
  version,
  register
};
