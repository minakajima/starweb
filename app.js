/* =========================================================
   天の川撮影プランナー — app.js
   Section 0: 設定 (localStorage)
   ========================================================= */

const SETTINGS_KEY = 'starweb-settings';

const DEFAULT_SETTINGS = {
  focalLength:  '',
  sensorKey:    'full',
  orientation:  'portrait',
  showFov:      true,        // 画角枠のデフォルト表示
  viewHFov:     110,
  optimalCount: 5,
  minGcAlt:     5,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// 起動時に設定を読み込んでグローバルに保持
let appSettings = loadSettings();

/* =========================================================
   Section 1: 天文計算ユーティリティ
   ========================================================= */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// --- Julian Day ---
function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// --- Greenwich Mean Sidereal Time (degrees) ---
function calcGMST(date) {
  const jd = dateToJD(date);
  const T = (jd - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
           + 0.000387933 * T * T - T * T * T / 38710000;
  return ((gmst % 360) + 360) % 360;
}

// --- Local Sidereal Time (degrees) ---
function calcLST(date, lonDeg) {
  return ((calcGMST(date) + lonDeg) % 360 + 360) % 360;
}

// --- Equatorial (RA/Dec) → Horizontal (Alt/Az) ---
function equatorialToHorizontal(raDeg, decDeg, latDeg, date, lonDeg) {
  const lst = calcLST(date, lonDeg);
  const ha  = ((lst - raDeg) % 360 + 360) % 360; // Hour Angle
  const haR = ha  * DEG;
  const dR  = decDeg * DEG;
  const lR  = latDeg * DEG;

  const sinAlt = Math.sin(dR) * Math.sin(lR) + Math.cos(dR) * Math.cos(lR) * Math.cos(haR);
  const altR   = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (Math.sin(dR) - Math.sin(lR) * sinAlt) / (Math.cos(lR) * Math.cos(altR));
  const sinAz = -Math.cos(dR) * Math.sin(haR) / Math.cos(altR);
  let azDeg   = Math.atan2(sinAz, cosAz) * RAD;
  azDeg = ((azDeg % 360) + 360) % 360;

  return { altDeg: altR * RAD, azDeg };
}

// --- 銀河座標 (l,b) → 赤道座標 (RA/Dec) J2000 ---
function galacticToEquatorial(lDeg, bDeg) {
  const RA_NGP  = 192.85948 * DEG;
  const DEC_NGP = 27.12825  * DEG;
  const L_ASC   = 32.93192  * DEG;
  const lR = lDeg * DEG, bR = bDeg * DEG;

  const sinDec = Math.sin(DEC_NGP) * Math.sin(bR)
               + Math.cos(DEC_NGP) * Math.cos(bR) * Math.cos(lR - L_ASC);
  const decR   = Math.asin(Math.max(-1, Math.min(1, sinDec)));

  const xNum = Math.cos(bR) * Math.sin(lR - L_ASC);
  const xDen = Math.cos(DEC_NGP) * Math.sin(bR)
             - Math.sin(DEC_NGP) * Math.cos(bR) * Math.cos(lR - L_ASC);
  let raDeg  = (RA_NGP * RAD + Math.atan2(xNum, xDen) * RAD);
  raDeg = ((raDeg % 360) + 360) % 360;

  return { raDeg, decDeg: decR * RAD };
}

// --- 銀河中心の Alt/Az ---
function galacticCenterAltAz(date, latDeg, lonDeg) {
  // 銀河中心: l=0, b=0  RA≈266.417°, Dec≈-29.008°
  return equatorialToHorizontal(266.417, -29.008, latDeg, date, lonDeg);
}

// --- 天の川帯の点列 (銀河面 b=0, l=0..360) ---
function getMilkyWayPoints(date, latDeg, lonDeg, numPoints) {
  const pts = [];
  for (let i = 0; i <= numPoints; i++) {
    const l = (i / numPoints) * 360;
    const { raDeg, decDeg } = galacticToEquatorial(l, 0);
    const { altDeg, azDeg } = equatorialToHorizontal(raDeg, decDeg, latDeg, date, lonDeg);
    // 銀河中心からの角距離（輝度計算用）
    const distFromCenter = Math.min(Math.abs(l), 360 - Math.abs(l));
    pts.push({ altDeg, azDeg, l, distFromCenter });
  }
  return pts;
}

// --- 月齢の絵文字 ---
function moonPhaseEmoji(phase) {
  if (phase < 0.05 || phase > 0.95) return '🌑';
  if (phase < 0.20) return '🌒';
  if (phase < 0.30) return '🌓';
  if (phase < 0.45) return '🌔';
  if (phase < 0.55) return '🌕';
  if (phase < 0.70) return '🌖';
  if (phase < 0.80) return '🌗';
  return '🌘';
}

// --- 薄明時刻のフォーマット ---
function formatTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(getCurrentLocale(), { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  const opts = currentLang === 'ja'
    ? { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }
    : { month: 'short',   day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' };
  return date.toLocaleString(getCurrentLocale(), opts);
}

/* =========================================================
   Section 2: 最適日時オプティマイザ
   ========================================================= */

function findOptimalDates(latDeg, lonDeg) {
  const results = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const day = new Date(now.getTime() + dayOffset * 86400000);

    // SunCalc で天文薄明を取得
    const times = SunCalc.getTimes(day, latDeg, lonDeg);
    const nightStart = times.night;
    const nightEnd   = times.nightEnd;

    if (!nightStart || isNaN(nightStart.getTime())) continue;
    if (!nightEnd   || isNaN(nightEnd.getTime()))   continue;
    // 翌朝の薄明を取得
    const nextDay   = new Date(day.getTime() + 86400000);
    const nextTimes = SunCalc.getTimes(nextDay, latDeg, lonDeg);
    const nightEndActual = nextTimes.nightEnd;
    if (!nightEndActual || isNaN(nightEndActual.getTime())) continue;

    // 月齢
    const moonIll  = SunCalc.getMoonIllumination(day);
    const phase    = moonIll.phase; // 0=新月, 0.5=満月
    // 新月付近(±4日)を優先
    const moonDark = phase < 0.15 || phase > 0.85;
    const moonScore = moonDark
      ? (phase < 0.15 ? (1 - phase / 0.15) : (phase - 0.85) / 0.15)
      : 0;

    // 闇夜の間で銀河中心の最大高度を探す（15分刻み）
    let maxAlt = -90;
    let bestTime = null;
    const step = 15 * 60 * 1000; // 15分
    for (let t = nightStart.getTime(); t <= nightEndActual.getTime(); t += step) {
      const d = new Date(t);
      const { altDeg } = galacticCenterAltAz(d, latDeg, lonDeg);
      if (altDeg > maxAlt) { maxAlt = altDeg; bestTime = d; }
    }

    if (maxAlt < (appSettings.minGcAlt ?? 5)) continue;

    // スコア計算
    const altScore  = Math.max(0, maxAlt) / 90;
    const score     = altScore * 0.6 + moonScore * 0.4;

    results.push({
      date: day,
      optimalTime: bestTime,
      maxAlt,
      phase,
      moonEmoji: moonPhaseEmoji(phase),
      moonPct: Math.round(moonIll.fraction * 100),
      nightStart,
      nightEnd: nightEndActual,
      score
    });
  }

  // スコア降順でソート、近い日付は1つにまとめる（7日クラスタリング）
  results.sort((a, b) => b.score - a.score);
  const deduped = [];
  for (const r of results) {
    const tooClose = deduped.some(d =>
      Math.abs(d.date.getTime() - r.date.getTime()) < 7 * 86400000
    );
    if (!tooClose) deduped.push(r);
    if (deduped.length >= (appSettings.optimalCount ?? 5)) break;
  }
  return deduped;
}

/* =========================================================
   Section 3: 天気予報 (Open-Meteo)
   ========================================================= */

let weatherCache = null;
let weatherCacheKey = '';

async function fetchWeather(latDeg, lonDeg) {
  const key = `${latDeg.toFixed(3)},${lonDeg.toFixed(3)}`;
  if (weatherCacheKey === key && weatherCache) return weatherCache;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latDeg}&longitude=${lonDeg}&hourly=cloud_cover&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    weatherCache = data;
    weatherCacheKey = key;
    return data;
  } catch { return null; }
}

function getCloudCover(weatherData, date) {
  if (!weatherData || !weatherData.hourly) return null;
  const times = weatherData.hourly.time;
  const clouds = weatherData.hourly.cloud_cover;
  const target = date.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  const idx = times.findIndex(t => t.startsWith(target));
  if (idx < 0) return null;
  return clouds[idx];
}

function cloudCoverToStars(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct <= 10)  return { stars: '★★★★★', label: t('weather.clear5'), cls: 'clear5' };
  if (pct <= 25)  return { stars: '★★★★☆', label: t('weather.clear4'), cls: 'clear4' };
  if (pct <= 50)  return { stars: '★★★☆☆', label: t('weather.clear3'), cls: 'clear3' };
  if (pct <= 75)  return { stars: '★★☆☆☆', label: t('weather.clear2'), cls: 'clear2' };
  return           { stars: '★☆☆☆☆', label: t('weather.clear1'), cls: 'clear1' };
}

