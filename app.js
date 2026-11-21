'use strict';
/* ตรวจเหล็ก/ความหนา — PWA สำหรับ iPhone 17 Pro Max
   ถ่าย 2 ภาพต่อจุด: 1× (ภาพรวม/ขอบเขตการวัด) + ซูม 2.6–2.9× (ตลับเมตร+ป้าย) พร้อมเช็กโฟกัสสด */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
import { ELEMENTS } from './checklists.js';
const QS = new URLSearchParams(location.search);

const KINDS = {
  rebar: { label: 'เหล็กเสริม · ระยะห่าง', rule: 'tol', tol: 10 },
  cover: { label: 'ระยะหุ้มเหล็ก (cover)', rule: 'min', tol: 0 },
  wall:  { label: 'ความหนาผนัง', rule: 'tol', tol: 10 },
  floor: { label: 'ความหนาพื้น', rule: 'tol', tol: 10 },
};
const TAPE_ZOOMS = [2.6, 2.7, 2.8, 2.9];
const MAIN_FOCAL_35 = 24;          // iPhone กล้องหลัก ≈ 24 mm (35mm-equiv) ใช้ตรวจซูมจาก EXIF

/* ---------- settings ---------- */
const S = { unit: 'm', job: '', inspector: '', sharpMin: 60, gate: true, stamp: true };
try { Object.assign(S, JSON.parse(localStorage.getItem('rc-settings') || '{}')); } catch {}
const saveS = () => { try { localStorage.setItem('rc-settings', JSON.stringify(S)); } catch {} };

/* ---------- IndexedDB ---------- */
const db = await new Promise((res, rej) => {
  const r = indexedDB.open('rebarcheck', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('records', { keyPath: 'id' }); r.result.createObjectStore('models', { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = (st, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(st, mode); const q = fn(t.objectStore(st));
  t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
});
const dbPut = (st, v) => tx(st, 'readwrite', s => s.put(v));
const dbAll = st => tx(st, 'readonly', s => s.getAll());
const dbDel = (st, id) => tx(st, 'readwrite', s => s.delete(id));

/* ---------- helpers ---------- */
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms);
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtTime = ts => new Date(ts).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
function judge(r) {
  if (r.measured == null || r.measured === '') return 'pending';
  const d = r.measured - r.spec;
  return (r.rule === 'min' ? d >= 0 : Math.abs(d) <= r.tol) ? 'pass' : 'fail';
}
// เก็บค่าเป็น มม. ภายใน แสดง/กรอกเป็น ม. (ตั้งค่าเปลี่ยนได้)
const unitM = () => S.unit !== 'mm';
const U = () => unitM() ? 'ม.' : 'มม.';
const toU = mm => (mm == null || mm === '') ? mm : (unitM() ? +(mm / 1000).toFixed(4) : mm);
const fmtU = mm => (mm == null || mm === '') ? '' : (unitM() ? (mm / 1000).toFixed(2) : String(mm));   // 0.xx ม.
const fromU = v => (v === '' || v == null) ? null : (unitM() ? +(+v * 1000).toFixed(2) : +v);
const ruleText = r => `${r.rule === 'min' ? '≥ ' + fmtU(r.spec) : fmtU(r.spec) + ' ± ' + fmtU(r.tol)} ${U()}`;
function setUnitLabels() {
  $$('.u').forEach(e => e.textContent = U());
  ['#iSpec', '#iTol', '#rMeasured'].forEach(id => { $(id).step = unitM() ? '0.01' : 'any'; $(id).placeholder = unitM() ? '0.00' : ''; });
}
let urlPool = [];
const mkUrl = b => { const u = URL.createObjectURL(b); urlPool.push(u); return u; };

if (!/iPhone/.test(navigator.userAgent) && !QS.has('fake')) {
  const w = $('#warn'); w.hidden = false;
  w.textContent = 'แอปนี้ออกแบบสำหรับ iPhone 17 Pro Max — เปิดบนเครื่องอื่นได้เพื่อทดสอบ แต่ซูม/โฟกัสจะต่างจากเครื่องจริง';
}

/* ---------- EXIF: เทียบซูมจากกล้องระบบ ---------- */
async function exifF35(blob) {
  try {
    const v = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < v.byteLength - 4) {
      const m = v.getUint16(o);
      if ((m & 0xFF00) !== 0xFF00) return null;
      const len = v.getUint16(o + 2);
      if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const g16 = p => v.getUint16(p, le), g32 = p => v.getUint32(p, le);
        const rd = p => { const n = g16(p), out = {}; for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; out[g16(e)] = e + 8; } return out; };
        const i0 = rd(t + g32(t + 4));
        if (!i0[0x8769]) return null;
        const i1 = rd(t + g32(i0[0x8769]));
        return i1[0xA405] ? g16(i1[0xA405]) : null;
      }
      o += 2 + len;
    }
  } catch {}
  return null;
}

