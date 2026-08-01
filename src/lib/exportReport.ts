import type {
  CardType,
  CardData,
  EntityType,
  VerdictCardData,
  TimelineCardData,
  AchievementsCardData,
  DarksideCardData,
  GameplayCardData,
} from '@/types';

interface ReportParams {
  fileNo: string;
  query: string;
  entityType: EntityType | null;
  cards: Partial<Record<CardType, CardData>>;
  sources: Array<{ title: string; url: string }>;
}

const ENTITY_LABEL: Record<EntityType, string> = {
  HUMAN: '人物 · HUMAN',
  EVENT: '事件 · EVENT',
  ITEM: '事物 · ITEM',
};

const CARD_META: Array<{
  type: CardType;
  no: string;
  title: string;
  subtitle: string;
}> = [
  { type: 'verdict', no: '01', title: 'Verdict', subtitle: '全景定性' },
  { type: 'timeline', no: '02', title: 'Timeline', subtitle: '核心时间线' },
  { type: 'achievements', no: '03', title: 'Achievements', subtitle: '硬核战绩' },
  { type: 'darkside', no: '04', title: 'Darkside', subtitle: '反向视角 · 风险预警' },
  { type: 'gameplay', no: '05', title: 'Network', subtitle: '关系网 · 利益相关方' },
];