function isWithin7Days(date) {
  const diff = date.getTime() - Date.now();
  return diff >= -3600000 && diff <= 7 * 86400000;
}

/* =========================================================
   Section 4: 写真ビュー Canvas レンダラー
   グノモニック投影（銀河中心を中心とした矩形カメラビュー）
   ========================================================= */

const VIEW_W = 500, VIEW_H = 340;
// 参照ビュー画角は設定値を参照（関数として取得）
function getViewHFov() { return appSettings.viewHFov || 110; }

// センサーサイズ
const SENSOR = {
  full: { w: 36,   h: 24   },
  apsc: { w: 23.5, h: 15.6 },
  m43:  { w: 17.3, h: 13.0 }
};

// Seeded PRNG (mulberry32)
function makePRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// --- グノモニック投影 ---

// Alt/Az → 3D単位ベクトル (x=East, y=Up, z=North)
function altAzToVec(altDeg, azDeg) {
  const a = altDeg * DEG, az = azDeg * DEG;
  return [Math.cos(a)*Math.sin(az), Math.sin(a), Math.cos(a)*Math.cos(az)];
}

// カメラフレーム構築 (cAlt,cAzの方向を中心に)
function buildCamera(cAlt, cAz) {
  const fwd    = altAzToVec(cAlt, cAz);
  const zenith = [0, 1, 0];
  const dot    = fwd[0]*zenith[0] + fwd[1]*zenith[1] + fwd[2]*zenith[2];
  const upRaw  = [zenith[0]-dot*fwd[0], zenith[1]-dot*fwd[1], zenith[2]-dot*fwd[2]];
  const upLen  = Math.hypot(upRaw[0], upRaw[1], upRaw[2]);
  if (upLen < 0.001) return buildCamera(cAlt < 0 ? -89 : 89, cAz);
  const up     = upRaw.map(v => v/upLen);
  // right = up × fwd  (南向きのとき West が右 = 写真として自然)
  const right  = [
    up[1]*fwd[2] - up[2]*fwd[1],
    up[2]*fwd[0] - up[0]*fwd[2],
    up[0]*fwd[1] - up[1]*fwd[0]
  ];
  return { right, up, fwd };
}

// グノモニック投影: 3D方向 → Canvas XY
function gProject(cam, altDeg, azDeg) {
  const v  = altAzToVec(altDeg, azDeg);
  const {right, up, fwd} = cam;
  const vx = v[0]*right[0] + v[1]*right[1] + v[2]*right[2];
  const vy = v[0]*up[0]    + v[1]*up[1]    + v[2]*up[2];
  const vz = v[0]*fwd[0]   + v[1]*fwd[1]   + v[2]*fwd[2];
  if (vz < 0.02) return null;
  const f  = (VIEW_W/2) / Math.tan(getViewHFov()/2 * DEG);
  return { x: VIEW_W/2 + f*vx/vz, y: VIEW_H/2 - f*vy/vz };
}

// --- メイン描画 ---
function drawSky(canvas, latDeg, lonDeg, date, showFov, focalLength, sensorKey, orientation) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // カメラ方向: 銀河中心（地平線上5°以上ならその方向、なければ南・高度30°）
  const gc  = galacticCenterAltAz(date, latDeg, lonDeg);
  const cAlt = gc.altDeg > 5 ? gc.altDeg : 30;
  const cAz  = gc.altDeg > 5 ? gc.azDeg  : 180;
  const cam  = buildCamera(cAlt, cAz);

  drawPhotoSky(ctx, cam);
  drawHorizonGround(ctx, cam);
  drawPhotoStars(ctx, cam);
  drawPhotoMilkyWay(ctx, cam, latDeg, lonDeg, date);
  drawGalacticCenterMark(ctx, cam, gc, latDeg, lonDeg, date);
  drawMoonPhoto(ctx, cam, latDeg, lonDeg, date);
  drawCompassHint(ctx, cam, cAz);

  if (showFov && focalLength > 0) {
    drawFovOverlay(ctx, cam, gc, cAlt, cAz, focalLength, sensorKey, orientation);
  }
}

