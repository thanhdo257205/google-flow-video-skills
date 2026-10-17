/**
 * Google Flow Video Automation Script v17
 *
 * PIPELINE (4 steps — Claude controls the loop):
 *   Step 1: generateVideo("image.png", "script text")  → ~5s
 *   Step 2: Claude waits 30s (do NOT use JS wait — use computer tool wait)
 *   Step 3: isVideoReady()                              → instant check
 *   Step 4: finishPipeline("13A.1", "720p")             → ~10s
 *   Then:   PowerShell Move-Item to move file to videos/
 *
 * v17 adds: JS-only UI helpers (settings panel, Agent panel, auto-approve), auto-Retry for failed/timed-out
 *   generations, Agent-quota detection, and a queue runner (loadQueue / runQueue / getQueueStatus) that runs
 *   a whole sheet inside the page (no per-video round trips).
 *
 * VERIFY: After injecting, call verifyScript() to confirm all functions loaded.
 */

// ─── Critical: wait must be on window ───
window.wait = (ms) => new Promise(r => setTimeout(r, ms));

// ─── OPENING/CLOSING prompts ───
const OPENING = 'Animate only from the attached reference image, which is the ONLY style guide: keep its exact rendering style (never more realistic, photographic, or polished) and preserve in every frame every character\'s identity, face (shape, proportions, eyes, nose, mouth, eyebrows, shading, level of stylization), skin tone, hairstyle, body proportions, clothing, accessories, seating or standing position, background, lighting, color palette, and line work. Show only the characters present in the image: do not add, remove, duplicate, replace, transform, redesign, or swap anyone; no extra people or background figures. CAMERA: one continuous, static shot from the same camera position and framing as the reference image (treat any shot size in the Visual Prompt, e.g. "Medium shot", as that framing); no cuts, zooms, pans, tilts, close-ups, reframing, angle changes, camera movement, or character repositioning. SPEECH: only the explicitly named speaker (the label before a dialogue line, e.g. "BA:") speaks and lip-syncs that line; every other character keeps their mouth closed and only listens or reacts. If a block has no speaker label (voice-over/narration), play it as narration only, with no character lip-sync. Based on this image, perform the following:\n\n';
const CLOSING = '\n\nSTRICT: read the complete dialogue exactly as written, once and verbatim; do not omit, shorten, summarize, paraphrase, repeat, or add any words, and end the video immediately after the final word. Dialogue or narration only: no background music, soundtrack, sound effects, ambient voices, or extra speech; keep the voice clear and isolated. Same art style, level of stylization, and faces as the reference image in every frame (no drift toward realism, no redesign); seats and standing positions fixed; physically consistent gestures and objects; static camera with no zoom, no cuts, and no camera movement at any point.';

// ─── Verify script loaded correctly ───
window.verifyScript = function() {
  const required = ['generateVideo','isVideoReady','finishPipeline','checkImagesExist',
    'trashVideoByName','listTilesByExactName','clearPrompt','addImageToPrompt','typePrompt','submitPrompt','renameLatestVideo',
    'downloadVideoViaMenu','dismissNotification','wait','getSettingsButtonCenter',
    'selectDuration','getCurrentDuration','estimateDuration','snapshotTiles','getNewTile','setSearch','clearSearch','findTileByName','waitForVideo','getCurrentSettings','isSettingsPanelOpen','waitFor','closeMenus','startGenerate','getGenerateResult','waitForGenerate','isAgentMode','setAgentMode','clickEl','openSettingsPanel','closeOverlay','closeSettingsPanel','applySettings','agentPanelOpen','closeAgentPanel','enableAutoApprove','disableAutoApprove','detectAgentQuota','loadQueue','queueChecksum','runQueue','stopQueue','getQueueStatus'];
  const missing = required.filter(fn => typeof window[fn] !== 'function');
  return {
    ok: missing.length === 0,
    version: 'v17',
    missing,
    pipeline: 'generateVideo() → wait 30s → isVideoReady() → finishPipeline(name, quality)'
  };
};

// ─── Duration helpers ───
window.estimateDuration = function(scriptContent) {
  const dialogueRegex = /:\s*["“]([^"”]+)["”]/g; // Excel uses curly quotes “ ”
  let totalWords = 0, match;
  while ((match = dialogueRegex.exec(scriptContent)) !== null) totalWords += match[1].split(/\s+/).length;
  // v4: voice-over / narration scenes have NO quoted dialogue ("Audio/Dialogue:\nThe team is..."): count the words after
  // "Audio/Dialogue:" (excluding "Screen x.y" lines) instead of returning 0 words (which would pick 4s and cut the narration).
  if (totalWords === 0) {
    const i = scriptContent.lastIndexOf('Audio/Dialogue:');
    const tail = (i >= 0 ? scriptContent.slice(i + 15) : '').split('\n').filter(l => l.trim() && !/^\s*Screen\s+[\d.A-Za-z]+\s*$/i.test(l)).join(' ');
    totalWords = tail.split(/\s+/).filter(Boolean).length;
  }
  const sec = totalWords / 2.3 + 2;
  const recommended = sec <= 5 ? 4 : sec <= 7 ? 6 : sec <= 9 ? 8 : 10;
  return { recommended, totalWords, estimatedSeconds: Math.round(sec * 10) / 10 };
};

window.getCurrentDuration = function() {
  const m = document.querySelector('.settings-trigger-button')?.textContent?.match(/(\d+)s/);
  return m ? parseInt(m[1]) : null;
};