/* ---------- ความคมโฟกัส (variance of Laplacian ที่พิกเซลจริง) ---------- */
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d', { willReadFrequently: true });
function sharp(src, sx, sy, sw, sh) {
  const sc = Math.min(1, 640 / sw);                       // ไม่ย่อภาพเกิน เพื่อให้เห็นความแตกของขีดตลับเมตร
  const W = Math.max(8, Math.round(sw * sc)), H = Math.max(8, Math.round(sh * sc));
  scratch.width = W; scratch.height = H;
  sctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  const d = sctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const c = y * W + x, l = 4 * g[c] - g[c - 1] - g[c + 1] - g[c - W] - g[c + W];
    s += l; s2 += l * l; n++;
  }
  const m = s / n; return s2 / n - m * m;
}

/* ================= กล้อง ================= */
const video = $('#video'), frame = $('#frame'), roiEl = $('#roi');
const cam = { on: false, stream: null, track: null, caps: {}, hwZ: 1, dig: 1, zoom: 1, ema: 0, step: 'wide',
              roi: { cx: .5, cy: .5, w: .34, h: .24 }, lensId: null };
let flow = null;   // { rec, steps:[], i }

const STEPS = {
  wide: { title: 'ภาพที่ 1 · 1× ภาพรวม', hint: 'ให้เห็นคนงานถึงป้าย + ขอบเขตจุดที่วัดทั้งหมด', zooms: [1], gate: false },
  tape: { title: 'ภาพที่ 2 · ซูม 2.6–2.9× ตลับเมตร+ป้าย', hint: 'แตะจุดบนตลับเมตรเพื่อย้ายกรอบโฟกัส รอให้เป็นสีเขียวแล้วถ่าย', zooms: TAPE_ZOOMS, gate: true },
};

async function startCamera(deviceId) {
  stopCamera();
  let stream;
  if (QS.has('fake')) stream = fakeStream();
  else {
    const v = { width: { ideal: 4032 }, height: { ideal: 3024 }, frameRate: { ideal: 30 } };
    if (deviceId) v.deviceId = { exact: deviceId }; else v.facingMode = { ideal: 'environment' };
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: v });
  }
  cam.stream = stream; cam.track = stream.getVideoTracks()[0];
  cam.caps = cam.track.getCapabilities ? cam.track.getCapabilities() : {};
  video.srcObject = stream; await video.play().catch(() => {});
  await new Promise(r => video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true }));
  cam.on = true; fitFrame();
  try { await cam.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {}
  await fillLenses();
  await setZoom(cam.zoom);
}
function stopCamera() {
  cam.on = false;
  if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
  cam.stream = null; video.srcObject = null;
}
async function fillLenses() {
  const sel = $('#lens');
  if (QS.has('fake') || !navigator.mediaDevices.enumerateDevices) { sel.hidden = true; return; }
  const ds = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && /back|rear|หลัง/i.test(d.label));
  const cur = cam.track.getSettings().deviceId;
  sel.innerHTML = ds.map(d => `<option value="${esc(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label.replace(/^Back\s*/i, '') || 'กล้องหลัง')}</option>`).join('');
  sel.hidden = ds.length < 2; cam.lensId = cur;
}
$('#lens').addEventListener('change', async e => { cam.lensId = e.target.value; await startCamera(cam.lensId); });

async function setZoom(z) {
  cam.zoom = z; cam.hwZ = 1;
  // ใช้ซูมฮาร์ดแวร์เฉพาะเมื่อเบราว์เซอร์รายงานค่า zoom กลับมาจริง (กันซูมซ้อน)
  if (cam.caps.zoom && typeof cam.track.getSettings().zoom === 'number') {
    try {
      await cam.track.applyConstraints({ advanced: [{ zoom: clamp(z, cam.caps.zoom.min, cam.caps.zoom.max) }] });
      const got = cam.track.getSettings().zoom; if (typeof got === 'number' && got > 0) cam.hwZ = got;
    } catch {}
  }
  cam.dig = Math.max(1, z / cam.hwZ); if (cam.dig < 1.02) cam.dig = 1;
  video.style.transform = cam.dig > 1 ? `scale(${cam.dig})` : '';
  const hw = cam.hwZ > 1.02;
  $('#zoomMode').innerHTML = `${z.toFixed(1)}×<br>${hw ? (cam.dig > 1 ? 'ออปติก+ดิจิทัล' : 'ซูมฮาร์ดแวร์') : (z > 1 ? 'ครอปดิจิทัล' : 'เลนส์หลัก')}<br>${video.videoWidth}×${video.videoHeight}`;
  $$('#zoombar button').forEach(b => b.classList.toggle('on', +b.dataset.z === z));
  cam.ema = 0;
}
function fitFrame() {
  const st = $('#stage'), vw = video.videoWidth || 3, vh = video.videoHeight || 4;
  const k = Math.min(st.clientWidth / vw, st.clientHeight / vh);
  frame.style.width = vw * k + 'px'; frame.style.height = vh * k + 'px';
  placeRoi();
}
addEventListener('resize', () => cam.on && fitFrame());
function placeRoi() {
  const r = cam.roi; roiEl.style.left = r.cx * 100 + '%'; roiEl.style.top = r.cy * 100 + '%';
  roiEl.style.width = r.w * 100 + '%'; roiEl.style.height = r.h * 100 + '%';
}
frame.addEventListener('pointerdown', e => {
  const b = frame.getBoundingClientRect();
  cam.roi.cx = clamp((e.clientX - b.left) / b.width, cam.roi.w / 2, 1 - cam.roi.w / 2);
  cam.roi.cy = clamp((e.clientY - b.top) / b.height, cam.roi.h / 2, 1 - cam.roi.h / 2);
  placeRoi(); cam.ema = 0;
  // พยายามให้เลนส์โฟกัสที่จุดแตะ (Safari ยังไม่รองรับ pointsOfInterest — ไม่รองรับก็ข้าม)
  if (cam.caps.focusMode) cam.track.applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x: cam.roi.cx, y: cam.roi.cy }] }] })
    .then(() => cam.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })).catch(() => {});
});

