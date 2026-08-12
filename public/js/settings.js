// Installningarna: ett skal med en meny till vanster och en panel i taget till
// hoger. Menyn ar bara en lista - en ny kategori ar en rad i NAV och en panel i
// index.html, inget mer.
//
// Ljudpanelen ar den forsta fardiga kategorin: master plus en rad per kanal i
// mixern. Reglagen gar direkt mot den levande mixern sa att man hor andringen
// medan man drar, men skrivs inte till disk forran man trycker Save. Backar man
// ut utan att spara stalls mixern tillbaka dit den sist sparades.
//
// Kontrollpanelen ar samma tangentbindningar som forut (controls.js), nu utan
// egen ram: skalet ager rubriken, notisrutan och spara-knappen at bada.

import { ControlsUi } from '/js/controls.js';

const NOTE_MS = 2600;

const NAV = [
  { id: 'audio', label: 'Audio', icon: '♪', color: '#ffd166', kicker: 'Sound & mixing' },
  { id: 'controls', label: 'Controls', icon: '⌨', color: '#4dc3ff', kicker: 'Keyboard & gamepad' },
  { id: 'video', label: 'Video', icon: '▣', color: '#c58bff', soon: true },
  { id: 'gameplay', label: 'Gameplay', icon: '⚙', color: '#ff4d9d', soon: true },
];

// Kanalerna i mixern, i den ordning de visas. Vardena bor i audio.js - det har
// ar bara ansiktet pa dem.
const CHANNELS = [
  { id: 'music', label: 'Music', desc: 'Soundtrack & menus', icon: '♫', color: '#c58bff' },
  { id: 'sfx', label: 'Effects', desc: 'Hits, jumps, items', icon: '✸', color: '#ffd166' },
  { id: 'voice', label: 'Announcer', desc: 'Callouts & voice', icon: '◈', color: '#ff4d9d' },
  { id: 'ambience', label: 'Ambience', desc: 'Arena atmosphere', icon: '≈', color: '#4dc3ff' },
  { id: 'ui', label: 'Interface', desc: 'Clicks & notifications', icon: '▮', color: '#7cf5b0' },
];

const MASTER = { id: 'master', label: 'Master', color: '#ffd166' };

// Ett steg med piltangenterna, i procent.
const STEP = 5;
const BIG_STEP = 20;

