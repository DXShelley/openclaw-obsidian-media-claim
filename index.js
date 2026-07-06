import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ATTACHMENT_MARKER_RE = /\[Attachment:\s*([^\]\r\n]+?)\s*\]/g;
const DEFAULT_REPLY = "收到媒体，已保存。";
const DEFAULT_STAGE_TTL_HOURS = 48;
const CLAIM_HOOK_OPTIONS = {
  priority: 1000,
  timeoutMs: 15000
};
const REPLY_DISPATCH_HOOK_OPTIONS = {
  priority: 1000,
  timeoutMs: 15000
};
const BEFORE_DISPATCH_HOOK_OPTIONS = {
  priority: 1000,
  timeoutMs: 15000
};
const AGENT_REPLY_HOOK_OPTIONS = {
  priority: 1000,
  timeoutMs: 15000
};
const PROMPT_BUILD_HOOK_OPTIONS = {
  priority: 1000,
  timeoutMs: 15000
};
const DEFAULT_DEBUG_LOG_PATH = "/tmp/obsidian-media-claim-debug.jsonl";
const DEBUG_STRING_LIMIT = 4000;
const DEBUG_ARRAY_LIMIT = 20;
const DEBUG_OBJECT_KEYS_LIMIT = 80;
const PROMPT_VALUE_LIMIT = 200;
const MEDIA_REFERENCE_RE = /(视频|录像|图片|照片|图像|音频|语音|媒体|附件|文件|上面|前面|刚才|刚刚|这些|这几个|这两|两条|两个|above|previous|earlier|media|video|image|audio|attachment|file)/i;
const RECORD_INTENT_RE = /(记录|记一下|保存|存一下|写入|同步|归档|ob|obsidian|record|save|attach|archive)/i;
const DEFAULT_WORKFLOWS_PATHS = [
  join(homedir(), ".openclaw/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py"),
  join(homedir(), ".codex/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py"),
  join(homedir(), ".cc-switch/skills/obsidian-cli-plugins/scripts/obsidian_workflows.py")
];

export const id = "obsidian-media-claim";
export const name = "Obsidian Media Claim";
export const description = "Intercept media-only inbound messages before the LLM.";
export const version = "0.1.14";

export function register(api) {
  const registerCtx = withPluginConfig({}, api);
  writeDebugLog("register", {
    version,
    hooks: ["reply_dispatch", "inbound_claim", "before_dispatch", "before_agent_reply", "before_prompt_build"],
    hookOptions: {
      reply_dispatch: REPLY_DISPATCH_HOOK_OPTIONS,
      inbound_claim: CLAIM_HOOK_OPTIONS,
      before_dispatch: BEFORE_DISPATCH_HOOK_OPTIONS,
      before_agent_reply: AGENT_REPLY_HOOK_OPTIONS,
      before_prompt_build: PROMPT_BUILD_HOOK_OPTIONS
    }
  }, registerCtx);

  api.on(
    "reply_dispatch",
    async (event, ctx) => {
      const runtimeCtx = withPluginConfig(ctx, api);
      writeDebugLog("reply_dispatch.received", {
        event: summarizeReplyDispatchEvent(event),
        ctx: summarizeReplyDispatchContext(runtimeCtx)
      }, runtimeCtx);
      try {
        const result = await handleReplyDispatch(event, runtimeCtx);
        writeDebugLog("reply_dispatch.result", result, runtimeCtx);
        return result;
      } catch (error) {
        writeDebugLog("reply_dispatch.error", {
          error: normalizeError(error)
        }, runtimeCtx);
        return;
      }
    },
    REPLY_DISPATCH_HOOK_OPTIONS
  );
  api.on(
    "inbound_claim",
    async (event, ctx) => {
      const runtimeCtx = withPluginConfig(ctx, api);
      writeDebugLog("inbound_claim.received", {
        event: summarizeInboundEvent(event),
        ctx: summarizeContext(runtimeCtx)
      }, runtimeCtx);
      try {
        const result = await handleInboundClaim(event, runtimeCtx);
        writeDebugLog("inbound_claim.result", {
          handled: Boolean(result?.handled),
          result
        }, runtimeCtx);
        return result;
      } catch (error) {
        writeDebugLog("inbound_claim.error", {
          error: normalizeError(error)
        }, runtimeCtx);
        return;
      }
    },
    CLAIM_HOOK_OPTIONS
  );
  api.on(
    "before_dispatch",
    async (event, ctx) => {
      const runtimeCtx = withPluginConfig(ctx, api);
      writeDebugLog("before_dispatch.received", {
        event: summarizeInboundEvent(event),
        ctx: summarizeContext(runtimeCtx)
      }, runtimeCtx);
      try {
        const result = await handleBeforeDispatch(event, runtimeCtx);
        writeDebugLog("before_dispatch.result", result, runtimeCtx);
        return result;
      } catch (error) {
        writeDebugLog("before_dispatch.error", {
          error: normalizeError(error)
        }, runtimeCtx);
        return;
      }
    },
    BEFORE_DISPATCH_HOOK_OPTIONS
  );
  api.on(
    "before_agent_reply",
    async (event, ctx) => {
      const runtimeCtx = withPluginConfig(ctx, api);
      writeDebugLog("before_agent_reply.received", {
        event: summarizeBeforeAgentReplyEvent(event),
        ctx: summarizeContext(runtimeCtx)
      }, runtimeCtx);
      try {
        const result = await handleBeforeAgentReply(event, runtimeCtx);
        writeDebugLog("before_agent_reply.result", result, runtimeCtx);
        return result;
      } catch (error) {
        writeDebugLog("before_agent_reply.error", {
          error: normalizeError(error)
        }, runtimeCtx);
        return;
      }
    },
    AGENT_REPLY_HOOK_OPTIONS
  );
  api.on(
    "before_prompt_build",
    async (event, ctx) => {
      const runtimeCtx = withPluginConfig(ctx, api);
      writeDebugLog("before_prompt_build.received", {
        event: summarizePromptBuildEvent(event),
        ctx: summarizeContext(runtimeCtx)
      }, runtimeCtx);
      try {
        const result = await handleBeforePromptBuild(event, runtimeCtx);
        writeDebugLog("before_prompt_build.result", result, runtimeCtx);
        return result;
      } catch (error) {
        writeDebugLog("before_prompt_build.error", {
          error: normalizeError(error)
        }, runtimeCtx);
        return;
      }
    },
    PROMPT_BUILD_HOOK_OPTIONS
  );
}