// พื้นที่ภาพที่ผู้ใช้เห็น/ที่จะถูกบันทึก (หลังครอปดิจิทัล) ในพิกัดวิดีโอ
function cropRect() {
  const vw = video.videoWidth, vh = video.videoHeight, sw = vw / cam.dig, sh = vh / cam.dig;
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}
const roiIn = (c, W, H) => { // ROI เศษส่วน → สี่เหลี่ยมพิกเซลในแหล่ง W×H
  const r = cam.roi; return { x: c.sx + (r.cx - r.w / 2) * c.sw, y: c.sy + (r.cy - r.h / 2) * c.sh, w: r.w * c.sw, h: r.h * c.sh };
};

setInterval(() => {
  if (!cam.on || !video.videoWidth) return;
  const c = cropRect(), r = roiIn(c);
  const s = sharp(video, r.x, r.y, r.w, r.h);
  cam.ema = cam.ema ? cam.ema * .55 + s * .45 : s;
  const ok = cam.ema >= S.sharpMin, max = Math.max(S.sharpMin * 2, 1);
  $('#sharpBar').style.transform = `scaleX(${clamp(cam.ema / max, .02, 1)})`;
  $('#sharpBar').classList.toggle('ok', ok);
  $('#sharpMark').style.left = S.sharpMin / max * 100 + '%';
  $('#sharpTxt').textContent = `${ok ? 'คม' : 'ไม่คม'} ${Math.round(cam.ema)} / ${S.sharpMin}`;
  roiEl.classList.toggle('ok', ok); roiEl.classList.toggle('bad', !ok);
  $('#shutter').classList.toggle('blur', !ok && STEPS[cam.step].gate);
}, 180);

async function shoot() {
  const st = STEPS[cam.step];
  if (st.gate && S.gate && cam.ema < S.sharpMin) { toast('ภาพตลับเมตรยังไม่คม — ถอยห่าง/รอโฟกัส/เพิ่มแสง แล้วถ่ายใหม่'); return; }
  const c = cropRect(), cv = document.createElement('canvas');
  cv.width = Math.round(c.sw); cv.height = Math.round(c.sh);
  cv.getContext('2d').drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, cv.width, cv.height);
  const r = cam.roi, score = sharp(cv, (r.cx - r.w / 2) * cv.width, (r.cy - r.h / 2) * cv.height, r.w * cv.width, r.h * cv.height);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .92));
  await takeShot(cam.step, { blob, w: cv.width, h: cv.height, zoom: +cam.zoom.toFixed(2), zoomMode: cam.hwZ > 1.02 ? 'hardware' : (cam.dig > 1 ? 'digital-crop' : 'native'),
    sharp: Math.round(score), sharpMin: S.sharpMin, at: Date.now(), src: 'app', lens: $('#lens').selectedOptions[0]?.textContent || null });
}
$('#shutter').addEventListener('click', shoot);

// กล้องระบบ (เต็มความละเอียด) — ตรวจความคม + ซูมจาก EXIF ภายหลัง
/* โหลดรูปให้ได้ทุกกรณี (Safari บางรุ่นไม่รองรับตัวเลือกของ createImageBitmap / รูปใหญ่มาก) */
async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
  try { return await createImageBitmap(blob); } catch {}
  const u = URL.createObjectURL(blob);
  try { const im = new Image(); im.src = u; await im.decode(); return im; }
  finally { setTimeout(() => URL.revokeObjectURL(u), 3000); }
}
async function fromFile(e, src) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  toast('กำลังประมวลผลรูป…', 8000);
  try {
    const bmp = await loadBitmap(f);
    const bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight;
    const r = cam.roi, w = bw * r.w, h = bh * r.h;
    const score = sharp(bmp, bw * r.cx - w / 2, bh * r.cy - h / 2, w, h);
    const f35 = await exifF35(f);
    const zoom = f35 ? +(f35 / MAIN_FOCAL_35).toFixed(2) : null;
    $('#toast').hidden = true;
    await takeShot(cam.step, { blob: f, w: bw, h: bh, zoom, f35, zoomMode: src === 'album' ? 'album' : 'system-camera', sharp: Math.round(score), sharpMin: S.sharpMin,
      at: src === 'album' && f.lastModified ? f.lastModified : Date.now(), src });
  } catch (err) {
    console.error(err); toast('อ่านรูปไม่ได้: ' + (err.message || err.name || 'ไม่ทราบสาเหตุ') + ' — ลองรูปอื่น', 6000);
  }
}
$('#sysFile').addEventListener('change', e => fromFile(e, 'system'));
$('#albFile').addEventListener('change', e => fromFile(e, 'album'));

