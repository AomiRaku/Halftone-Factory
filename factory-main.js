const canvas = document.querySelector('[data-canvas]');
const caption = document.querySelector('[data-caption]');
const zoomLabel = document.querySelector('[data-zoom-label]');
const sizeLabel = document.querySelector('[data-size-label]');
const fileInputs = document.querySelectorAll('[data-file-input]');
const downloadPngButton = document.querySelector('[data-download-png]') || document.querySelector('[data-download]');
const downloadWebmButton = document.querySelector('[data-download-webm]');
const downloadGifButton = document.querySelector('[data-download-gif]');
const playButton = document.querySelector('[data-play]');
const playIcon = document.querySelector('[data-play-icon]');

const menuToggle = document.querySelector('[data-menu-toggle]');
const menuPopover = document.querySelector('[data-menu-popover]');
const menuList = document.querySelector('[data-menu-list]');
const menuCount = document.querySelector('[data-menu-count]');
const menuFoot = document.querySelector('[data-menu-foot]');
const exportToggle = document.querySelector('[data-export-toggle]');
const exportPopover = document.querySelector('[data-export-popover]');
const utilMenuToggle = document.querySelector('[data-util-menu-toggle]');
const utilMenuPopover = document.querySelector('[data-util-menu-popover]');
const shapeButtons = Array.from(document.querySelectorAll('[data-shape]'));
const colorModeButtons = Array.from(document.querySelectorAll('[data-color-mode]'));
const transitionButtons = Array.from(document.querySelectorAll('[data-transition]'));
const pathButtons = Array.from(document.querySelectorAll('[data-path]'));
const controls = Array.from(document.querySelectorAll('[data-control]'));
document.querySelectorAll('input[type="range"]').forEach((input) => {
  const min = +input.min || 0;
  const max = +input.max || 100;
  const def = input.hasAttribute('value') ? +input.getAttribute('value') : (min + max) / 2;
  const pct = (def - min) / (max - min) * 100;
  input.style.setProperty('--tick-pct', pct.toFixed(2) + '%');
});
const outputs = {
  step: document.querySelector('[data-output="step"]'),
  scale: document.querySelector('[data-output="scale"]'),
  sizeWeight: document.querySelector('[data-output="sizeWeight"]'),
  markRotation: document.querySelector('[data-output="markRotation"]'),
  rotation: document.querySelector('[data-output="rotation"]'),
  threshold: document.querySelector('[data-output="threshold"]'),
  contrast: document.querySelector('[data-output="contrast"]'),
  detail: document.querySelector('[data-output="detail"]'),
  highlightDetail: document.querySelector('[data-output="highlightDetail"]'),
  duration: document.querySelector('[data-output="duration"]'),
  blank: document.querySelector('[data-output="blank"]'),
  hold: document.querySelector('[data-output="hold"]'),
  drift: document.querySelector('[data-output="drift"]')
};

const state = {
  shape: 'dot',
  colorMode: 'pure',
  transition: 'dissolve',
  pathStyle: 'radial',
  step: 8,
  scale: 0.78,
  sizeWeight: 1,
  markRotation: 0,
  rotation: 0,
  threshold: 0.18,
  contrast: 1.18,
  detail: 0.5,
  highlightDetail: 0.5,
  duration: 1.7,
  blank: 0.24,
  hold: 0.55,
  drift: 0.08,
  ink: '#009cdb',
  paper: '#f7f3ec',
  shadowInk: '#23322d',
  midInk: '#2fb69a',
  highlightInk: '#e7e4d8',
  transparent: false,
  texture: false,
  invert: false,
  morph: false,
  allowTransparency: false,
  sources: [],
  activeIndex: 0,
  playing: true,
  animationStart: performance.now(),
  pausedAt: 0,
  frameId: 0,
  pointSets: [],
  pointSetSignature: '',
  objectUrls: [],
  exportStatus: '',
  viewScale: 1,
  viewX: 0,
  viewY: 0,
  viewResetToken: 0,
  vectorZoom: false
};

const sampleCanvas = document.createElement('canvas');
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
const context = canvas ? canvas.getContext('2d') : null;
const renderCache = { canvas: null, ctx: null, signature: '', width: 0, height: 0, totalRatio: 0 };
const downloadSvgButton = document.querySelector('[data-download-svg]');
const GIF_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js';
const GIF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js';
const GIFLER_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/gifler@0.1.0/gifler.min.js';
const EXPORT_MAX_MS = 10000;
const EXPORT_GIF_FPS = 12;

const updateSwatchAvailability = () => {
  document.querySelectorAll('.swatch-item').forEach((item) => {
    const input = item.querySelector('input[type="color"]');
    if (!input) return;
    const key = input.dataset.control;
    let allowed;
    if (state.colorMode === 'gradient') {
      allowed = true;
    } else if (state.colorMode === 'source') {
      allowed = key === 'paper';
    } else {
      allowed = key === 'ink' || key === 'paper';
    }
    item.classList.toggle('is-disabled', !allowed);
    item.style.pointerEvents = allowed ? '' : 'none';
    input.disabled = !allowed;
    input.tabIndex = allowed ? 0 : -1;
  });
};
const EXPORT_WEBM_FPS = 30;

let gifEncoderLoader = null;
let gifWorkerScriptUrl = '';
let giflerLoader = null;
let mediaStage = null;
let webmAbort = false;
let gifAbort = false;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const getSourceWidth = (source) => source.naturalWidth || source.videoWidth || source.width || 1;
const getSourceHeight = (source) => source.naturalHeight || source.videoHeight || source.height || 1;
const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3
    ? clean.split('').map((part) => part + part).join('')
    : clean, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const rgbToHex = ({ r, g, b }) => {
  const toHex = (value) => {
    const hex = clamp(Math.round(value), 0, 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixChannel = (base, ink, strength) => Math.round(base + (ink - base) * strength);
const mixRgb = (from, to, amount) => ({
  r: mixChannel(from.r, to.r, amount),
  g: mixChannel(from.g, to.g, amount),
  b: mixChannel(from.b, to.b, amount)
});

const gradeSourceColour = (point) => {
  const average = (point.red + point.green + point.blue) * 0.3333333333;
  const saturation = 1.24;
  const contrast = 1.12;

  const r = clamp(Math.round((average + (point.red - average) * saturation - 128) * contrast + 128), 0, 255);
  const g = clamp(Math.round((average + (point.green - average) * saturation - 128) * contrast + 128), 0, 255);
  const b = clamp(Math.round((average + (point.blue - average) * saturation - 128) * contrast + 128), 0, 255);
  return { r, g, b };
};

const getGradientColour = (point, shadowRgb, midRgb, highlightRgb) => {
  const tone = clamp(point.luminance, 0, 1);
  if (tone < 0.54) return mixRgb(shadowRgb, midRgb, tone / 0.54);
  return mixRgb(midRgb, highlightRgb, (tone - 0.54) / 0.46);
};

const rgbStringCache = new Map();
const rgbToStr = (colour) => {
  const key = `${colour.r}|${colour.g}|${colour.b}`;
  let s = rgbStringCache.get(key);
  if (s === undefined) {
    s = `rgb(${colour.r} ${colour.g} ${colour.b})`;
    rgbStringCache.set(key, s);
  }
  return s;
};

const getMarkColour = (point, paper, ink, strength, colourCtx) => {
  if (state.colorMode === 'pure') return ink;
  const mixStrength = clamp(0.24 + strength * 0.76, 0, 1);

  if (state.colorMode === 'source' && point) {
    return mixRgb(paper, gradeSourceColour(point), mixStrength);
  }

  if (state.colorMode === 'gradient' && point) {
    const mapped = getGradientColour(point, colourCtx.shadowRgb, colourCtx.midRgb, colourCtx.highlightRgb);
    return mixRgb(paper, mapped, mixStrength);
  }

  return mixRgb(paper, ink, clamp(0.18 + strength * 0.82, 0, 1));
};

const buildColourCtx = () => ({
  shadowRgb: hexToRgb(state.shadowInk),
  midRgb: hexToRgb(state.midInk),
  highlightRgb: hexToRgb(state.highlightInk)
});

const paintBackgroundTexture = (width, height) => {
  if (state.transparent || !state.texture) return;

  const grid = Math.max(1, state.step);
  const mid = hexToRgb(state.midInk);
  context.save();
  context.lineWidth = 0.5;
  context.strokeStyle = `rgba(${mid.r}, ${mid.g}, ${mid.b}, 0.055)`;
  context.beginPath();

  for (let x = grid * 0.5; x < width; x += grid) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }

  for (let y = grid * 0.5; y < height; y += grid) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }

  context.stroke();
  context.fillStyle = `rgba(${mid.r}, ${mid.g}, ${mid.b}, 0.035)`;

  for (let y = grid * 0.5; y < height; y += grid) {
    for (let x = grid * 0.5; x < width; x += grid) {
      context.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  context.restore();
};
const isDynamicSource = (item) => item?.dynamic === true;
const hasDynamicSource = () => state.sources.some(isDynamicSource);

const setMediaPlayback = (playing) => {
  state.sources.forEach((item) => {
    if (item.kind === 'video') {
      if (playing) item.source.play().catch(() => {});
      else item.source.pause();
    } else if (item.kind === 'gif' && item.animator) {
      if (playing) item.animator.start();
      else item.animator.stop();
    }
  });
};

const ensureMediaStage = () => {
  if (mediaStage || !document.body) return mediaStage;

  mediaStage = document.createElement('div');
  mediaStage.setAttribute('aria-hidden', 'true');
  Object.assign(mediaStage.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none'
  });
  document.body.appendChild(mediaStage);
  return mediaStage;
};

const appendMediaElement = (element) => {
  const stage = ensureMediaStage();
  if (!stage || element.parentNode === stage) return;
  Object.assign(element.style, {
    width: '1px',
    height: '1px',
    opacity: '0'
  });
  stage.appendChild(element);
};

const clearObjectUrls = () => {
  state.sources.forEach((item) => {
    if (item.kind === 'gif') item.animator?.stop?.();
  });
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
  if (mediaStage) mediaStage.replaceChildren();
};

const DEMO_SOURCES = [
  { name: '蓝色大肥鱼.webp', src: 'assets/demo/DS.webp' }
];

const loadDemoImage = ({ name, src }) => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
    resolve({ source: image, name, kind: 'image', dynamic: false });
  }, { once: true });
  image.addEventListener('error', () => {
    reject(new Error(`Unable to load demo image: ${src}`));
  }, { once: true });
  image.src = src;
});