function withPluginConfig(ctx = {}, api = {}) {
  const base = isRecord(ctx) ? ctx : {};
  if (isRecord(base.pluginConfig)) return base;
  if (isRecord(api?.pluginConfig)) {
    return {
      ...base,
      pluginConfig: api.pluginConfig
    };
  }
  return base;
}

export async function handleReplyDispatch(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  writeDebugLog("handleReplyDispatch.start", {
    event: summarizeReplyDispatchEvent(event),
    ctx: summarizeReplyDispatchContext(ctx),
    config: summarizeConfig(config)
  }, ctx);
  if (!config.replyDispatchGuard) {
    writeDebugLog("handleReplyDispatch.pass.guard_disabled", {}, ctx);
    return;
  }

  const syntheticInboundEvent = inboundEventFromReplyDispatch(event);
  writeDebugLog("handleReplyDispatch.syntheticInboundEvent", {
    event: summarizeInboundEvent(syntheticInboundEvent)
  }, ctx);

  const result = await handleInboundClaim(syntheticInboundEvent, ctx);
  if (!result?.handled) {
    writeDebugLog("handleReplyDispatch.pass.not_media_only", {}, ctx);
    return;
  }

  const replyText = replyTextFromResult(result);
  const queuedFinal = typeof ctx.dispatcher?.sendFinalReply === "function"
    ? Boolean(await ctx.dispatcher.sendFinalReply({ text: replyText }))
    : false;
  const replyResult = {
    handled: true,
    queuedFinal,
    counts: ctx.dispatcher?.getQueuedCounts?.() || emptyDispatchCounts(),
    reason: "media_only_message"
  };
  writeDebugLog("handleReplyDispatch.handled", replyResult, ctx);
  return replyResult;
}

