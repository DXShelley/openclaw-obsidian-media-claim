export type SiteLocale = 'zh-CN' | 'en';

interface SiteConfig {
  readonly version: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly nav: {
    readonly ariaLabel: string;
    readonly items: readonly { readonly label: string; readonly href: string }[];
  };
  readonly language: {
    readonly label: string;
    readonly zh: string;
    readonly en: string;
  };
  readonly hero: {
    readonly kicker: string;
    readonly title: string;
    readonly subtitle: string;
    readonly primary: { readonly label: string; readonly href: string };
    readonly secondary: { readonly label: string; readonly href: string };
    readonly panel: {
      readonly kicker: string;
      readonly title: string;
      readonly body: string;
      readonly chips: readonly string[];
    };
  };
  readonly sections: {
    readonly capabilities: { readonly eyebrow: string; readonly title: string };
    readonly workflow: { readonly eyebrow: string; readonly title: string };
    readonly install: { readonly eyebrow: string; readonly title: string; readonly body: string };
    readonly links: { readonly eyebrow: string; readonly title: string };
    readonly support: { readonly eyebrow: string; readonly title: string; readonly body: string };
  };
  readonly cards: readonly { readonly title: string; readonly body: string; readonly meta: string }[];
  readonly workflow: readonly { readonly step: string; readonly title: string; readonly body: string }[];
  readonly commands: readonly string[];
  readonly links: readonly { readonly title: string; readonly body: string; readonly href: string; readonly meta: string }[];
  readonly support: readonly { readonly title: string; readonly body: string; readonly image: string; readonly alt: string }[];
}

const VERSION = 'v0.1.16';
const imageManagerUrlZh = 'https://dxshelley.github.io/obsidian-image-manager/';
const imageManagerUrlEn = 'https://dxshelley.github.io/obsidian-image-manager/?lang=en';
const skillUrlZh = 'https://dxshelley.github.io/obsidian-cli-plugins-skill/';
const skillUrlEn = 'https://dxshelley.github.io/obsidian-cli-plugins-skill/?lang=en';

const supportZh: SiteConfig['support'] = [
  { title: '微信支付', body: '推荐使用微信扫码支持项目维护。', image: 'support/weixin.png', alt: '微信支付收款二维码' },
  { title: '微信赞赏码', body: '也可以通过微信赞赏码支持后续迭代。', image: 'support/zanshangma.png', alt: '微信赞赏码' },
  { title: '支付宝', body: '打开支付宝扫一扫即可支持项目。', image: 'support/zhifubao.png', alt: '支付宝收款二维码' }
];

const supportEn: SiteConfig['support'] = [
  { title: 'WeChat Pay', body: 'Scan with WeChat Pay to support the project.', image: 'support/weixin.png', alt: 'WeChat Pay QR code' },
  { title: 'WeChat Reward Code', body: 'You can also support through the WeChat reward code.', image: 'support/zanshangma.png', alt: 'WeChat reward QR code' },
  { title: 'Alipay', body: 'Scan with Alipay to support the project.', image: 'support/zhifubao.png', alt: 'Alipay QR code' }
];