const loadDemoSources = async () => {
  try {
    state.sources = await Promise.all(DEMO_SOURCES.map(loadDemoImage));
    state.activeIndex = 0;
    state.animationStart = performance.now();
    state.pausedAt = 0;
    invalidatePointSets();
    updatePlayButton();
    renderMenu();
    setPanelDisabled(false);
    render();
    if (state.playing) requestRenderLoop();
  } catch (error) {
    console.warn(error);
    state.playing = false;
    updatePlayButton();
    if (caption) setCaption('默认样张加载失败，请上传素材。');
  }
};

const updateOutputs = () => {
  if (outputs.step) outputs.step.textContent = String(23 - state.step);
  if (outputs.scale) outputs.scale.textContent = state.scale.toFixed(2);
  if (outputs.sizeWeight) outputs.sizeWeight.textContent = state.sizeWeight.toFixed(2);
  if (outputs.markRotation) outputs.markRotation.textContent = `${state.markRotation}°`;
  if (outputs.rotation) outputs.rotation.textContent = `${state.rotation}°`;
  if (outputs.threshold) outputs.threshold.textContent = state.threshold.toFixed(2);
  if (outputs.contrast) outputs.contrast.textContent = state.contrast.toFixed(2);
  if (outputs.detail) outputs.detail.textContent = state.detail.toFixed(2);
  if (outputs.highlightDetail) outputs.highlightDetail.textContent = state.highlightDetail.toFixed(2);
  if (outputs.duration) outputs.duration.textContent = `${state.duration.toFixed(2)}s`;
  if (outputs.blank) outputs.blank.textContent = `${state.blank.toFixed(2)}s`;
  if (outputs.hold) outputs.hold.textContent = `${state.hold.toFixed(2)}s`;
  if (outputs.drift) outputs.drift.textContent = state.drift.toFixed(2);
};

const updatePlayButton = () => {
  if (!playButton) return;
  const label = state.playing ? '暂停预览' : '播放预览';
  playButton.setAttribute('aria-label', label);
  playButton.setAttribute('title', label);
  playButton.classList.toggle('playing', state.playing);
};

const removeSource = (idx) => {
  if (idx < 0 || idx >= state.sources.length) return;
  const removed = state.sources.splice(idx, 1)[0];
  const removedPs = state.pointSets.splice(idx, 1)[0];
  if (removed?.kind === 'gif') removed.animator?.stop?.();
  if (removed?.kind === 'video' && removed.source) {
    try { removed.source.pause?.(); } catch {}
    try { removed.source.remove?.(); } catch {}
  }
  if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
  if (removedPs?.objectUrls) removedPs.objectUrls.forEach((u) => URL.revokeObjectURL(u));

  if (state.sources.length === 0) {
    state.activeIndex = 0;
    state.playing = false;
    updatePlayButton();
  } else if (state.activeIndex >= state.sources.length) {
    state.activeIndex = state.sources.length - 1;
  } else if (state.activeIndex > idx) {
    state.activeIndex -= 1;
  }

  invalidatePointSets();
  renderMenu();
  render();
};

const renderMenu = () => {
  if (!menuList || !menuCount) return;
  const count = state.sources.length;
  menuCount.textContent = count;

  const dragOver = menuList.dataset.dragOver;
  const dragOverIdx = dragOver ? Number.parseInt(dragOver, 10) : -1;

  menuList.innerHTML = '';
  menuList.dataset.empty = '暂无素材';

  if (count === 0) {
    menuFoot?.setAttribute('hidden', '');
    return;
  }

  menuFoot?.removeAttribute('hidden');

  state.sources.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'popover-item' + (idx === state.activeIndex ? ' is-active' : '');
    li.setAttribute('role', 'menuitem');
    li.draggable = true;
    li.dataset.index = String(idx);
    if (idx === dragOverIdx) li.classList.add('is-drop-target');

    const thumb = document.createElement('div');
    thumb.className = 'popover-thumb';
    const src = item.source?.src || '';
    if (src) thumb.style.backgroundImage = `url("${src}")`;

    const meta = document.createElement('div');
    meta.className = 'popover-meta';
    const name = document.createElement('span');
    name.className = 'popover-name';
    name.textContent = item.name || `素材 ${idx + 1}`;
    const sub = document.createElement('span');
    sub.className = 'popover-sub';
    const kindLabel = item.kind === 'video' ? '视频' : item.kind === 'gif' ? 'GIF' : '图片';
    const kindTag = document.createElement('span');
    kindTag.className = `popover-kind popover-kind--${item.kind === 'video' ? 'video' : item.kind === 'gif' ? 'gif' : 'image'}`;
    kindTag.textContent = kindLabel;
    sub.appendChild(kindTag);
    const dims = item.source?.naturalWidth ? `${item.source.naturalWidth}×${item.source.naturalHeight}` : '';
    if (dims) {
      const dimSpan = document.createElement('span');
      dimSpan.className = 'popover-dims';
      dimSpan.textContent = dims;
      sub.appendChild(dimSpan);
    }
    meta.append(name, sub);

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'popover-delete-btn';
    handle.setAttribute('aria-label', `删除 ${item.name}`);
    handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21q.512.078 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48 48 0 0 0-3.478-.397m-12 .562q.51-.088 1.022-.165m0 0a48 48 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a52 52 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a49 49 0 0 0-7.5 0"/></svg>';
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      removeSource(idx);
    });

    li.append(thumb, meta, handle);
    li.addEventListener('click', () => {
      if (state.activeIndex !== idx) {
        state.activeIndex = idx;
        state.animationStart = performance.now();
        invalidatePointSets();
        render();
        renderMenu();
      }
      closeMenu();
    });

    li.addEventListener('dragstart', (e) => {
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      menuList.dataset.dragOver = '';
      const items = menuList.querySelectorAll('.popover-item');
      items.forEach((el) => el.classList.remove('is-drop-target'));
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (menuList.dataset.dragOver !== String(idx)) {
        menuList.dataset.dragOver = String(idx);
        const items = menuList.querySelectorAll('.popover-item');
        items.forEach((el, i) => el.classList.toggle('is-drop-target', i === idx));
      }
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = idx;
      if (Number.isNaN(fromIdx) || fromIdx === toIdx) return;

      const [moved] = state.sources.splice(fromIdx, 1);
      state.sources.splice(toIdx, 0, moved);

      if (state.activeIndex === fromIdx) {
        state.activeIndex = toIdx;
      } else if (fromIdx < state.activeIndex && toIdx >= state.activeIndex) {
        state.activeIndex -= 1;
      } else if (fromIdx > state.activeIndex && toIdx <= state.activeIndex) {
        state.activeIndex += 1;
      }

      invalidatePointSets();
      render();
      renderMenu();
    });

    menuList.appendChild(li);
  });
};

const openMenu = () => {
  if (!menuPopover || !menuToggle) return;
  renderMenu();
  menuPopover.removeAttribute('hidden');
  menuPopover.classList.remove('is-closing');
  requestAnimationFrame(() => menuPopover.classList.add('is-open'));
  menuToggle.setAttribute('aria-expanded', 'true');
};

const closeMenu = () => {
  if (!menuPopover || !menuToggle) return;
  menuPopover.classList.remove('is-open');
  menuPopover.classList.add('is-closing');
  const onEnd = () => {
    menuPopover.removeEventListener('transitionend', onEnd);
    if (!menuPopover.classList.contains('is-open')) {
      menuPopover.setAttribute('hidden', '');
      menuPopover.classList.remove('is-closing');
    }
  };
  menuPopover.addEventListener('transitionend', onEnd);
  menuToggle.setAttribute('aria-expanded', 'false');
};

const toggleMenu = () => {
  if (!menuPopover) return;
  if (menuPopover.hasAttribute('hidden')) openMenu();
  else closeMenu();
};

const controlPanel = document.querySelector('[data-panel]');

const setPanelDisabled = (disabled) => {
  if (!controlPanel) return;
  controlPanel.classList.toggle('is-disabled', disabled);
  controlPanel.querySelectorAll('button, input, select, textarea').forEach((el) => {
    if (el.closest('.popover-list')) return;
    el.disabled = disabled;
  });
  if (!disabled && typeof updateSwatchAvailability === 'function') {
    updateSwatchAvailability();
  }
};