export async function handleInboundClaim(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  writeDebugLog("handleInboundClaim.start", {
    event: summarizeInboundEvent(event),
    config: summarizeConfig(config)
  }, ctx);
  if (!isChannelAllowed(event.channel, config)) {
    writeDebugLog("handleInboundClaim.skip.channel_not_allowed", {
      channel: event?.channel,
      onlyChannels: config.onlyChannels,
      ignoredChannels: config.ignoredChannels
    }, ctx);
    return;
  }

  const claim = inspectInboundMedia(event);
  writeDebugLog("handleInboundClaim.inspect", {
    claim,
    textSignals: inspectTextSignals(event)
  }, ctx);
  if (!claim.mediaOnly) {
    writeDebugLog("handleInboundClaim.skip.not_media_only", {
      claim,
      textSignals: inspectTextSignals(event)
    }, ctx);
    return;
  }

  const readablePaths = claim.paths.filter(isReadableFile);
  writeDebugLog("handleInboundClaim.paths", {
    detectedPaths: claim.paths,
    readablePaths
  }, ctx);
  let staged = [];
  let stageError = null;

  if (config.stageAttachments && readablePaths.length > 0) {
    try {
      writeDebugLog("handleInboundClaim.stage.start", {
        readablePaths,
        obsidianWorkflowsPath: config.obsidianWorkflowsPath,
        python: config.python
      }, ctx);
      staged = await stageAttachments(readablePaths, event, config);
      writeDebugLog("handleInboundClaim.stage.success", {
        staged
      }, ctx);
    } catch (error) {
      stageError = error instanceof Error ? error.message : String(error);
      writeDebugLog("handleInboundClaim.stage.error", {
        error: normalizeError(error)
      }, ctx);
    }
  }

  const result = {
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
  writeDebugLog("handleInboundClaim.claimed", {
    result,
    stagedCount: staged.length,
    stageError
  }, ctx);
  return result;
}

export async function handleBeforeDispatch(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  writeDebugLog("handleBeforeDispatch.start", {
    event: summarizeInboundEvent(event),
    ctx: summarizeContext(ctx),
    config: summarizeConfig(config)
  }, ctx);
  if (!config.beforeDispatchFallback) {
    writeDebugLog("handleBeforeDispatch.pass.fallback_disabled", {}, ctx);
    return;
  }

  const result = await handleInboundClaim(event, ctx);
  if (!result?.handled) {
    writeDebugLog("handleBeforeDispatch.pass.not_media_only", {}, ctx);
    return;
  }

  const replyResult = {
    handled: true,
    text: replyTextFromResult(result)
  };
  writeDebugLog("handleBeforeDispatch.handled", replyResult, ctx);
  return replyResult;
}

export async function handleBeforeAgentReply(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  writeDebugLog("handleBeforeAgentReply.start", {
    event: summarizeBeforeAgentReplyEvent(event),
    ctx: summarizeContext(ctx),
    config: summarizeConfig(config)
  }, ctx);
  if (!config.agentReplyFallback) {
    writeDebugLog("handleBeforeAgentReply.pass.fallback_disabled", {}, ctx);
    return;
  }

  const syntheticInboundEvent = {
    channel: ctx.channel || ctx.messageProvider,
    accountId: ctx.accountId,
    conversationId: ctx.channelId || ctx.chatId,
    senderId: ctx.senderId,
    threadId: ctx.sessionKey,
    body: "",
    bodyForAgent: asString(event?.bodyForAgent),
    transcript: "",
    content: firstString(event?.cleanedBody, event?.prompt, event?.content, event?.body)
  };
  writeDebugLog("handleBeforeAgentReply.syntheticInboundEvent", {
    event: summarizeInboundEvent(syntheticInboundEvent)
  }, ctx);

  const result = await handleInboundClaim(syntheticInboundEvent, ctx);
  if (!result?.handled) {
    writeDebugLog("handleBeforeAgentReply.pass.not_media_only", {}, ctx);
    return;
  }

  const replyResult = {
    handled: true,
    reply: {
      text: replyTextFromResult(result),
      content: replyTextFromResult(result)
    },
    reason: "media_only_message"
  };
  writeDebugLog("handleBeforeAgentReply.handled", replyResult, ctx);
  return replyResult;
}

export async function handleBeforePromptBuild(event, ctx = {}) {
  const config = normalizeConfig(ctx.pluginConfig);
  writeDebugLog("handleBeforePromptBuild.start", {
    event: summarizePromptBuildEvent(event),
    ctx: summarizeContext(ctx),
    config: summarizeConfig(config)
  }, ctx);
  if (!config.pendingMediaPromptInjection) {
    writeDebugLog("handleBeforePromptBuild.pass.injection_disabled", {}, ctx);
    return;
  }

  const promptText = extractPromptText(event);
  if (!shouldInjectPendingMediaContext(promptText)) {
    writeDebugLog("handleBeforePromptBuild.pass.no_media_record_intent", {
      promptText
    }, ctx);
    return;
  }

  const pendingBatchKey = buildPromptBatchKey(event, ctx);
  if (!pendingBatchKey) {
    writeDebugLog("handleBeforePromptBuild.pass.no_trusted_batch_key", {}, ctx);
    return;
  }

  let pending;
  try {
    pending = await getPendingAttachments(config, pendingBatchKey);
  } catch (error) {
    writeDebugLog("handleBeforePromptBuild.pending.error", {
      batchKey: pendingBatchKey,
      error: normalizeError(error)
    }, ctx);
    return;
  }

  if (!pending?.ok || Number(pending.count || 0) <= 0 || !pending.selector) {
    writeDebugLog("handleBeforePromptBuild.pass.no_pending_media", {
      pending
    }, ctx);
    return;
  }

  const appendContext = buildPendingMediaPromptContext(pending, config);
  const result = {
    appendContext
  };
  writeDebugLog("handleBeforePromptBuild.inject", {
    selector: pending.selector,
    requestedBatchKey: pendingBatchKey,
    resolvedBatchKey: pending.resolved_batch_key || pending.batch_key,
    count: pending.count,
    idsCount: extractPendingIds(pending).length
  }, ctx);
  return result;
}

export function inspectInboundMedia(event) {
  const metadata = isRecord(event?.metadata) ? event.metadata : {};
  const paths = uniqueStrings([
    ...extractAttachmentPathsFromEvent(event),
    ...extractStructuredMediaPaths(event),
    ...extractMetadataPaths(metadata)
  ]);
  const remoteUrls = uniqueStrings([
    ...extractRemoteMediaUrls(event),
    ...extractRemoteMediaUrls(metadata)
  ]);
  const hasAttachmentSignal =
    hasAttachmentMarkerInEvent(event) ||
    paths.length > 0 ||
    remoteUrls.length > 0;

  return {
    mediaOnly: hasAttachmentSignal && !hasUserText(event),
    hasAttachmentSignal,
    paths,
    remoteUrls
  };
}

export function hasUserText(event) {
  const body = stripMediaOnlySignals(asString(event?.body)).trim();
  const bodyForAgent = stripMediaOnlySignals(asString(event?.bodyForAgent)).trim();
  const transcript = asString(event?.transcript).trim();
  const content = stripRuntimeMetadata(stripMediaOnlySignals(asString(event?.content))).trim();

  return Boolean(body || bodyForAgent || transcript || content);
}

export function hasAttachmentMarker(content) {
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  return ATTACHMENT_MARKER_RE.test(content);
}

export function hasAttachmentMarkerInEvent(event) {
  return extractEventTextFields(event).some((content) => hasAttachmentMarker(content));
}

export function extractAttachmentPathsFromEvent(event) {
  return uniqueStrings(extractEventTextFields(event).flatMap(extractAttachmentPaths));
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

export function stripMediaOnlySignals(content) {
  return stripAttachmentMarkers(content)
    .replace(/^\s*<media:[^>\r\n]+>(?:\s*\([^)\r\n]*\))?\s*$/gim, "")
    .replace(/^\s*\[media attached:\s*\d+\s+files?\]\s*$/gim, "")
    .replace(/^\s*\[media attached(?:\s+\d+\/\d+)?:[^\]\r\n]*\]\s*$/gim, "")
    .replace(/^\s*\[(?:image|video|audio|file|document)(?:\s+attached)?[^\]\r\n]*\]\s*$/gim, "");
}