const configs: Record<SiteLocale, SiteConfig> = {
  'zh-CN': {
    version: VERSION,
    metaTitle: `Obsidian Media Claim ${VERSION}`,
    metaDescription: 'Obsidian Media Claim 是 OpenClaw 媒体-only 上传守卫插件，只保存和暂存媒体，不触发大模型参与，从而节省 token。',
    nav: {
      ariaLabel: '页面导航',
      items: [
        { label: '核心能力', href: '#capabilities' },
        { label: '处理流程', href: '#workflow' },
        { label: '安装验证', href: '#install' },
        { label: '友情链接', href: '#links' },
        { label: '支持项目', href: '#support' }
      ]
    },
    language: { label: '语言', zh: '中文', en: 'EN' },
    hero: {
      kicker: 'OpenClaw 媒体暂存插件',
      title: '只上传媒体，不惊动模型，把 token 省下来。',
      subtitle:
        'Obsidian Media Claim 的边界很明确：媒体-only 消息只保存文件、暂存引用、回复确认，不触发大模型；真正的文字意图出现后，再把安全 selector 交给后续记录流程。',
      primary: { label: '查看省 token 机制', href: '#capabilities' },
      secondary: { label: '安装验证', href: '#install' },
      panel: {
        kicker: '模型前守卫',
        title: '媒体-only 事件在 reply_dispatch 前后被 claim，LLM 不参与、不读图、不花 token。',
        body: '插件只做 claim、stage、inject，不分析媒体内容，也不直接创建 Obsidian 笔记。记录落库由独立的 obsidian-cli-plugins 技能负责。',
        chips: ['省 token', '不触发 LLM', 'media-only guard', 'staged attachments']
      }
    },
    sections: {
      capabilities: { eyebrow: '核心能力', title: '插件只做本项目该做的事：守住模型入口，暂存可追踪媒体。' },
      workflow: { eyebrow: '处理流程', title: '省 token 的关键，是把媒体上传和文字意图拆开处理。' },
      install: { eyebrow: '安装验证', title: '插件配置重点是 Python、hook 权限和调试日志。', body: 'OpenClaw Gateway 的 PATH 可能不同于交互式 shell，建议配置绝对 Python 3.10+ 路径。' },
      links: { eyebrow: '友情链接', title: '相关项目各在自己的仓库维护 Pages，本页只展示 Obsidian Media Claim。' },
      support: { eyebrow: '支持项目', title: '如果这个插件帮你省掉了 token 和媒体整理时间，可以扫码支持维护。', body: '赞助用于测试真实渠道、维护文档、跟进 OpenClaw typed hooks 与 Obsidian 工作流变化。' }
    },
    cards: [
      { meta: 'Token', title: '媒体-only 上传不走 LLM', body: '图片、视频、音频或文件先被保存并暂存，不让模型为了“看见一个附件”消耗上下文和推理成本。' },
      { meta: 'Hook', title: 'reply_dispatch 是主路径', body: '在默认 LLM reply path 前 claim 媒体-only 事件，直接发送“收到媒体，已保存。”这类确认回复。' },
      { meta: 'Handoff', title: '后续文本才进入 Agent', body: '用户后续说“把刚才的视频记录一下”时，插件只注入 staged selector，让 Agent 使用现成附件。' },
      { meta: 'Boundary', title: '不分析媒体内容，不创建笔记', body: '插件只负责媒体守卫和暂存；是否记录、记录到哪里、如何同步，都交给技能。' }
    ],
    workflow: [
      { step: '01', title: '识别纯媒体事件', body: '过滤含用户文本的消息，只 claim 没有真实文字意图的媒体上传。' },
      { step: '02', title: '直接保存和暂存', body: '调用 attachment-stage 保存本地路径，回复确认，不启动 LLM。' },
      { step: '03', title: '等待文字意图', body: '后续文字指令出现时，才进入 prompt build 和 Agent 工作流。' },
      { step: '04', title: '只注入安全 selector', body: '注入 JSON escaped selector、ids 和 labels，不把媒体内容暴露给模型。' }
    ],
    commands: [
      'openclaw plugins install obsidian-media-claim --force',
      'openclaw plugins inspect obsidian-media-claim',
      'tail -f /tmp/obsidian-media-claim-debug.jsonl'
    ],
    links: [
      { meta: 'Image Plugin', title: 'Note Image Manager', body: 'Obsidian 图片导入、压缩、转换、画廊和恢复事务插件。', href: imageManagerUrlZh },
      { meta: 'OpenClaw Plugin', title: 'Obsidian Media Claim', body: '当前页面。媒体-only 上传的模型前守卫，核心价值是省 token。', href: '#top' },
      { meta: 'Obsidian Skill', title: 'obsidian-cli-plugins', body: '灵感记录、项目孵化、任务管理、日程管理和附件记录的少量命令入口。', href: skillUrlZh }
    ],
    support: supportZh
  },
  en: {
    version: VERSION,
    metaTitle: `Obsidian Media Claim ${VERSION}`,
    metaDescription: 'Obsidian Media Claim is an OpenClaw media-only upload guard that stores and stages media without invoking the LLM, saving tokens.',
    nav: {
      ariaLabel: 'Page navigation',
      items: [
        { label: 'Capabilities', href: '#capabilities' },
        { label: 'Workflow', href: '#workflow' },
        { label: 'Install', href: '#install' },
        { label: 'Links', href: '#links' },
        { label: 'Support', href: '#support' }
      ]
    },
    language: { label: 'Language', zh: '中文', en: 'EN' },
    hero: {
      kicker: 'OpenClaw Media Staging Plugin',
      title: 'Upload media without waking the model. Save the tokens.',
      subtitle:
        'Obsidian Media Claim has a tight boundary: media-only messages are stored, staged, and acknowledged without invoking the LLM. Later text intent receives a safe staged selector for downstream recording.',
      primary: { label: 'View token saving', href: '#capabilities' },
      secondary: { label: 'Install and verify', href: '#install' },
      panel: {
        kicker: 'Pre-model guard',
        title: 'Media-only events are claimed before the model path. No LLM call, no image reading, no token spend.',
        body: 'The plugin only claims, stages, and injects. It does not analyze media or write Obsidian notes directly; recording belongs to the separate obsidian-cli-plugins skill.',
        chips: ['token saving', 'no LLM call', 'media-only guard', 'staged attachments']
      }
    },
    sections: {
      capabilities: { eyebrow: 'Capabilities', title: 'The plugin does its own job: guard the model entrance and stage traceable media.' },
      workflow: { eyebrow: 'Workflow', title: 'Token saving comes from separating media upload from text intent.' },
      install: { eyebrow: 'Install and Verify', title: 'Configure Python, hook permissions, and debug logs.', body: 'OpenClaw Gateway PATH may differ from your shell. Prefer an absolute Python 3.10+ path.' },
      links: { eyebrow: 'Friendly Links', title: 'Related projects maintain their own Pages. This page only describes Obsidian Media Claim.' },
      support: { eyebrow: 'Support', title: 'If this plugin saves tokens and media handling time, you can support its maintenance.', body: 'Sponsorship helps cover real-channel testing, documentation, and OpenClaw typed hook / Obsidian workflow updates.' }
    },
    cards: [
      { meta: 'Token', title: 'Media-only uploads skip the LLM', body: 'Images, videos, audio, or files are stored and staged before they consume context or inference cost.' },
      { meta: 'Hook', title: 'reply_dispatch is the main guard', body: 'The plugin claims media-only events before the default LLM reply path and sends a short confirmation.' },
      { meta: 'Handoff', title: 'Text comes later', body: 'When the user says “record the previous video,” the plugin injects a staged selector so the Agent can use existing attachments.' },
      { meta: 'Boundary', title: 'No media analysis, no note writing', body: 'The plugin owns media guarding and staging. Recording, destination, and sync belong to the skill.' }
    ],
    workflow: [
      { step: '01', title: 'Detect pure media', body: 'Messages with real user text are passed through; media-only uploads are claimed.' },
      { step: '02', title: 'Store and stage', body: 'The plugin calls attachment-stage, confirms receipt, and avoids starting the LLM.' },
      { step: '03', title: 'Wait for intent', body: 'Only later text instructions enter prompt build and Agent flow.' },
      { step: '04', title: 'Inject safe selectors', body: 'The model receives escaped selectors and ids, not media contents.' }
    ],
    commands: [
      'openclaw plugins install obsidian-media-claim --force',
      'openclaw plugins inspect obsidian-media-claim',
      'tail -f /tmp/obsidian-media-claim-debug.jsonl'
    ],
    links: [
      { meta: 'Image Plugin', title: 'Note Image Manager', body: 'Obsidian image import, compression, conversion, galleries, and recovery transactions.', href: imageManagerUrlEn },
      { meta: 'OpenClaw Plugin', title: 'Obsidian Media Claim', body: 'This page. A pre-model guard for media-only uploads whose main value is saving tokens.', href: '#top' },
      { meta: 'Obsidian Skill', title: 'obsidian-cli-plugins', body: 'A small command set for inspiration capture, project incubation, tasks, schedules, and attachments.', href: skillUrlEn }
    ],
    support: supportEn
  }
};

export function getSiteConfig(locale: SiteLocale): SiteConfig {
  return configs[locale];
}