// Reads the settings button label (e.g. "Video · 720p · 10s crop_16_9 x1"); works with the panel closed.
window.getCurrentSettings = function() {
  const txt = (document.querySelector('.settings-trigger-button')?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!txt) return null;
  const mode = /^(Video|Image)/i.exec(txt)?.[1] || null;
  const quality = /(\d{3,4}p)/.exec(txt)?.[1] || null;
  const sec = /(\d+)s\b/.exec(txt)?.[1];
  const cnt = /\bx(\d)\b/i.exec(txt)?.[1];
  return { mode, quality, seconds: sec ? parseInt(sec) : null, count: cnt ? parseInt(cnt) : null, raw: txt };
};

// ─── Agent mode (verified on the live UI) ───
// The chip is  button.agent-mode-chip  inside  flow-agent-mode-toggle-chip. When ON it gets the class
// "agent-mode-chip-checked" (the parent gets "checked"). Do NOT use aria-pressed: it stays "false".
// A plain JS click toggles it. In Agent mode the normal settings button (.settings-trigger-button) has NO text/width,
// so getCurrentSettings() returns null; there is a separate "Settings" (tune icon) button that opens "Agent settings"
// (Confirm before generating, default ratio/count/model) -- the USER sets those; this script never changes them.
window.isAgentMode = function() {
  const chip = document.querySelector('button.agent-mode-chip');
  return chip ? chip.classList.contains('agent-mode-chip-checked') : null;   // null = chip not found
};

window.setAgentMode = async function(on) {
  const chip = document.querySelector('button.agent-mode-chip');
  if (!chip) return { success: false, error: 'Agent chip not found' };
  if (window.isAgentMode() !== !!on) { chip.click(); await window.wait(1000); }
  const now = window.isAgentMode();
  return now === !!on ? { success: true, agentMode: now } : { success: false, error: 'Agent mode did not change', agentMode: now };
};

// True when the settings panel (duration/count toggles) is open in the overlay.
window.isSettingsPanelOpen = function() {
  const ov = document.querySelector('.cdk-overlay-container');
  if (!ov) return false;
  return [...ov.querySelectorAll('mat-button-toggle, [role="radio"]')].some(e => /^\d+s$/.test((e.textContent || '').trim()));
};

// Click preference: (1) computer click by ref (find the settings button, click its ref);
// (2) fallback: computer click at x,y below, multiplied by scale = screenshotFrameWidth / innerWidth
// (the screenshot coordinate frame can be larger than the viewport, ~1.02).
window.getSettingsButtonCenter = function() {
  for (const btn of document.querySelectorAll('button')) {
    if (btn.classList.contains('settings-trigger-button')) {
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    }
  }
  return null;
};

// Available durations differ by model (verified on the live panel: Omni 1.1 Flash = 4/6/8/10s; Veo 3.1 Fast = 4/6/8s).
// Changing the model can RESET the duration, so ALWAYS select the model FIRST, then the duration, then verify.
window.selectDuration = function(seconds) {
  const ov = document.querySelector('.cdk-overlay-container');
  const cands = [...(ov?.querySelectorAll('mat-button-toggle, [role="radio"]') || [])].filter(e => /^\d+s$/.test((e.textContent || '').trim()));
  if (!cands.length) return { success: false, error: 'Settings panel not open' };
  const available = [...new Set(cands.map(e => e.textContent.trim()))];
  const want = seconds + 's';
  const el = cands.find(e => e.textContent.trim() === want);
  if (!el) return { success: false, error: 'Duration ' + want + ' not available for this model', available };
  const btn = el.tagName.toLowerCase() === 'mat-button-toggle' ? (el.querySelector('button') || el) : el;
  const checked = el.classList.contains('mat-button-toggle-checked') || btn.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-checked') === 'true';
  if (checked) return { success: true, changed: false };
  btn.click();
  return { success: true, changed: true };
};

// ─── Model helpers (the settings panel must be open: open it with a real mouse click first) ───
// The model control is a MENU BUTTON (aria-haspopup="menu") whose items are role="menuitem",
// NOT a mat-select. Item text starts with an icon name ("volume_up..."), which is stripped here.
// Match EXACTLY: "Veo 3.1 - Lite" and "Veo 3.1 - Lite [Lower Priority]" are different items.
window._modelName = t => (t || '').replace(/arrow_drop_down$/, '').replace(/^[a-z_]+(?=[A-Z])/, '').replace(/\s+/g, ' ').trim();
window._modelButton = function() {
  const ov = document.querySelector('.cdk-overlay-container');
  return [...(ov?.querySelectorAll('button') || [])].find(b => b.getAttribute('aria-haspopup') === 'menu') || null;
};

window.getCurrentModel = function() {
  const b = window._modelButton();
  return b ? window._modelName(b.textContent) : null;
};

window.openModelDropdown = function() {
  const b = window._modelButton();
  if (!b) return { success: false, error: 'Settings panel not open' };
  if (b.getAttribute('aria-expanded') !== 'true') b.click();
  return { success: true };
};

