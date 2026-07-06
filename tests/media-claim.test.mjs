import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPendingMediaPromptContext,
  buildBatchKey,
  buildPromptBatchKey,
  detectMediaType,
  extractAttachmentPaths,
  extractAttachmentPathsFromEvent,
  extractRemoteMediaUrls,
  extractStructuredMediaPaths,
  handleBeforeAgentReply,
  handleBeforeDispatch,
  handleBeforePromptBuild,
  handleInboundClaim,
  handleReplyDispatch,
  hasUserText,
  inspectInboundMedia,
  register,
  shouldInjectPendingMediaContext,
  stripAttachmentMarkers,
  stripMediaOnlySignals,
  stripRuntimeMetadata
} from "../index.js";

const registeredHooks = [];
register({
  pluginConfig: {
    agentReplyFallback: false,
    replyDispatchGuard: false
  },
  on(name, handler, options) {
    registeredHooks.push({ name, handler, options });
  }
});
assert.deepEqual(
  registeredHooks.map((hook) => hook.name),
  ["reply_dispatch", "inbound_claim", "before_dispatch", "before_agent_reply", "before_prompt_build"]
);

const registeredBeforeAgentReplyDisabledResult = await registeredHooks
  .find((hook) => hook.name === "before_agent_reply")
  .handler(
    {
      cleanedBody: "[Attachment: /tmp/not-readable.png]"
    },
    {
      channel: "qqbot"
    }
  );
assert.equal(registeredBeforeAgentReplyDisabledResult, undefined);

const registeredReplyDispatchDisabledResult = await registeredHooks
  .find((hook) => hook.name === "reply_dispatch")
  .handler(
    {
      ctx: {
        OriginatingChannel: "qqbot",
        MediaPaths: ["/tmp/not-readable.mp4"],
        MediaTypes: ["video/mp4"]
      }
    },
    {
      dispatcher: {
        sendFinalReply() {
          throw new Error("sendFinalReply should not run when replyDispatchGuard=false");
        },
        getQueuedCounts() {
          return { tool: 0, block: 0, final: 0 };
        }
      }
    }
  );
assert.equal(registeredReplyDispatchDisabledResult, undefined);

assert.equal(shouldInjectPendingMediaContext("使用技能将两条视频记录一下。这是今天测试的视频"), true);
assert.equal(shouldInjectPendingMediaContext("记录一下今天的想法"), false);
assert.equal(shouldInjectPendingMediaContext("分析一下这个视频"), false);

const pendingMediaContext = buildPendingMediaPromptContext(
  {
    count: 2,
    selector: "batch:wecom-abc123",
    resolved_batch_key: "wecom-abc123",
    ids: ["id-a", "id-b"],
    attachments: [
      { id: "id-a", label: "a.mp4", type: "video" },
      { id: "id-b", label: "b.mp4", type: "video" }
    ]
  },
  {
    python: "python3",
    obsidianWorkflowsPath: "/tmp/obsidian_workflows.py"
  }
);
assert.match(pendingMediaContext, /Selector: batch:wecom-abc123/);
assert.match(pendingMediaContext, /Types: video:2/);
assert.match(pendingMediaContext, /Staged attachment ids:\n- id-a\n- id-b/);
assert.match(pendingMediaContext, /attachment-pending --batch-key "wecom-abc123" --ttl-hours 48/);
assert.match(pendingMediaContext, /--staged-attachment "id-a" --staged-attachment "id-b"/);
assert.match(pendingMediaContext, /Do not create a text-only fallback record/);
assert.match(pendingMediaContext, /do not search the current directory/i);

const promptBatchKey = buildPromptBatchKey(
  {
    prompt: `Conversation info (untrusted metadata):
\`\`\`json
{"chat_id":"wecom:YuZhenQuan","sender_id":"YuZhenQuan"}
\`\`\`

Sender (untrusted metadata):
\`\`\`json
{"id":"YuZhenQuan"}
\`\`\`

使用技能将两条视频记录一下。`
  },
  {
    agentAccountId: "default",
    sessionKey: "agent:main:wecom:direct:yuzhenquan"
  }
);
assert.match(promptBatchKey, /^wecom-[0-9a-f]{16}$/);