function advance() {
  flow.i++;
  if (flow.i < flow.steps.length) enterStep(flow.steps[flow.i]);
  else { closeCamera(); openReview(flow.rec, flow.isNew); }
}
async function takeShot(step, shot) { flow.rec.shots[step] = shot; advance(); }   // ถ่าย/อัปรูปใหม่ → แทนที่รูปเดิม
let prevUrl = null;
function updatePrev() {   // รูปที่เคยถ่ายไว้ของขั้นนี้ (แคชใน rec.shots) — ไม่อัปใหม่ก็ใช้ของเดิมได้
  if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = null; }
  const s = flow && flow.rec.shots[cam.step];
  $('#prevCard').hidden = !s;
  if (s) { prevUrl = URL.createObjectURL(s.blob); $('#prevImg').src = prevUrl;
    $('#prevTxt').textContent = `${s.zoom != null ? s.zoom + '×' : ''} · คม ${s.sharp}${s.src === 'album' ? ' · อัลบั้ม' : ''}`; }
  $('#camBack').hidden = !(flow && flow.i > 0);
}
$('#prevUse').addEventListener('click', () => advance());
$('#camBack').addEventListener('click', () => { if (flow && flow.i > 0) { flow.i--; enterStep(flow.steps[flow.i]); } });
async function enterStep(step) {
  cam.step = step; const st = STEPS[step];
  $('#camStep').textContent = st.title; $('#camHint').textContent = st.hint;
  cam.roi = step === 'tape' ? { cx: .5, cy: .55, w: .34, h: .22 } : { cx: .5, cy: .5, w: .4, h: .3 };
  placeRoi();
  $('#zoombar').innerHTML = st.zooms.length > 1 ? st.zooms.map(z => `<button data-z="${z}">${z.toFixed(1)}×</button>`).join('') : `<button data-z="1" disabled>1× (ล็อก)</button>`;
  $$('#zoombar button').forEach(b => b.onclick = () => setZoom(+b.dataset.z));
  $('#shutter').classList.remove('blur'); updatePrev();
  if (cam.on) await setZoom(step === 'tape' ? 2.8 : 1);
  else cam.zoom = step === 'tape' ? 2.8 : 1;
}
async function openCamera(rec, steps, isNew) {
  flow = { rec, steps, i: 0, isNew }; $('#cam').hidden = false;
  await enterStep(steps[0]);
  try { await startCamera(cam.lensId); await setZoom(cam.zoom); }
  catch (err) {
    toast('เปิดกล้องไม่ได้ (' + (err.name || err) + ') — ต้องเปิดผ่าน https และอนุญาตกล้อง ใช้ปุ่ม “กล้องระบบ” แทนได้', 5000);
  }
}
function closeCamera() { stopCamera(); $('#cam').hidden = true; if (prevUrl) { URL.revokeObjectURL(prevUrl); prevUrl = null; } }
$('#camClose').addEventListener('click', () => { closeCamera(); if (flow && !flow.isNew) openReview(flow.rec, false); flow = null; });

function fakeStream() {  // โหมดทดสอบบนคอมพิวเตอร์ ?fake
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'); let t = 0;
  const draw = () => {
    t++; x.fillStyle = '#8d8a82'; x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = '#e8c21a'; x.fillRect(300, 520, 1000, 120);
    x.fillStyle = '#111'; x.font = '28px sans-serif';
    for (let i = 0; i <= 50; i++) { const px = 300 + i * 20; x.fillRect(px, 520, 2, i % 10 ? 30 : 60); if (i % 10 === 0) x.fillText(i / 10 * 10, px - 10, 620); }
    x.fillStyle = '#fff'; x.fillRect(560, 760, 480, 160); x.fillStyle = '#c00'; x.font = 'bold 56px sans-serif'; x.fillText('W3 / A-3', 600, 860);
    if (Math.floor(t / 90) % 2) { x.filter = 'blur(6px)'; x.drawImage(c, 0, 0); x.filter = 'none'; }
    requestAnimationFrame(draw);
  }; draw(); return c.captureStream(15);
}

/* ================= รายการ ================= */
async function renderList() {
  urlPool.forEach(URL.revokeObjectURL); urlPool = [];
  const recs = (await dbAll('records')).sort((a, b) => b.createdAt - a.createdAt);
  $('#jobName').textContent = S.job || 'ยังไม่ตั้งชื่องาน (⚙)';
  const blur = r => Object.values(r.shots).some(s => s && s.sharp < (s.sharpMin ?? S.sharpMin) && s === r.shots.tape);
  const n = k => recs.filter(r => judge(r) === k).length;
  $('#summary').innerHTML = `<div><b>${recs.length}</b><span>ทั้งหมด</span></div><div class="pass"><b>${n('pass')}</b><span>ผ่าน</span></div><div class="fail"><b>${n('fail')}</b><span>ไม่ผ่าน</span></div><div class="blur"><b>${recs.filter(blur).length}</b><span>ภาพไม่คม</span></div>`;
  $('#empty').hidden = recs.length > 0;
  $('#recs').innerHTML = recs.map(r => {
    const j = judge(r), img = r.shots.tape || r.shots.wide;
    return `<li data-id="${r.id}"><img alt="" src="${img ? mkUrl(img.blob) : ''}"><div class="main"><div class="t">${esc(r.label)}</div>${r.element ? `<div class="m">☑ ${esc(ELEMENTS[r.element]?.label)} · ${esc(ELEMENTS[r.element]?.items.find(i => i.id === r.checkId)?.t || '')}</div>` : ''}<div class="m">${esc(KINDS[r.kind].label)} · ${ruleText(r)}</div><div class="m">${r.measured != null && r.measured !== '' ? 'วัดได้ ' + fmtU(r.measured) + ' ' + U() + ' · ' : ''}${fmtTime(r.createdAt)}</div></div>
      <span class="chip ${blur(r) && j === 'pending' ? 'blur' : j}">${{ pass: 'ผ่าน', fail: 'ไม่ผ่าน', pending: blur(r) ? 'ไม่คม' : 'รอวัด' }[j]}</span></li>`;
  }).join('');
  $$('#recs li').forEach(li => li.onclick = async () => openReview((await dbAll('records')).find(r => r.id === li.dataset.id), false));
}