window.selectModel = async function(modelName) {
  const b = window._modelButton();
  if (!b) return { success: false, error: 'Settings panel not open' };
  if (window._modelName(b.textContent) === modelName) return { success: true, selected: modelName, changed: false };
  if (b.getAttribute('aria-expanded') !== 'true') b.click();
  const items = () => [...(document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="menuitem"]') || [])];
  await window.waitFor(() => items().length, 3000);
  await window.wait(400); // let the menu finish opening before clicking an item
  const item = items().find(i => window._modelName(i.textContent) === modelName);
  if (!item) {
    const available = items().map(i => window._modelName(i.textContent));
    // Close ONLY the menu by toggling its button (a body click would close the whole settings panel).
    const mb = window._modelButton(); if (mb && mb.getAttribute('aria-expanded') === 'true') mb.click();
    await window.wait(400);
    return { success: false, error: 'Model not found: ' + modelName, available };
  }
  item.click();
  await window.wait(500);
  if (!window._modelButton()) return { success: false, error: 'Settings panel closed after selecting; reopen the panel and check getCurrentModel()', requested: modelName };
  const ok = await window.waitFor(() => window.getCurrentModel() === modelName, 3000);
  const durations = [...new Set([...(document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="radio"]') || [])].map(e => e.textContent.trim()).filter(t => /^\d+s$/.test(t)))];
  return ok
    ? { success: true, selected: modelName, changed: true, durationOptions: durations, note: 'Model change may reset the duration: set it again and verify.' }
    : { success: false, error: 'Model did not change', current: window.getCurrentModel() };
};

// ─── Image validation ───
// The grid is virtual-scrolled (only ~8 tiles are in the DOM), so images further down are
// NOT found by scanning tiles. Use the page search box to filter first.
window.setSearch = async function(text) {
  const inp = document.querySelector('input.search-input');
  if (!inp) throw new Error('Search input not found');
  inp.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, text);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  await window.wait(1500);
};

window.clearSearch = async function() { await window.setSearch(''); };

window.findTileByName = async function(name, tries) {
  for (let i = 0; i < (tries || 6); i++) {
    for (const t of document.querySelectorAll('flow-grid-tile-container')) {
      if ((t.textContent || '').includes(name)) return t;
    }
    await window.wait(500);
  }
  return null;
};

window.checkImagesExist = async function(imageNames) {
  const results = {};
  for (const name of imageNames) {
    await window.setSearch(name);
    results[name] = !!(await window.findTileByName(name, 4));
  }
  await window.clearSearch();
  const missing = Object.keys(results).filter(k => !results[k]);
  return { all: missing.length === 0, results, missing };
};

// ─── Core pipeline functions ───
window.clearPrompt = async function() {
  const clearBtn = document.querySelector('button[aria-label="Clear prompt"]');
  if (clearBtn && !clearBtn.classList.contains('mat-mdc-button-disabled')) { clearBtn.click(); await window.wait(500); return; }
  const pm = document.querySelector('.ProseMirror');
  if (pm) { pm.focus(); document.execCommand('selectAll'); document.execCommand('delete'); await window.wait(300); }
};

// Search the image first (filters the grid), add it to the prompt, then clear the search
// so the grid shows all tiles again (needed to track the new video tile).
window.addImageToPrompt = async function(imageName) {
  await window.setSearch(imageName);
  const target = await window.findTileByName(imageName, 6);
  if (!target) { await window.clearSearch(); throw new Error('Image "' + imageName + '" not found via search'); }
  target.querySelector('button[aria-label="More options"]')?.click();
  await window.wait(800);
  const items = document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="menuitem"]') || [];
  let addBtn = null;
  for (const i of items) { if (i.textContent?.includes('Add to prompt')) { addBtn = i; break; } }
  if (!addBtn) { document.body.click(); await window.clearSearch(); throw new Error('"Add to prompt" not found'); }
  addBtn.click();
  await window.wait(1000);
  if (!document.querySelector('.chip-image')) { await window.clearSearch(); throw new Error('Image chip not added'); }
  await window.clearSearch();
  return true;
};

// raw = true (REDO mode): send scriptContent EXACTLY as given, WITHOUT adding OPENING/CLOSING
// (the corrected prompt in column K already contains the full instructions).
window.typePrompt = async function(scriptContent, raw) {
  const full = raw ? scriptContent : (OPENING + scriptContent + CLOSING);
  const pm = document.querySelector('.ProseMirror');
  if (!pm) throw new Error('ProseMirror not found');
  pm.focus(); await window.wait(200);
  document.execCommand('insertText', false, full);
  await window.wait(500);
  if ((pm.textContent || '').length < 20) throw new Error('Text not inserted');
  return full.length;
};

window.submitPrompt = async function() {
  const btn = document.querySelector('flow-generate-icon-button button') || document.querySelector('button[type="submit"]');
  if (!btn) throw new Error('Submit button not found');
  if (btn.classList.contains('mat-mdc-button-disabled')) throw new Error('Submit disabled');
  btn.click(); await window.wait(2000);
  return true;
};

// ─── Track the NEW tile (so we never rename/download an older video) ───
// The grid is virtual-scrolled and RECYCLES DOM elements, so tiles cannot be compared by
// element reference. Flow lists newest first, so the new video is the FIRST tile once its
// content differs from the first tile seen before submitting.
window.snapshotTiles = function() {
  const sc = document.querySelector('.cdk-virtual-scrollable.page-container');
  if (sc) sc.scrollTop = 0;
  window.__firstSigBefore = document.querySelector('flow-grid-tile-container')?.textContent || '';
  window.__retryCount = 0;
  return window.__firstSigBefore.length;
};

window.getNewTile = function() {
  const sc = document.querySelector('.cdk-virtual-scrollable.page-container');
  if (sc && sc.scrollTop > 0) sc.scrollTop = 0;
  const first = document.querySelector('flow-grid-tile-container');
  if (!first || window.__firstSigBefore === undefined) return null;
  return (first.textContent || '') === window.__firstSigBefore ? null : first;
};

// expectedSeconds (optional but REQUIRED by the README flow): refuses to submit when the current
// settings do not match (wrong duration / not Video mode / not x1), so a wrong video is never paid for.
window.generateVideo = async function(imageName, scriptContent, expectedSeconds, raw) {
  try {
    // In Agent mode there is no duration/model panel (the Agent decides), so the settings check is skipped.
    if (expectedSeconds !== undefined && expectedSeconds !== null && !window.isAgentMode()) {
      const want = Number(expectedSeconds);
      const cur = window.getCurrentSettings();
      if (!cur) throw new Error('Settings button not found');
      if (cur.seconds !== want) return { success: false, error: 'Duration mismatch: current ' + cur.seconds + 's, expected ' + want + 's', current: cur, expected: want };
      if (cur.mode && cur.mode.toLowerCase() !== 'video') return { success: false, error: 'Mode is ' + cur.mode + ', expected Video', current: cur };
      if (cur.count !== null && cur.count !== 1) return { success: false, error: 'Count is x' + cur.count + ', expected x1', current: cur };
    }
    await window.clearPrompt();
    await window.addImageToPrompt(imageName); // search is cleared inside
    window.snapshotTiles(); // after the grid is back to normal, right before submitting
    const len = await window.typePrompt(scriptContent, !!raw);
    await window.submitPrompt();
    return { success: true, promptLength: len, raw: !!raw };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ─── Background generation (avoids the ~45s javascript_tool timeout) ───
// startGenerate() returns immediately and runs generateVideo() in the page; the outcome is kept in
// window.__gen = { status: 'running' | 'done' | 'failed', result, startedAt, finishedAt }.
// It refuses to start while a generation is still 'running' (prevents duplicate videos / credits).
// After any timeout or silence, NEVER call startGenerate again before checking getGenerateResult()
// and the tile list. If it is stuck 'running' and no tile was created, reset: window.__gen = { status: 'none' }.
if (!window.__gen) window.__gen = { status: 'none' };

window.startGenerate = function(imageName, scriptContent, expectedSeconds, raw) {
  if (window.__gen && window.__gen.status === 'running') {
    return { started: false, error: 'Already running', runningForMs: Date.now() - window.__gen.startedAt };
  }
  const job = { status: 'running', startedAt: Date.now(), image: imageName };
  window.__gen = job;
  window.generateVideo(imageName, scriptContent, expectedSeconds, raw)
    .then(r => { job.result = r; job.status = r && r.success ? 'done' : 'failed'; job.finishedAt = Date.now(); })
    .catch(e => { job.result = { success: false, error: e.message }; job.status = 'failed'; job.finishedAt = Date.now(); });
  return { started: true };
};

window.getGenerateResult = function() {
  const g = window.__gen || { status: 'none' };
  return { status: g.status, result: g.result, elapsedMs: g.startedAt ? (g.finishedAt || Date.now()) - g.startedAt : null };
};

// Polls inside the page until the job leaves 'running' (or maxMs). Keep maxMs <= 30000.
window.waitForGenerate = async function(maxMs) {
  const end = Date.now() + (maxMs || 30000);
  while (window.__gen && window.__gen.status === 'running' && Date.now() < end) await window.wait(500);
  return window.getGenerateResult();
};

// ─── Video status check ───
// Checks the tile created by the latest generateVideo() call (not tiles[0]).
// Ready = new tile exists, no "NN%" progress left, and its thumbnail <img> has loaded
// (a queued/generating tile is a grey placeholder with no loaded thumbnail; a finished
// tile shows a thumbnail until hovered, so a <video> element is NOT required).
// Do NOT rely on the tile title: Flow may keep the prompt as the title after finishing.
// A tile can show "Failed - The video failed to load." with a "Retry" button (no name, no menu). Clicking Retry reloads the video (verified).
window.isLoadFailedTile = function(tile) { return !!tile && /failed to load/i.test(tile.innerText || ''); };
window.retryFailedTile = function(tile) {
  const btn = window.isLoadFailedTile(tile) ? tile.querySelector('button[aria-label="Retry"]') : null;
  if (!btn) return false;
  btn.click();
  return true;
};
window.isVideoReady = function() {
  const tile = window.getNewTile();
  if (!tile) return { ready: false, reason: 'no new tile' };
  // v17: generation failed / timed out on Flow's side (verified texts: "Sorry, this video failed to generate" and
  // "Generation timed out. Please try again."; both say "You have not been charged"). Click Retry (max 4 per video).
  if (/failed to generate|generation timed out|something went wrong/i.test(tile.innerText || '') && !window.isLoadFailedTile(tile)) {
    const key = window.__Q ? ((window.__Q.items[window.__Q.i] || {}).name || '') : (window.__genKey || '');
    if (!window.__genRetry || window.__genRetry.key !== key) window.__genRetry = { n: 0, key };
    if (window.__genRetry.n >= 4) return { ready: false, reason: 'generate failed (Retry used 4 times)' };
    const rb = tile.querySelector('button[aria-label="Retry"]');
    if (rb) {
      window.__genRetry.n++; rb.click();
      if (window.__Q) window.__Q.ev.push({ n: key, s: 'retry', note: 'generate failed/timed out, clicked Retry ' + window.__genRetry.n, ts: new Date().toISOString() });
      return { ready: false, reason: 'generate failed, clicked Retry (' + window.__genRetry.n + '/4)' };
    }
  }
  if (window.isLoadFailedTile(tile)) {
    window.__retryCount = window.__retryCount || 0;
    if (window.__retryCount >= 2) return { ready: false, reason: 'load failed (Retry used 2 times)' };
    window.__retryCount++;
    window.retryFailedTile(tile);
    return { ready: false, reason: 'load failed, clicked Retry (' + window.__retryCount + '/2)' };
  }
  const pct = (tile.textContent || '').match(/(\d+)%/);
  if (pct) return { ready: false, reason: 'generating', progress: pct[1] + '%' };
  const loaded = [...tile.querySelectorAll('img')].some(i => i.complete && i.naturalWidth > 0);
  if (!loaded && !tile.querySelector('video')) return { ready: false, reason: 'generating (no thumbnail yet)' };
  return { ready: true };
};

// Poll inside the page so Claude does not sit idle after the video is done.
// Keep maxMs <= 30000 (the javascript_tool call times out at ~45s).
window.waitForVideo = async function(maxMs) {
  const end = Date.now() + (maxMs || 30000);
  let r = window.isVideoReady();
  while (!r.ready && Date.now() < end) { await window.wait(2000); r = window.isVideoReady(); }
  return r;
};

// ─── Rename ───
window.renameLatestVideo = async function(newName) {
  const tile = window.getNewTile();
  if (!tile) throw new Error('New tile not found');
  tile.querySelector('button[aria-label="More options"]')?.click();
  await window.wait(800);
  const items = document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="menuitem"]') || [];
  let renameBtn = null;
  for (const i of items) { if (i.textContent?.includes('Rename')) { renameBtn = i; break; } }
  if (!renameBtn) { document.body.click(); throw new Error('Rename not found'); }
  renameBtn.click(); await window.wait(800);
  const input = document.querySelector('input.editable-text-input.editing');
  if (!input) throw new Error('Rename input not found');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, newName);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await window.wait(300);
  input.closest('flow-editable-text')?.querySelector('button[aria-label="Done"]')?.click();
  await window.wait(500);
  return { success: true, newName };
};

// ─── Download ───
window.dismissNotification = async function() {
  const btn = document.querySelector('button.gm3-snackbar__action, button[aria-label="Dismiss"]');
  if (btn) { btn.click(); await window.wait(500); return true; }
  return false;
};

// Poll fn() every stepMs until it returns a truthy value or maxMs passes (returns null).
// Polling runs inside the page, so it costs no extra tokens (only wall-clock time).
window.waitFor = async function(fn, maxMs, stepMs) {
  const end = Date.now() + (maxMs || 3000);
  stepMs = stepMs || 300;
  while (true) {
    let v = null;
    try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() >= end) return null;
    await window.wait(stepMs);
  }
};

window.closeMenus = async function() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  document.body.click();
  await window.wait(300);
};