// 空の背景グラデーション（写真風：上が暗い宇宙の黒、地平線付近は微妙に青）
function drawPhotoSky(ctx, cam) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0,    '#000007');
  grad.addColorStop(0.5,  '#010010');
  grad.addColorStop(0.85, '#030818');
  grad.addColorStop(1,    '#060d22');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // エアグロー: 地平線付近の微かな緑がかった光
  const horizon = ctx.createLinearGradient(0, VIEW_H*0.65, 0, VIEW_H);
  horizon.addColorStop(0, 'rgba(0,0,0,0)');
  horizon.addColorStop(1, 'rgba(15,30,15,0.25)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// 地平線と地面を描画
function drawHorizonGround(ctx, cam) {
  const rng = makePRNG(0xF00D1234);
  // alt=0° をaz=0..360でサンプリング
  const horizPts = [];
  for (let az = 0; az <= 360; az += 2) {
    const p = gProject(cam, 0, az);
    if (p) horizPts.push(p);
  }
  if (horizPts.length < 4) {
    // 地平線がフレーム外 → 下端を地面として塗る
    const groundY = VIEW_H * 0.85;
    ctx.fillStyle = '#040a04';
    ctx.fillRect(0, groundY, VIEW_W, VIEW_H - groundY);
    return;
  }

  // 地平線の最小Y（キャンバス上で最も低い位置）を使い地面を塗る
  const horizYByX = new Map();
  horizPts.forEach(p => {
    const xi = Math.round(p.x);
    if (!horizYByX.has(xi) || horizYByX.get(xi) > p.y) horizYByX.set(xi, p.y);
  });

  // 地面（地平線より下）を塗りつぶす
  ctx.save();
  ctx.beginPath();
  // 左端から右端へ地平線をトレース
  const sorted = [...horizYByX.entries()].sort((a,b)=>a[0]-b[0]);
  if (sorted.length > 0) {
    ctx.moveTo(sorted[0][0], sorted[0][1]);
    sorted.forEach(([x,y]) => ctx.lineTo(x, y));
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.lineTo(0, VIEW_H);
    ctx.closePath();
    // 地面色: 深い緑がかった黒
    const groundGrad = ctx.createLinearGradient(0, VIEW_H*0.7, 0, VIEW_H);
    groundGrad.addColorStop(0, '#050d05');
    groundGrad.addColorStop(1, '#030803');
    ctx.fillStyle = groundGrad;
    ctx.fill();
  }

  // 地平線の大気グロー（うっすらと明るい帯）
  sorted.forEach(([x, y]) => {
    const grd = ctx.createLinearGradient(0, y-18, 0, y+10);
    grd.addColorStop(0,   'rgba(30,60,80,0)');
    grd.addColorStop(0.4, 'rgba(20,40,55,0.22)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x-1, y-18, 3, 28);
  });
  ctx.restore();

  // 地形シルエット（波状の山稜線）
  ctx.save();
  ctx.beginPath();
  let started = false;
  for (let x = 0; x <= VIEW_W; x++) {
    const baseY = horizYByX.get(x) ?? (sorted.length > 0
      ? VIEW_H * 0.75 : VIEW_H * 0.85);
    // 地形の凸凹: 複数のサイン波の重ね合わせ
    const bump = Math.sin(x*0.018)*6 + Math.sin(x*0.007+0.8)*10
               + Math.sin(x*0.034+2)*3 + Math.sin(x*0.052+5)*2;
    const terrainY = baseY + bump;
    if (!started) { ctx.moveTo(x, terrainY); started = true; }
    else ctx.lineTo(x, terrainY);
  }
  ctx.lineTo(VIEW_W, VIEW_H); ctx.lineTo(0, VIEW_H); ctx.closePath();
  ctx.fillStyle = '#030703';
  ctx.fill();
  ctx.restore();
}

// 星（写真風: 青白い点、輝星はグロー付き）
function drawPhotoStars(ctx, cam) {
  const rng = makePRNG(0xDEADBEEF);
  const N   = 3000; // 全天に配置、視野内だけ描画
  for (let i = 0; i < N; i++) {
    const az  = rng() * 360;
    const alt = (rng() * 180 - 90); // 全天均一
    const mag = Math.pow(rng(), 1.8);
    const pt  = gProject(cam, alt, az);
    if (!pt) continue;
    const {x, y} = pt;
    if (x < -5 || x > VIEW_W+5 || y < -5 || y > VIEW_H+5) continue;
    const r = 0.3 + (1-mag)*1.7;
    const a = 0.2 + (1-mag)*0.8;
    // 青白い星色
    const blue  = Math.floor(200 + mag*55);
    const green = Math.floor(210 + mag*45);
    if (mag < 0.12) {
      ctx.shadowColor = `rgba(${180},${210},${255},0.9)`;
      ctx.shadowBlur  = 6;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2*Math.PI);
    ctx.fillStyle = `rgba(220,${green},${blue},${a.toFixed(2)})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// 天の川（写真風: 暖色コア + 青白い外縁 + ダストレーン）
function drawPhotoMilkyWay(ctx, cam, latDeg, lonDeg, date) {
  // b=0 の銀河面のみ。幅広いストロークの重ね合わせで帯の厚みを表現
  const passes = [
    { w:120, a:0.015, c:'#3a4a90' },  // 最外縁: 淡い青紫
    { w: 65, a:0.038, c:'#5868c0' },
    { w: 32, a:0.075, c:'#8898e0' },  // 中間: 青白
    { w: 14, a:0.16,  c:'#c0d0ff' },  // 内側: 白
    { w:  5, a:0.32,  c:'#e0ecff' },  // コア輝線
  ];

  const pts = [];
  for (let li = 0; li <= 360; li += 2) {
    const { raDeg, decDeg } = galacticToEquatorial(li, 0);
    const { altDeg, azDeg } = equatorialToHorizontal(raDeg, decDeg, latDeg, date, lonDeg);
    const distFromCenter = Math.min(li, 360 - li);
    pts.push({ altDeg, azDeg, l: li, distFromCenter });
  }

  // 連続セグメントに分割（投影後に不連続になった箇所で切断）
  const segments = [];
  let seg = [];
  let prevPt = null;
  pts.forEach(p => {
    const proj = gProject(cam, p.altDeg, p.azDeg);
    if (!proj) { if (seg.length > 1) segments.push(seg); seg = []; prevPt = null; return; }
    if (prevPt && (Math.abs(proj.x - prevPt.x) > 80 || Math.abs(proj.y - prevPt.y) > 80)) {
      if (seg.length > 1) segments.push(seg); seg = [];
    }
    seg.push({ ...proj, l: p.l, distFromCenter: p.distFromCenter });
    prevPt = proj;
  });
  if (seg.length > 1) segments.push(seg);

  segments.forEach(s => {
    passes.forEach(({ w, a, c }) => {
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      s.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = c;
      ctx.lineWidth   = w;
      ctx.globalAlpha = a;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // 銀河中心付近: 暖色バルジ（橙〜金）
    const coreSegs = s.filter(p => p.distFromCenter < 55);
    if (coreSegs.length > 1) {
      const corePasses = [
        { w: 60, a:0.05,  c:'#a06020' },
        { w: 30, a:0.12,  c:'#d09040' },
        { w: 12, a:0.28,  c:'#f0c060' },
        { w:  4, a:0.55,  c:'#fff0c0' },
      ];
      corePasses.forEach(({ w, a, c }) => {
        ctx.beginPath();
        ctx.moveTo(coreSegs[0].x, coreSegs[0].y);
        coreSegs.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = c;
        ctx.lineWidth   = w;
        ctx.globalAlpha = a;
        ctx.lineCap     = 'round';
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // ダストレーン（暗い帯: コア中心線に沿って暗くする）
    if (coreSegs.length > 2) {
      ctx.beginPath();
      ctx.moveTo(coreSegs[0].x, coreSegs[0].y);
      coreSegs.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth   = 4;
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  });
}

// 銀河中心マーカー（写真風: 暖色の輝点）
// 銀河中心バルジ（楕円グロー）: 実際の写真に近いレンダリング
function drawGalacticCenterMark(ctx, cam, gc, latDeg, lonDeg, date) {
  if (gc.altDeg < -5) return;
  const ptCenter = gProject(cam, gc.altDeg, gc.azDeg);
  if (!ptCenter) return;
  const cx = ptCenter.x, cy = ptCenter.y;

  // バルジの長軸方向: l=+18°の点 → バンド方向をキャンバス座標で求める
  const r18 = galacticToEquatorial(18, 0);
  const p18 = equatorialToHorizontal(r18.raDeg, r18.decDeg, latDeg, date, lonDeg);
  const pt18 = gProject(cam, p18.altDeg, p18.azDeg);
  // バルジの短軸方向: b=+10°の点
  const rb10 = galacticToEquatorial(0, 10);
  const pb10 = equatorialToHorizontal(rb10.raDeg, rb10.decDeg, latDeg, date, lonDeg);
  const ptB10 = gProject(cam, pb10.altDeg, pb10.azDeg);

  // キャンバス上の半径（見つからなければデフォルト）
  const longR = pt18  ? Math.hypot(pt18.x  - cx, pt18.y  - cy) : 55;
  const shortR = ptB10 ? Math.hypot(ptB10.x - cx, ptB10.y - cy) : 28;
  // バンド方向の角度
  const angle = pt18 ? Math.atan2(pt18.y - cy, pt18.x - cx) : 0;

  // --- 楕円バルジを外側から内側に向けて重ね塗り ---
  const bulgeLayers = [
    { rx: longR*3.5, ry: shortR*3.5, color: 'rgba(40,15,3,0.07)'  },
    { rx: longR*2.5, ry: shortR*2.5, color: 'rgba(70,25,5,0.10)'  },
    { rx: longR*1.7, ry: shortR*1.7, color: 'rgba(110,45,8,0.14)' },
    { rx: longR*1.2, ry: shortR*1.2, color: 'rgba(165,70,15,0.20)'},
    { rx: longR*0.8, ry: shortR*0.8, color: 'rgba(210,105,25,0.28)'},
    { rx: longR*0.5, ry: shortR*0.5, color: 'rgba(245,155,50,0.38)'},
    { rx: longR*0.3, ry: shortR*0.3, color: 'rgba(255,195,90,0.50)'},
    { rx: longR*0.15,ry: shortR*0.15,color: 'rgba(255,225,140,0.65)'},
    { rx: longR*0.06,ry: shortR*0.06,color: 'rgba(255,245,200,0.80)'},
  ];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  bulgeLayers.forEach(({ rx, ry, color }) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  });
  ctx.restore();

  // --- ダストレーン（暗い帯）: 銀河中心をまたぐ暗い筋 ---
  // b=+2.5° と b=-2.5° の線をl=-30〜+30でサンプリングして細い暗線を引く
  [-2.5, 2.5].forEach(bOff => {
    const dustPts = [];
    for (let l = -35; l <= 35; l += 3) {
      const { raDeg, decDeg } = galacticToEquatorial(l, bOff);
      const pos = equatorialToHorizontal(raDeg, decDeg, latDeg, date, lonDeg);
      const pt  = gProject(cam, pos.altDeg, pos.azDeg);
      if (pt) dustPts.push(pt);
    }
    if (dustPts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(dustPts[0].x, dustPts[0].y);
    dustPts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth   = 5;
    ctx.globalAlpha = 1;
    ctx.lineCap     = 'round';
    ctx.stroke();
  });

  // --- 中心星（最明輝点） ---
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fillStyle   = '#fffaee';
  ctx.shadowColor = '#ffdd88';
  ctx.shadowBlur  = 16;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // ラベル
  ctx.fillStyle = 'rgba(255,215,100,0.88)';
  ctx.font      = 'bold 11px sans-serif';
  ctx.fillText(t('sky.galCenter'), cx + 8, cy - 6);
}

// 月（写真風）
function drawMoonPhoto(ctx, cam, latDeg, lonDeg, date) {
  const pos    = SunCalc.getMoonPosition(date, latDeg, lonDeg);
  const ill    = SunCalc.getMoonIllumination(date);
  const altDeg = pos.altitude * RAD;
  const azDeg  = ((pos.azimuth * RAD) + 180 + 360) % 360;
  const pt     = gProject(cam, altDeg, azDeg);
  if (!pt) return;
  const { x, y } = pt;
  if (x < -20 || x > VIEW_W+20 || y < -20 || y > VIEW_H+20) return;

  const R = 11, phase = ill.phase, lit = ill.fraction;

  // 月光ハロ
  const halo = ctx.createRadialGradient(x, y, R, x, y, R*5);
  halo.addColorStop(0, `rgba(200,200,160,${(lit*0.3).toFixed(2)})`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(x-R*5, y-R*5, R*10, R*10);

  // 月面
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2*Math.PI);
  ctx.fillStyle = '#1c2645'; ctx.fill();

  if (lit > 0.03) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2*Math.PI); ctx.clip();
    const ellW = Math.abs(R * Math.cos(Math.PI * (phase > 0.5 ? 2-phase*2 : phase*2)));
    ctx.beginPath(); ctx.ellipse(x, y, ellW, R, 0, 0, 2*Math.PI);
    ctx.fillStyle = '#fff8d8'; ctx.fill();
    ctx.fillStyle = '#1c2645';
    if (phase <= 0.5) ctx.fillRect(x-R-1, y-R-1, R+2, R*2+2);
    else              ctx.fillRect(x,      y-R-1, R+2, R*2+2);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2*Math.PI);
  ctx.strokeStyle = 'rgba(220,220,170,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();

  ctx.fillStyle = 'rgba(200,200,150,0.75)';
  ctx.font = '10px sans-serif';
  ctx.fillText(`${t('sky.moon')} ${Math.round(lit*100)}%`, x+R+4, y+3);
}

// 画角ヒント（コンパス）
function drawCompassHint(ctx, cam, cAz) {
  ctx.save();

  // --- 地平線上の方角ラベル（日本語・背景ピル付き） ---
  const horizDirs = [
    {l: t('dir.N'),  az: 0},   {l: t('dir.NE'), az: 45},
    {l: t('dir.E'),  az: 90},  {l: t('dir.SE'), az: 135},
    {l: t('dir.S'),  az: 180}, {l: t('dir.SW'), az: 225},
    {l: t('dir.W'),  az: 270}, {l: t('dir.NW'), az: 315},
  ];
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  horizDirs.forEach(({l, az}) => {
    const pt = gProject(cam, 1, az);
    if (!pt) return;
    const {x, y} = pt;
    if (x < 28 || x > VIEW_W - 28 || y < 18 || y > VIEW_H - 18) return;
    const tw = ctx.measureText(l).width + 12;
    // 背景ピル（角丸矩形）
    ctx.fillStyle = 'rgba(0,5,20,0.6)';
    _fillRoundRect(ctx, x - tw/2, y - 9, tw, 18, 4);
    // テキスト
    ctx.fillStyle = az === 0 ? 'rgba(255,150,150,0.95)' : 'rgba(180,210,245,0.9)';
    ctx.fillText(l, x, y);
  });

  // --- コンパスローズ（右下コーナー） ---
  const cx = VIEW_W - 42, cy = VIEW_H - 42, r = 22;

  // 背景円
  ctx.fillStyle = 'rgba(5,8,25,0.65)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,110,160,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 各方位のキャンバス上の方向ベクトルを取得
  function getDir(az) {
    const pt = gProject(cam, 1, az);
    if (pt) {
      const dx = pt.x - VIEW_W / 2, dy = pt.y - VIEW_H / 2;
      const len = Math.hypot(dx, dy);
      if (len > 1) return { dx: dx / len, dy: dy / len };
    }
    // カメラ後方の場合は反対方向を逆転して推定
    const opp = gProject(cam, 1, (az + 180) % 360);
    if (opp) {
      const dx = -(opp.x - VIEW_W / 2), dy = -(opp.y - VIEW_H / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) return { dx: dx / len, dy: dy / len };
    }
    return null;
  }

  const roseItems = [
    { l: 'N', az: 0,   color: '#ff7070', lw: 2 },
    { l: 'S', az: 180, color: 'rgba(160,195,230,0.7)', lw: 1 },
    { l: 'E', az: 90,  color: 'rgba(160,195,230,0.7)', lw: 1 },
    { l: 'W', az: 270, color: 'rgba(160,195,230,0.7)', lw: 1 },
  ];
  roseItems.forEach(({ l, az, color, lw }) => {
    const dir = getDir(az);
    if (!dir) return;
    const { dx, dy } = dir;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * (r - 2), cy + dy * (r - 2));
    ctx.stroke();
    ctx.font = `${lw > 1 ? 'bold ' : ''}${lw > 1 ? 9 : 8}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(l, cx + dx * (r + 7), cy + dy * (r + 7));
  });

  // 中心点
  ctx.fillStyle = 'rgba(200,220,245,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// 角丸矩形塗りつぶしヘルパー（Safari互換）
function _fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
  ctx.fill();
}

// --- 画角オーバーレイ（写真フレーム）---
function drawFovOverlay(ctx, cam, gc, cAlt, cAz, focalLength, sensorKey, orientation) {
  const sensor = SENSOR[sensorKey] || SENSOR.full;
  // 縦向き(portrait)のときセンサー幅/高さを入れ替え
  const sw   = orientation === 'portrait' ? sensor.h : sensor.w;
  const sh   = orientation === 'portrait' ? sensor.w : sensor.h;
  const hFov = 2 * Math.atan(sw / (2 * focalLength)) * RAD;
  const vFov = 2 * Math.atan(sh / (2 * focalLength)) * RAD;

  // 銀河中心をフレーム中心に
  const fAlt = gc.altDeg > 5 ? gc.altDeg : cAlt;
  const fAz  = gc.altDeg > 5 ? gc.azDeg  : cAz;
  const fcam  = buildCamera(fAlt, fAz);
  const fFov  = Math.max(hFov, vFov) * 1.05;
  const focalF = (VIEW_W/2) / Math.tan(getViewHFov()/2 * DEG);

  // フレームの4コーナーをビュー上に投影
  const fovHalf = (VIEW_W/2) / Math.tan(getViewHFov()/2 * DEG);
  const corners3D = [
    [-hFov/2*DEG, +vFov/2*DEG],
    [+hFov/2*DEG, +vFov/2*DEG],
    [+hFov/2*DEG, -vFov/2*DEG],
    [-hFov/2*DEG, -vFov/2*DEG],
  ].map(([dx, dy]) => {
    // fcam空間でのコーナー方向
    const {right, up, fwd} = fcam;
    const scale = 1 / Math.cos(Math.hypot(dx, dy));
    const wx = fwd[0] + Math.tan(dx)*right[0] + Math.tan(dy)*up[0];
    const wy = fwd[1] + Math.tan(dx)*right[1] + Math.tan(dy)*up[1];
    const wz = fwd[2] + Math.tan(dx)*right[2] + Math.tan(dy)*up[2];
    // ワールド→Alt/Az
    const len  = Math.hypot(wx, wy, wz);
    const altD = Math.asin(wy/len) * RAD;
    const azD  = ((Math.atan2(wx/len, wz/len) * RAD) + 360) % 360;
    return gProject(cam, altD, azD);
  });

  if (corners3D.some(c => !c)) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners3D[0].x, corners3D[0].y);
  corners3D.forEach(c => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,80,0.9)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([8, 5]);
  ctx.stroke();
  ctx.fillStyle   = 'rgba(255,255,80,0.06)';
  ctx.fill();
  ctx.setLineDash([]);

  // ラベル: 右上コーナーの外側
  const lx = Math.max(...corners3D.map(c=>c.x)) + 4;
  const ly = Math.min(...corners3D.map(c=>c.y)) - 4;
  ctx.fillStyle = 'rgba(255,255,80,0.92)';
  ctx.font      = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${hFov.toFixed(1)}° × ${vFov.toFixed(1)}°`, lx, ly);
  ctx.restore();
}

/* =========================================================
   Section 5: 地図 (Leaflet + Nominatim)
   ========================================================= */

let map = null, mapMarker = null;
let nominatimTimer = null;

function initMap(onLocationSelected) {
  map = L.map('map', { zoomControl: true }).setView([35.68, 139.69], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 18
  }).addTo(map);

  map.on('click', async e => {
    const { lat, lng } = e.latlng;
    const name = await reverseGeocode(lat, lng);
    setMapMarker(lat, lng, name);
    onLocationSelected({ lat, lon: lng, name });
  });
}

function setMapMarker(lat, lon, name) {
  if (mapMarker) map.removeLayer(mapMarker);
  mapMarker = L.marker([lat, lon]).addTo(map).bindPopup(name).openPopup();
  map.setView([lat, lon], Math.max(map.getZoom(), 8));
}

async function geocodeSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ja`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`;
    const res  = await fetch(url);
    const data = await res.json();
    return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch { return `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
}