/* ----- บันทึกใหม่ ----- */
$('#iKind').innerHTML = Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
const applyKind = () => { const k = KINDS[$('#iKind').value]; $('#iRule').value = k.rule; $('#iTol').value = fmtU(k.tol); };
$('#iKind').addEventListener('change', applyKind); applyKind();
$('#iElem').insertAdjacentHTML('beforeend', Object.entries(ELEMENTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join(''));
$('#iElem').addEventListener('change', () => {
  const e = ELEMENTS[$('#iElem').value]; $('#lItem').hidden = !e;
  if (e) { $('#iItem').innerHTML = e.items.map(i => `<option value="${i.id}">${esc(i.t)}</option>`).join(''); fillItem(); }
});
function fillItem() {
  const e = ELEMENTS[$('#iElem').value], it = e && e.items.find(i => i.id === $('#iItem').value); if (!it) return;
  if (it.kind) { $('#iKind').value = it.kind; applyKind(); }
  $('#iLabel').placeholder = `${e.label} — รหัสจุด เช่น ${e.label} C12 ชั้น 2`;
}
$('#iItem').addEventListener('change', fillItem);
$('#btnNew').onclick = () => { $('#dlgInfo').showModal(); };
$('#iCancel').onclick = () => $('#dlgInfo').close();
$('#fInfo').addEventListener('submit', e => {
  const rec = { id: uid(), createdAt: Date.now(), job: S.job, inspector: S.inspector, kind: $('#iKind').value, label: $('#iLabel').value.trim(),
    spec: fromU($('#iSpec').value), rule: $('#iRule').value, tol: fromU($('#iTol').value) || 0, measured: null, note: '', shots: {}, gps: null,
    element: $('#iElem').value || null, checkId: $('#iElem').value ? $('#iItem').value : null,
    model: { ref: null, pos: null }, device: navigator.userAgent };
  navigator.geolocation?.getCurrentPosition(p => { rec.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; }, () => {}, { timeout: 5000, maximumAge: 60000 });
  $('#iLabel').value = '';
  setTimeout(() => openCamera(rec, ['wide', 'tape'], true), 50);
});

/* ----- ตรวจทาน / แก้ไข ----- */
let cur = null, curNew = false;
function qcText(step, s) {
  if (!s) return ['ยังไม่มีภาพ', 'bad'];
  const out = []; let cls = 'ok';
  if (step === 'tape') {
    const th = s.sharpMin ?? S.sharpMin;
    if (s.sharp < th) { out.push(`ไม่คม (${s.sharp} < ${th})`); cls = 'bad'; } else out.push(`คม (${s.sharp})`);
  }
  if (s.src === 'album') out.push('จากอัลบั้ม');
  if (s.zoom != null) {
    const inRange = step === 'tape' ? s.zoom >= 2.55 && s.zoom <= 2.95 : s.zoom >= .9 && s.zoom <= 1.1;
    out.push(`ซูม ${s.zoom}×${s.src !== 'app' ? ' (EXIF)' : ''}`);
    if (!inRange) { cls = 'bad'; out.push('นอกช่วง'); }
  } else if (s.src !== 'app') { out.push('อ่านซูมจาก EXIF ไม่ได้'); if (cls === 'ok') cls = 'warn'; }
  return [out.join(' · '), cls];
}
function openReview(rec, isNew) {
  cur = rec; curNew = isNew; urlPool.forEach(URL.revokeObjectURL); urlPool = [];
  $('#rvTitle').textContent = rec.label;
  $('#rvMeta').textContent = `${KINDS[rec.kind].label} · เกณฑ์ ${ruleText(rec)} · ${fmtTime(rec.createdAt)}`;
  for (const [step, id] of [['wide', 'Wide'], ['tape', 'Tape']]) {
    const s = rec.shots[step]; $('#img' + id).src = s ? mkUrl(s.blob) : $('#img' + id).src;
    const [t, c] = qcText(step, s); const q = $('#qc' + id); q.textContent = t; q.className = 'qc ' + c;
  }
  $('#rMeasured').value = fmtU(rec.measured); $('#rNote').value = rec.note || '';
  $('#rDelete').hidden = isNew; $('#rShare').hidden = false; updResult();
  if (!$('#dlgReview').open) $('#dlgReview').showModal();
}
function updResult() {
  const m = $('#rMeasured').value; const r = { ...cur, measured: fromU(m) }; const j = judge(r);
  const b = $('#rResult'); b.textContent = { pass: 'ผ่าน', fail: 'ไม่ผ่าน', pending: '—' }[j]; b.className = j;
}
$('#rMeasured').addEventListener('input', updResult);
$$('[data-retake]').forEach(b => b.onclick = () => { $('#dlgReview').close(); openCamera(cur, [b.dataset.retake], curNew); });
$('#fReview').addEventListener('submit', async () => {
  const m = $('#rMeasured').value; cur.measured = fromU(m); cur.note = $('#rNote').value;
  await dbPut('records', cur); toast('บันทึกแล้ว'); renderList();
});
$('#dlgReview').addEventListener('cancel', () => { if (curNew) { /* ยังไม่บันทึก: ถือว่ายกเลิก */ } });
$('#rDelete').onclick = async () => {
  if (!confirm('ลบบันทึกนี้ถาวร?')) return;
  await dbDel('records', cur.id); $('#dlgReview').close(); renderList();
};

/* ----- ภาพประทับ + แชร์/ส่งออก ----- */
async function stamped(rec, step) {
  const s = rec.shots[step]; if (!s) return null;
  if (!S.stamp) return s.blob;
  const bmp = await loadBitmap(s.blob);
  const cv = document.createElement('canvas'); const bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight; cv.width = bw; cv.height = bh;
  const x = cv.getContext('2d'); x.drawImage(bmp, 0, 0);
  const fs = Math.round(bw / 34), pad = fs * .6;
  const lines = [`${rec.job || ''} · ${rec.label}`,
    `${KINDS[rec.kind].label} · เกณฑ์ ${ruleText(rec)}${rec.measured != null ? ' · วัดได้ ' + fmtU(rec.measured) + ' ' + U() + ' (' + { pass: 'ผ่าน', fail: 'ไม่ผ่าน' }[judge(rec)] + ')' : ''}`,
    `${fmtTime(s.at)} · ${step === 'wide' ? '1×' : 'ซูม ' + (s.zoom ?? '?') + '×'} · คม ${s.sharp}${rec.gps ? ` · ${rec.gps.lat.toFixed(5)},${rec.gps.lng.toFixed(5)}` : ''}`];
  const h = lines.length * fs * 1.3 + pad * 2;
  x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(0, cv.height - h, cv.width, h);
  x.fillStyle = '#fff'; x.font = `${fs}px -apple-system, sans-serif`; x.textBaseline = 'top';
  lines.forEach((l, i) => x.fillText(l, pad, cv.height - h + pad + i * fs * 1.3));
  return new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#rShare').onclick = async () => {
  const m = $('#rMeasured').value; cur.measured = fromU(m);
  const safe = cur.label.replace(/[^\w฀-๿-]+/g, '_');
  const files = [];
  for (const st of ['wide', 'tape']) { const b = await stamped(cur, st); if (b) files.push(new File([b], `${safe}_${st}.jpg`, { type: 'image/jpeg' })); }
  if (navigator.canShare?.({ files })) { try { await navigator.share({ files, title: cur.label }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  files.forEach(f => download(f, f.name));
};
$('#btnExport').onclick = async () => {
  const recs = await dbAll('records');
  const data = recs.map(({ shots, ...r }) => ({ ...r, result: judge(r), shots: Object.fromEntries(Object.entries(shots).map(([k, s]) => [k, { ...s, blob: undefined, file: `${r.id}_${k}.jpg` }])) }));
  download(new Blob([JSON.stringify({ app: 'rebar-check', exportedAt: Date.now(), job: S.job, records: data }, null, 2)], { type: 'application/json' }), `rebar-check-${new Date().toISOString().slice(0, 10)}.json`);
};
$('#btnReport').onclick = async () => {
  const recs = (await dbAll('records')).sort((a, b) => a.createdAt - b.createdAt);
  const urls = [];
  const imgs = async r => { let h = ''; for (const st of ['wide', 'tape']) { const b = await stamped(r, st); if (b) { const u = URL.createObjectURL(b); urls.push(u); h += `<img src="${u}" alt="">`; } } return h; };
  let html = `<h2>${esc(S.job || 'รายงานตรวจ')} — ผู้ตรวจ ${esc(S.inspector)}</h2>`;
  for (const r of recs) html += `<div class="pr"><h3>${esc(r.label)} · ${esc(KINDS[r.kind].label)} · เกณฑ์ ${ruleText(r)} · วัดได้ ${r.measured != null ? fmtU(r.measured) + ' ' + U() : '-'} · ${{ pass: 'ผ่าน', fail: 'ไม่ผ่าน', pending: 'รอวัด' }[judge(r)]}</h3>${await imgs(r)}</div>`;
  $('#print').innerHTML = html; await new Promise(r => setTimeout(r, 300)); print();
  setTimeout(() => urls.forEach(URL.revokeObjectURL), 20000);
};

/* ----- ตั้งค่า ----- */
$('#btnSettings').onclick = () => {
  $('#sJob').value = S.job; $('#sInspector').value = S.inspector; $('#sSharp').value = S.sharpMin; $('#sSharpOut').textContent = S.sharpMin;
  $('#sUnit').value = S.unit; $('#sGate').checked = S.gate; $('#sStamp').checked = S.stamp; $('#dlgSettings').showModal();
};
$('#sSharp').oninput = e => $('#sSharpOut').textContent = e.target.value;
$('#fSet').addEventListener('submit', () => {
  Object.assign(S, { unit: $('#sUnit').value, job: $('#sJob').value.trim(), inspector: $('#sInspector').value.trim(), sharpMin: +$('#sSharp').value, gate: $('#sGate').checked, stamp: $('#sStamp').checked });
  saveS(); setUnitLabels(); applyKind(); renderList();
});

/* ================= แท็บ + โมเดล 3D ================= */
$$('.tabs button').forEach(b => b.onclick = () => {
  $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#v-list').hidden = b.dataset.v !== 'list'; $('#v-model').hidden = b.dataset.v !== 'model';
  $('#btnNew').hidden = b.dataset.v !== 'list';
  if (b.dataset.v === 'model') initViewer();
});

let V3 = null, V3p = null;
const vState = { wire: false, xray: false, rot: false, pan: false, scan: true, pin: false, scanOp: .7 };
function mLoad(p) { const e = $('#mLoad'); e.hidden = p == null || p >= 100; if (p != null) { $('#mLoadTxt').textContent = `Loading ${Math.round(p)}%`; $('#mLoadBar').style.width = p + '%'; } }
function initViewer() {
  if (V3) { V3.resize(); V3.refreshPins(); return Promise.resolve(V3); }
  return V3p || (V3p = (async () => {
    const host = $('#viewer');
    try {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
      host.innerHTML = '';
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b2029);
      const camera = new THREE.PerspectiveCamera(50, 1, .05, 5000); camera.position.set(6, 5, 8);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(5, 10, 7); scene.add(dl);
      scene.add(new THREE.GridHelper(40, 40, 0x556677, 0x334455));
      const ctl = new OrbitControls(camera, renderer.domElement); ctl.enableDamping = true; ctl.autoRotateSpeed = 1.5;
      const design = new THREE.Group(), scan = new THREE.Group(), pins = new THREE.Group(); scene.add(design, scan, pins);
      let size = 10, center = new THREE.Vector3();
      const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      addEventListener('resize', resize); resize();
      renderer.setAnimationLoop(() => { ctl.update(); renderer.render(scene, camera); });

      const eachMat = (g, fn) => g.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => fn(m, o)); });
      const applyStyle = () => {
        eachMat(design, m => { m.wireframe = vState.wire; m.transparent = vState.xray; m.opacity = vState.xray ? .3 : 1; m.depthWrite = !vState.xray; m.needsUpdate = true; });
        eachMat(scan, (m, o) => { m.transparent = true; m.opacity = vState.scanOp; m.depthWrite = vState.scanOp >= .99; if (o.isMesh) m.wireframe = vState.wire; m.needsUpdate = true; });
        scan.visible = vState.scan; ctl.autoRotate = vState.rot;
        ctl.mouseButtons.LEFT = vState.pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; ctl.touches.ONE = vState.pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      };
      const frame = () => {
        const box = new THREE.Box3(); [design, scan].forEach(g => g.children.length && box.expandByObject(g));
        if (box.isEmpty()) return; box.getCenter(center); size = box.getSize(new THREE.Vector3()).length() || 10;
        ctl.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(.7, .6, .9).multiplyScalar(size));
        camera.near = size / 500; camera.far = size * 30; camera.updateProjectionMatrix();
      };
      const loadFile = (blob, name, group, label) => new Promise(res => {
        const url = URL.createObjectURL(blob), ext = name.split('.').pop().toLowerCase(); mLoad(0);
        const done = obj => { group.clear(); group.add(obj); applyStyle(); frame(); mLoad(100); URL.revokeObjectURL(url); V3 && V3.refreshPins(); res(true); };
        const fail = () => { mLoad(100); URL.revokeObjectURL(url); toast(`อ่าน${label}ไม่ได้`); res(false); };
        const prog = e => e.total && mLoad(e.loaded / e.total * 100);
        if (ext === 'ply') new PLYLoader().load(url, g => {
          if (g.computeVertexNormals && g.index) g.computeVertexNormals(); const hasC = !!g.getAttribute('color');
          done(g.index ? new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: hasC, color: hasC ? 0xffffff : 0x9fb4c8, side: THREE.DoubleSide }))
                       : new THREE.Points(g, new THREE.PointsMaterial({ size: .02, sizeAttenuation: true, vertexColors: hasC, color: hasC ? 0xffffff : 0x7fd4ff })));
        }, prog, fail);
        else new GLTFLoader().load(url, g => done(g.scene), prog, fail);
      });
      const tfScan = () => {
        const v = id => +$(id).value;
        scan.rotation.y = v('#aRy') * Math.PI / 180; scan.position.set(v('#aX'), v('#aY'), v('#aZ')); scan.scale.setScalar(v('#aS'));
        vState.scanOp = v('#aOp') / 100; applyStyle();
        ['Ry', 'X', 'Y', 'Z', 'S', 'Op'].forEach(k => $('#o' + k).textContent = $('#a' + k).value);
      };
      $$('.align input').forEach(i => i.oninput = tfScan);

      /* หมุดบันทึกตรวจ <-> ตำแหน่งบนโมเดล/สแกน */
      let recsCache = [];
      const refreshPins = async () => {
        recsCache = await dbAll('records'); pins.clear();
        const r0 = size * .012;
        recsCache.filter(r => r.model && r.model.pos).forEach(r => {
          const col = { pass: 0x2ecc71, fail: 0xff4d4d, pending: 0xffb020 }[judge(r)];
          const m = new THREE.Mesh(new THREE.SphereGeometry(r0, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false }));
          m.renderOrder = 10; m.position.fromArray(r.model.pos); m.userData.rec = r; pins.add(m);
        });
        const sel = $('#pinRec'), keep = sel.value;
        sel.innerHTML = '<option value="">— เลือกบันทึกที่จะปักหมุด —</option>' + [...recsCache].sort((a, b) => b.createdAt - a.createdAt).map(r => `<option value="${r.id}">${r.model && r.model.pos ? '📍 ' : ''}${esc(r.label)}</option>`).join('');
        sel.value = keep;
      };
      const inScan = o => { while (o) { if (o === scan) return true; o = o.parent; } return false; };
      const ray = new THREE.Raycaster(); let down = null;
      renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
      renderer.domElement.addEventListener('pointerup', async e => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; down = null;
        const b = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
        ray.params.Points.threshold = size * .01;
        if (!vState.pin) {
          const h = ray.intersectObjects(pins.children)[0];
          if (h) { const r = h.object.userData.rec; toast(`${r.label} — ${{ pass: 'ผ่าน', fail: 'ไม่ผ่าน', pending: 'รอวัด' }[judge(r)]}${r.measured != null ? ' · วัดได้ ' + fmtU(r.measured) + ' ' + U() : ''}`, 3500); }
          return;
        }
        const id = $('#pinRec').value; if (!id) { toast('เลือกบันทึกที่จะปักหมุดก่อน'); return; }
        const hit = ray.intersectObjects([design, scan], true)[0]; if (!hit) { toast('แตะบนผิวโมเดล/สแกน'); return; }
        const r = recsCache.find(x => x.id === id);
        r.model = { ref: inScan(hit.object) ? 'scan' : 'design', pos: hit.point.toArray() };
        await dbPut('records', r); toast('ปักหมุดแล้ว'); await refreshPins(); $('#pinRec').value = id; renderList();
      });

      V3 = { resize, refreshPins, loadFile, design, scan, pins, applyStyle,
        eye() { const t = center.clone(); t.y = 1.6; ctl.target.copy(t); camera.position.set(center.x, 1.6, center.z + size * .35); },
        reset: frame };
      applyStyle();
      for (const [id, g, lab] of [['glb', design, 'แบบ 3D'], ['scan', scan, 'สแกน LiDAR']]) {
        const m = (await dbAll('models')).find(x => x.id === id); if (m) await loadFile(m.blob, m.name, g, lab);
      }
      await refreshPins();
      return V3;
    } catch (e) { console.error(e); host.innerHTML = '<p class="empty">โหลดตัวแสดง 3D ไม่ได้ (ต้องออนไลน์ครั้งแรก)</p>'; V3p = null; return null; }
  })());
}
$('#vtools').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const v = await initViewer(); if (!v) return;
  const t = b.dataset.t;
  if (t === 'reset') { v.reset(); return; }
  if (t === 'eye') { v.eye(); return; }
  vState[t] = !vState[t]; b.setAttribute('aria-pressed', vState[t]);
  v.applyStyle();
});
$('#pinBtn').addEventListener('click', e => { vState.pin = !vState.pin; e.currentTarget.setAttribute('aria-pressed', vState.pin); if (vState.pin) toast('แตะตำแหน่งบนโมเดล/สแกนเพื่อปักหมุด'); });
$('#modelFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.name.toLowerCase().endsWith('.skp')) {
    await dbPut('models', { id: 'skp', kind: 'skp', name: f.name, blob: f, at: Date.now() });
    $('#modelNote').textContent = `เก็บ ${f.name} แล้ว — เบราว์เซอร์อ่าน .skp ตรงๆ ไม่ได้ ให้ Export จาก SketchUp เป็น glTF/.glb (หรือรอฟีเจอร์แปลงอัตโนมัติ) แล้วแนบอีกครั้ง`; return;
  }
  const v = await initViewer(); if (!v) return;
  if (await v.loadFile(f, f.name, v.design, 'แบบ 3D')) { await dbPut('models', { id: 'glb', kind: 'glb', name: f.name, blob: f, at: Date.now() }); $('#modelNote').textContent = 'ลาก 1 นิ้ว = หมุน · บีบ = ซูม · ลาก 2 นิ้ว = เลื่อน'; }
});
$('#scanFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const v = await initViewer(); if (!v) return;
  if (await v.loadFile(f, f.name, v.scan, 'สแกน LiDAR')) { await dbPut('models', { id: 'scan', kind: 'scan', name: f.name, blob: f, at: Date.now() }); $('#modelNote').textContent = 'ใช้ “จัดตำแหน่งสแกน” ให้ซ้อนกับแบบ แล้วปักหมุดบันทึกตรวจ'; }
});

/* ---------- เริ่มต้น ---------- */
setUnitLabels(); applyKind();
await renderList();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.();   // ขอให้ iOS ไม่ล้างภาพที่เก็บไว้