// Up to 3 attempts. Retries happen ONLY before the quality item is clicked (the quality item is
// clicked at most once), so a video is never downloaded twice.
window.downloadVideoViaMenu = async function(videoName, quality) {
  quality = quality || '720p';
  const MAX_ATTEMPTS = 3;
  let lastError = 'unknown', available = null, clickedDownloadItem = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Prefer the tile created by the latest generateVideo(); fall back to name match.
    let target = window.getNewTile();
    if (!target || !target.isConnected) {
      target = null;
      for (const t of document.querySelectorAll('flow-grid-tile-container')) { if ((t.textContent || '').includes(videoName)) { target = t; break; } }
    }
    if (!target) return { success: false, error: 'Tile "' + videoName + '" not found', attempts: attempt };

    const items = () => document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="menuitem"]') || [];
    const findItem = (txt) => [...items()].find(i => (i.textContent || '').includes(txt)) || null;

    target.querySelector('button[aria-label="More options"]')?.click();
    const dlBtn = await window.waitFor(() => findItem('Download'), 3000);
    if (!dlBtn) { lastError = 'Download not found'; await window.closeMenus(); continue; }

    // Hover first (opens the submenu); if the quality item does not appear, click "Download" as a fallback.
    ['mouseenter', 'mouseover'].forEach(t => dlBtn.dispatchEvent(new MouseEvent(t, { bubbles: true })));
    let qBtn = await window.waitFor(() => findItem(quality), 3000);
    if (!qBtn) {
      dlBtn.click(); clickedDownloadItem = true;
      qBtn = await window.waitFor(() => findItem(quality), 2000);
    }
    if (!qBtn) {
      available = [...items()].map(i => i.textContent?.trim()).filter(Boolean);
      lastError = 'Quality "' + quality + '" not found';
      await window.closeMenus(); continue;
    }

    window.__downloadStartedAt = Date.now();
    qBtn.click(); await window.wait(3000);
    return { success: true, quality, attempts: attempt, startedAt: new Date(window.__downloadStartedAt).toISOString() };
  }
  return { success: false, error: lastError, attempts: MAX_ATTEMPTS, available, clickedDownloadItem };
};

