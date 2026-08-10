import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TONES,
  achievementProgress,
  publicAchievement,
  rarityForPct,
} from '/shared/achievements.js';

const STATUS_FILTERS = [
  ['all', 'All'],
  ['unlocked', 'Unlocked'],
  ['locked', 'Locked'],
];
const TOAST_MS = 4600;
const TOAST_OUT_MS = 420;
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

export class AchievementsUi {
  constructor({ playerName = () => '', onBack = () => {} } = {}) {
    this.playerName = playerName;
    this.onBack = onBack;
    this.profile = null;
    this.cat = 'all';
    this.status = 'all';
    this.toastId = 0;
    this.toastTimers = [];
    this.matchEarned = [];
    this.summaryMatch = null;

    this.page = document.getElementById('achievements-view');
    this.subline = document.getElementById('achievements-subline');
    this.dial = document.getElementById('achievements-dial');
    this.completionLabel = document.getElementById('achievements-completion-label');
    this.stats = document.getElementById('achievements-stats');
    this.catFilters = document.getElementById('achievements-cat-filters');
    this.statusFilters = document.getElementById('achievements-status-filters');
    this.grid = document.getElementById('achievements-grid');
    this.empty = document.getElementById('achievements-empty');
    this.back = document.getElementById('achievements-back');
    this.toasts = document.getElementById('achievement-toasts');
    this.summary = document.getElementById('match-achievements-summary');

    this.catFilters?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ach-cat]');
      if (!btn) return;
      this.cat = btn.dataset.achCat;
      this.renderPage();
    });

    this.statusFilters?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ach-status]');
      if (!btn) return;
      this.status = btn.dataset.achStatus;
      this.renderPage();
    });

    this.back?.addEventListener('click', () => this.onBack());
    this.renderPage();
  }

  setProfile(profile) {
    this.profile = profile ?? null;
    this.renderPage();
  }

  clearMatch() {
    this.matchEarned = [];
    this.summaryMatch = null;
    this.renderSummary();
  }

  unlock(achievements, profile = null) {
    if (profile) this.setProfile(profile);
    for (const raw of achievements ?? []) {
      const item = this.decorateUnlock(raw);
      if (!item) continue;
      this.pushToast(item);
      if (!this.matchEarned.some((a) => a.id === item.id)) this.matchEarned.push(item);
    }
    this.renderSummary();
  }

  renderSummary(match = this.summaryMatch) {
    this.summaryMatch = match ?? this.summaryMatch;
    if (!this.summary) return;

    if (!this.matchEarned.length) {
      this.summary.hidden = true;
      this.summary.innerHTML = '';
      return;
    }

    const earned = this.matchEarned;
    const totalPts = earned.reduce((sum, a) => sum + a.pts, 0);
    this.summary.hidden = false;
    this.summary.innerHTML = `
      <div class="ma-summary-head">
        <div>
          <div class="ma-kicker">Match rewards</div>
          <b>${earned.length} new achievement${earned.length === 1 ? '' : 's'} earned</b>
        </div>
        <span>+${totalPts}<small>glory</small></span>
      </div>
      <div class="ma-summary-list">
        ${earned.map((a, index) => summaryRow(a, index)).join('')}
      </div>`;
  }

  renderPage() {
    if (!this.grid) return;

    const items = this.items();
    const unlocked = items.filter((a) => a.unlocked);
    const completionPct = items.length ? Math.round((unlocked.length / items.length) * 100) : 0;
    const earnedPts = unlocked.reduce((sum, a) => sum + a.pts, 0);
    const totalPts = items.reduce((sum, a) => sum + a.pts, 0);
    const rarest = unlocked.slice().sort((a, b) => a.pct - b.pct)[0] ?? null;
    const inProgress = items.filter((a) => !a.unlocked && a.cur > 0).length;
    const name = this.profile?.n || this.playerName() || 'Fighter';

    if (this.subline) this.subline.textContent = `${name} - rare feats earn more glory`;
    if (this.completionLabel) this.completionLabel.textContent = `${unlocked.length} of ${items.length} unlocked`;
    if (this.dial) {
      this.dial.style.setProperty('--ach-completion', `${completionPct * 3.6}deg`);
      this.dial.innerHTML = `<span>${completionPct}<small>%</small></span>`;
    }

    if (this.stats) {
      this.stats.innerHTML = [
        { k: 'Unlocked', v: `${unlocked.length}/${items.length}`, sub: 'achievements earned', tone: '#7cf5b0' },
        { k: 'Glory points', v: earnedPts, sub: `of ${totalPts} available`, tone: '#ffd166' },
        { k: 'Rarest unlock', v: rarest ? `${rarest.pct}%` : '-', sub: rarest?.title ?? 'none yet', tone: '#c58bff' },
        { k: 'In progress', v: inProgress, sub: 'partially complete', tone: '#4dc3ff' },
      ]
        .map(
          (s) => `
          <div class="ach-stat" style="--ach-tone:${s.tone}">
            <div>${escapeHtml(s.k)}</div>
            <b>${escapeHtml(String(s.v))}</b>
            <span>${escapeHtml(s.sub)}</span>
          </div>`,
        )
        .join('');
    }

    this.renderFilters(items);

    const filtered = items.filter(
      (a) => (this.cat === 'all' || a.cat === this.cat) && (this.status === 'all' || (this.status === 'unlocked') === a.unlocked),
    );
    this.grid.innerHTML = filtered.map((a, index) => achievementCard(a, index)).join('');
    if (this.empty) this.empty.hidden = filtered.length > 0;
  }

  renderFilters(items) {
    if (this.catFilters) {
      const cats = ['all', ...ACHIEVEMENT_CATEGORIES];
      this.catFilters.innerHTML = cats
        .map((cat) => {
          const label = cat === 'all' ? 'All' : cat;
          const count = cat === 'all' ? items.length : items.filter((a) => a.cat === cat).length;
          const active = this.cat === cat;
          return `<button class="ach-chip ${active ? 'on' : ''}" type="button" data-ach-cat="${escapeHtml(cat)}">${escapeHtml(
            label,
          )}<span>${count}</span></button>`;
        })
        .join('');
    }

    if (this.statusFilters) {
      this.statusFilters.innerHTML = STATUS_FILTERS.map(
        ([id, label]) =>
          `<button class="ach-chip ach-status ${this.status === id ? 'on' : ''}" type="button" data-ach-status="${id}">${label}</button>`,
      ).join('');
    }
  }

  items() {
    const unlockedMap = this.profile?.achievements?.unlocked ?? {};
    return ACHIEVEMENTS.map((def) => {
      const progress = achievementProgress(def, this.profile ?? {});
      const unlockedAt = Math.max(0, Number(unlockedMap[def.id]) || 0);
      const unlocked = !!unlockedAt || progress.unlocked;
      const rarity = rarityForPct(def.pct);
      const tone = ACHIEVEMENT_TONES[def.cat] ?? '#ffd166';
      return {
        ...publicAchievement(def),
        cur: progress.cur,
        max: progress.max,
        progressPct: Math.min(100, Math.round((progress.cur / progress.max) * 100)),
        unlocked,
        unlockedAt,
        rarity: rarity.label,
        rarityTone: rarity.tone,
        tone,
      };
    });
  }

  decorateUnlock(raw) {
    const def = ACHIEVEMENTS.find((a) => a.id === raw?.id) ?? raw;
    if (!def?.id) return null;
    const pub = publicAchievement(def);
    const rarity = rarityForPct(pub.pct);
    return {
      ...pub,
      rarity: rarity.label,
      rarityTone: rarity.tone,
      tone: ACHIEVEMENT_TONES[pub.cat] ?? '#ffd166',
    };
  }

  pushToast(item) {
    if (!this.toasts) return;

    const id = ++this.toastId;
    const el = document.createElement('div');
    el.className = 'ma-toast';
    el.dataset.toastId = String(id);
    el.style.setProperty('--rarity-tone', item.rarityTone);
    el.style.setProperty('--toast-dur', `${TOAST_MS}ms`);
    el.innerHTML = `
      <div class="ma-toast-shine"></div>
      <div class="ma-toast-row">
        <span class="ma-toast-icon"><img src="${escapeAttr(item.icon)}" alt="" /></span>
        <span class="ma-toast-copy">
          <span>${escapeHtml(item.rarity)} unlocked</span>
          <b>${escapeHtml(item.title)}</b>
        </span>
        <span class="ma-toast-points"><b>+${item.pts}</b><small>glory</small></span>
      </div>
      <span class="ma-toast-timer"></span>`;

    this.toasts.appendChild(el);
    this.toastTimers.push(
      window.setTimeout(() => el.classList.add('leaving'), TOAST_MS - TOAST_OUT_MS),
      window.setTimeout(() => {
        el.remove();
        this.toastTimers = this.toastTimers.filter(Boolean);
      }, TOAST_MS),
    );
  }
}

