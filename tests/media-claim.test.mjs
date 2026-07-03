import assert from "node:assert/strict";
import {
  buildBatchKey,
  detectMediaType,
  extractAttachmentPaths,
  handleInboundClaim,
  hasUserText,
  inspectInboundMedia
} from "../index.js";

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
    paths: ["/tmp/a.jpg", "/tmp/b.mp4"]
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

assert.equal(
  buildBatchKey({
    channel: "qqbot",
    accountId: "bot-1",
    conversationId: "group-1",
    senderId: "user-1"
  }),
  "qqbot@bot-1@group-1@user-1"
);

console.log("media-claim tests passed");