const tempRoot = await mkdtemp(join(tmpdir(), "media-claim-test-"));
try {
  const fakeWorkflow = join(tempRoot, "fake-workflow.mjs");
  await writeFile(
    fakeWorkflow,
    `const args = process.argv.slice(2);
if (!args.includes("--batch-key")) {
  process.stderr.write("missing --batch-key");
  process.exit(1);
}
const batchKey = args[args.indexOf("--batch-key") + 1];
const result = {
  ok: true,
  count: 2,
  selector: \`batch:\${batchKey}\`,
  resolved_batch_key: batchKey,
  ids: ["first-id", "second-id"],
  attachments: [
    { id: "first-id", label: "first.mp4", type: "video" },
    { id: "second-id", label: "second.mp4", type: "video" }
  ]
};
process.stdout.write(JSON.stringify(result));
`
  );
  const promptBuildResult = await handleBeforePromptBuild(
    {
      prompt: "使用技能将两条视频记录一下。这是今天测试的视频"
    },
    {
      channel: "wecom",
      accountId: "default",
      channelId: "YuZhenQuan",
      senderId: "YuZhenQuan",
      sessionKey: "agent:main:wecom:direct:yuzhenquan",
      pluginConfig: {
        python: process.execPath,
        obsidianWorkflowsPath: fakeWorkflow
      }
    }
  );
  assert.match(promptBuildResult.appendContext, /batch:wecom-[0-9a-f]{16}/);
  assert.match(promptBuildResult.appendContext, /attachment-pending --batch-key "wecom-[0-9a-f]{16}" --ttl-hours 48/);
  assert.match(promptBuildResult.appendContext, /--staged-attachment "first-id" --staged-attachment "second-id"/);

  const promptBuildDisabledResult = await handleBeforePromptBuild(
    {
      prompt: "使用技能将两条视频记录一下。"
    },
    {
      pluginConfig: {
        pendingMediaPromptInjection: false,
        python: process.execPath,
        obsidianWorkflowsPath: fakeWorkflow
      }
    }
  );
  assert.equal(promptBuildDisabledResult, undefined);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

assert.deepEqual(
  extractAttachmentPaths("[Attachment: /tmp/a.png]\n[Attachment: /tmp/b video.mp4]"),
  ["/tmp/a.png", "/tmp/b video.mp4"]
);

assert.equal(
  hasUserText({
    body: "",
    bodyForAgent: "",
    transcript: "",
    content: "[Attachment: /tmp/a.png]"
  }),
  false
);

assert.equal(
  hasUserText({
    body: "下班路上看到的",
    content: "下班路上看到的\n[Attachment: /tmp/a.png]"
  }),
  true
);

const runtimeMetadataPrompt = `Conversation info (untrusted metadata):
\`\`\`json
{
  "chat_id": "qqbot:c2c:user-1",
  "message_id": "msg-1",
  "sender_id": "user-1",
  "inbound_event_kind": "user_request"
}
\`\`\`

Sender (untrusted metadata):
\`\`\`json
{
  "label": "user-1",
  "id": "user-1"
}
\`\`\`

[Attachment: /tmp/not-readable.png]`;

assert.equal(stripRuntimeMetadata(stripAttachmentMarkers(runtimeMetadataPrompt)).trim(), "");
assert.equal(
  hasUserText({
    content: runtimeMetadataPrompt
  }),
  false
);

assert.equal(
  hasUserText({
    content: "[Fri 2026-07-03 15:51 GMT+8] [Attachment: /tmp/not-readable.png]"
  }),
  false
);

assert.equal(stripMediaOnlySignals("[media attached: 2 files]\n[media attached 1/2: video/mp4 /tmp/a.mp4]").trim(), "");
assert.equal(stripMediaOnlySignals("<media:video> (download pending)").trim(), "");
assert.equal(
  hasUserText({
    content: "[media attached: 1 file]\n[media attached: video/mp4 /tmp/a.mp4]"
  }),
  false
);

assert.equal(
  hasUserText({
    content: `${runtimeMetadataPrompt}\n请记录这个视频`
  }),
  true
);

assert.deepEqual(
  inspectInboundMedia({
    content: "",
    body: "",
    metadata: {
      MediaPaths: ["/tmp/a.jpg"],
      mediaList: [{ path: "/tmp/b.mp4" }]
    }
  }),
  {
    mediaOnly: true,
    hasAttachmentSignal: true,
    paths: ["/tmp/a.jpg", "/tmp/b.mp4"],
    remoteUrls: []
  }
);

assert.deepEqual(
  extractAttachmentPathsFromEvent({
    bodyForAgent: "[Attachment: /tmp/from-body-for-agent.png]",
    content: "[Attachment: /tmp/from-content.png]"
  }),
  ["/tmp/from-body-for-agent.png", "/tmp/from-content.png"]
);

assert.deepEqual(
  extractStructuredMediaPaths({
    attachments: [
      { localPath: "/tmp/local-a.jpg" },
      { file: { path: "/tmp/local-b.mp4" } }
    ],
    mediaRefs: [{ tempPath: "/tmp/temp-c.opus" }]
  }),
  ["/tmp/local-a.jpg", "/tmp/local-b.mp4", "/tmp/temp-c.opus"]
);

assert.deepEqual(
  extractRemoteMediaUrls({
    attachments: [
      { url: "https://example.com/a.jpg" },
      { localPath: "/tmp/local-a.jpg" }
    ],
    mediaUrl: "https://example.com/b.mp4"
  }),
  ["https://example.com/b.mp4", "https://example.com/a.jpg"]
);

assert.deepEqual(
  inspectInboundMedia({
    bodyForAgent: "[Attachment: /tmp/from-body-for-agent.png]",
    content: "",
    metadata: {}
  }),
  {
    mediaOnly: true,
    hasAttachmentSignal: true,
    paths: ["/tmp/from-body-for-agent.png"],
    remoteUrls: []
  }
);

assert.deepEqual(
  inspectInboundMedia({
    body: "",
    content: "",
    attachments: [{ url: "https://example.com/remote.png" }]
  }),
  {
    mediaOnly: true,
    hasAttachmentSignal: true,
    paths: [],
    remoteUrls: ["https://example.com/remote.png"]
  }
);

const noStageResult = await handleInboundClaim(
  {
    channel: "qqbot",
    body: "",
    bodyForAgent: "",
    transcript: "",
    content: "[Attachment: /tmp/not-readable.png]"
  },
  {
    pluginConfig: {
      stageAttachments: false
    }
  }
);
assert.equal(noStageResult.handled, true);
assert.equal(noStageResult.reply.content, "收到媒体，但当前渠道没有提供可读的本地文件路径。");

const textResult = await handleInboundClaim({
  channel: "qqbot",
  body: "把这张图记录一下",
  content: "把这张图记录一下\n[Attachment: /tmp/a.png]"
});
assert.equal(textResult, undefined);

const beforeAgentReplyResult = await handleBeforeAgentReply(
  {
    cleanedBody: "[Attachment: /tmp/not-readable.png]"
  },
  {
    channel: "qqbot",
    pluginConfig: {
      stageAttachments: false
    }
  }
);
assert.deepEqual(beforeAgentReplyResult, {
  handled: true,
  reply: {
    text: "收到媒体，但当前渠道没有提供可读的本地文件路径。",
    content: "收到媒体，但当前渠道没有提供可读的本地文件路径。"
  },
  reason: "media_only_message"
});

const beforeAgentReplyRuntimeMetadataResult = await handleBeforeAgentReply(
  {
    cleanedBody: runtimeMetadataPrompt
  },
  {
    channel: "qqbot",
    pluginConfig: {
      stageAttachments: false
    }
  }
);
assert.deepEqual(beforeAgentReplyRuntimeMetadataResult, {
  handled: true,
  reply: {
    text: "收到媒体，但当前渠道没有提供可读的本地文件路径。",
    content: "收到媒体，但当前渠道没有提供可读的本地文件路径。"
  },
  reason: "media_only_message",
});

const beforeDispatchResult = await handleBeforeDispatch(
  {
    channel: "qqbot",
    body: "",
    content: "[Attachment: /tmp/not-readable.mp4]"
  },
  {
    pluginConfig: {
      stageAttachments: false
    }
  }
);
assert.deepEqual(beforeDispatchResult, {
  handled: true,
  text: "收到媒体，但当前渠道没有提供可读的本地文件路径。"
});

const beforeDispatchDisabledResult = await handleBeforeDispatch(
  {
    channel: "qqbot",
    body: "",
    content: "[Attachment: /tmp/not-readable.mp4]"
  },
  {
    pluginConfig: {
      stageAttachments: false,
      beforeDispatchFallback: false
    }
  }
);
assert.equal(beforeDispatchDisabledResult, undefined);

const sentFinalReplies = [];
const replyDispatchResult = await handleReplyDispatch(
  {
    ctx: {
      OriginatingChannel: "qqbot",
      OriginatingTo: "group-1",
      SenderId: "user-1",
      MessageSid: "msg-1",
      Body: "",
      BodyForAgent: "",
      MediaPaths: ["/tmp/not-readable.mp4"],
      MediaTypes: ["video/mp4"]
    }
  },
  {
    pluginConfig: {
      stageAttachments: false
    },
    dispatcher: {
      sendFinalReply(payload) {
        sentFinalReplies.push(payload);
        return true;
      },
      getQueuedCounts() {
        return { tool: 0, block: 0, final: sentFinalReplies.length };
      }
    }
  }
);
assert.deepEqual(sentFinalReplies, [
  {
    text: "收到媒体，但当前渠道没有提供可读的本地文件路径。"
  }
]);
assert.deepEqual(replyDispatchResult, {
  handled: true,
  queuedFinal: true,
  counts: { tool: 0, block: 0, final: 1 },
  reason: "media_only_message"
});

const replyDispatchTextResult = await handleReplyDispatch(
  {
    ctx: {
      OriginatingChannel: "qqbot",
      Body: "请记录这个视频",
      MediaPaths: ["/tmp/not-readable.mp4"],
      MediaTypes: ["video/mp4"]
    }
  },
  {
    pluginConfig: {
      stageAttachments: false
    },
    dispatcher: {
      sendFinalReply() {
        throw new Error("sendFinalReply should not run for text plus media");
      },
      getQueuedCounts() {
        return { tool: 0, block: 0, final: 0 };
      }
    }
  }
);
assert.equal(replyDispatchTextResult, undefined);

const beforeAgentReplyPassResult = await handleBeforeAgentReply(
  {
    cleanedBody: "把这张图记录一下\n[Attachment: /tmp/not-readable.png]"
  },
  {
    channel: "qqbot",
    pluginConfig: {
      stageAttachments: false
    }
  }
);
assert.equal(beforeAgentReplyPassResult, undefined);

const beforeAgentReplyDisabledResult = await handleBeforeAgentReply(
  {
    cleanedBody: "[Attachment: /tmp/not-readable.png]"
  },
  {
    channel: "qqbot",
    pluginConfig: {
      stageAttachments: false,
      agentRunFallback: false
    }
  }
);
assert.equal(beforeAgentReplyDisabledResult, undefined);

const beforeAgentReplyDisabledByNewConfigResult = await handleBeforeAgentReply(
  {
    cleanedBody: "[Attachment: /tmp/not-readable.png]"
  },
  {
    channel: "qqbot",
    pluginConfig: {
      stageAttachments: false,
      agentReplyFallback: false
    }
  }
);
assert.equal(beforeAgentReplyDisabledByNewConfigResult, undefined);

const ignoredResult = await handleInboundClaim(
  {
    channel: "telegram",
    body: "",
    content: "[Attachment: /tmp/a.png]"
  },
  {
    pluginConfig: {
      ignoredChannels: ["telegram"]
    }
  }
);
assert.equal(ignoredResult, undefined);

assert.equal(detectMediaType("/tmp/a.png"), "image");
assert.equal(detectMediaType("/tmp/a.mp4"), "video");
assert.equal(detectMediaType("/tmp/a.opus"), "audio");
assert.equal(detectMediaType("/tmp/a.zip"), "file");

const qqBatchKey = buildBatchKey({
    channel: "qqbot",
    accountId: "bot-1",
    conversationId: "group-1",
    senderId: "user-1"
  });
assert.match(qqBatchKey, /^qqbot-[0-9a-f]{16}$/);
assert.equal(
  qqBatchKey,
  buildBatchKey({
    channel: "qqbot",
    accountId: "bot-1",
    conversationId: "group-1",
    senderId: "user-1"
  })
);
assert.notEqual(
  qqBatchKey,
  buildBatchKey({
    channel: "qqbot",
    accountId: "bot-1",
    conversationId: "group-2",
    senderId: "user-1"
  })
);

console.log("media-claim tests passed");