// ─── Delete an OLD video by EXACT name (REDO mode: delete the old video, then generate the new one under the same name) ───
// Flow only MOVES it to Trash (tile menu item "Move to trash"); it can be restored from the Trash page. Never use "Delete all" there.
// Search matches substrings ("19B.2" also matches "19B.2_R1"), so the tile label is compared EXACTLY.
window.listTilesByExactName = function(name) {
  return [...document.querySelectorAll('flow-grid-tile-container')].filter(t =>
    (t.innerText || '').split('\n').map(s => s.trim()).includes(name));
};
window.trashVideoByName = async function(videoName) {
  try {
    await window.setSearch(videoName);
    let tiles = [], retried = 0;
    for (let i = 0; i < 6 && !tiles.length; i++) {
      tiles = window.listTilesByExactName(videoName);
      if (!tiles.length) {
        // Tiles that failed to load show no name: click Retry on them (max 2 rounds) so their name appears.
        const failed = [...document.querySelectorAll('flow-grid-tile-container')].filter(window.isLoadFailedTile);
        if (failed.length && retried < 2) { failed.forEach(window.retryFailedTile); retried++; await window.wait(2000); continue; }
        await window.wait(500);
      }
    }
    if (tiles.length === 0) { await window.clearSearch(); return { success: false, error: 'not found', videoName, count: 0 }; }
    if (tiles.length > 1) { await window.clearSearch(); return { success: false, error: 'ambiguous: more than one tile has this exact name', videoName, count: tiles.length }; }
    const target = tiles[0];
    target.querySelector('button[aria-label="More options"]')?.click();
    const items = () => document.querySelector('.cdk-overlay-container')?.querySelectorAll('[role="menuitem"]') || [];
    const item = await window.waitFor(() => [...items()].find(i => (i.textContent || '').includes('Move to trash')), 3000);
    if (!item) { await window.closeMenus(); await window.clearSearch(); return { success: false, error: '"Move to trash" not found', videoName }; }
    item.click();
    const gone = await window.waitFor(() => !target.isConnected || window.listTilesByExactName(videoName).length === 0, 5000);
    await window.wait(1000);
    const still = window.listTilesByExactName(videoName).length;
    await window.clearSearch();
    return { success: !!gone && still === 0, videoName, trashed: !!gone && still === 0, remaining: still };
  } catch (e) { try { await window.clearSearch(); } catch (_) {} return { success: false, error: String(e), videoName }; }
};