const showConfirm = (message) => new Promise((resolve) => {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true">
      <div class="confirm-title">确认</div>
      <div class="confirm-body">${message}</div>
      <div class="confirm-actions">
        <button type="button" class="btn btn-ghost" data-cancel>取消</button>
        <button type="button" class="btn btn-primary" data-ok>确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  const ok = overlay.querySelector('[data-ok]');
  const cancel = overlay.querySelector('[data-cancel]');
  const cleanup = (result) => {
    overlay.classList.remove('is-visible');
    setTimeout(() => { overlay.remove(); resolve(result); }, 300);
  };
  ok.addEventListener('click', () => cleanup(true));
  cancel.addEventListener('click', () => cleanup(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
});

const APP_VERSION = '1.0.1-81741';

const showAbout = () => {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay is-about';
  overlay.innerHTML = `
    <div class="confirm-dialog about-dialog" role="dialog" aria-modal="true">
      <button type="button" class="about-close" data-about-close aria-label="关闭">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
      </button>
      <div class="about-header">
        <div class="about-logo" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 200 200" fill="currentColor"><g><circle cx="15.85" cy="23.69" r="13.07"/><circle cx="15.85" cy="50.29" r="11.9"/><circle cx="15.85" cy="76.89" r="10.74"/><circle cx="15.85" cy="103.49" r="9.58"/><circle cx="15.85" cy="130.09" r="8.41"/><circle cx="15.85" cy="156.69" r="7.25"/><circle cx="15.85" cy="183.29" r="6.09"/></g><g><circle cx="49.51" cy="23.69" r="13.07"/><circle cx="49.51" cy="50.29" r="11.9"/><circle cx="49.51" cy="76.89" r="10.74"/><circle cx="49.51" cy="103.49" r="9.58"/><circle cx="49.51" cy="130.09" r="8.41"/><circle cx="49.51" cy="156.69" r="7.25"/><circle cx="49.51" cy="183.29" r="6.09"/></g><g><circle cx="83.17" cy="23.69" r="13.07"/><circle cx="83.17" cy="50.29" r="11.9"/><circle cx="83.17" cy="76.89" r="10.74"/><circle cx="83.17" cy="103.49" r="9.58"/><circle cx="83.17" cy="130.09" r="8.41"/><circle cx="83.17" cy="156.69" r="7.25"/><circle cx="83.17" cy="183.29" r="6.09"/></g><g><circle cx="116.83" cy="23.69" r="13.07"/><circle cx="116.83" cy="50.29" r="11.9"/><circle cx="116.83" cy="76.89" r="10.74"/><circle cx="116.83" cy="103.49" r="9.58"/><circle cx="116.83" cy="130.09" r="8.41"/><circle cx="116.83" cy="156.69" r="7.25"/><circle cx="116.83" cy="183.29" r="6.09"/></g><g><circle cx="150.49" cy="23.69" r="13.07"/><circle cx="150.49" cy="50.29" r="11.9"/><circle cx="150.49" cy="76.89" r="10.74"/><circle cx="150.49" cy="103.49" r="9.58"/><circle cx="150.49" cy="130.09" r="8.41"/><circle cx="150.49" cy="156.69" r="7.25"/><circle cx="150.49" cy="183.29" r="6.09"/></g><g><circle cx="184.15" cy="23.69" r="13.07"/><circle cx="184.15" cy="50.29" r="11.9"/><circle cx="184.15" cy="76.89" r="10.74"/><circle cx="184.15" cy="103.49" r="9.58"/><circle cx="184.15" cy="130.09" r="8.41"/><circle cx="184.15" cy="156.69" r="7.25"/><circle cx="184.15" cy="183.29" r="6.09"/></g></svg>
        </div>
        <div class="about-text">
          <div class="about-name">半调工厂</div>
          <div class="about-en">Halftone Factory</div>
          <div class="about-version">版本：${APP_VERSION}</div>
        </div>
      </div>
      <div class="confirm-actions">
        <button type="button" class="btn btn-primary" data-about-done>完成</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  const close = () => {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.querySelector('[data-about-close]').addEventListener('click', close);
  overlay.querySelector('[data-about-done]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
};

const clearCanvas = () => {
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
};

const getFit = (source, width, height) => {
  const sourceRatio = getSourceWidth(source) / getSourceHeight(source);
  const targetRatio = width / height;
  const drawWidth = sourceRatio > targetRatio ? width : height * sourceRatio;
  const drawHeight = sourceRatio > targetRatio ? width / sourceRatio : height;

  return {
    x: (width - drawWidth) * 0.5,
    y: (height - drawHeight) * 0.5,
    width: drawWidth,
    height: drawHeight
  };
};

const getPointSetSignature = (width, height) => [
  width,
  height,
  state.step,
  state.rotation,
  state.threshold,
  state.contrast,
  state.detail,
  state.invert,
  state.pathStyle,
  state.sources.map((item) => item.name).join('|')
].join(':');

const getPointOrder = ({ x, y, column, row, width, height, centerX, centerY }) => {
  const normalizedX = x / Math.max(1, width);
  const normalizedY = y / Math.max(1, height);
  const radius = Math.hypot((x - centerX) / width, (y - centerY) / height);
  const angle = Math.atan2(y - centerY, x - centerX);
  const random = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;

  if (state.pathStyle === 'horizontal') return normalizedX * 100000 + normalizedY * 600;
  if (state.pathStyle === 'vertical') return normalizedY * 100000 + normalizedX * 600;
  if (state.pathStyle === 'diagonal') return (normalizedX + normalizedY) * 100000 + (normalizedY - normalizedX) * 900;
  if (state.pathStyle === 'random') return (random - Math.floor(random)) * 100000;
  return Math.round(radius * 260) * 10000 + Math.round((angle + Math.PI) * 1000);
};

const buildPointSet = (source, width, height) => {
  const step = state.step;
  const columns = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const points = [];

  sampleCanvas.width = columns;
  sampleCanvas.height = rows;
  sampleContext.clearRect(0, 0, columns, rows);
  sampleContext.imageSmoothingEnabled = true;
  sampleContext.imageSmoothingQuality = 'high';

  const fit = getFit(source, columns, rows);
  sampleContext.drawImage(source, fit.x, fit.y, fit.width, fit.height);

  const pixels = sampleContext.getImageData(0, 0, columns, rows).data;

  const rotRad = state.rotation * Math.PI / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const gx = column * step + step * 0.5;
      const gy = row * step + step * 0.5;

      let ox = gx;
      let oy = gy;
      if (state.rotation) {
        const dx = gx - centerX;
        const dy = gy - centerY;
        ox = dx * cosR - dy * sinR + centerX;
        oy = dx * sinR + dy * cosR + centerY;
      }

      const sc = Math.round(ox / step);
      const sr = Math.round(oy / step);
      if (sc < 0 || sc >= columns || sr < 0 || sr >= rows) continue;

      const index = (sr * columns + sc) * 4;
      const alpha = pixels[index + 3] / 255;
      if (alpha <= 0.01) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const tone = state.invert ? luminance : 1 - luminance;
      const softThreshold = state.threshold * (1 - state.detail);
      const rawStrength = (tone - softThreshold) * state.contrast + softThreshold;
      const knee = 0.5;
      let strength;
      if (rawStrength <= knee) {
        const h = state.highlightDetail;
        const t = clamp(rawStrength / knee, 0, 1);
        strength = knee * Math.pow(t, 1 - h * 0.7);
      } else {
        strength = rawStrength;
      }
      strength = clamp(strength, 0, 1) * alpha;
      if (strength <= 0.025 * (1 - state.detail * 0.85)) continue;

      points.push({
        x: ox,
        y: oy,
        red,
        green,
        blue,
        luminance,
        strength,
        seed: (column * 12.9898 + row * 78.233) % 6.283,
        order: getPointOrder({ x: ox, y: oy, column, row, width, height, centerX, centerY })
      });
    }
  }

  return points.sort((a, b) => a.order - b.order).map((point, index, list) => ({
    ...point,
    phase: list.length <= 1 ? 0 : index / (list.length - 1)
  }));
};

const rebuildPointSets = (width, height) => {
  const signature = getPointSetSignature(width, height);
  if (hasDynamicSource()) {
    state.pointSets = state.sources.map((item) => buildPointSet(item.source, width, height));
    state.pointSetSignature = '';
    return;
  }

  if (state.pointSetSignature === signature && state.pointSets.length === state.sources.length) return;
  state.pointSets = state.sources.map((item) => buildPointSet(item.source, width, height));
  state.pointSetSignature = signature;
};

const invalidatePointSets = () => {
  state.pointSetSignature = '';
};

const easeInOut = (value) => {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};

const getMorphState = (timestamp) => {
  const count = state.sources.length;
  if (!state.morph || count < 2) return { fromIndex: state.activeIndex, toIndex: state.activeIndex, progress: 0, phase: 'still' };

  const duration = Math.max(80, state.duration * 1000);
  const hold = Math.max(0, state.hold * 1000);
  const blank = Math.max(0, state.blank * 1000);
  const isDissolve = state.transition === 'dissolve';
  const segment = isDissolve ? hold + duration + blank + duration : duration + hold;
  const elapsed = Math.max(0, timestamp - state.animationStart);
  const segmentIndex = Math.floor(elapsed / segment);
  const local = elapsed % segment;
  const fromIndex = (state.activeIndex + segmentIndex) % count;
  const toIndex = (fromIndex + 1) % count;

  if (isDissolve) {
    if (local < hold) return { fromIndex, toIndex, progress: 0, phase: 'hold' };
    const transitionLocal = local - hold;
    if (transitionLocal < duration) {
      return { fromIndex, toIndex, progress: easeInOut(transitionLocal / duration), phase: 'fadeOut' };
    }
    if (transitionLocal < duration + blank) {
      return { fromIndex, toIndex, progress: 1, phase: 'blank' };
    }

    return {
      fromIndex,
      toIndex,
      progress: easeInOut((transitionLocal - duration - blank) / duration),
      phase: 'fadeIn'
    };
  }

  const rawProgress = local < hold ? 0 : (local - hold) / duration;

  return {
    fromIndex,
    toIndex,
    progress: easeInOut(rawProgress),
    phase: local < hold ? 'hold' : 'path'
  };
};

const drawPointSet = (points, paper, ink, timestamp, visibility = 1, moving = false, colourCtx) => {
  const baseRadius = state.step * 0.5 * state.scale;
  const driftAmount = moving ? state.drift : 0;
  const shape = state.shape;
  const allowTransparency = state.allowTransparency;
  const batches = new Map();
  const CHUNK = 20000;
  const markRad = state.markRotation * Math.PI / 180;
  const markCos = Math.cos(markRad);
  const markSin = Math.sin(markRad);
  const hasMarkRot = state.markRotation !== 0;

  for (let i = 0, len = points.length; i < len; i += 1) {
    const point = points[i];
    const visibleStrength = point.strength * clamp(visibility, 0, 1);
    if (visibleStrength <= 0.018) continue;

    const visSqrt = Math.sqrt(clamp(visibility, 0, 1));
    const radius = Math.max(0.05, baseRadius * (1 - state.sizeWeight + visibleStrength * state.sizeWeight) * visSqrt);
    let x = point.x;
    let y = point.y;

    if (driftAmount) {
      const tick = timestamp;
      const seed = point.seed;
      x += driftAmount * state.step * 0.7 * Math.sin(tick * 0.003 + seed);
      y += driftAmount * state.step * 0.45 * Math.cos(tick * 0.0027 + seed * 1.7);
    }

    const colour = getMarkColour(point, paper, ink, point.strength, colourCtx);
    const QR = (colour.r >> 5) * 32;
    const QG = (colour.g >> 5) * 32;
    const QB = (colour.b >> 5) * 32;
    const fillStr = `rgb(${QR} ${QG} ${QB})`;
    const alpha = allowTransparency
      ? clamp(0.18 + point.strength * 0.92, 0, 1) * clamp(visibility, 0, 1)
      : 1;
    const alphaBucket = Math.round(alpha * 20) / 20;

    let extra = '';
    if (shape !== 'dot' && shape !== 'square') {
      extra = `|w${Math.round(Math.max(1, radius * (shape === 'slash' ? 0.88 : shape === 'plus' ? 0.66 : 0.44)) * 10)}`;
    }
    const batchKey = fillStr + '|' + alphaBucket + extra;

    let batch = batches.get(batchKey);
    if (!batch) {
      batch = { paths: [new Path2D()], fillStr, alpha: alphaBucket, lineWidth: extra ? Number.parseFloat(extra.slice(2)) / 10 : 0, count: 0 };
      batches.set(batchKey, batch);
    }

    if (batch.count > 0 && batch.count % CHUNK === 0) {
      batch.paths.push(new Path2D());
    }
    const path = batch.paths[batch.paths.length - 1];
    batch.count++;

    if (shape === 'dot') {
      path.moveTo(x + radius, y);
      path.arc(x, y, radius, 0, Math.PI * 2);
    } else if (shape === 'square') {
      if (hasMarkRot) {
        const k = radius * 0.91;
        const a = markCos * k;
        const b = markSin * k;
        path.moveTo(x - a - b, y - b + a);
        path.lineTo(x + a - b, y + b + a);
        path.lineTo(x + a + b, y + b - a);
        path.lineTo(x - a + b, y - b - a);
      } else {
        const size = radius * 1.82;
        path.rect(x - size * 0.5, y - size * 0.5, size, size);
      }
    } else if (shape === 'slash') {
      if (hasMarkRot) {
        const k = radius * (markSin - markCos);
        const m = radius * (markSin + markCos);
        path.moveTo(x + k, y - m);
        path.lineTo(x - k, y + m);
      } else {
        path.moveTo(x - radius, y - radius);
        path.lineTo(x + radius, y + radius);
      }
    } else if (shape === 'plus') {
      if (hasMarkRot) {
        const hx = radius * markCos;
        const hy = radius * markSin;
        path.moveTo(x - hx, y - hy);
        path.lineTo(x + hx, y + hy);
        path.moveTo(x + hy, y - hx);
        path.lineTo(x - hy, y + hx);
      } else {
        path.moveTo(x - radius, y);
        path.lineTo(x + radius, y);
        path.moveTo(x, y - radius);
        path.lineTo(x, y + radius);
      }
    } else {
      if (hasMarkRot) {
        const k = radius * (markSin - markCos);
        const m = radius * (markSin + markCos);
        path.moveTo(x + k, y - m);
        path.lineTo(x - k, y + m);
        path.moveTo(x - m, y - k);
        path.lineTo(x + m, y + k);
      } else {
        path.moveTo(x - radius, y - radius);
        path.lineTo(x + radius, y + radius);
        path.moveTo(x + radius, y - radius);
        path.lineTo(x - radius, y + radius);
      }
    }
  }

  for (const batch of batches.values()) {
    context.fillStyle = batch.fillStr;
    context.strokeStyle = batch.fillStr;
    context.globalAlpha = batch.alpha;

    if (shape === 'dot' || shape === 'square') {
      for (const p of batch.paths) context.fill(p);
    } else {
      context.lineWidth = Math.max(1, batch.lineWidth);
      if (shape === 'plus') context.lineCap = 'butt';
      for (const p of batch.paths) context.stroke(p);
      if (shape === 'plus') context.lineCap = 'round';
    }
  }
};

const drawDissolve = (morph, paper, ink, timestamp, colourCtx) => {
  const fromPoints = state.pointSets[morph.fromIndex] || [];
  const toPoints = state.pointSets[morph.toIndex] || [];

  if (morph.phase === 'blank') return;
  if (morph.phase === 'fadeIn') {
    drawPointSet(toPoints, paper, ink, timestamp, morph.progress, false, colourCtx);
    return;
  }

  const visibility = morph.phase === 'fadeOut' ? 1 - morph.progress : 1;
  drawPointSet(fromPoints, paper, ink, timestamp, visibility, false, colourCtx);
};

const drawMorph = (morph, paper, ink, timestamp, colourCtx) => {
  const fromPoints = state.pointSets[morph.fromIndex] || [];
  const toPoints = state.pointSets[morph.toIndex] || [];
  const count = Math.max(fromPoints.length, toPoints.length);
  const stagger = state.pathStyle === 'random' ? 0.5 : 0.38;
  const morphed = new Array(count);

  for (let index = 0; index < count; index += 1) {
    const fallback = toPoints[index] || fromPoints[index] || { x: 0, y: 0, strength: 0, seed: index * 0.017 };
    const from = fromPoints[index] || { ...fallback, strength: 0 };
    const to = toPoints[index] || { ...fallback, strength: 0 };
    const phase = from.phase ?? to.phase ?? (count <= 1 ? 0 : index / (count - 1));
    const localProgress = easeInOut(clamp((morph.progress - phase * stagger) / (1 - stagger), 0, 1));
    const arc = Math.sin(localProgress * Math.PI) * state.step * state.drift;
    const seed = from.seed || to.seed || index * 0.017;
    const strength = lerp(from.strength, to.strength, localProgress);

    morphed[index] = {
      x: lerp(from.x, to.x, localProgress) + Math.cos(seed) * arc,
      y: lerp(from.y, to.y, localProgress) + Math.sin(seed) * arc,
      strength,
      seed,
      red: lerp(from.red ?? fallback.red ?? 0, to.red ?? fallback.red ?? 0, localProgress),
      green: lerp(from.green ?? fallback.green ?? 0, to.green ?? fallback.green ?? 0, localProgress),
      blue: lerp(from.blue ?? fallback.blue ?? 0, to.blue ?? fallback.blue ?? 0, localProgress),
      luminance: lerp(from.luminance ?? fallback.luminance ?? strength, to.luminance ?? fallback.luminance ?? strength, localProgress)
    };
  }

  drawPointSet(morphed, paper, ink, timestamp, 1, false, colourCtx);
};

const applyView = () => {
  if (!canvas) return;
  canvas.style.transformOrigin = '0 0';
  canvas.style.transform = `translate(${state.viewX}px, ${state.viewY}px) scale(${state.viewScale})`;
  const renderScale = state.vectorZoom ? state.viewScale : 1;
  if (state.canvasScale !== renderScale) {
    state.canvasScale = renderScale;
    render();
  }
  updateStatusbar();
};

const updateStatusbar = () => {
  if (zoomLabel) zoomLabel.textContent = `${Math.round(state.viewScale * 100)}%`;
  if (sizeLabel && canvas) sizeLabel.textContent = `${canvas.offsetWidth} × ${canvas.offsetHeight}px`;
};

const resetView = () => {
  state.viewScale = 1;
  state.viewX = 0;
  state.viewY = 0;
  state.viewResetToken += 1;
  applyView();
};

const buildRenderSignature = (width, height, totalRatio) => {
  const morph = state.morph && state.sources.length > 1;
  return [
    width, height, totalRatio,
    state.activeIndex,
    state.shape, state.colorMode, state.pathStyle, state.transition,
    state.step, state.scale, state.threshold, state.contrast,
    state.detail, state.highlightDetail, state.invert,
    state.paper, state.ink, state.shadowInk, state.midInk, state.highlightInk,
    state.allowTransparency, state.texture, state.transparent,
    state.viewX.toFixed(1), state.viewY.toFixed(1), state.viewScale.toFixed(2),
    morph ? 'morph' : (state.drift > 0.001 ? 'drift' : 'static'),
    state.sources.map((s) => s.name).join('|')
  ].join(':');
};

const render = () => {
  if (!canvas || !context || state.sources.length === 0) return;

  const width = Math.max(320, Math.round(canvas.offsetWidth || 960));
  const height = Math.max(320, Math.round(canvas.offsetHeight || 640));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const timestamp = state.playing ? performance.now() : state.pausedAt || performance.now();
  const sampleScale = Math.max(1, state.canvasScale || 1);
  const totalRatio = pixelRatio * sampleScale;
  const deviceWidth = Math.round(width * totalRatio);
  const deviceHeight = Math.round(height * totalRatio);

  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth;
    canvas.height = deviceHeight;
  }

  applyView();
  context.setTransform(totalRatio, 0, 0, totalRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const isAnimated = state.morph && state.sources.length > 1
    || state.drift > 0.001
    || hasDynamicSource();
  const sig = buildRenderSignature(width, height, totalRatio);

  if (!isAnimated && renderCache.signature === sig) {
    context.drawImage(renderCache.canvas, 0, 0, width, height);
    updateOutputs();
    if (caption) {
      const fromName = state.sources[state.activeIndex]?.name || '素材';
      const activePoints = state.pointSets[state.activeIndex]?.length || 0;
      const shapeLabel = { dot: '圆点', cross: '叉号', square: '方块', slash: '斜线', plus: '加号' }[state.shape] || state.shape;
      setCaption(state.exportStatus || `${fromName} / ${shapeLabel} / ${activePoints} 粒`);
    }
    return;
  }

  const paper = hexToRgb(state.paper);
  const ink = hexToRgb(state.ink);
  const colourCtx = buildColourCtx();

  if (!state.transparent) {
    context.fillStyle = state.paper;
    context.fillRect(0, 0, width, height);
  }

  paintBackgroundTexture(width, height);

  context.lineCap = 'round';
  context.lineJoin = 'round';
  rebuildPointSets(width, height);

  const morph = getMorphState(timestamp);
  if (state.morph && state.sources.length > 1 && state.transition === 'dissolve') {
    drawDissolve(morph, paper, ink, timestamp, colourCtx);
  } else if (state.morph && state.sources.length > 1) {
    drawMorph(morph, paper, ink, timestamp, colourCtx);
  } else {
    drawPointSet(state.pointSets[state.activeIndex] || [], paper, ink, timestamp, 1, false, colourCtx);
  }

  context.globalAlpha = 1;

  if (!isAnimated) {
    if (!renderCache.canvas || renderCache.width !== width || renderCache.height !== height || renderCache.totalRatio !== totalRatio) {
      renderCache.canvas = document.createElement('canvas');
      renderCache.canvas.width = deviceWidth;
      renderCache.canvas.height = deviceHeight;
      renderCache.ctx = renderCache.canvas.getContext('2d');
      renderCache.width = width;
      renderCache.height = height;
      renderCache.totalRatio = totalRatio;
    }
    renderCache.ctx.setTransform(totalRatio, 0, 0, totalRatio, 0, 0);
    renderCache.ctx.clearRect(0, 0, width, height);
    renderCache.ctx.drawImage(canvas, 0, 0, width, height, 0, 0, width, height);
    renderCache.signature = sig;
  }

  updateOutputs();

  if (caption) {
    if (state.exportStatus) {
      setCaption(state.exportStatus);
      return;
    }

    const displayIndex = state.morph && state.sources.length > 1 ? morph.fromIndex : state.activeIndex;
    const fromName = state.sources[displayIndex]?.name || '素材';
    const toName = state.morph && state.sources.length > 1 ? state.sources[morph.toIndex]?.name || fromName : fromName;
    const activePoints = state.pointSets[displayIndex]?.length || 0;
    const mediaMode = hasDynamicSource() ? '动态' : '静态';
    const shapeLabel = { dot: '圆点', cross: '叉号', square: '方块', slash: '斜线', plus: '加号' }[state.shape] || state.shape;
    setCaption(state.morph && state.sources.length > 1
      ? `${fromName} → ${toName} / ${mediaMode} / ${activePoints} 粒`
      : `${fromName} / ${shapeLabel} / ${mediaMode} / ${activePoints} 粒`);
  }
};

const requestRenderLoop = () => {
  if (state.frameId) return;

  const tick = () => {
    render();
    state.frameId = state.playing ? window.requestAnimationFrame(tick) : 0;
  };

  state.frameId = window.requestAnimationFrame(tick);
};

const isGifFile = (file) => file?.type === 'image/gif' || file?.name?.toLowerCase().endsWith('.gif');
const isImageFile = (file) => file?.type.startsWith('image/') || /\.(gif|png|jpe?g|webp|avif)$/i.test(file?.name || '');
const isVideoFile = (file) => file?.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file?.name || '');

const loadGifler = () => {
  if (window.gifler) return Promise.resolve(window.gifler);
  if (giflerLoader) return giflerLoader;

  giflerLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIFLER_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.gifler) resolve(window.gifler);
      else reject(new Error('GIF player unavailable'));
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('GIF player failed to load')), { once: true });
    document.head.appendChild(script);
  });

  return giflerLoader;
};

const loadGifFile = (file) => new Promise((resolve) => {
  if (!file || !isGifFile(file)) {
    resolve(null);
    return;
  }

  const url = URL.createObjectURL(file);
  state.objectUrls.push(url);

  loadGifler()
    .then((gifler) => {
      gifler(url).get((animator) => {
        const gifCanvas = document.createElement('canvas');
        gifCanvas.width = animator.width || 1;
        gifCanvas.height = animator.height || 1;
        appendMediaElement(gifCanvas);
        animator.animateInCanvas(gifCanvas);
        resolve({
          source: gifCanvas,
          name: file.name,
          kind: 'gif',
          dynamic: true,
          animator
        });
      });
    })
    .catch(() => resolve(null));
});

const loadImageFile = (file) => new Promise((resolve) => {
  if (!file || !isImageFile(file)) {
    resolve(null);
    return;
  }

  const url = URL.createObjectURL(file);
  state.objectUrls.push(url);

  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => {
    resolve({
      source: image,
      name: file.name,
      kind: 'image',
      dynamic: false
    });
  }, { once: true });
  image.addEventListener('error', () => resolve(null), { once: true });
  image.src = url;
});

const loadVideoFile = (file) => new Promise((resolve) => {
  if (!file || !isVideoFile(file)) {
    resolve(null);
    return;
  }

  const url = URL.createObjectURL(file);
  state.objectUrls.push(url);
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  video.addEventListener('loadeddata', () => {
    appendMediaElement(video);
    video.play().catch(() => {});
    resolve({
      source: video,
      name: file.name,
      kind: 'video',
      dynamic: true
    });
  }, { once: true });

  video.addEventListener('error', () => resolve(null), { once: true });
});

const loadMediaFile = (file) => {
  if (isVideoFile(file)) return loadVideoFile(file);
  if (isGifFile(file)) return loadGifFile(file);
  return loadImageFile(file);
};

const loadMediaFiles = async (files) => {
  const mediaFiles = Array.from(files || [])
    .filter((file) => isImageFile(file) || isVideoFile(file));
  if (mediaFiles.length === 0) return;

  const loaded = (await Promise.all(mediaFiles.map(loadMediaFile))).filter(Boolean);
  if (loaded.length === 0) return;

  state.sources.unshift(...loaded);
  state.activeIndex = 0;
  state.animationStart = performance.now();
  state.pausedAt = 0;
  state.playing = state.sources.length > 1 || state.sources.some(isDynamicSource);
  setMediaPlayback(state.playing);
  updatePlayButton();
  renderMenu();
  setPanelDisabled(false);
  invalidatePointSets();
  render();
  if (state.playing) requestRenderLoop();
};

const EXPORT_HIGHLIGHT_KEYWORDS = ['GIF', 'WebM', '录制', '编码', '采样'];

const setCaption = (message) => {
  if (!caption) return;
  caption.textContent = message;
  const shouldHighlight = EXPORT_HIGHLIGHT_KEYWORDS.some((kw) => message.includes(kw));
  caption.classList.toggle('is-exporting', shouldHighlight);
};

const setExportStatus = (message) => {
  state.exportStatus = message;
  setCaption(message);
};

const clearExportStatusSoon = (message = '') => {
  const finalMessage = message || state.exportStatus;
  window.setTimeout(() => {
    if (state.exportStatus === finalMessage) {
      state.exportStatus = '';
      render();
    }
  }, 1400);
};

const setButtonBusy = (button, busy, label = '') => {
  if (!button) return;
  const main = button.querySelector('.btn-main');
  if (busy) {
    if (!button.dataset.idleText) {
      button.dataset.idleText = main?.textContent || '';
    }
    button.classList.add('is-busy');
    button.disabled = false;
    if (main && label) main.textContent = label;
  } else {
    button.classList.remove('is-busy');
    button.disabled = false;
    if (main && button.dataset.idleText) main.textContent = button.dataset.idleText;
  }
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
};

const getExportDurationMs = () => {
  if (state.morph && state.sources.length > 1) {
    const duration = Math.max(80, state.duration * 1000);
    const hold = Math.max(0, state.hold * 1000);
    const blank = Math.max(0, state.blank * 1000);
    const segment = state.transition === 'dissolve'
      ? hold + duration + blank + duration
      : duration + hold;
    return clamp(segment * state.sources.length, 2200, EXPORT_MAX_MS);
  }

  const videoDurations = state.sources
    .filter((item) => item.kind === 'video' && Number.isFinite(item.source.duration))
    .map((item) => item.source.duration * 1000);

  if (videoDurations.length > 0) return clamp(Math.max(...videoDurations), 2200, EXPORT_MAX_MS);
  if (hasDynamicSource()) return 6000;
  return 3000;
};

const beginExportPlayback = () => {
  const snapshot = {
    playing: state.playing,
    pausedAt: state.pausedAt,
    animationStart: state.animationStart
  };

  if (!state.playing) {
    const resumeFrom = state.pausedAt || performance.now();
    state.animationStart += performance.now() - resumeFrom;
    state.pausedAt = 0;
    state.playing = true;
    setMediaPlayback(true);
    updatePlayButton();
    requestRenderLoop();
  }

  return snapshot;
};

const restoreExportPlayback = (snapshot) => {
  if (!snapshot || snapshot.playing) return;
  state.playing = false;
  state.pausedAt = snapshot.pausedAt;
  state.animationStart = snapshot.animationStart;
  setMediaPlayback(false);
  updatePlayButton();
  render();
};

const getSupportedWebmType = () => {
  if (!window.MediaRecorder) return '';
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const exportWebm = async () => {
  if (!canvas?.captureStream || !window.MediaRecorder) {
    setExportStatus('当前浏览器不支持 WebM 录制。');
    clearExportStatusSoon('当前浏览器不支持 WebM 录制。');
    return;
  }

  const mimeType = getSupportedWebmType();
  if (!mimeType) {
    setExportStatus('当前浏览器没有可用的 WebM 编码器。');
    clearExportStatusSoon('当前浏览器没有可用的 WebM 编码器。');
    return;
  }

  if (downloadWebmButton?.classList.contains('is-busy')) {
    webmAbort = true;
    return;
  }

  webmAbort = false;
  setButtonBusy(downloadWebmButton, true, '录制中...');
  const duration = getExportDurationMs();
  const snapshot = beginExportPlayback();
  setExportStatus(`正在录制 WebM，约 ${(duration / 1000).toFixed(1)} 秒...`);
  render();

  let recorder = null;
  let stream = null;

  try {
    stream = canvas.captureStream(EXPORT_WEBM_FPS);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType });
    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.addEventListener('error', () => reject(recorder.error), { once: true });
    });

    recorder.start(250);
    const deadline = Date.now() + duration;
    while (!webmAbort && Date.now() < deadline) {
      await wait(100);
    }
    if (webmAbort) {
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      setExportStatus('录制已取消。');
      clearExportStatusSoon('录制已取消。');
      restoreExportPlayback(snapshot);
      setButtonBusy(downloadWebmButton, false);
      return;
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    if (chunks.length === 0) throw new Error('empty recording');
    downloadBlob(new Blob(chunks, { type: mimeType }), `半调-${state.shape}.webm`);
    setExportStatus('WebM 已生成并开始下载。');
    clearExportStatusSoon('WebM 已生成并开始下载。');
  } catch (error) {
    setExportStatus('WebM 导出失败，请换 Chrome / Edge 再试。');
    clearExportStatusSoon('WebM 导出失败，请换 Chrome / Edge 再试。');
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch {} }
    if (stream) stream.getTracks().forEach((track) => track.stop());
  } finally {
    restoreExportPlayback(snapshot);
    setButtonBusy(downloadWebmButton, false);
  }
};

const ensureGifWorkerScript = async () => {
  if (gifWorkerScriptUrl) return gifWorkerScriptUrl;
  const workerSource = await fetch(GIF_WORKER_URL).then((response) => {
    if (!response.ok) throw new Error('GIF worker unavailable');
    return response.text();
  });
  gifWorkerScriptUrl = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }));
  return gifWorkerScriptUrl;
};

const loadGifEncoder = () => {
  if (window.GIF) return ensureGifWorkerScript().then(() => window.GIF);
  if (gifEncoderLoader) return gifEncoderLoader;

  gifEncoderLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIF_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', async () => {
      try {
        if (!window.GIF) throw new Error('GIF encoder unavailable');
        await ensureGifWorkerScript();
        resolve(window.GIF);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('GIF encoder failed to load')), { once: true });
    document.head.appendChild(script);
  });

  return gifEncoderLoader;
};

const exportGif = async () => {
  if (downloadGifButton?.classList.contains('is-busy')) {
    gifAbort = true;
    return;
  }

  gifAbort = false;
  setButtonBusy(downloadGifButton, true, '编码中...');
  setExportStatus('正在加载 GIF 编码器...');
  let snapshot = null;

  try {
    const GIFEncoder = await loadGifEncoder();
    if (gifAbort) throw new Error('cancelled');
    const duration = Math.min(getExportDurationMs(), 8000);
    const frameDelay = Math.round(1000 / EXPORT_GIF_FPS);
    const frameCount = Math.max(8, Math.round(duration / frameDelay));
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / Math.max(1, canvas.width));
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = Math.max(2, Math.round(canvas.width * scale));
    frameCanvas.height = Math.max(2, Math.round(canvas.height * scale));
    const frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
    snapshot = beginExportPlayback();

    const gif = new GIFEncoder({
      workers: 2,
      quality: 12,
      width: frameCanvas.width,
      height: frameCanvas.height,
      workerScript: gifWorkerScriptUrl || GIF_WORKER_URL
    });

    gif.on('progress', (progress) => {
      setExportStatus(`正在编码 GIF ${(progress * 100).toFixed(0)}%...`);
    });

    const finished = new Promise((resolve, reject) => {
      gif.on('finished', resolve);
      gif.on('abort', () => reject(new Error('aborted')));
    });

    for (let index = 0; index < frameCount; index += 1) {
      if (gifAbort) {
        gif.abort();
        throw new Error('cancelled');
      }
      setExportStatus(`正在采样 GIF ${index + 1}/${frameCount}...`);
      render();
      frameContext.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
      frameContext.drawImage(canvas, 0, 0, frameCanvas.width, frameCanvas.height);
      gif.addFrame(frameCanvas, { copy: true, delay: frameDelay });
      await wait(frameDelay);
    }

    restoreExportPlayback(snapshot);
    if (gifAbort) throw new Error('cancelled');
    setExportStatus('正在编码 GIF 0%...');
    gif.render();
    const blob = await finished;
    if (gifAbort) throw new Error('cancelled');
    downloadBlob(blob, `半调-${state.shape}.gif`);
    setExportStatus('GIF 已生成并开始下载。');
    clearExportStatusSoon('GIF 已生成并开始下载。');
  } catch (error) {
    if (gifAbort || error?.message === 'cancelled' || error?.message === 'aborted') {
      setExportStatus('GIF 编码已取消。');
      clearExportStatusSoon('GIF 编码已取消。');
    } else {
      setExportStatus('GIF 导出失败，可能是编码器加载受限，请先导出 WebM。');
      clearExportStatusSoon('GIF 导出失败，可能是编码器加载受限，请先导出 WebM。');
    }
  } finally {
    restoreExportPlayback(snapshot);
    setButtonBusy(downloadGifButton, false);
  }
};

const buildSvgMark = (x, y, strength, paper, ink, visibility, point, colourCtx) => {
  const visibleStrength = strength * clamp(visibility, 0, 1);
  if (visibleStrength <= 0.018) return '';

  const baseRadius = state.step * 0.5 * state.scale;
  const radius = Math.max(0.05, baseRadius * (1 - state.sizeWeight + strength * state.sizeWeight) * Math.sqrt(clamp(visibility, 0, 1)));
  const colour = getMarkColour(point, paper, ink, strength, colourCtx);

  const fillColor = rgbToHex(colour);
  const opacity = state.allowTransparency
    ? clamp(0.18 + strength * 0.92, 0, 1) * clamp(visibility, 0, 1)
    : 1;
  const rotateAttr = state.markRotation ? ` transform="rotate(${state.markRotation.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"` : '';

  if (state.shape === 'dot') {
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${fillColor}" opacity="${opacity.toFixed(3)}"/>`;
  }

  if (state.shape === 'square') {
    const size = radius * 1.82;
    const half = size * 0.5;
    return `<rect x="${(x - half).toFixed(2)}" y="${(y - half).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="${fillColor}" opacity="${opacity.toFixed(3)}"${rotateAttr}/>`;
  }

  if (state.shape === 'slash') {
    const halfDiag = radius;
    const strokeWidth = Math.max(1, radius * 0.88);
    return `<line x1="${(x - halfDiag).toFixed(2)}" y1="${(y - halfDiag).toFixed(2)}" x2="${(x + halfDiag).toFixed(2)}" y2="${(y + halfDiag).toFixed(2)}" stroke="${fillColor}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" opacity="${opacity.toFixed(3)}"${rotateAttr}/>`;
  }

  if (state.shape === 'plus') {
    const half = radius;
    const strokeWidth = Math.max(1, radius * 0.66);
    return (
      `<line x1="${(x - half).toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + half).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${fillColor}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="butt" opacity="${opacity.toFixed(3)}"${rotateAttr}/>` +
      `<line x1="${x.toFixed(2)}" y1="${(y - half).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(y + half).toFixed(2)}" stroke="${fillColor}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="butt" opacity="${opacity.toFixed(3)}"${rotateAttr}/>`
    );
  }

  const halfDiag = radius;
  const strokeWidth = Math.max(1, radius * 0.44);
  const strokeColor = fillColor;
  return (
    `<line x1="${(x - halfDiag).toFixed(2)}" y1="${(y - halfDiag).toFixed(2)}" x2="${(x + halfDiag).toFixed(2)}" y2="${(y + halfDiag).toFixed(2)}" stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" opacity="${opacity.toFixed(3)}"${rotateAttr}/>` +
    `<line x1="${(x + halfDiag).toFixed(2)}" y1="${(y - halfDiag).toFixed(2)}" x2="${(x - halfDiag).toFixed(2)}" y2="${(y + halfDiag).toFixed(2)}" stroke="${strokeColor}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" opacity="${opacity.toFixed(3)}"${rotateAttr}/>`
  );
};

const collectSvgMarks = (paper, ink, timestamp, colourCtx) => {
  const marks = [];
  const morph = getMorphState(timestamp);

  const appendPointSet = (points, visibility = 1) => {
    for (const point of points) {
      marks.push(buildSvgMark(point.x, point.y, point.strength, paper, ink, visibility, point, colourCtx));
    }
  };

  if (state.morph && state.sources.length > 1 && state.transition === 'dissolve') {
    const fromPoints = state.pointSets[morph.fromIndex] || [];
    const toPoints = state.pointSets[morph.toIndex] || [];

    if (morph.phase === 'hold') {
      appendPointSet(fromPoints, 1);
    } else if (morph.phase === 'fadeOut') {
      appendPointSet(fromPoints, 1 - morph.progress);
    } else if (morph.phase === 'fadeIn') {
      appendPointSet(toPoints, morph.progress);
    }
  } else if (state.morph && state.sources.length > 1) {
    const fromPoints = state.pointSets[morph.fromIndex] || [];
    const toPoints = state.pointSets[morph.toIndex] || [];
    const count = Math.max(fromPoints.length, toPoints.length);
    const stagger = state.pathStyle === 'random' ? 0.5 : 0.38;

    for (let index = 0; index < count; index += 1) {
      const fallback = toPoints[index] || fromPoints[index] || { x: 0, y: 0, strength: 0, seed: index * 0.017 };
      const from = fromPoints[index] || { ...fallback, strength: 0 };
      const to = toPoints[index] || { ...fallback, strength: 0 };
      const phase = from.phase ?? to.phase ?? (count <= 1 ? 0 : index / (count - 1));
      const localProgress = easeInOut(clamp((morph.progress - phase * stagger) / (1 - stagger), 0, 1));
      const strength = lerp(from.strength, to.strength, localProgress);

      if (strength <= 0.018) continue;

      const colourPoint = {
        red: lerp(from.red ?? fallback.red ?? 0, to.red ?? fallback.red ?? 0, localProgress),
        green: lerp(from.green ?? fallback.green ?? 0, to.green ?? fallback.green ?? 0, localProgress),
        blue: lerp(from.blue ?? fallback.blue ?? 0, to.blue ?? fallback.blue ?? 0, localProgress),
        luminance: lerp(from.luminance ?? fallback.luminance ?? strength, to.luminance ?? fallback.luminance ?? strength, localProgress)
      };

      const x = lerp(from.x, to.x, localProgress);
      const y = lerp(from.y, to.y, localProgress);
      marks.push(buildSvgMark(x, y, strength, paper, ink, 1, colourPoint, colourCtx));
    }
  } else {
    appendPointSet(state.pointSets[state.activeIndex] || [], 1);
  }

  return marks.filter(Boolean);
};

const exportSvg = () => {
  if (state.sources.length === 0) {
    setExportStatus('请先上传或加载素材后再导出 SVG。');
    clearExportStatusSoon('请先上传或加载素材后再导出 SVG。');
    return;
  }

  setButtonBusy(downloadSvgButton, true, '生成');

  const width = Math.max(320, Math.round(canvas.offsetWidth || 960));
  const height = Math.max(320, Math.round(canvas.offsetHeight || 640));

  const wasPlaying = state.playing;
  if (wasPlaying) {
    state.pausedAt = performance.now();
    state.playing = false;
    setMediaPlayback(false);
    updatePlayButton();
  }

  const timestamp = state.pausedAt || performance.now();
  invalidatePointSets();
  rebuildPointSets(width, height);

  const paper = hexToRgb(state.paper);
  const ink = hexToRgb(state.ink);
  const colourCtx = buildColourCtx();
  const marks = collectSvgMarks(paper, ink, timestamp, colourCtx);

  const svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);

  if (!state.transparent) {
    svgParts.push(`<rect width="${width}" height="${height}" fill="${state.paper}"/>`);
  }

  if (state.texture && !state.transparent) {
    const grid = Math.max(1, state.step);
    const mid = hexToRgb(state.midInk);
    const stroke = `rgba(${mid.r},${mid.g},${mid.b},0.055)`;
    const dotFill = `rgba(${mid.r},${mid.g},${mid.b},0.035)`;

    svgParts.push(`<g stroke="${stroke}" stroke-width="0.5" fill="none">`);
    for (let x = grid * 0.5; x < width; x += grid) {
      svgParts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${height}"/>`);
    }
    for (let y = grid * 0.5; y < height; y += grid) {
      svgParts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}"/>`);
    }
    svgParts.push('</g>');

    svgParts.push(`<g fill="${dotFill}">`);
    for (let y = grid * 0.5; y < height; y += grid) {
      for (let x = grid * 0.5; x < width; x += grid) {
        svgParts.push(`<rect x="${Math.round(x)}" y="${Math.round(y)}" width="1" height="1"/>`);
      }
    }
    svgParts.push('</g>');
  }

  svgParts.push('<g>');
  for (const mark of marks) svgParts.push(mark);
  svgParts.push('</g>');
  svgParts.push('</svg>');

  const svgContent = svgParts.join('');
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `半调-${state.shape}.svg`);

  if (wasPlaying) {
    state.playing = true;
    updatePlayButton();
    setMediaPlayback(true);
    requestRenderLoop();
  } else {
    render();
  }

  setButtonBusy(downloadSvgButton, false);
  setExportStatus('SVG 已生成并开始下载。');
  clearExportStatusSoon('SVG 已生成并开始下载。');
};

