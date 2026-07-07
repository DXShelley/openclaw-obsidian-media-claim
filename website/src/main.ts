import './styles.css';
import { getSiteConfig, type SiteLocale } from './config/site';

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

function localeFromUrl(): SiteLocale {
  const params = new URLSearchParams(window.location.search);
  return params.get('lang') === 'en' ? 'en' : 'zh-CN';
}

function homePath(locale: SiteLocale): string {
  const base = import.meta.env.BASE_URL;
  return locale === 'en' ? `${base}?lang=en` : base;
}

function semanticText(text: string, preservePhrases = true): string {
  const parts = text.split('|');
  if (parts.length === 1) {
    return text;
  }

  if (!preservePhrases) {
    return parts
      .map(
        (part, index) =>
          `<span class="semantic-soft-phrase">${part}${index < parts.length - 1 ? '<wbr>' : ''}</span>`
      )
      .join('');
  }

  return parts.map((part) => `<span class="semantic-phrase">${part}</span>`).join('');
}

function cardList(items: readonly { title: string; body: string; meta: string }[]): string {
  return items
    .map(
      (item) => `
        <article class="card">
          <p class="meta">${item.meta}</p>
          <h3>${semanticText(item.title)}</h3>
          <p>${semanticText(item.body, false)}</p>
        </article>
      `
    )
    .join('');
}

function stepList(items: readonly { step: string; title: string; body: string }[]): string {
  return items
    .map(
      (item) => `
        <article class="step">
          <span>${item.step}</span>
          <h3>${semanticText(item.title)}</h3>
          <p>${semanticText(item.body, false)}</p>
        </article>
      `
    )
    .join('');
}

function supportCards(methods: readonly { title: string; body: string; image: string; alt: string }[]): string {
  return methods
    .map(
      (item) => `
        <article class="support-card">
          <div class="qr-frame"><img src="${assetUrl(item.image)}" alt="${item.alt}" loading="lazy" /></div>
          <h3>${semanticText(item.title)}</h3>
          <p>${semanticText(item.body, false)}</p>
        </article>
      `
    )
    .join('');
}

function linkCards(
  links: readonly {
    title: string;
    body: string;
    href: string;
    meta: string;
    relation: string;
    optionality: string;
  }[]
): string {
  return links
    .map(
      (item) => `
        <a class="link-card" href="${item.href}">
          <div class="link-card-top">
            <p class="meta">${item.meta}</p>
            <span>${item.relation}</span>
          </div>
          <h3>${semanticText(item.title)}</h3>
          <p class="link-optionality">${semanticText(item.optionality, false)}</p>
          <p>${semanticText(item.body, false)}</p>
        </a>
      `
    )
    .join('');
}

function render(): void {
  const locale = localeFromUrl();
  const config = getSiteConfig(locale);
  document.documentElement.lang = locale;
  document.title = config.metaTitle;

  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', config.metaDescription);

  const root = document.querySelector<HTMLDivElement>('#root');
  if (!root) return;

  root.innerHTML = `
    <div class="shell" id="top">
      <header class="topbar">
        <a class="brand" href="${homePath(locale)}" aria-label="Obsidian Media Claim">
          <span class="brand-mark">MC</span>
          <span><strong>Obsidian Media Claim</strong><small>${config.version}</small></span>
        </a>
        <nav class="nav" aria-label="${config.nav.ariaLabel}">
          ${config.nav.items.map((item) => `<a href="${item.href}">${item.label}</a>`).join('')}
        </nav>
        <div class="language-switch" aria-label="${config.language.label}">
          <a class="${locale === 'zh-CN' ? 'active' : ''}" href="${homePath('zh-CN')}">${config.language.zh}</a>
          <a class="${locale === 'en' ? 'active' : ''}" href="${homePath('en')}">${config.language.en}</a>
        </div>
      </header>

      <main>
        <aside class="side-nav" aria-label="${config.nav.ariaLabel} side">
          ${config.nav.items.map((item) => `<a href="${item.href}">${item.label}</a>`).join('')}
        </aside>

        <section class="hero">
          <div class="hero-copy">
            <p class="eyebrow">${config.hero.kicker}</p>
            <h1>${semanticText(config.hero.title)}</h1>
            <p class="lead">${config.hero.subtitle}</p>
            <div class="actions">
              <a class="button primary" href="${config.hero.primary.href}">${config.hero.primary.label}</a>
              <a class="button" href="${config.hero.secondary.href}">${config.hero.secondary.label}</a>
            </div>
          </div>
          <div class="hero-panel" aria-label="${config.hero.panel.title}">
            <p class="meta">${config.hero.panel.kicker}</p>
            <h2>${semanticText(config.hero.panel.title)}</h2>
            <p>${semanticText(config.hero.panel.body, false)}</p>
            <div class="chips">${config.hero.panel.chips.map((chip) => `<span>${semanticText(chip)}</span>`).join('')}</div>
          </div>
        </section>

        <section class="section" id="capabilities">
          <div class="section-head">
            <p class="eyebrow">${config.sections.capabilities.eyebrow}</p>
            <h2>${semanticText(config.sections.capabilities.title)}</h2>
          </div>
          <div class="split-grid">
            ${cardList(config.cards)}
          </div>
        </section>

        <section class="section muted" id="workflow">
          <div class="section-head">
            <p class="eyebrow">${config.sections.workflow.eyebrow}</p>
            <h2>${semanticText(config.sections.workflow.title)}</h2>
          </div>
          <div class="step-grid">
            ${stepList(config.workflow)}
          </div>
        </section>

        <section class="section install" id="install">
          <div>
            <p class="eyebrow">${config.sections.install.eyebrow}</p>
            <h2>${semanticText(config.sections.install.title)}</h2>
            <p>${semanticText(config.sections.install.body, false)}</p>
          </div>
          <pre><code>${config.commands.join('\n')}</code></pre>
        </section>

        <section class="section links" id="links">
          <div class="section-head">
            <p class="eyebrow">${config.sections.links.eyebrow}</p>
            <h2>${semanticText(config.sections.links.title)}</h2>
          </div>
          <div class="link-grid">
            ${linkCards(config.links)}
          </div>
        </section>

        <section class="section support" id="support">
          <div class="section-head">
            <p class="eyebrow">${config.sections.support.eyebrow}</p>
            <h2>${semanticText(config.sections.support.title)}</h2>
            <p>${semanticText(config.sections.support.body, false)}</p>
          </div>
          <div class="support-grid">
            ${supportCards(config.support)}
          </div>
        </section>
      </main>
    </div>
  `;
}

render();