export function stripRuntimeMetadata(content) {
  return asString(content)
    .replace(/(?:^|\n)Conversation info \(untrusted metadata\):\s*```(?:json)?\s*[\s\S]*?```\s*/g, "\n")
    .replace(/(?:^|\n)Sender \(untrusted metadata\):\s*```(?:json)?\s*[\s\S]*?```\s*/g, "\n")
    .replace(/(?:^|\n)OpenClaw runtime context for the immediately preceding user message\.[\s\S]*?<<<END_OPENCLAW_INTERNAL_CONTEXT>>>\s*/g, "\n")
    .replace(/^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})? GMT[^\]]*\]\s*/i, "");
}

function extractEventTextFields(event) {
  return [
    event?.bodyForAgent,
    event?.body,
    event?.transcript,
    event?.content,
    event?.cleanedBody,
    event?.prompt
  ].flatMap(extractStringValue);
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
    ...extractMediaListPaths(metadata.MediaList),
    ...extractStructuredMediaPaths(metadata)
  ]);
}

export function extractStructuredMediaPaths(value) {
  if (!isRecord(value)) return [];
  return uniqueStrings([
    ...extractMediaListPaths(value.attachments),
    ...extractMediaListPaths(value.attachmentRefs),
    ...extractMediaListPaths(value.files),
    ...extractMediaListPaths(value.media),
    ...extractMediaListPaths(value.mediaRefs),
    ...extractMediaListPaths(value.images),
    ...extractMediaListPaths(value.videos),
    ...extractMediaListPaths(value.audios),
    ...extractMediaListPaths(value.documents)
  ]);
}