export class SettingsUi {
  constructor({ audio, onBack = () => {} } = {}) {
    this.audio = audio;
    this.onBack = onBack;
    this.section = NAV[0].id;
    this.mix = audio.mix();
    this.savedMix = snapshot(this.mix);
    this.noteTimer = 0;
    this.opened = false;

    this.page = document.getElementById('settings-view');
    this.navs = document.getElementById('settings-navs');
    this.eyebrow = document.getElementById('settings-eyebrow');
    this.title = document.getElementById('settings-title');
    this.dirtyPill = document.getElementById('settings-dirty');
    this.saveBtn = document.getElementById('settings-save');
    this.resetBtn = document.getElementById('settings-reset');
    this.backBtn = document.getElementById('settings-back');
    this.note = document.getElementById('settings-note');
    this.soonMsg = document.getElementById('settings-soon-msg');
    this.masterCard = document.getElementById('settings-master');
    this.masterSlot = document.getElementById('settings-master-slider');
    this.masterPct = document.getElementById('settings-master-pct');
    this.masterMuteBtn = document.getElementById('settings-master-mute');
    this.meter = document.getElementById('settings-meter');
    this.channelRows = document.getElementById('settings-channels');
    this.panels = {
      audio: document.getElementById('settings-audio'),
      controls: document.getElementById('controls-view'),
      video: document.getElementById('settings-soon'),
      gameplay: document.getElementById('settings-soon'),
    };
    if (!this.page) return;

    this.controls = new ControlsUi({
      onChange: () => this.renderStatus(),
      onNote: (text, glyph) => this.showNote(text, glyph),
    });

    this.navs?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-set-nav]');
      if (btn) this.setSection(btn.dataset.setNav);
    });

    if (this.masterSlot) this.masterSlot.innerHTML = sliderMarkup(MASTER.id, 'Master volume');
    this.masterCard?.addEventListener('pointerdown', (e) => this.onSliderDown(e));
    this.masterCard?.addEventListener('keydown', (e) => this.onSliderKey(e));
    this.masterMuteBtn?.addEventListener('click', () => this.toggleMute(MASTER.id));

    this.channelRows?.addEventListener('pointerdown', (e) => this.onSliderDown(e));
    this.channelRows?.addEventListener('keydown', (e) => this.onSliderKey(e));
    this.channelRows?.addEventListener('click', (e) => {
      const mute = e.target.closest('[data-mix-mute]');
      if (mute) {
        this.toggleMute(mute.dataset.mixMute);
        return;
      }
      const test = e.target.closest('[data-mix-test]');
      if (test) this.testChannel(test.dataset.mixTest);
    });

    this.saveBtn?.addEventListener('click', () => this.save());
    this.resetBtn?.addEventListener('click', () => this.restoreDefaults());
    this.backBtn?.addEventListener('click', () => this.onBack());

    this.renderNav();
    this.renderChannels();
    this.setSection(this.section);
  }

  /**
   * Oppnar sidan. Utkastet borjar alltid fran det som faktiskt ar sparat - bade
   * mixern och bindningarna - sa att en oavslutad tur aldrig sitter kvar.
   */
  open(section = this.section) {
    if (!this.page) return;
    this.opened = true;
    this.mix = this.audio.storedMix();
    this.savedMix = snapshot(this.mix);
    this.audio.applyMix(this.mix, { persist: false });
    this.controls.open();
    this.hideNote();
    this.renderMix();
    this.setSection(section);
  }

  /** Stanger sidan och slanger det man inte hann spara. */
  close() {
    if (!this.page || !this.opened) return;
    this.opened = false;
    if (this.isMixDirty()) this.audio.applyMix(this.audio.storedMix(), { persist: false });
    this.mix = this.audio.storedMix();
    this.savedMix = snapshot(this.mix);
    this.controls.close();
    this.hideNote();
    this.hidePanels();
    this.renderMix();
  }

  setSection(id) {
    const nav = NAV.find((item) => item.id === id) ?? NAV[0];
    this.section = nav.id;

    this.hidePanels();
    const panel = this.panels[nav.id];
    if (panel) panel.hidden = false;
    if (nav.soon && this.soonMsg) this.soonMsg.textContent = `${nav.label} settings are on the way.`;

    if (this.eyebrow) this.eyebrow.textContent = nav.soon ? 'Coming soon' : nav.kicker;
    if (this.title) this.title.textContent = nav.label;
    if (this.resetBtn) this.resetBtn.hidden = !!nav.soon;

    this.renderNav();
    this.renderStatus();
  }

  hidePanels() {
    for (const panel of new Set(Object.values(this.panels))) {
      if (panel) panel.hidden = true;
    }
  }

  // ---------------------------------------------------------------- mixern

  /**
   * Reglagen: pekaren nagonstans pa banan satter vardet direkt, sedan foljer vi
   * den tills den slapps. Banans matt las en gang - raderna ritas inte om under
   * tiden, bara malas.
   */
  onSliderDown(e) {
    const track = e.target.closest('[data-mix-slider]');
    if (!track || e.button > 0) return;

    e.preventDefault();
    track.focus();
    const id = track.dataset.mixSlider;
    const rect = track.getBoundingClientRect();
    const apply = (x) => this.setValue(id, Math.round(((x - rect.left) / rect.width) * 100) / 100);

    apply(e.clientX);
    const move = (ev) => apply(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  onSliderKey(e) {
    const track = e.target.closest('[data-mix-slider]');
    if (!track) return;

    const id = track.dataset.mixSlider;
    const value = this.valueOf(id);
    const step = keyStep(e.key);
    if (step !== null) {
      e.preventDefault();
      this.setValue(id, value + (step / 100) * (e.shiftKey ? BIG_STEP / STEP : 1));
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.setValue(id, e.key === 'Home' ? 0 : 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggleMute(id);
    }
  }

  valueOf(id) {
    return id === MASTER.id ? this.mix.master : (this.mix.channels[id]?.value ?? 0);
  }

  mutedOf(id) {
    return id === MASTER.id ? this.mix.masterMuted : !!this.mix.channels[id]?.muted;
  }

  /** Att dra i ett reglage tar ocksa bort tystnaden - annars hander ingenting. */
  setValue(id, value) {
    const next = clamp01(value);
    if (id === MASTER.id) this.mix = { ...this.mix, master: next, masterMuted: false };
    else if (this.mix.channels[id]) {
      this.mix = { ...this.mix, channels: { ...this.mix.channels, [id]: { value: next, muted: false } } };
    } else return;

    this.applyLive();
    this.paint(id);
    this.renderStatus();
  }

  toggleMute(id) {
    if (id === MASTER.id) this.mix = { ...this.mix, masterMuted: !this.mix.masterMuted };
    else if (this.mix.channels[id]) {
      const channel = this.mix.channels[id];
      this.mix = { ...this.mix, channels: { ...this.mix.channels, [id]: { ...channel, muted: !channel.muted } } };
    } else return;

    this.applyLive();
    this.paint(id);
    this.renderStatus();
  }

  /** Testknappen: ett representativt ljud genom kanalens egen buss. */
  testChannel(id) {
    const channel = CHANNELS.find((c) => c.id === id);
    if (!channel) return;

    if (this.mutedOf(id) || this.mix.masterMuted) {
      this.showNote(`${channel.label} is muted`);
      return;
    }
    this.audio.previewChannel(id);
    this.showNote(`Testing ${channel.label.toLowerCase()}…`);
  }

  applyLive() {
    this.audio.applyMix(this.mix, { persist: false });
  }

  // --------------------------------------------------------------- knappar

  save() {
    if (!this.isDirty()) return;

    const savedBinds = this.controls?.save() ?? false;
    const savedMix = this.isMixDirty();
    this.audio.applyMix(this.mix);
    this.savedMix = snapshot(this.mix);

    this.renderStatus();
    this.showNote(savedMix && savedBinds ? 'Settings saved' : savedBinds ? 'Bindings saved' : 'Sound levels saved');
  }

  /** Aterstaller den kategori man star i - inte allt pa en gang. */
  restoreDefaults() {
    if (this.section === 'controls') {
      this.controls?.resetAll();
      return;
    }
    if (this.section !== 'audio') return;

    this.mix = this.audio.defaultMix();
    this.applyLive();
    this.renderMix();
    this.renderStatus();
    this.showNote('Sound levels restored to defaults', '♪');
  }

  isMixDirty() {
    return snapshot(this.mix) !== this.savedMix;
  }

  isDirty() {
    return this.isMixDirty() || !!this.controls?.isDirty();
  }

  // ----------------------------------------------------------------- rita

  renderNav() {
    if (!this.navs) return;
    this.navs.innerHTML = NAV.map((nav) => {
      const on = nav.id === this.section;
      return `
        <button class="set-nav${on ? ' on' : ''}${nav.soon ? ' soon' : ''}" type="button"
          data-set-nav="${escapeAttr(nav.id)}" style="--set-tone:${escapeAttr(nav.color)}"
          aria-current="${on ? 'page' : 'false'}">
          <span class="set-nav-icon">${escapeHtml(nav.icon)}</span>
          <span class="set-nav-label">${escapeHtml(nav.label)}</span>
          ${nav.soon ? '<span class="set-nav-tag">Soon</span>' : ''}
        </button>`;
    }).join('');
  }

  renderChannels() {
    if (!this.channelRows) return;
    this.channelRows.innerHTML = CHANNELS.map(
      (channel, index) => `
        <div class="mix-row" id="mix-row-${escapeAttr(channel.id)}"
          style="--mix-tone:${escapeAttr(channel.color)};--mix-delay:${(index * 0.05).toFixed(2)}s">
          <span class="mix-icon">${escapeHtml(channel.icon)}</span>
          <div class="mix-copy">
            <b>${escapeHtml(channel.label)}</b>
            <span>${escapeHtml(channel.desc)}</span>
          </div>
          ${sliderMarkup(channel.id, `${channel.label} volume`)}
          <span class="mix-pct" id="mix-pct-${escapeAttr(channel.id)}">0%</span>
          <button class="mix-test" type="button" title="Test sound"
            data-mix-test="${escapeAttr(channel.id)}" aria-label="Test ${escapeAttr(channel.label)}">▶</button>
          <button class="mix-mute" type="button" data-mix-mute="${escapeAttr(channel.id)}">On</button>
        </div>`,
    ).join('');
    this.renderMix();
  }

  renderMix() {
    this.paint(MASTER.id);
    for (const channel of CHANNELS) this.paint(channel.id);
  }

  /** Malar om ett reglage utan att bygga om raden - det pagar ju ett drag. */
  paint(id) {
    const master = id === MASTER.id;
    const row = master ? this.masterCard : document.getElementById(`mix-row-${id}`);
    const track = row?.querySelector(`[data-mix-slider="${id}"]`);
    if (!row || !track) return;

    const value = this.valueOf(id);
    const muted = this.mutedOf(id);
    const pct = Math.round(value * 100);

    row.classList.toggle('muted', muted);
    track.style.setProperty('--mix-value', `${pct}%`);
    track.setAttribute('aria-valuenow', String(pct));
    track.setAttribute('aria-valuetext', muted ? 'Muted' : `${pct}%`);

    const label = master ? this.masterPct : document.getElementById(`mix-pct-${id}`);
    if (label) label.textContent = master ? String(muted ? 0 : pct) : muted ? '—' : `${pct}%`;

    const muteBtn = master ? this.masterMuteBtn : row.querySelector('[data-mix-mute]');
    if (muteBtn) {
      muteBtn.textContent = master ? (muted ? 'Muted' : 'Mute') : muted ? 'Off' : 'On';
      muteBtn.classList.toggle('on', muted);
      muteBtn.setAttribute('aria-pressed', String(muted));
    }

    // Mataren ar bara en bild av att det gar ljud ut - den slocknar nar den
    // inte gor det.
    if (master && this.meter) {
      this.meter.classList.toggle('live', !muted && value > 0);
    }
  }

  renderStatus() {
    const dirty = this.isDirty();
    if (this.dirtyPill) {
      this.dirtyPill.classList.toggle('on', dirty);
      this.dirtyPill.innerHTML = `<i></i>${dirty ? 'Unsaved changes' : 'All saved'}`;
    }
    if (this.saveBtn) this.saveBtn.disabled = !dirty;
  }

  showNote(text, glyph = '♪') {
    if (!this.note || !text) return;
    window.clearTimeout(this.noteTimer);
    this.note.innerHTML = `<i>${escapeHtml(glyph)}</i>${escapeHtml(text)}`;
    this.note.hidden = false;
    this.noteTimer = window.setTimeout(() => this.hideNote(), NOTE_MS);
  }

  hideNote() {
    window.clearTimeout(this.noteTimer);
    if (this.note) this.note.hidden = true;
  }
}

function sliderMarkup(id, label) {
  return `
    <div class="mix-track" data-mix-slider="${escapeAttr(id)}" tabindex="0" role="slider"
      aria-label="${escapeAttr(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <i class="mix-fill"></i>
      <b class="mix-handle"></b>
    </div>`;
}

function keyStep(key) {
  if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'PageUp') return STEP;
  if (key === 'ArrowLeft' || key === 'ArrowDown' || key === 'PageDown') return -STEP;
  return null;
}

function snapshot(mix) {
  return JSON.stringify(mix);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