function achievementCard(a, index) {
  const locked = !a.unlocked;
  const globalW = Math.max(3, Math.round(Math.sqrt((Number(a.pct) || 0) / 100) * 100));
  const showProgress = locked && a.cur > 0;
  const stamp = a.unlockedAt ? `&#10003; ${formatDate(a.unlockedAt)}` : a.unlocked ? '&#10003; Unlocked' : 'Locked';
  return `
    <article class="ach-card ${locked ? 'locked' : 'unlocked'} ${a.rarity === 'Common' ? 'common' : ''}"
      style="--ach-tone:${a.tone};--rarity-tone:${a.rarityTone};--progress:${a.progressPct}%;--global:${globalW}%;--delay:${(
        index * 0.025
      ).toFixed(2)}s">
      <div class="ach-ribbon">${escapeHtml(a.rarity)}</div>
      ${locked ? '' : '<div class="ach-shine"></div>'}
      <div class="ach-card-main">
        <span class="ach-icon">
          <img src="${escapeAttr(a.icon)}" alt="" />
          ${locked ? '<i>LOCKED</i>' : ''}
        </span>
        <span class="ach-copy">
          <span class="ach-title-row"><b>${escapeHtml(a.title)}</b><em>+${a.pts}<small>PTS</small></em></span>
          <span class="ach-desc">${escapeHtml(a.desc)}</span>
        </span>
      </div>
      ${
        showProgress
          ? `<div class="ach-progress">
              <span><b>Progress</b><em>${formatCount(a.cur)} / ${formatCount(a.max)}</em></span>
              <i><b></b></i>
            </div>`
          : ''
      }
      <div class="ach-card-foot">
        <span class="ach-global"><b>${a.pct}%</b> of fighters unlocked this<i><b></b></i></span>
        <span class="ach-stamp">${stamp}</span>
      </div>
    </article>`;
}

function summaryRow(a, index) {
  const globalW = Math.max(4, Math.round(Math.sqrt((Number(a.pct) || 0) / 100) * 100));
  return `
    <div class="ma-summary-row" style="--rarity-tone:${a.rarityTone};--global:${globalW}%;--delay:${(index * 0.09).toFixed(2)}s">
      <span class="ma-summary-icon"><img src="${escapeAttr(a.icon)}" alt="" /></span>
      <span class="ma-summary-copy">
        <span><b>${escapeHtml(a.title)}</b><em>${escapeHtml(a.rarity)}</em></span>
        <small>${escapeHtml(a.desc)}</small>
        <i><b></b><span><strong>${a.pct}%</strong> of fighters</span></i>
      </span>
      <span class="ma-summary-points">+${a.pts}</span>
    </div>`;
}

function formatDate(ms) {
  return DATE_FMT.format(new Date(ms));
}

function formatCount(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll('`', '&#96;');
}