// ─── Pipeline finisher (rename + download in one call) ───
// Default download quality is 720p. Renames ONCE (skipped if the new tile already has the name);
// if the download still fails after 3 attempts it returns downloaded:false and never renames again.
window.finishPipeline = async function(videoName, quality) {
  quality = quality || '720p';
  const check = window.isVideoReady();
  if (!check.ready) return { success: false, error: 'Not ready: ' + check.reason, ...check };
  await window.dismissNotification();
  const tile = window.getNewTile();
  const alreadyNamed = !!(tile && (tile.textContent || '').includes(videoName));
  if (!alreadyNamed) {
    try { await window.renameLatestVideo(videoName); } catch (e) { return { success: false, error: 'Rename: ' + e.message }; }
    await window.wait(1000);
  }
  const dl = await window.downloadVideoViaMenu(videoName, quality);
  const out = { success: true, videoName, quality, renamed: !alreadyNamed, downloaded: dl.success, attempts: dl.attempts, downloadStartedAt: dl.startedAt || null };
  if (!dl.success) { out.downloadError = dl.error; out.available = dl.available; out.clickedDownloadItem = dl.clickedDownloadItem; }
  return out;
};


// ═══════════════════════════════════════════════════════════════════════════════
// v17 — JS-only UI helpers (avoid the `computer` tool; verified on the live UI unless marked UNVERIFIED)
// ═══════════════════════════════════════════════════════════════════════════════

// Plain .click() first (works for Flow's settings button, verified). Fallback: full pointer/mouse event sequence.
window.clickEl = async function(el, check) {
  if (!el) return false;
  el.click(); await window.wait(600);
  if (!check || check()) return true;
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const C = t.startsWith('pointer') ? PointerEvent : MouseEvent;
    el.dispatchEvent(new C(t, { bubbles: true, cancelable: true, view: window, pointerId: 1, isPrimary: true, button: 0 }));
  }
  await window.wait(600);
  return check ? !!check() : true;
};

// VERIFIED: a plain JS click on .settings-trigger-button opens the settings panel (v3 notes saying "needs a real click" are obsolete).
window.openSettingsPanel = async function() {
  if (window.isSettingsPanelOpen()) return { success: true, changed: false };
  const btn = document.querySelector('.settings-trigger-button');
  if (!btn || !(btn.textContent || '').trim()) return { success: false, error: 'Settings button not found (Agent mode on? use setAgentMode(false))' };
  const ok = await window.clickEl(btn, () => window.isSettingsPanelOpen());
  return ok ? { success: true, changed: true } : { success: false, error: 'Settings panel did not open' };
};

// VERIFIED: the overlay closes when Escape is dispatched on .cdk-overlay-container (dispatching on document does NOT close it).
window.closeOverlay = async function() {
  const ov = document.querySelector('.cdk-overlay-container');
  if (ov) for (const tgt of [ov, document.activeElement, document.body]) {
    if (tgt) tgt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }
  await window.wait(500);
};
window.closeSettingsPanel = async function() {
  if (!window.isSettingsPanelOpen()) return { success: true, changed: false };
  await window.closeOverlay();
  if (window.isSettingsPanelOpen()) await window.clickEl(document.querySelector('.settings-trigger-button'), () => !window.isSettingsPanelOpen());
  return { success: !window.isSettingsPanelOpen() };
};