const updateControl = (control) => {
  const key = control.dataset.control;
  if (!key) return;

  const prevMorph = state.morph;

  if (control.type === 'checkbox') state[key] = control.checked;
  else if (control.type === 'range') {
    const raw = Number(control.value);
    state[key] = key === 'step' ? (23 - raw) : raw;
  } else state[key] = control.value;

  if (key === 'morph' && state.morph && !prevMorph) {
    state.animationStart = performance.now();
  }

  if (['step', 'rotation', 'threshold', 'contrast', 'detail', 'highlightDetail', 'invert'].includes(key)) invalidatePointSets();
};

if (canvas && context) {
  let pendingRender = 0;
  const scheduleRender = () => {
    if (pendingRender) return;
    pendingRender = window.requestAnimationFrame(() => {
      pendingRender = 0;
      render();
      if (state.playing) requestRenderLoop();
    });
  };

  updateOutputs();
  updatePlayButton();

  const canvasWrap = canvas.parentElement;

  canvasWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = clamp(state.viewScale * zoomFactor, 0.1, 6);

    const localX = (mx - state.viewX) / state.viewScale;
    const localY = (my - state.viewY) / state.viewScale;

    state.viewScale = newScale;
    state.viewX = mx - localX * newScale;
    state.viewY = my - localY * newScale;
    applyView();
  }, { passive: false });

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOrigX = 0;
  let panOrigY = 0;

  canvasWrap.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    panning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panOrigX = state.viewX;
    panOrigY = state.viewY;
    canvasWrap.setPointerCapture(event.pointerId);
    canvasWrap.style.cursor = 'grabbing';
  });

  canvasWrap.addEventListener('pointermove', (event) => {
    if (!panning) return;
    state.viewX = panOrigX + (event.clientX - panStartX);
    state.viewY = panOrigY + (event.clientY - panStartY);
    applyView();
  });

  const endPan = (event) => {
    if (event && panning) canvasWrap.releasePointerCapture?.(event.pointerId);
    panning = false;
    canvasWrap.style.cursor = '';
  };

  canvasWrap.addEventListener('pointerup', endPan);
  canvasWrap.addEventListener('pointercancel', endPan);

  canvasWrap.addEventListener('dblclick', () => {
    resetView();
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      resetView();
    }
  });

  applyView();
  updateSwatchAvailability();

  controls.forEach((control) => {
    updateControl(control);
    control.addEventListener('input', () => {
      updateControl(control);
      scheduleRender();
    });
  });

  const bindSegmented = (buttons, datasetKey, stateKey, { onChange = null } = {}) => {
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        state[stateKey] = btn.dataset[datasetKey];
        buttons.forEach((item) => item.classList.toggle('is-active', item === btn));
        onChange?.();
        scheduleRender();
      });
    });
  };

  bindSegmented(shapeButtons, 'shape', 'shape');
  bindSegmented(colorModeButtons, 'colorMode', 'colorMode', { onChange: updateSwatchAvailability });
  bindSegmented(transitionButtons, 'transition', 'transition', { onChange: () => {
    state.animationStart = performance.now();
    state.pausedAt = 0;
  }});
  bindSegmented(pathButtons, 'path', 'pathStyle', { onChange: () => {
    state.animationStart = performance.now();
    state.pausedAt = 0;
    invalidatePointSets();
  }});

  fileInputs.forEach(input => {
    input.addEventListener('change', () => {
      loadMediaFiles(input.files);
    });
  });

  menuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportPopover && !exportPopover.hasAttribute('hidden')) closeExportMenu();
    if (utilMenuPopover && !utilMenuPopover.hasAttribute('hidden')) closeUtilMenu();
    toggleMenu();
  });
  document.querySelector('[data-menu-close]')?.addEventListener('click', closeMenu);
  document.querySelector('[data-menu-clear]')?.addEventListener('click', async () => {
    const ok = await showConfirm('确定要清空全部素材吗？此操作不可撤销。');
    if (!ok) return;
    clearObjectUrls();
    state.sources = [];
    state.activeIndex = 0;
    state.playing = false;
    state.pausedAt = 0;
    state.morph = false;
    state.pointSets = [];
    state.pointSetSignature = '';
    setMediaPlayback(false);
    updatePlayButton();
    renderMenu();
    clearCanvas();
    setPanelDisabled(true);
    closeMenu();
  });

  const openExportMenu = () => {
    if (!exportPopover || !exportToggle) return;
    exportPopover.removeAttribute('hidden');
    exportPopover.classList.remove('is-closing');
    requestAnimationFrame(() => exportPopover.classList.add('is-open'));
    exportToggle.setAttribute('aria-expanded', 'true');
  };
  const closeExportMenu = () => {
    if (!exportPopover || !exportToggle) return;
    exportPopover.classList.remove('is-open');
    exportPopover.classList.add('is-closing');
    const onEnd = () => {
      exportPopover.removeEventListener('transitionend', onEnd);
      if (!exportPopover.classList.contains('is-open')) {
        exportPopover.setAttribute('hidden', '');
        exportPopover.classList.remove('is-closing');
      }
    };
    exportPopover.addEventListener('transitionend', onEnd);
    exportToggle.setAttribute('aria-expanded', 'false');
  };
  const toggleExportMenu = () => {
    if (!exportPopover) return;
    if (exportPopover.hasAttribute('hidden')) openExportMenu();
    else closeExportMenu();
  };
  exportToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuPopover && !menuPopover.hasAttribute('hidden')) closeMenu();
    if (utilMenuPopover && !utilMenuPopover.hasAttribute('hidden')) closeUtilMenu();
    toggleExportMenu();
  });

  const openUtilMenu = () => {
    if (!utilMenuPopover || !utilMenuToggle) return;
    utilMenuPopover.removeAttribute('hidden');
    utilMenuPopover.classList.remove('is-closing');
    requestAnimationFrame(() => utilMenuPopover.classList.add('is-open'));
    utilMenuToggle.setAttribute('aria-expanded', 'true');
  };
  const closeUtilMenu = () => {
    if (!utilMenuPopover || !utilMenuToggle) return;
    utilMenuPopover.classList.remove('is-open');
    utilMenuPopover.classList.add('is-closing');
    const onEnd = () => {
      utilMenuPopover.removeEventListener('transitionend', onEnd);
      if (!utilMenuPopover.classList.contains('is-open')) {
        utilMenuPopover.setAttribute('hidden', '');
        utilMenuPopover.classList.remove('is-closing');
      }
    };
    utilMenuPopover.addEventListener('transitionend', onEnd);
    utilMenuToggle.setAttribute('aria-expanded', 'false');
  };
  const toggleUtilMenu = () => {
    if (!utilMenuPopover) return;
    if (utilMenuPopover.hasAttribute('hidden')) openUtilMenu();
    else closeUtilMenu();
  };
  utilMenuToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuPopover && !menuPopover.hasAttribute('hidden')) closeMenu();
    if (exportPopover && !exportPopover.hasAttribute('hidden')) closeExportMenu();
    toggleUtilMenu();
  });
  document.querySelector('[data-about]')?.addEventListener('click', () => {
    closeUtilMenu();
    showAbout();
  });

  document.addEventListener('click', (e) => {
    if (menuPopover && !menuPopover.hasAttribute('hidden') && !menuPopover.contains(e.target) && !menuToggle?.contains(e.target)) {
      closeMenu();
    }
    if (exportPopover && !exportPopover.hasAttribute('hidden') && !exportPopover.contains(e.target) && !exportToggle?.contains(e.target)) {
      closeExportMenu();
    }
    if (utilMenuPopover && !utilMenuPopover.hasAttribute('hidden') && !utilMenuPopover.contains(e.target) && !utilMenuToggle?.contains(e.target)) {
      closeUtilMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (menuPopover && !menuPopover.hasAttribute('hidden')) closeMenu();
      if (exportPopover && !exportPopover.hasAttribute('hidden')) closeExportMenu();
      if (utilMenuPopover && !utilMenuPopover.hasAttribute('hidden')) closeUtilMenu();
    }
  });

  playButton?.addEventListener('click', () => {
    state.playing = !state.playing;

    if (state.playing) {
      const resumeFrom = state.pausedAt || performance.now();
      state.animationStart += performance.now() - resumeFrom;
      state.pausedAt = 0;
      updatePlayButton();
      setMediaPlayback(true);
      requestRenderLoop();
    } else {
      state.pausedAt = performance.now();
      updatePlayButton();
      setMediaPlayback(false);
      render();
    }
  });

  const vectorZoomToggle = document.querySelector('[data-vector-zoom]');
  if (vectorZoomToggle) {
    vectorZoomToggle.checked = state.vectorZoom;
    vectorZoomToggle.addEventListener('change', () => {
      state.vectorZoom = vectorZoomToggle.checked;
      applyView();
    });
  }

  downloadPngButton?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `半调-${state.shape}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  downloadWebmButton?.addEventListener('click', () => {
    exportWebm();
  });

  downloadGifButton?.addEventListener('click', () => {
    exportGif();
  });

  downloadSvgButton?.addEventListener('click', () => {
    exportSvg();
  });


  const syncControlsFromState = () => {
    controls.forEach((control) => {
      const key = control.dataset.control;
      if (!key) return;
      if (!(key in state)) return;
      const val = state[key];
      if (control.type === 'checkbox') control.checked = !!val;
      else if (control.type === 'range' || control.type === 'number') control.value = key === 'step' ? (23 - val) : val;
      else if (control.type === 'color') control.value = val;
      else control.value = val;
      const valueEl = control.parentElement?.querySelector('[data-value]');
      if (valueEl) valueEl.textContent = typeof val === 'number' ? +val.toFixed(2) : val;
    });
    [[shapeButtons, 'shape', 'shape'], [colorModeButtons, 'colorMode', 'colorMode'], [transitionButtons, 'transition', 'transition'], [pathButtons, 'path', 'pathStyle']]
      .forEach(([btns, dk, sk]) => btns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset[dk] === state[sk])));
    updateSwatchAvailability();
  };

  document.querySelector('[data-reset-params]')?.addEventListener('click', async () => {
    const ok = await showConfirm('确定要重置所有参数吗？素材不会被清空。');
    if (!ok) return;
    state.shape = 'dot';
    state.colorMode = 'pure';
    state.transition = 'dissolve';
    state.pathStyle = 'radial';
    state.step = 8;
    state.scale = 0.78;
    state.sizeWeight = 1;
    state.markRotation = 0;
    state.rotation = 0;
    state.threshold = 0.18;
    state.contrast = 1.18;
    state.detail = 0.5;
    state.highlightDetail = 0.5;
    state.duration = 1.7;
    state.blank = 0.24;
    state.hold = 0.55;
    state.drift = 0.08;
    state.ink = '#009cdb';
    state.paper = '#f7f3ec';
    state.shadowInk = '#23322d';
    state.midInk = '#2fb69a';
    state.highlightInk = '#e7e4d8';
    state.transparent = false;
    state.texture = false;
    state.invert = false;
    state.allowTransparency = false;
    state.morph = false;
    state.playing = false;
    syncControlsFromState();
    updatePlayButton();
    invalidatePointSets();
    scheduleRender();
  });

  window.addEventListener('resize', () => {
    resetView();
    invalidatePointSets();
    window.requestAnimationFrame(render);
  }, { passive: true });

  loadDemoSources();
}