/* =========================================================
   Section 6: UI コントローラー
   ========================================================= */

// アプリ状態
const state = {
  mode: 'optimal',
  location: null,
  optimalResults: [],
  selectedResult: null,
  weatherData: null,
  showFov: !!appSettings.showFov,
  focalLength: appSettings.focalLength ? parseFloat(appSettings.focalLength) : 0,
  sensorKey:   appSettings.sensorKey   || 'full',
  orientation: appSettings.orientation || 'portrait',
};

function showLoading(on) {
  document.getElementById('loading').classList.toggle('hidden', !on);
}
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}
function showResult(on) {
  document.getElementById('result-panel').classList.toggle('hidden', !on);
}

// --- 最適日時リストを描画 ---
async function renderOptimalList(results) {
  const container = document.getElementById('optimal-cards');
  container.innerHTML = '';

  // タイトルを設定・言語に応じて更新
  const titleEl = document.getElementById('optimal-title');
  if (titleEl) titleEl.textContent = t('result.optimalTitle') + (appSettings.optimalCount ?? 5);

  // 天気データ取得（バックグラウンド）
  const weatherData = await fetchWeather(state.location.lat, state.location.lon);

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'optimal-card';
    card.dataset.idx = i;

    const rankLabel = t(`rank.${i}`);
    const rankCls   = i < 3 ? `rank-${i+1}` : '';
    const dateOpts  = currentLang === 'ja'
      ? { month: 'long',  day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' };
    const dateOnlyOpts = currentLang === 'ja'
      ? { month: 'long',  day: 'numeric', weekday: 'short' }
      : { month: 'short', day: 'numeric', weekday: 'short' };
    const dateStr = r.optimalTime
      ? r.optimalTime.toLocaleString(getCurrentLocale(), dateOpts)
      : r.date.toLocaleDateString(getCurrentLocale(), dateOnlyOpts);

    // 天気バッジ
    let weatherBadge = `<span class="badge badge-noforecast">${t('weather.outOfRange')}</span>`;
    if (weatherData && r.optimalTime && isWithin7Days(r.optimalTime)) {
      const pct = getCloudCover(weatherData, r.optimalTime);
      const sw  = cloudCoverToStars(pct);
      if (sw) {
        const isCloudy = pct > 50;
        weatherBadge = `<span class="badge badge-weather${isCloudy ? ' cloudy' : ''}">${sw.stars} ${t('weather.cloudCover')}${pct}%</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-rank ${rankCls}">${rankLabel}</div>
      <div class="card-info">
        <div class="card-date">${dateStr}</div>
        <div class="card-detail">${t('card.twilight')}: ${formatTime(r.nightStart)} 〜 ${formatTime(r.nightEnd)}</div>
      </div>
      <div class="card-badges">
        <span class="badge badge-alt">↑ ${r.maxAlt.toFixed(1)}°</span>
        <span class="badge badge-moon">${r.moonEmoji} ${r.moonPct}%</span>
        ${weatherBadge}
      </div>`;

    card.addEventListener('click', () => {
      document.querySelectorAll('.optimal-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.selectedResult = r;
      renderSkyAndCondition(r.optimalTime || r.date);
    });

    container.appendChild(card);
  });

  // 最初の結果を自動選択
  if (results.length > 0) {
    container.children[0]?.click();
  }
}

// --- 星空と撮影条件を更新 ---
function renderSkyAndCondition(date) {
  if (!state.location) return;
  const { lat, lon } = state.location;

  // Canvas 描画
  const canvas = document.getElementById('sky-canvas');
  drawSky(canvas, lat, lon, date, state.showFov, state.focalLength, state.sensorKey, state.orientation);

  // タイトル
  const skyDateOpts = currentLang === 'ja'
    ? { month: 'long',  day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  document.getElementById('sky-title').textContent =
    '🌠 ' + date.toLocaleString(getCurrentLocale(), skyDateOpts) + t('sky.titleSuffix');

  // 撮影条件
  const { altDeg, azDeg } = galacticCenterAltAz(date, lat, lon);
  const moonIll  = SunCalc.getMoonIllumination(date);
  const moonPos  = SunCalc.getMoonPosition(date, lat, lon);
  const times    = SunCalc.getTimes(date, lat, lon);
  const nextDay  = new Date(date); nextDay.setDate(nextDay.getDate() + 1);
  const nextTimes = SunCalc.getTimes(nextDay, lat, lon);

  document.getElementById('cond-datetime').textContent    = formatDateTime(date);
  document.getElementById('cond-altitude').textContent    = altDeg > 0 ? `${altDeg.toFixed(1)}°${t('alt.above')}` : `${altDeg.toFixed(1)}°${t('alt.below')}`;
  document.getElementById('cond-azimuth').textContent     = `${azDeg.toFixed(1)}° (${azimuthLabel(azDeg)})`;
  document.getElementById('cond-moon').textContent        = `${moonPhaseEmoji(moonIll.phase)} ${Math.round(moonIll.fraction * 100)}%`;
  document.getElementById('cond-twilight-end').textContent   = formatTime(times.night);
  document.getElementById('cond-twilight-start').textContent = formatTime(nextTimes.nightEnd);

  // 天気
  const weatherRow = document.getElementById('weather-row');
  if (state.weatherData && isWithin7Days(date)) {
    const pct = getCloudCover(state.weatherData, date);
    const sw  = cloudCoverToStars(pct);
    if (sw) {
      document.getElementById('cond-weather').textContent = `${pct}% / ${sw.stars} ${sw.label}`;
      weatherRow.style.display = '';
    } else { weatherRow.style.display = 'none'; }
  } else {
    weatherRow.style.display = 'none';
  }

  // スコア（モード1のみ）
  const condScore = document.getElementById('cond-score');
  if (state.selectedResult) {
    const s = state.selectedResult;
    condScore.parentElement.style.display = '';
    condScore.textContent = `${(s.score * 100).toFixed(0)}${t('score.suffix')}`;
  } else {
    condScore.parentElement.style.display = 'none';
  }

  // 画角ラベル更新
  if (state.focalLength > 0) {
    const sensor = SENSOR[state.sensorKey] || SENSOR.full;
    const sw   = state.orientation === 'portrait' ? sensor.h : sensor.w;
    const sh   = state.orientation === 'portrait' ? sensor.w : sensor.h;
    const hFov = 2 * Math.atan(sw / (2 * state.focalLength)) * RAD;
    const vFov = 2 * Math.atan(sh / (2 * state.focalLength)) * RAD;
    const orient = state.orientation === 'portrait' ? t('orient.portrait') : t('orient.landscape');
    document.getElementById('fov-value').textContent = `[${orient}] ${t('fov.h')} ${hFov.toFixed(1)}° × ${t('fov.v')} ${vFov.toFixed(1)}°`;
    document.getElementById('fov-display').style.display = '';
  } else {
    document.getElementById('fov-display').style.display = 'none';
  }
}

function azimuthLabel(az) {
  const dirs = [
    t('dir.N'),   t('dir.NNE'), t('dir.NE'),  t('dir.ENE'),
    t('dir.E'),   t('dir.ESE'), t('dir.SE'),  t('dir.SSE'),
    t('dir.S'),   t('dir.SSW'), t('dir.SW'),  t('dir.WSW'),
    t('dir.W'),   t('dir.WNW'), t('dir.NW'),  t('dir.NNW'),
  ];
  return dirs[Math.round(az / 22.5) % 16];
}

// --- メイン処理: 場所が決まったら実行 ---
async function runOptimal() {
  if (!state.location) { showError(t('error.noLocation')); return; }
  showError('');
  showLoading(true);
  showResult(false);
  state.selectedResult = null;

  // 天気を並行取得
  state.weatherData = null;
  fetchWeather(state.location.lat, state.location.lon).then(d => { state.weatherData = d; });

  // 最適日時計算（少し遅延させてUIを先に更新）
  await new Promise(r => setTimeout(r, 30));
  const results = findOptimalDates(state.location.lat, state.location.lon);
  state.optimalResults = results;
  showLoading(false);

  if (results.length === 0) {
    showError(t('error.noResults'));
    return;
  }
  document.getElementById('optimal-list').classList.remove('hidden');
  showResult(true);
  await renderOptimalList(results);
}

async function runSimulate() {
  if (!state.location) { showError(t('error.noLocation')); return; }
  const dateVal = document.getElementById('date-input').value;
  const timeVal = document.getElementById('time-input').value;
  if (!dateVal) { showError(t('error.noDate')); return; }
  showError('');

  const date = new Date(`${dateVal}T${timeVal || '22:00'}:00`);
  if (isNaN(date.getTime())) { showError(t('error.invalidDate')); return; }

  // スライダーを入力値に同期
  syncDateSlider();
  syncTimeSlider();

  showLoading(true);
  document.getElementById('optimal-list').classList.add('hidden');
  state.selectedResult = null;

  state.weatherData = await fetchWeather(state.location.lat, state.location.lon);
  showLoading(false);
  showResult(true);
  renderSkyAndCondition(date);
}

// --- 初期化 ---
// --- rAF デバウンスつきリアルタイム描画 ---
let _rafPending = false, _pendingDate = null;
function scheduleSimRender(date) {
  _pendingDate = date;
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      if (_pendingDate && state.location) {
        document.getElementById('optimal-list').classList.add('hidden');
        state.selectedResult = null;
        showResult(true);
        renderSkyAndCondition(_pendingDate);
      }
    });
  }
}