// One call: close Agent panel -> Agent off -> open panel -> model -> duration -> verify -> close. Returns the final settings text.
// Model change can reset the duration, so the order is always model first, then duration.
window.applySettings = async function(opts) {
  opts = opts || {};
  try {
    const cp = await window.closeAgentPanel(); if (!cp.success) return { success: false, step: 'close-agent-panel', ...cp };
    if (window.isAgentMode()) { const a = await window.setAgentMode(false); if (!a.success) return { success: false, step: 'agent-off', ...a }; await window.wait(800); }
    const o = await window.openSettingsPanel(); if (!o.success) return { success: false, step: 'open', ...o };
    if (opts.model) { const m = await window.selectModel(opts.model); if (!m.success) { await window.closeSettingsPanel(); return { success: false, step: 'model', ...m }; } await window.wait(500); }
    if (opts.seconds) { const d = window.selectDuration(opts.seconds); if (!d.success) { await window.closeSettingsPanel(); return { success: false, step: 'duration', ...d }; } await window.wait(500); }
    const model = window.getCurrentModel();
    const cur = window.getCurrentSettings();
    await window.closeSettingsPanel();
    const okSec = !opts.seconds || (cur && cur.seconds === Number(opts.seconds));
    const okModel = !opts.model || model === opts.model;
    return { success: !!(cur && okSec && okModel), model, settings: cur && cur.raw };
  } catch (e) { return { success: false, error: String(e) }; }
};

// Agent side panel: <flow-agent-panel> with .agent-panel-header (.header-left = session history, .header-right = "Start new
// session" + "Close"). VERIFIED on the live UI. It opens by itself after an Agent submission / reopening the project in Agent
// mode, and WHILE IT IS OPEN the prompt bar chip (button.agent-mode-chip) and the settings button are not usable
// (isAgentMode() can return null, getCurrentSettings() null). After closing it the host element stays in the DOM and the wrapper
// .agent-panel-animation-container gets the class "agent-panel-slide-out", so "open" = wrapper without slide-out.
window.agentPanelOpen = function() {
  const w = document.querySelector('.agent-panel-animation-container');
  return !!w && !/slide-out/.test(w.className) && !!document.querySelector('flow-agent-panel');
};
window.closeAgentPanel = async function() {
  if (!window.agentPanelOpen()) return { success: true, changed: false };
  const b = document.querySelector('flow-agent-panel .agent-panel-header .header-right button[aria-label="Close"]');
  if (!b) return { success: false, error: 'Agent panel Close button not found' };
  b.click();
  const ok = await window.waitFor(() => !window.agentPanelOpen(), 3000);
  await window.wait(500);
  return { success: !!ok, changed: true };
};

// Auto-click "Always approve" on Agent's confirmation ("Would you like me to kick off this 1 video generation, costing
// 15 credits?" with Approve / Always approve / Reject). STANDING USER RULE (v4): in Agent mode, always click "Always approve"
// when this box appears (it appears on the first video). runQueue() enables this automatically when opts.agent is true.
// Never click Approve or Reject instead.
// UNVERIFIED element type: matches any button/menuitem/role=button whose text is exactly "Always approve".
window.enableAutoApprove = function() {
  if (window.__aaTimer) return { success: true, already: true };
  window.__aaCount = 0;
  window.__aaTimer = setInterval(() => {
    for (const b of document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"]')) {
      const raw = (b.innerText || '').trim();
      if (raw === 'Always approve' || raw.replace(/^[a-z_]+\s+/, '') === 'Always approve') {
        b.click(); window.__aaCount++;
        if (window.__Q) window.__Q.ev.push({ n: ((window.__Q.items[window.__Q.i] || {}).name || ''), s: 'approve', note: 'clicked Always approve', ts: new Date().toISOString() });
        break;
      }
    }
  }, 4000);
  return { success: true };
};
window.disableAutoApprove = function() { if (window.__aaTimer) { clearInterval(window.__aaTimer); window.__aaTimer = null; } return { success: true, clicks: window.__aaCount || 0 }; };

// Flow shows "You've reached your Flow Agent quota limit. Switch to manual prompting or come back tomorrow" in the Agent panel.
window.detectAgentQuota = function() { return /reached your Flow Agent quota limit/i.test(document.body.innerText || ''); };