/** HTML 转义 — 防止内容注入破坏结构 */
function esc(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isVerdict(d: CardData): d is VerdictCardData {
  return typeof (d as VerdictCardData).title === 'string';
}
function isTimeline(d: CardData): d is TimelineCardData {
  return Array.isArray((d as TimelineCardData).events);
}
function isAchievements(d: CardData): d is AchievementsCardData {
  return Array.isArray((d as AchievementsCardData).items);
}
function isDarkside(d: CardData): d is DarksideCardData {
  return Array.isArray((d as DarksideCardData).controversies);
}
function isGameplay(d: CardData): d is GameplayCardData {
  return (
    Array.isArray((d as GameplayCardData).stakeholders) ||
    typeof (d as GameplayCardData).dynamics === 'string'
  );
}

const SEVERITY_LABEL: Record<string, string> = {
  high: '高危',
  medium: '中危',
  low: '低危',
};

/** 渲染单张卡片为 HTML 片段 */
function renderCard(type: CardType, no: string, title: string, subtitle: string, data: CardData | undefined): string {
  if (!data) return '';

  let body = '';

  if (type === 'verdict' && isVerdict(data)) {
    body = `
      <div class="verdict-body">
        <h3 class="verdict-title">${esc(data.title)}</h3>
        ${data.subtitle ? `<p class="verdict-subtitle">${esc(data.subtitle)}</p>` : ''}
        ${data.tags && data.tags.length > 0 ? `
          <div class="tag-row">
            ${data.tags.map((t) => `<span class="tag"># ${esc(t)}</span>`).join('')}
          </div>` : ''}
      </div>`;
  } else if (type === 'timeline' && isTimeline(data)) {
    const events = data.events ?? [];
    body = `
      <ol class="timeline-list">
        ${events
          .map(
            (ev) => `
          <li class="timeline-item">
            <span class="timeline-year">${esc(ev.year)}</span>
            <div class="timeline-content">
              <div class="timeline-title">${esc(ev.title)}</div>
              ${ev.description ? `<div class="timeline-desc">${esc(ev.description)}</div>` : ''}
            </div>
          </li>`,
          )
          .join('')}
      </ol>`;
  } else if (type === 'achievements' && isAchievements(data)) {
    const items = data.items ?? [];
    body = `
      <div class="ach-grid">
        ${items
          .map(
            (item) => `
          <div class="ach-item">
            <div class="ach-metric">${esc(item.metric)}</div>
            <div class="ach-label">${esc(item.label)}</div>
            ${item.context ? `<div class="ach-context">${esc(item.context)}</div>` : ''}
          </div>`,
          )
          .join('')}
      </div>`;
  } else if (type === 'darkside' && isDarkside(data)) {
    const controversies = data.controversies ?? [];
    body = `
      <ul class="dark-list">
        ${controversies
          .map((c) => {
            const sev = SEVERITY_LABEL[c.severity ?? 'medium'] ?? '中危';
            const sevClass = `sev-${c.severity ?? 'medium'}`;
            return `
          <li class="dark-item">
            <span class="sev-badge ${sevClass}">[${esc(sev)}]</span>
            <div class="dark-content">
              <div class="dark-title">${esc(c.title)}</div>
              ${c.detail ? `<div class="dark-detail">${esc(c.detail)}</div>` : ''}
            </div>
          </li>`;
          })
          .join('')}
      </ul>`;
  } else if (type === 'gameplay' && isGameplay(data)) {
    const stakeholders = data.stakeholders ?? [];
    body = `
      ${data.dynamics ? `
        <div class="dynamics-box">
          <span class="dynamics-label">Dynamics · 底层逻辑</span>
          <p class="dynamics-text">${esc(data.dynamics)}</p>
        </div>` : ''}
      ${stakeholders.length > 0 ? `
        <ul class="gp-list">
          ${stakeholders
            .map(
              (s) => `
            <li class="gp-item">
              <span class="gp-name">${esc(s.name)}</span>
              <span class="gp-pos">(${esc(s.position)})</span>
              <span class="gp-colon">:</span>
              <span class="gp-interest">${esc(s.interest)}</span>
            </li>`,
            )
            .join('')}
        </ul>` : ''}`;
  }

  if (!body) return '';

  return `
    <section class="card">
      <div class="card-head">
        <span class="card-no">${esc(no)}</span>
        <div class="card-head-text">
          <span class="card-title">${esc(title)}</span>
          <span class="card-subtitle">${esc(subtitle)}</span>
        </div>
        <span class="card-stamp">Classified</span>
      </div>
      <div class="card-body">${body}</div>
    </section>`;
}

/** 生成完整的 HTML 报告字符串 */
export function generateReportHTML(params: ReportParams): string {
  const { fileNo, query, entityType, cards, sources } = params;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const entityLabel = entityType ? ENTITY_LABEL[entityType] : '未分类 · UNCLASSIFIED';

  const cardSections = CARD_META.map((meta) => {
    const data = cards[meta.type];
    return renderCard(meta.type, meta.no, meta.title, meta.subtitle, data);
  })
    .filter(Boolean)
    .join('\n');

  const sourcesSection =
    sources && sources.length > 0
      ? `
    <section class="sources">
      <div class="sources-head">
        <span class="sources-title">DATA SOURCES · 数据来源</span>
        <span class="sources-count">${sources.length} 项</span>
      </div>
      <ol class="sources-list">
        ${sources
          .map(
            (s, i) => `
          <li class="source-item">
            <span class="source-idx">${String(i + 1).padStart(2, '0')}</span>
            <div class="source-body">
              <div class="source-title">${esc(s.title)}</div>
              ${s.url ? `<div class="source-url">${esc(s.url)}</div>` : ''}
            </div>
          </li>`,
          )
          .join('')}
      </ol>
    </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>情报档案 ${esc(fileNo)} · ${esc(query)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #ffffff;
    color: #18181b;
    font-family: "Geist", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 12px;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .mono { font-family: "Geist Mono", "Cascadia Code", "Consolas", "Courier New", monospace; }

  .page { max-width: 800px; margin: 0 auto; padding: 8px; }

  /* ===== 顶部档案头 ===== */
  .header {
    border: 1.5px solid #18181b;
    padding: 18px 22px;
    position: relative;
    margin-bottom: 24px;
  }
  .header::before, .header::after {
    content: "";
    position: absolute;
    width: 12px; height: 12px;
    border: 1.5px solid #18181b;
  }
  .header::before { top: -3px; left: -3px; border-right: none; border-bottom: none; }
  .header::after { bottom: -3px; right: -3px; border-left: none; border-top: none; }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px dashed #a1a1aa;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .brand {
    font-family: "Geist Mono", monospace;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: #18181b;
  }
  .brand-sub {
    font-family: "Geist Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.2em;
    color: #71717a;
    text-transform: uppercase;
    margin-top: 2px;
  }
  .stamp {
    font-family: "Geist Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border: 1px solid #18181b;
    padding: 3px 10px;
    transform: rotate(-2deg);
    color: #18181b;
  }

  .header-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 8px;
    font-size: 10px;
    font-family: "Geist Mono", monospace;
    color: #52525b;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .header-row .sep { color: #d4d4d8; }
  .header-row .label { color: #71717a; }
  .header-row .val { color: #18181b; font-weight: 600; }

  .header-query {
    font-size: 26px;
    font-weight: 900;
    color: #18181b;
    margin-top: 10px;
    letter-spacing: -0.02em;
    line-height: 1.2;
    word-break: break-word;
  }

  /* ===== 分隔线 ===== */
  .divider {
    height: 1px;
    background: linear-gradient(to right, transparent, #a1a1aa 20%, #a1a1aa 80%, transparent);
    margin: 20px 0;
  }

  /* ===== 卡片 ===== */
  .card {
    border: 1px solid #d4d4d8;
    margin-bottom: 16px;
    page-break-inside: avoid;
    position: relative;
    background: #fafafa;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #d4d4d8;
    background: #f4f4f5;
  }
  .card-no {
    font-family: "Geist Mono", monospace;
    font-size: 22px;
    font-weight: 900;
    color: #a1a1aa;
    line-height: 1;
  }
  .card-head-text { flex: 1; }
  .card-title {
    font-family: "Geist Mono", monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #18181b;
    text-transform: uppercase;
  }
  .card-subtitle {
    font-size: 10px;
    color: #71717a;
    margin-top: 1px;
  }
  .card-stamp {
    font-family: "Geist Mono", monospace;
    font-size: 8px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border: 1px solid #a1a1aa;
    padding: 2px 7px;
    color: #52525b;
    transform: rotate(-2deg);
  }
  .card-body { padding: 14px; }

  /* Verdict */
  .verdict-title {
    font-size: 20px;
    font-weight: 900;
    color: #18181b;
    line-height: 1.25;
    word-break: break-word;
  }
  .verdict-subtitle {
    font-size: 12px;
    color: #52525b;
    margin-top: 8px;
    line-height: 1.7;
  }
  .tag-row { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    font-family: "Geist Mono", monospace;
    font-size: 10px;
    border: 1px solid #a1a1aa;
    padding: 2px 8px;
    color: #3f3f46;
    background: #fff;
  }

  /* Timeline */
  .timeline-list { list-style: none; }
  .timeline-item {
    display: flex;
    gap: 14px;
    padding: 8px 0;
    border-left: 2px solid #d4d4d8;
    padding-left: 14px;
    margin-left: 4px;
    position: relative;
  }
  .timeline-item::before {
    content: "";
    position: absolute;
    left: -5px; top: 14px;
    width: 8px; height: 8px;
    background: #18181b;
    border-radius: 50%;
  }
  .timeline-year {
    font-family: "Geist Mono", monospace;
    font-size: 12px;
    font-weight: 700;
    color: #18181b;
    min-width: 60px;
    flex-shrink: 0;
  }
  .timeline-content { flex: 1; }
  .timeline-title { font-size: 12px; font-weight: 600; color: #18181b; }
  .timeline-desc { font-size: 11px; color: #52525b; margin-top: 3px; line-height: 1.6; }

  /* Achievements */
  .ach-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 18px; }
  .ach-item { border-left: 2px solid #18181b; padding-left: 10px; }
  .ach-metric {
    font-family: "Geist Mono", monospace;
    font-size: 18px;
    font-weight: 900;
    color: #18181b;
    line-height: 1.1;
  }
  .ach-label { font-size: 11px; font-weight: 600; color: #18181b; margin-top: 3px; }
  .ach-context { font-size: 10px; color: #71717a; margin-top: 2px; line-height: 1.5; }

  /* Darkside */
  .dark-list { list-style: none; }
  .dark-item {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px dashed #e4e4e7;
  }
  .dark-item:last-child { border-bottom: none; }
  .sev-badge {
    font-family: "Geist Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border: 1px solid;
    height: fit-content;
    flex-shrink: 0;
  }
  .sev-high { color: #be123c; border-color: #be123c; background: #fff1f2; }
  .sev-medium { color: #c2410c; border-color: #c2410c; background: #fff7ed; }
  .sev-low { color: #a16207; border-color: #a16207; background: #fefce8; }
  .dark-content { flex: 1; }
  .dark-title { font-size: 12px; font-weight: 600; color: #18181b; }
  .dark-detail { font-size: 11px; color: #52525b; margin-top: 3px; line-height: 1.6; }

  /* Gameplay */
  .dynamics-box {
    background: #f4f4f5;
    border-left: 2px solid #18181b;
    padding: 8px 12px;
    margin-bottom: 10px;
  }
  .dynamics-label {
    font-family: "Geist Mono", monospace;
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #71717a;
  }
  .dynamics-text { font-size: 11px; color: #18181b; margin-top: 3px; line-height: 1.6; }
  .gp-list { list-style: none; }
  .gp-item {
    padding: 6px 0;
    border-bottom: 1px dashed #e4e4e7;
    font-size: 11px;
    line-height: 1.6;
  }
  .gp-item:last-child { border-bottom: none; }
  .gp-name { font-weight: 700; color: #18181b; }
  .gp-pos { color: #52525b; }
  .gp-colon { color: #a1a1aa; margin: 0 2px; }
  .gp-interest { color: #3f3f46; }

  /* Sources */
  .sources {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 2px solid #18181b;
    page-break-inside: avoid;
  }
  .sources-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }
  .sources-title {
    font-family: "Geist Mono", monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #18181b;
  }
  .sources-count {
    font-family: "Geist Mono", monospace;
    font-size: 10px;
    color: #71717a;
  }
  .sources-list { list-style: none; }
  .source-item {
    display: flex;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px dotted #d4d4d8;
  }
  .source-item:last-child { border-bottom: none; }
  .source-idx {
    font-family: "Geist Mono", monospace;
    font-size: 10px;
    color: #a1a1aa;
    flex-shrink: 0;
    min-width: 22px;
  }
  .source-body { flex: 1; }
  .source-title { font-size: 11px; color: #18181b; font-weight: 600; }
  .source-url {
    font-family: "Geist Mono", monospace;
    font-size: 9px;
    color: #52525b;
    word-break: break-all;
    margin-top: 1px;
  }

  /* Footer */
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #d4d4d8;
    display: flex;
    justify-content: space-between;
    font-family: "Geist Mono", monospace;
    font-size: 9px;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  @media print {
    .page { max-width: none; padding: 0; }
    .card, .header, .sources { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="page">
    <!-- 档案头 -->
    <header class="header">
      <div class="header-top">
        <div>
          <div class="brand">OMNIVISION</div>
          <div class="brand-sub">全知视野 · Intelligence Dossier</div>
        </div>
        <span class="stamp">Top Secret // EYES ONLY</span>
      </div>
      <div class="header-row">
        <span class="label">File No.</span>
        <span class="val mono">${esc(fileNo)}</span>
        <span class="sep">·</span>
        <span class="label">Entity</span>
        <span class="val">${esc(entityLabel)}</span>
        <span class="sep">·</span>
        <span class="label">Generated</span>
        <span class="val mono">${esc(generatedAt)}</span>
      </div>
      <div class="header-query">${esc(query)}</div>
    </header>

    <div class="divider"></div>

    <!-- 卡片内容 -->
    ${cardSections}

    <!-- 数据源 -->
    ${sourcesSection}

    <!-- 页脚 -->
    <footer class="footer">
      <span>OMNIVISION · 全知视野</span>
      <span>${esc(fileNo)} · ${esc(generatedAt)}</span>
    </footer>
  </div>
</body>
</html>`;
}