// date-input の値 → date-slider 位置 を同期
function syncDateSlider() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sel   = new Date(document.getElementById('date-input').value);
  const offset = isNaN(sel) ? 0 : Math.round((sel - today) / 86400000);
  document.getElementById('date-slider').value = Math.max(0, Math.min(365, offset));
}
// time-input の値 → time-slider 位置 を同期
function syncTimeSlider() {
  const val = document.getElementById('time-input').value || '22:00';
  const [h, m] = val.split(':').map(Number);
  document.getElementById('time-slider').value = (h || 0) * 60 + (m || 0);
}
// 現在の入力値から Date を作成
function buildDateFromInputs() {
  const dv = document.getElementById('date-input').value;
  const tv = document.getElementById('time-input').value || '22:00';
  const d  = new Date(`${dv}T${tv}:00`);
  return isNaN(d) ? null : d;
}

document.addEventListener('DOMContentLoaded', () => {
  // 今日の日付をデフォルト
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('date-input').value = today;
  syncDateSlider();
  syncTimeSlider();

  // タブ切替
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;

      const dtRow = document.getElementById('datetime-row');
      dtRow.classList.toggle('hidden', state.mode !== 'simulate');
      showResult(false);
      showError('');
    });
  });

  // 場所検索
  const locationInput = document.getElementById('location-input');
  const searchResults = document.getElementById('search-results');
  const searchBtn     = document.getElementById('search-btn');

  async function doSearch() {
    const q = locationInput.value.trim();
    if (!q) return;
    searchResults.innerHTML = `<div class="search-result-item">${t('search.loading')}</div>`;
    searchResults.classList.remove('hidden');
    const results = await geocodeSearch(q);
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.innerHTML = `<div class="search-result-item">${t('search.notFound')}</div>`;
      return;
    }
    results.forEach(r => {
      const item = document.createElement('div');
      item.className   = 'search-result-item';
      item.textContent = r.display_name;
      item.addEventListener('click', () => {
        const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
        state.location = { lat, lon, name: r.display_name };
        locationInput.value = r.display_name.split(',')[0];
        searchResults.classList.add('hidden');
        setMapMarker(lat, lon, r.display_name);
        updateFavAddBtn();
        if (state.mode === 'optimal') runOptimal();
      });
      searchResults.appendChild(item);
    });
  }

  searchBtn.addEventListener('click', doSearch);
  locationInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== locationInput && e.target !== searchBtn) {
      searchResults.classList.add('hidden');
    }
  });

  // --- 日付スライダー ---
  document.getElementById('date-slider').addEventListener('input', e => {
    const offset = parseInt(e.target.value);
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset);
    document.getElementById('date-input').value = d.toISOString().slice(0, 10);
    if (state.mode === 'simulate') {
      const date = buildDateFromInputs();
      if (date) scheduleSimRender(date);
    }
  });
  document.getElementById('date-input').addEventListener('change', () => {
    syncDateSlider();
    if (state.mode === 'simulate') {
      const date = buildDateFromInputs();
      if (date) scheduleSimRender(date);
    }
  });

  // --- 時刻スライダー ---
  document.getElementById('time-slider').addEventListener('input', e => {
    const mins = parseInt(e.target.value);
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    document.getElementById('time-input').value = `${h}:${m}`;
    if (state.mode === 'simulate') {
      const date = buildDateFromInputs();
      if (date) scheduleSimRender(date);
    }
  });
  document.getElementById('time-input').addEventListener('input', () => {
    syncTimeSlider();
    if (state.mode === 'simulate') {
      const date = buildDateFromInputs();
      if (date) scheduleSimRender(date);
    }
  });

  // 計算ボタン
  document.getElementById('calc-btn').addEventListener('click', () => {
    if (state.mode === 'optimal') runOptimal();
    else runSimulate();
  });

  // カメラ設定
  document.getElementById('focal-input').addEventListener('input', e => {
    state.focalLength = parseFloat(e.target.value) || 0;
    if (state.selectedResult) renderSkyAndCondition(state.selectedResult.optimalTime || state.selectedResult.date);
    else if (state.mode === 'simulate') {
      const d = new Date(`${document.getElementById('date-input').value}T${document.getElementById('time-input').value}:00`);
      if (!isNaN(d)) renderSkyAndCondition(d);
    }
  });
  document.getElementById('sensor-select').addEventListener('change', e => {
    state.sensorKey = e.target.value;
    if (state.focalLength > 0) document.getElementById('focal-input').dispatchEvent(new Event('input'));
  });

  // 縦/横ボタン
  document.querySelectorAll('input[name="orientation"]').forEach(radio => {
    radio.addEventListener('change', e => {
      state.orientation = e.target.value;
      document.getElementById('orient-portrait').classList.toggle('active',  state.orientation === 'portrait');
      document.getElementById('orient-landscape').classList.toggle('active', state.orientation === 'landscape');
      if (state.focalLength > 0) document.getElementById('focal-input').dispatchEvent(new Event('input'));
    });
  });
  document.getElementById('fov-toggle').addEventListener('change', e => {
    state.showFov = e.target.checked;
    if (state.selectedResult) renderSkyAndCondition(state.selectedResult.optimalTime || state.selectedResult.date);
    else if (state.mode === 'simulate') {
      const d = new Date(`${document.getElementById('date-input').value}T${document.getElementById('time-input').value}:00`);
      if (!isNaN(d)) renderSkyAndCondition(d);
    }
  });

  // 言語切替ボタン
  document.getElementById('lang-btn').addEventListener('click', () => {
    setLang(currentLang === 'ja' ? 'en' : 'ja');
    // 表示済みの動的コンテンツを再描画
    if (state.optimalResults.length > 0 && state.mode === 'optimal') {
      renderOptimalList(state.optimalResults);
    }
    if (state.selectedResult) {
      renderSkyAndCondition(state.selectedResult.optimalTime || state.selectedResult.date);
    } else if (state.mode === 'simulate') {
      const d = buildDateFromInputs();
      if (d && state.location) renderSkyAndCondition(d);
    }
    updateFavAddBtn();
  });

  // 地図初期化
  initMap(loc => {
    state.location = loc;
    locationInput.value = loc.name.split(',')[0];
    updateFavAddBtn();
    if (state.mode === 'optimal') runOptimal();
  });

  // 起動時に設定値をUIへ反映
  applySettingsToUI();

  // ===== 設定モーダル =====
  function applySettingsToUI() {
    // カメラ設定
    if (appSettings.focalLength) {
      document.getElementById('focal-input').value = appSettings.focalLength;
      state.focalLength = parseFloat(appSettings.focalLength);
    }
    document.getElementById('sensor-select').value = appSettings.sensorKey || 'full';
    state.sensorKey   = appSettings.sensorKey   || 'full';
    state.orientation = appSettings.orientation || 'portrait';
    document.getElementById('orient-portrait').classList.toggle('active',  state.orientation === 'portrait');
    document.getElementById('orient-landscape').classList.toggle('active', state.orientation === 'landscape');
    document.querySelector(`input[name="orientation"][value="${state.orientation}"]`).checked = true;
    // 画角枠の表示状態
    state.showFov = !!appSettings.showFov;
    document.getElementById('fov-toggle').checked = state.showFov;
  }

  // モーダルを開くときにフォームへ現在の設定値を反映
  function openSettingsModal() {
    const s = appSettings;
    document.getElementById('s-focal').value    = s.focalLength || '';
    document.getElementById('s-sensor').value   = s.sensorKey   || 'full';
    document.getElementById('s-show-fov').checked = !!s.showFov;
    document.getElementById('s-hfov').value     = String(s.viewHFov   || 110);
    document.getElementById('s-count').value    = String(s.optimalCount || 5);
    document.getElementById('s-min-alt').value  = String(s.minGcAlt ?? 5);
    // 向き
    const orientVal = s.orientation || 'portrait';
    document.querySelector(`input[name="s-orientation"][value="${orientVal}"]`).checked = true;
    document.getElementById('s-orient-portrait').classList.toggle('active',  orientVal === 'portrait');
    document.getElementById('s-orient-landscape').classList.toggle('active', orientVal === 'landscape');
    document.getElementById('settings-overlay').classList.remove('hidden');
  }

  document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('settings-overlay').classList.add('hidden');
  });
  document.getElementById('settings-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-overlay'))
      document.getElementById('settings-overlay').classList.add('hidden');
  });

  // 設定モーダル内の向きボタン
  document.querySelectorAll('input[name="s-orientation"]').forEach(radio => {
    radio.addEventListener('change', e => {
      document.getElementById('s-orient-portrait').classList.toggle('active',  e.target.value === 'portrait');
      document.getElementById('s-orient-landscape').classList.toggle('active', e.target.value === 'landscape');
    });
  });

  // 保存
  document.getElementById('settings-save').addEventListener('click', () => {
    const newSettings = {
      focalLength:  document.getElementById('s-focal').value.trim(),
      sensorKey:    document.getElementById('s-sensor').value,
      orientation:  document.querySelector('input[name="s-orientation"]:checked')?.value || 'portrait',
      showFov:      document.getElementById('s-show-fov').checked,
      viewHFov:     parseInt(document.getElementById('s-hfov').value)    || 110,
      optimalCount: parseInt(document.getElementById('s-count').value)   || 5,
      minGcAlt:     parseInt(document.getElementById('s-min-alt').value) ?? 5,
    };
    appSettings = newSettings;
    saveSettings(newSettings);
    applySettingsToUI();
    document.getElementById('settings-overlay').classList.add('hidden');
    // 設定を変えたので再描画（場所が選択済みの場合）
    if (state.location && state.selectedResult)
      renderSkyAndCondition(state.selectedResult.optimalTime || state.selectedResult.date);
  });

  // リセット
  document.getElementById('settings-reset').addEventListener('click', () => {
    appSettings = { ...DEFAULT_SETTINGS };
    saveSettings(appSettings);
    openSettingsModal(); // フォームを再描画
  });

  // ===== お気に入り =====
  const FAVORITES_KEY = 'starweb-favorites';

  function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
    catch { return []; }
  }

  function saveFavorites(favs) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  }

  function updateFavCount(favs) {
    const badge = document.getElementById('fav-count');
    if (favs.length > 0) {
      badge.textContent = favs.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function isFavorited(lat, lon) {
    return loadFavorites().some(f => Math.abs(f.lat - lat) < 0.001 && Math.abs(f.lon - lon) < 0.001);
  }

  function updateFavAddBtn() {
    const btn = document.getElementById('fav-add-btn');
    if (!state.location) {
      btn.disabled = true;
      btn.textContent = '☆';
      btn.title = t('fav.add');
      return;
    }
    btn.disabled = false;
    if (isFavorited(state.location.lat, state.location.lon)) {
      btn.textContent = '⭐';
      btn.title = t('fav.added');
    } else {
      btn.textContent = '☆';
      btn.title = t('fav.add');
    }
  }

  function renderFavoritesList() {
    const favs = loadFavorites();
    const listEl  = document.getElementById('fav-list');
    const emptyEl = document.getElementById('fav-empty');
    listEl.innerHTML = '';
    updateFavCount(favs);

    if (favs.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    favs.forEach(fav => {
      const item = document.createElement('div');
      item.className = 'fav-item';

      // 名前（クリックで選択）
      const nameSpan = document.createElement('span');
      nameSpan.className = 'fav-name';
      nameSpan.textContent = fav.name;
      nameSpan.title = fav.fullName || fav.name;
      nameSpan.addEventListener('click', () => {
        state.location = { lat: fav.lat, lon: fav.lon, name: fav.fullName || fav.name };
        document.getElementById('location-input').value = fav.name;
        setMapMarker(fav.lat, fav.lon, fav.fullName || fav.name);
        document.getElementById('fav-panel').classList.add('hidden');
        document.getElementById('fav-list-btn').classList.remove('active');
        updateFavAddBtn();
        if (state.mode === 'optimal') runOptimal();
      });

      // 編集ボタン
      const editBtn = document.createElement('button');
      editBtn.className = 'fav-btn';
      editBtn.textContent = '✏️';
      editBtn.title = t('fav.edit');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fav-name-input';
        input.value = fav.name;
        nameSpan.replaceWith(input);
        input.focus();
        input.select();
        const save = () => {
          const newName = input.value.trim() || fav.name;
          const favs2 = loadFavorites();
          const idx = favs2.findIndex(f => f.id === fav.id);
          if (idx !== -1) { favs2[idx].name = newName; saveFavorites(favs2); }
          renderFavoritesList();
          updateFavAddBtn();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e2 => { if (e2.key === 'Enter') input.blur(); });
      });

      // 削除ボタン
      const delBtn = document.createElement('button');
      delBtn.className = 'fav-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = t('fav.delete');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const favs2 = loadFavorites().filter(f => f.id !== fav.id);
        saveFavorites(favs2);
        renderFavoritesList();
        updateFavAddBtn();
      });

      item.appendChild(nameSpan);
      item.appendChild(editBtn);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    });
  }

  // ☆ ボタン: お気に入り追加/削除
  document.getElementById('fav-add-btn').addEventListener('click', () => {
    if (!state.location) return;
    const favs = loadFavorites();
    const existIdx = favs.findIndex(
      f => Math.abs(f.lat - state.location.lat) < 0.001 && Math.abs(f.lon - state.location.lon) < 0.001
    );
    if (existIdx !== -1) {
      // 既登録 → 削除
      favs.splice(existIdx, 1);
    } else {
      // 新規追加
      const shortName = state.location.name.split(',')[0].trim();
      favs.push({
        id: Date.now(),
        name: shortName,
        fullName: state.location.name,
        lat: state.location.lat,
        lon: state.location.lon,
      });
    }
    saveFavorites(favs);
    renderFavoritesList();
    updateFavAddBtn();
  });

  // ⭐ ボタン: お気に入りパネル開閉
  document.getElementById('fav-list-btn').addEventListener('click', () => {
    const panel = document.getElementById('fav-panel');
    const btn   = document.getElementById('fav-list-btn');
    const isHidden = panel.classList.toggle('hidden');
    btn.classList.toggle('active', !isHidden);
    if (!isHidden) renderFavoritesList();
  });

  // テキスト入力でクリアしたときもボタン状態を更新
  document.getElementById('location-input').addEventListener('input', () => updateFavAddBtn());

  // 初期化
  renderFavoritesList();
  updateFavAddBtn();

});