export function extractRemoteMediaUrls(value) {
  if (!isRecord(value)) return [];
  return uniqueStrings([
    ...extractStringArray(value.mediaUrls),
    ...extractStringArray(value.MediaUrls),
    ...extractStringArray(value.urls),
    ...extractStringArray(value.remoteUrls),
    ...extractStringValue(value.mediaUrl),
    ...extractStringValue(value.MediaUrl),
    ...extractStringValue(value.url),
    ...extractMediaListUrls(value.attachments),
    ...extractMediaListUrls(value.attachmentRefs),
    ...extractMediaListUrls(value.media),
    ...extractMediaListUrls(value.mediaRefs)
  ]).filter(isHttpUrl);
}

export function buildBatchKey(event) {
  const parts = [
    event?.channel,
    event?.accountId,
    event?.conversationId,
    event?.senderId,
    event?.threadId
  ].map(asString).filter(Boolean);
  if (parts.length === 0) return "default";
  const channel = sanitizeBatchKeyPart(parts[0]) || "media";
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
  return `${channel}-${hash}`;
}

export function buildPromptBatchKey(event, ctx = {}) {
  const promptEvent = {
    channel: firstString(ctx.messageChannel, ctx.channel, ctx.messageProvider),
    accountId: firstString(ctx.agentAccountId, ctx.accountId),
    conversationId: firstString(ctx.channelId, ctx.conversationId, ctx.chatId),
    senderId: firstString(ctx.requesterSenderId, ctx.senderId),
    threadId: firstString(ctx.sessionKey, event?.sessionKey)
  };
  if (!promptEvent.channel || !promptEvent.conversationId || !promptEvent.senderId) {
    return "";
  }
  const batchKey = buildBatchKey(promptEvent);
  return batchKey === "default" ? "" : batchKey;
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

export function shouldInjectPendingMediaContext(text) {
  const normalized = asString(text).trim();
  return Boolean(normalized && MEDIA_REFERENCE_RE.test(normalized) && RECORD_INTENT_RE.test(normalized));
}

export function buildPendingMediaPromptContext(pending, config = {}) {
  const attachments = Array.isArray(pending?.attachments) ? pending.attachments : [];
  const typeCounts = countAttachmentTypes(attachments);
  const labels = attachments
    .slice(0, 10)
    .map((item, index) => {
      const label = promptJsonString(firstString(item?.label, item?.id, "attachment"));
      const type = promptJsonString(firstString(item?.type, "file"), 50);
      return `${index + 1}. label=${label} type=${type}`;
    });
  const typeSummary = Object.entries(typeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ") || "unknown";
  const python = asString(config.python) || "python3";
  const workflowsPath = asString(config.obsidianWorkflowsPath) || findDefaultWorkflowsPath();
  const resolvedBatchKey = asString(pending?.resolved_batch_key || pending?.batch_key);
  const selector = asString(pending?.selector);
  const ids = extractPendingIds(pending);
  const pendingCommand = [
    quoteCommandArg(python),
    quoteCommandArg(workflowsPath),
    "attachment-pending",
    resolvedBatchKey ? `--batch-key ${quoteCommandArg(resolvedBatchKey)}` : "",
    "--ttl-hours",
    String(config.stagedAttachmentTtlHours || DEFAULT_STAGE_TTL_HOURS)
  ].filter(Boolean).join(" ");
  const idArgs = ids.map((attachmentId) => `--staged-attachment ${quoteCommandArg(attachmentId)}`).join(" ");

  return [
    "OpenClaw staged media context (trusted runtime metadata):",
    `There are ${Number(pending?.count || attachments.length || 0)} pending media/file attachment(s) staged from earlier media-only channel messages.`,
    `Selector (JSON string): ${promptJsonString(selector)}`,
    `Resolved batch key (JSON string): ${promptJsonString(resolvedBatchKey)}`,
    `Types: ${typeSummary}`,
    ids.length > 0 ? `Staged attachment ids (JSON strings):\n${ids.map((attachmentId) => `- ${promptJsonString(attachmentId)}`).join("\n")}` : "",
    labels.length > 0 ? `Untrusted display labels (JSON strings):\n${labels.join("\n")}` : "",
    "",
    "When the current user asks to record/use the earlier videos/media/attachments, do not search the current directory and do not ask for paths.",
    "Use the obsidian-cli-plugins staged attachment workflow:",
    `1. Verify pending media with: ${pendingCommand}`,
    "2. If the user's stated count conflicts with the pending count, ask for clarification before writing.",
    "3. Create one file-mode Obsidian record and consume the staged media with --staged-attachment using the selector above, normally with --type mixed and --require-attachment.",
    ids.length > 0 ? `4. If record-sync returns staged-attachments-not-found for the selector, retry once with each staged id as separate arguments: ${idArgs}` : "",
    "5. Do not create a text-only fallback record when attachments were requested.",
    "6. Do not analyze or describe the video contents unless the user explicitly asks for media understanding.",
    "<<<END_OBSIDIAN_STAGED_MEDIA_CONTEXT>>>"
  ].filter(Boolean).join("\n");
}

function normalizeConfig(value) {
  const config = isRecord(value) ? value : {};
  return {
    stageAttachments: config.stageAttachments !== false,
    replyContent: asString(config.replyContent) || DEFAULT_REPLY,
    python: asString(config.python) || "python3",
    obsidianWorkflowsPath: asString(config.obsidianWorkflowsPath) || findDefaultWorkflowsPath(),
    stagedAttachmentTtlHours: positiveNumber(config.stagedAttachmentTtlHours, DEFAULT_STAGE_TTL_HOURS),
    onlyChannels: extractStringArray(config.onlyChannels),
    ignoredChannels: extractStringArray(config.ignoredChannels),
    replyDispatchGuard: config.replyDispatchGuard !== false,
    beforeDispatchFallback: config.beforeDispatchFallback !== false,
    agentReplyFallback: config.agentReplyFallback !== false && config.agentRunFallback !== false,
    pendingMediaPromptInjection: config.pendingMediaPromptInjection !== false,
    debugLogging: config.debugLogging === true,
    debugLogPath: asString(config.debugLogPath) || process.env.OBSIDIAN_MEDIA_CLAIM_DEBUG_LOG || DEFAULT_DEBUG_LOG_PATH
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
  await pruneStagedAttachments(config);
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

async function pruneStagedAttachments(config) {
  const { stdout } = await execFileAsync(
    config.python,
    [
      config.obsidianWorkflowsPath,
      "attachment-prune",
      "--ttl-hours",
      String(config.stagedAttachmentTtlHours)
    ],
    { timeout: 10000, maxBuffer: 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout);
  if (!parsed?.ok) {
    throw new Error(asString(parsed?.reason) || "attachment-prune failed");
  }
  return parsed;
}

async function getPendingAttachments(config, batchKey = "") {
  if (!config.obsidianWorkflowsPath || !existsSync(config.obsidianWorkflowsPath)) {
    throw new Error("obsidian_workflows.py not found");
  }

  const args = [
    config.obsidianWorkflowsPath,
    "attachment-pending"
  ];
  if (batchKey) {
    args.push("--batch-key", batchKey);
  }
  args.push("--ttl-hours", String(config.stagedAttachmentTtlHours));

  const { stdout } = await execFileAsync(
    config.python,
    args,
    { timeout: 10000, maxBuffer: 1024 * 1024 }
  );
  return JSON.parse(stdout);
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

function inboundEventFromReplyDispatch(event) {
  const source = isRecord(event?.ctx) ? event.ctx : {};
  const mediaPaths = extractStringArray(source.MediaPaths);
  const mediaUrls = extractStringArray(source.MediaUrls);
  const mediaTypes = extractStringArray(source.MediaTypes);
  const metadata = {
    mediaPath: source.MediaPath,
    mediaPaths,
    mediaUrl: source.MediaUrl,
    mediaUrls,
    mediaType: source.MediaType,
    mediaTypes,
    mediaList: buildMediaListFromContext(source)
  };
  return {
    channel: firstString(source.OriginatingChannel, source.Provider, source.Surface),
    accountId: source.AccountId,
    conversationId: firstString(source.OriginatingTo, source.To, source.From),
    senderId: source.SenderId,
    threadId: firstString(source.MessageThreadId, event?.sessionKey, source.SessionKey),
    messageId: firstString(source.MessageSidFull, source.MessageSid, source.MessageSidLast, source.MessageSidFirst),
    isGroup: Boolean(source.GroupSubject || source.GroupChannel),
    body: firstString(source.BodyForCommands, source.RawBody, source.CommandBody, source.Body),
    bodyForAgent: source.BodyForAgent,
    transcript: source.Transcript,
    content: firstString(source.BodyForAgent, source.BodyStripped, source.BodyForCommands, source.RawBody, source.CommandBody, source.Body),
    metadata
  };
}

function buildMediaListFromContext(ctx) {
  const paths = extractStringArray(ctx.MediaPaths);
  const urls = extractStringArray(ctx.MediaUrls);
  const types = extractStringArray(ctx.MediaTypes);
  const maxLength = Math.max(paths.length, urls.length, types.length, ctx.MediaPath ? 1 : 0, ctx.MediaUrl ? 1 : 0);
  const mediaList = [];
  for (let index = 0; index < maxLength; index += 1) {
    const item = {
      path: paths[index] || (index === 0 ? ctx.MediaPath : undefined),
      url: urls[index] || (index === 0 ? ctx.MediaUrl : undefined),
      type: types[index] || (index === 0 ? ctx.MediaType : undefined)
    };
    if (item.path || item.url || item.type) mediaList.push(item);
  }
  return mediaList;
}

function replyTextFromResult(result) {
  return result?.reply?.text || result?.reply?.content || DEFAULT_REPLY;
}

function emptyDispatchCounts() {
  return {
    tool: 0,
    block: 0,
    final: 0
  };
}

function writeDebugLog(label, value, ctx = {}) {
  const config = normalizeConfig(ctx?.pluginConfig);
  if (!config.debugLogging) return;

  try {
    appendFileSync(
      config.debugLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        plugin: id,
        version,
        label,
        value: limitDebugValue(value)
      })}\n`
    );
  } catch {
    // Debug logging must never affect message handling.
  }
}

function summarizeInboundEvent(event) {
  return {
    channel: event?.channel,
    accountId: event?.accountId,
    conversationId: event?.conversationId,
    senderId: event?.senderId,
    threadId: event?.threadId,
    isGroup: event?.isGroup,
    messageId: event?.messageId,
    replyToId: event?.replyToId,
    body: event?.body,
    bodyForAgent: event?.bodyForAgent,
    transcript: event?.transcript,
    content: event?.content,
    metadata: event?.metadata
  };
}

function summarizeBeforeAgentReplyEvent(event) {
  return {
    cleanedBody: event?.cleanedBody
  };
}

function summarizePromptBuildEvent(event) {
  return {
    prompt: event?.prompt,
    messagesCount: Array.isArray(event?.messages) ? event.messages.length : undefined
  };
}

function summarizeReplyDispatchEvent(event) {
  const ctx = isRecord(event?.ctx) ? event.ctx : {};
  return {
    runId: event?.runId,
    sessionKey: event?.sessionKey,
    inboundAudio: event?.inboundAudio,
    originatingChannel: event?.originatingChannel,
    originatingTo: event?.originatingTo,
    ctx: summarizeReplyDispatchMessageContext(ctx)
  };
}

function summarizeReplyDispatchMessageContext(ctx = {}) {
  return {
    Provider: ctx.Provider,
    Surface: ctx.Surface,
    OriginatingChannel: ctx.OriginatingChannel,
    OriginatingTo: ctx.OriginatingTo,
    To: ctx.To,
    From: ctx.From,
    SenderId: ctx.SenderId,
    MessageSid: ctx.MessageSid,
    MessageSidFull: ctx.MessageSidFull,
    Body: ctx.Body,
    BodyForAgent: ctx.BodyForAgent,
    BodyForCommands: ctx.BodyForCommands,
    RawBody: ctx.RawBody,
    BodyStripped: ctx.BodyStripped,
    Transcript: ctx.Transcript,
    MediaPath: ctx.MediaPath,
    MediaPaths: ctx.MediaPaths,
    MediaUrl: ctx.MediaUrl,
    MediaUrls: ctx.MediaUrls,
    MediaType: ctx.MediaType,
    MediaTypes: ctx.MediaTypes,
    MediaRemoteHost: ctx.MediaRemoteHost,
    MediaStaged: ctx.MediaStaged
  };
}

function summarizeContext(ctx = {}) {
  return {
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    runId: ctx.runId,
    channel: ctx.channel,
    messageProvider: ctx.messageProvider,
    channelId: ctx.channelId,
    senderId: ctx.senderId,
    chatId: ctx.chatId,
    messageId: ctx.messageId,
    replyToId: ctx.replyToId,
    traceId: ctx.traceId,
    pluginConfig: ctx.pluginConfig
  };
}

function summarizeReplyDispatchContext(ctx = {}) {
  return {
    ...summarizeContext(ctx),
    hasDispatcher: Boolean(ctx.dispatcher),
    hasSendFinalReply: typeof ctx.dispatcher?.sendFinalReply === "function"
  };
}

function summarizeConfig(config) {
  return {
    stageAttachments: config.stageAttachments,
    replyContent: config.replyContent,
    python: config.python,
    obsidianWorkflowsPath: config.obsidianWorkflowsPath,
    stagedAttachmentTtlHours: config.stagedAttachmentTtlHours,
    onlyChannels: config.onlyChannels,
    ignoredChannels: config.ignoredChannels,
    replyDispatchGuard: config.replyDispatchGuard,
    beforeDispatchFallback: config.beforeDispatchFallback,
    agentReplyFallback: config.agentReplyFallback,
    pendingMediaPromptInjection: config.pendingMediaPromptInjection,
    debugLogging: config.debugLogging,
    debugLogPath: config.debugLogPath
  };
}

function extractPromptText(event) {
  const direct = asString(event?.prompt).trim();
  const latestUser = Array.isArray(event?.messages)
    ? [...event.messages].reverse().find((message) => message?.role === "user")
    : null;
  const latestUserText = extractMessageText(latestUser?.content).trim();
  return [direct, latestUserText].filter(Boolean).join("\n\n");
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return asString(content);
  return content.map((item) => {
    if (typeof item === "string") return item;
    if (!isRecord(item)) return "";
    return asString(item.text || item.content || item.value);
  }).filter(Boolean).join("\n");
}

function countAttachmentTypes(attachments) {
  const counts = {};
  for (const item of attachments) {
    const type = sanitizePromptValue(firstString(item?.type, "file"), 50);
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function extractPendingIds(pending) {
  const ids = extractStringArray(pending?.ids);
  if (ids.length > 0) return ids;
  const attachments = Array.isArray(pending?.attachments) ? pending.attachments : [];
  return uniqueStrings(attachments.map((item) => asString(item?.id)).filter(Boolean));
}

function sanitizeBatchKeyPart(value) {
  return asString(value).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function promptJsonString(value, limit = PROMPT_VALUE_LIMIT) {
  return JSON.stringify(sanitizePromptValue(value, limit));
}

function sanitizePromptValue(value, limit = PROMPT_VALUE_LIMIT) {
  const text = asString(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function quoteCommandArg(value) {
  const text = sanitizePromptValue(value, 1000);
  return `"${text.replace(/["\\$`]/g, "\\$&")}"`;
}

function inspectTextSignals(event) {
  return {
    bodyAfterStrip: stripMediaOnlySignals(asString(event?.body)).trim(),
    bodyForAgentAfterStrip: stripMediaOnlySignals(asString(event?.bodyForAgent)).trim(),
    transcript: asString(event?.transcript).trim(),
    contentAfterStrip: stripRuntimeMetadata(stripMediaOnlySignals(asString(event?.content))).trim(),
    extractedAttachmentPaths: extractAttachmentPathsFromEvent(event),
    hasUserText: hasUserText(event)
  };
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    message: String(error)
  };
}

function limitDebugValue(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    if (value.length <= DEBUG_STRING_LIMIT) return value;
    return `${value.slice(0, DEBUG_STRING_LIMIT)}...[truncated ${value.length - DEBUG_STRING_LIMIT} chars]`;
  }
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.slice(0, DEBUG_ARRAY_LIMIT).map((item) => limitDebugValue(item, seen));
    if (value.length > DEBUG_ARRAY_LIMIT) {
      result.push(`[truncated ${value.length - DEBUG_ARRAY_LIMIT} items]`);
    }
    return result;
  }

  const result = {};
  const entries = Object.entries(value);
  for (const [key, item] of entries.slice(0, DEBUG_OBJECT_KEYS_LIMIT)) {
    result[key] = limitDebugValue(item, seen);
  }
  if (entries.length > DEBUG_OBJECT_KEYS_LIMIT) {
    result.__truncatedKeys = entries.length - DEBUG_OBJECT_KEYS_LIMIT;
  }
  return result;
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
      item.downloadPath,
      item.absolutePath,
      item.sourcePath,
      item.tmpPath,
      item.tempPath,
      item.local?.path,
      item.file?.path
    ].flatMap(extractStringValue);
  });
}

function extractMediaListUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    return [
      item.url,
      item.mediaUrl,
      item.remoteUrl,
      item.downloadUrl,
      item.href,
      item.sourceUrl,
      item.file?.url
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

function firstString(...values) {
  return values.find((value) => asString(value).trim()) || "";
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(asString(value).trim());
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