// ═══════════════════════════════════════════════════════════════════════════════
// v17 — Queue runner: a whole sheet runs INSIDE the page (no per-video round trips).
// items = [{ name, image, script, seconds? }]. `header` (optional) is a common prefix: header + item.script is sent.
// Events are appended to window.__Q.ev: submitting | submitted | downloaded | retry | approve | failed.
// The runner STOPS (state 'stopped') on any hard failure and never re-submits a scene by itself.
// ═══════════════════════════════════════════════════════════════════════════════
window.loadQueue = function(items, opts) {
  opts = opts || {};
  window.__Q = { items: items, i: 0, ev: [], state: 'idle', header: opts.header || '', opts: opts };
  return window.queueChecksum();
};
// [count, total chars, sum of char codes] over name+image+script. Compare with export_queue.py output to prove the
// queue injected into the page is byte-identical to the Excel content.
window.queueChecksum = function() {
  const s = window.__Q.items.map(x => x.name + x.image + x.script).join('');
  let h = 0; for (let k = 0; k < s.length; k++) h += s.charCodeAt(k);
  return [window.__Q.items.length, s.length, h];
};
window.stopQueue = function() { if (window.__Q && window.__Q.state === 'running') window.__Q.state = 'stopping'; return window.__Q && window.__Q.state; };
window.getQueueStatus = function(sinceEv) {
  const Q = window.__Q; if (!Q) return { state: 'none' };
  return { state: Q.state, i: Q.i, total: Q.items.length, current: (Q.items[Q.i] || {}).name || null, now: new Date().toISOString(), nev: Q.ev.length, ev: Q.ev.slice(sinceEv || 0) };
};
// Start WITHOUT await (the javascript_tool call times out at ~45s): `window.runQueue(); 'started'`, then poll getQueueStatus().
// opts: { readyTimeoutMs (default 12 min), quality ('720p'), agent (true = skip the duration check AND auto-click "Always approve"),
//         autoApprove (default = agent), fallbackManual (default true: on Agent quota limit switch to manual + estimated duration and continue),
//         manualModel (default 'Omni 1.1 Flash'), raw (default true) }
window.runQueue = async function(opts) {
  const Q = window.__Q; opts = Object.assign({ readyTimeoutMs: 12 * 60 * 1000, quality: '720p', raw: true }, Q.opts || {}, opts || {});
  Q.state = 'running';
  if (opts.autoApprove === undefined ? !!opts.agent : opts.autoApprove) window.enableAutoApprove();
  const ev = (n, s, note) => Q.ev.push({ n, s, note: note || '', ts: new Date().toISOString() });
  // v4 STANDING USER RULE: when Agent mode runs out of quota, switch to manual mode (model 'Omni 1.1 Flash', duration estimated
  // per script with estimateDuration) and CONTINUE without asking the user. Disable with opts.fallbackManual = false.
  let manual = !opts.agent, appliedSec = null;
  for (; Q.i < Q.items.length && Q.state === 'running'; Q.i++) {
    const it = Q.items[Q.i], n = it.name;
    window.__genKey = n; window.__genRetry = { n: 0, key: n };
    let sec = null;
    if (manual) {
      sec = it.seconds || window.estimateDuration((Q.header || '') + it.script).recommended;
      if (sec !== appliedSec) {
        const a = await window.applySettings({ model: opts.manualModel || 'Omni 1.1 Flash', seconds: sec });
        if (!a.success) { ev(n, 'failed', 'applySettings: ' + JSON.stringify(a)); Q.state = 'stopped'; break; }
        appliedSec = sec; ev(n, 'settings', (opts.manualModel || 'Omni 1.1 Flash') + ' ' + sec + 's (estimated)');
      }
    }
    ev(n, 'submitting'); window.__gen = { status: 'none' };
    const st = window.startGenerate(it.image, (Q.header || '') + it.script, manual ? sec : null, opts.raw);
    if (!st.started) { ev(n, 'failed', 'start: ' + JSON.stringify(st)); Q.state = 'stopped'; break; }
    const g = await window.waitForGenerate(60000);
    if (g.status !== 'done') { ev(n, 'failed', 'generate: ' + JSON.stringify(g)); Q.state = 'stopped'; break; }
    ev(n, 'submitted');
    const t0 = Date.now(); let r = { ready: false }, quotaHit = false;
    while (Date.now() - t0 < opts.readyTimeoutMs && Q.state === 'running') {
      r = await window.waitForVideo(10000); if (r.ready) break;
      if (!manual && r.reason === 'no new tile' && Date.now() - t0 > 120000 && window.detectAgentQuota()) { quotaHit = true; break; }
      if (/Retry used/.test(r.reason || '')) break;
    }
    if (quotaHit) {
      // No tile was created and no credit was charged, so re-submitting THIS scene in manual mode cannot duplicate it.
      if (opts.fallbackManual === false) { ev(n, 'failed', 'agent quota limit reached (no video created, no credit)'); Q.state = 'stopped'; break; }
      ev(n, 'mode_switch', 'agent quota limit reached -> manual mode (Omni 1.1 Flash, estimated duration)');
      manual = true; appliedSec = null; window.disableAutoApprove(); Q.i--; continue;
    }
    if (Q.state !== 'running') break;
    if (!r.ready) { ev(n, 'failed', 'timeout/stuck ' + JSON.stringify(r)); Q.state = 'stopped'; break; }
    const f = await window.finishPipeline(n, opts.quality);
    if (f.success && !f.downloaded) { const d = await window.downloadVideoViaMenu(n, opts.quality); f.downloaded = d.success; f.downloadStartedAt = d.startedAt; f.downloadError = d.error; }
    if (!f.success || !f.downloaded) { ev(n, 'failed', 'finish: ' + JSON.stringify(f)); Q.state = 'stopped'; break; }
    ev(n, 'downloaded', f.downloadStartedAt);
    await window.wait(3000);
  }
  if (Q.state === 'running') Q.state = 'finished'; else if (Q.state === 'stopping') Q.state = 'stopped';
  return window.getQueueStatus(Q.ev.length);
};

'v17 OK. Pipeline: generateVideo() -> wait -> isVideoReady() -> finishPipeline(name). Queue mode: loadQueue() -> runQueue() -> getQueueStatus(). Verify: verifyScript()';
