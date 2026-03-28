/* =========================================================
   天の川撮影プランナー — app.js
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
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  return date.toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit'
  });
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

    if (maxAlt < 5) continue; // 地平線上5度未満はスキップ

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
    if (deduped.length >= 5) break;
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
  if (pct <= 10)  return { stars: '★★★★★', label: '絶好', cls: 'clear5' };
  if (pct <= 25)  return { stars: '★★★★☆', label: '良好', cls: 'clear4' };
  if (pct <= 50)  return { stars: '★★★☆☆', label: '普通', cls: 'clear3' };
  if (pct <= 75)  return { stars: '★★☆☆☆', label: '不向き', cls: 'clear2' };
  return           { stars: '★☆☆☆☆', label: '厳しい', cls: 'clear1' };
}

function isWithin7Days(date) {
  const diff = date.getTime() - Date.now();
  return diff >= -3600000 && diff <= 7 * 86400000;
}

/* =========================================================
   Section 4: 星空 Canvas レンダラー
   ========================================================= */

const CX = 250, CY = 250, CR = 238; // canvas center & radius

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

// 等距離方位図法: Alt/Az → Canvas XY (北=上)
function project(altDeg, azDeg) {
  const r  = CR * Math.cos(altDeg * DEG);
  const az = azDeg * DEG;
  return {
    x: CX + r * Math.sin(az),
    y: CY - r * Math.cos(az)
  };
}

function drawSky(canvas, latDeg, lonDeg, date, showFov, focalLength, sensorKey) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // クリップ: 円形ドームのみ描画
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, CR, 0, 2 * Math.PI);
  ctx.clip();

  drawBackground(ctx);
  drawAltGrid(ctx);
  drawStars(ctx);
  drawMilkyWay(ctx, latDeg, lonDeg, date);
  drawGalacticCenter(ctx, latDeg, lonDeg, date);
  drawMoon(ctx, latDeg, lonDeg, date);

  ctx.restore();

  // 地平線リング
  ctx.beginPath();
  ctx.arc(CX, CY, CR, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(100,160,255,0.35)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = '#1a3a6c';
  ctx.shadowBlur  = 18;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // 方角ラベル
  drawCardinals(ctx);

  // 画角オーバーレイ
  if (showFov && focalLength > 0) {
    drawFovOverlay(ctx, latDeg, lonDeg, date, focalLength, sensorKey);
  }
}

function drawBackground(ctx) {
  const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, CR);
  grad.addColorStop(0,   '#000005');
  grad.addColorStop(0.7, '#020210');
  grad.addColorStop(1,   '#05102a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 500, 500);
}

function drawAltGrid(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(80,100,160,0.2)';
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([4, 6]);
  [30, 60].forEach(alt => {
    const r = CR * Math.cos(alt * DEG);
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, 2 * Math.PI);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.fillStyle  = 'rgba(80,110,180,0.45)';
  ctx.font       = '10px sans-serif';
  ctx.textAlign  = 'left';
  [30, 60].forEach(alt => {
    const r = CR * Math.cos(alt * DEG);
    ctx.fillText(alt + '°', CX + r + 3, CY - 2);
  });
  ctx.restore();
}

function drawStars(ctx) {
  const rng = makePRNG(0xDEADBEEF);
  const N   = 1400;
  for (let i = 0; i < N; i++) {
    const az  = rng() * 360;
    const alt = Math.asin(rng()) * RAD; // 0〜90°
    const mag = Math.pow(rng(), 2);     // 暗い星が多い
    const { x, y } = project(alt, az);
    const r   = 0.4 + (1 - mag) * 1.8;
    const a   = 0.25 + (1 - mag) * 0.75;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (mag < 0.15) {
      ctx.shadowColor = '#cce4ff';
      ctx.shadowBlur  = 4;
    }
    ctx.fillStyle = `rgba(200,220,255,${a})`;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawMilkyWay(ctx, latDeg, lonDeg, date) {
  const pts  = getMilkyWayPoints(date, latDeg, lonDeg, 180);
  const above = pts.filter(p => p.altDeg > -8);
  if (above.length < 3) return;

  // 方位角でソートして連続する弧を作る
  above.sort((a, b) => a.azDeg - b.azDeg);

  // 不連続点で分割（隣接点の方位角差>60°）
  const segments = [];
  let seg = [above[0]];
  for (let i = 1; i < above.length; i++) {
    if (above[i].azDeg - above[i-1].azDeg > 60) {
      segments.push(seg); seg = [];
    }
    seg.push(above[i]);
  }
  segments.push(seg);

  segments.forEach(s => {
    if (s.length < 2) return;
    // 3パス描画（外側ぼかし→中心輝線）
    const passes = [
      { w: 42, a: 0.025, c: '#8090d8' },
      { w: 22, a: 0.055, c: '#a0b8f0' },
      { w:  9, a: 0.14,  c: '#d0e4ff' },
    ];
    passes.forEach(({ w, a, c }) => {
      ctx.beginPath();
      const first = project(s[0].altDeg, s[0].azDeg);
      ctx.moveTo(first.x, first.y);
      s.forEach(p => {
        const { x, y } = project(p.altDeg, p.azDeg);
        ctx.lineTo(x, y);
      });
      ctx.strokeStyle = c;
      ctx.lineWidth   = w;
      ctx.globalAlpha = a;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      // 銀河中心付近（l<40 or l>320）は明るく
      const nearCenter = s.some(p => p.distFromCenter < 40);
      if (nearCenter) ctx.globalAlpha = a * 2;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  });
}

function drawGalacticCenter(ctx, latDeg, lonDeg, date) {
  const { altDeg, azDeg } = galacticCenterAltAz(date, latDeg, lonDeg);
  if (altDeg < -5) return;
  const { x, y } = project(altDeg, azDeg);

  // 外側グロー
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, 2 * Math.PI);
  ctx.fillStyle   = 'rgba(255,200,80,0.12)';
  ctx.shadowColor = '#ffcc44';
  ctx.shadowBlur  = 20;
  ctx.fill();

  // 中心点
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 2 * Math.PI);
  ctx.fillStyle   = '#ffe080';
  ctx.shadowColor = '#ffcc44';
  ctx.shadowBlur  = 10;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // ラベル
  if (altDeg > 2) {
    ctx.fillStyle = 'rgba(255,220,100,0.9)';
    ctx.font      = 'bold 11px sans-serif';
    ctx.fillText('銀河中心', x + 8, y - 6);
  }
}

function drawMoon(ctx, latDeg, lonDeg, date) {
  const pos  = SunCalc.getMoonPosition(date, latDeg, lonDeg);
  const ill  = SunCalc.getMoonIllumination(date);
  const altDeg = pos.altitude * RAD;
  const azDeg  = ((pos.azimuth * RAD) + 180 + 360) % 360;
  if (altDeg < -5) return;
  const { x, y } = project(altDeg, azDeg);
  const R = 9;
  const phase = ill.phase;

  // 月の暗面
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  ctx.fillStyle = '#1a2040';
  ctx.fill();

  // 輝面（位相に応じた半月〜満月）
  const lit = ill.fraction;
  if (lit > 0.03) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 2 * Math.PI);
    ctx.clip();
    const waning = phase > 0.5;
    const ellipseX = R * Math.cos(Math.PI * (phase > 0.5 ? 2 - phase * 2 : phase * 2));
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(ellipseX), R, 0, 0, 2 * Math.PI);
    ctx.fillStyle = '#fffde0';
    ctx.fill();
    if (!waning) {
      // 上弦側: 右を残す
      ctx.fillStyle = '#1a2040';
      ctx.fillRect(x - R - 1, y - R - 1, R + 1, R * 2 + 2);
    } else {
      ctx.fillStyle = '#1a2040';
      ctx.fillRect(x, y - R - 1, R + 1, R * 2 + 2);
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(x, y, R, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(220,220,180,0.5)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  if (altDeg > 3) {
    ctx.fillStyle = 'rgba(200,200,160,0.8)';
    ctx.font      = '10px sans-serif';
    ctx.fillText(`月 ${Math.round(lit * 100)}%`, x + R + 3, y + 3);
  }
}

function drawCardinals(ctx) {
  const dirs = [
    { label: 'N', az: 0 },
    { label: 'E', az: 90 },
    { label: 'S', az: 180 },
    { label: 'W', az: 270 },
  ];
  ctx.font      = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  dirs.forEach(({ label, az }) => {
    const { x, y } = project(0, az);
    // 少し外側へ
    const dx = x - CX, dy = y - CY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx  = CX + dx / len * (CR + 14);
    const ny  = CY + dy / len * (CR + 14);
    ctx.fillStyle = 'rgba(180,200,255,0.7)';
    ctx.fillText(label, nx, ny + 4);
  });
  ctx.textAlign = 'left';
}

// --- 画角オーバーレイ ---
const SENSOR = {
  full: { w: 36, h: 24 },
  apsc: { w: 23.5, h: 15.6 },
  m43:  { w: 17.3, h: 13.0 }
};

function drawFovOverlay(ctx, latDeg, lonDeg, date, focalLength, sensorKey) {
  const sensor = SENSOR[sensorKey] || SENSOR.full;
  const hFov   = 2 * Math.atan(sensor.w / (2 * focalLength)) * RAD;
  const vFov   = 2 * Math.atan(sensor.h / (2 * focalLength)) * RAD;

  // 銀河中心を基準
  const { altDeg, azDeg } = galacticCenterAltAz(date, latDeg, lonDeg);
  const cAlt = altDeg > 5 ? altDeg : 45;
  const cAz  = altDeg > 5 ? azDeg  : 180;

  // 4コーナーを投影（Alt/Azオフセット）
  const corners = [
    { da: +vFov/2, dz: -hFov/2 },
    { da: +vFov/2, dz: +hFov/2 },
    { da: -vFov/2, dz: +hFov/2 },
    { da: -vFov/2, dz: -hFov/2 },
  ].map(({ da, dz }) => {
    const a = Math.max(-5, Math.min(89, cAlt + da));
    const z = ((cAz + dz) + 360) % 360;
    return project(a, z);
  });

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.forEach(c => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,80,0.85)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // ラベル
  const lx = corners[1].x + 4;
  const ly = corners[1].y - 4;
  ctx.fillStyle = 'rgba(255,255,80,0.9)';
  ctx.font      = 'bold 11px sans-serif';
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
  mode: 'optimal',         // 'optimal' | 'simulate'
  location: null,          // { lat, lon, name }
  optimalResults: [],
  selectedResult: null,
  weatherData: null,
  showFov: false,
  focalLength: 0,
  sensorKey: 'full',
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

  // 天気データ取得（バックグラウンド）
  const weatherData = await fetchWeather(state.location.lat, state.location.lon);

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'optimal-card';
    card.dataset.idx = i;

    const rankLabels = ['1位', '2位', '3位', '4位', '5位'];
    const rankCls    = i < 3 ? `rank-${i+1}` : '';
    const dateStr    = r.optimalTime
      ? r.optimalTime.toLocaleString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : r.date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

    // 天気バッジ
    let weatherBadge = '<span class="badge badge-noforecast">予報範囲外</span>';
    if (weatherData && r.optimalTime && isWithin7Days(r.optimalTime)) {
      const pct = getCloudCover(weatherData, r.optimalTime);
      const sw  = cloudCoverToStars(pct);
      if (sw) {
        const isCloudy = pct > 50;
        weatherBadge = `<span class="badge badge-weather${isCloudy ? ' cloudy' : ''}">${sw.stars} 雲量${pct}%</span>`;
      }
    }

    card.innerHTML = `
      <div class="card-rank ${rankCls}">${rankLabels[i]}</div>
      <div class="card-info">
        <div class="card-date">${dateStr}</div>
        <div class="card-detail">天文薄明: ${formatTime(r.nightStart)} 〜 ${formatTime(r.nightEnd)}</div>
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
  drawSky(canvas, lat, lon, date, state.showFov, state.focalLength, state.sensorKey);

  // タイトル
  document.getElementById('sky-title').textContent =
    '🌠 ' + date.toLocaleString('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' の空';

  // 撮影条件
  const { altDeg, azDeg } = galacticCenterAltAz(date, lat, lon);
  const moonIll  = SunCalc.getMoonIllumination(date);
  const moonPos  = SunCalc.getMoonPosition(date, lat, lon);
  const times    = SunCalc.getTimes(date, lat, lon);
  const nextDay  = new Date(date); nextDay.setDate(nextDay.getDate() + 1);
  const nextTimes = SunCalc.getTimes(nextDay, lat, lon);

  document.getElementById('cond-datetime').textContent    = formatDateTime(date);
  document.getElementById('cond-altitude').textContent    = altDeg > 0 ? `${altDeg.toFixed(1)}° （撮影可）` : `${altDeg.toFixed(1)}° （地平線下）`;
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
    condScore.textContent = `${(s.score * 100).toFixed(0)}点`;
  } else {
    condScore.parentElement.style.display = 'none';
  }

  // 画角ラベル更新
  if (state.focalLength > 0) {
    const sensor = SENSOR[state.sensorKey] || SENSOR.full;
    const hFov = 2 * Math.atan(sensor.w / (2 * state.focalLength)) * RAD;
    const vFov = 2 * Math.atan(sensor.h / (2 * state.focalLength)) * RAD;
    document.getElementById('fov-value').textContent = `水平 ${hFov.toFixed(1)}° × 垂直 ${vFov.toFixed(1)}°`;
    document.getElementById('fov-display').style.display = '';
  } else {
    document.getElementById('fov-display').style.display = 'none';
  }
}

function azimuthLabel(az) {
  const dirs = ['北','北北東','北東','東北東','東','東南東','南東','南南東',
                 '南','南南西','南西','西南西','西','西北西','北西','北北西'];
  return dirs[Math.round(az / 22.5) % 16];
}

// --- メイン処理: 場所が決まったら実行 ---
async function runOptimal() {
  if (!state.location) { showError('場所を選択してください。'); return; }
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
    showError('この場所では天の川の撮影に適した日時が見つかりませんでした。');
    return;
  }
  document.getElementById('optimal-list').classList.remove('hidden');
  showResult(true);
  await renderOptimalList(results);
}

async function runSimulate() {
  if (!state.location) { showError('場所を選択してください。'); return; }
  const dateVal = document.getElementById('date-input').value;
  const timeVal = document.getElementById('time-input').value;
  if (!dateVal) { showError('日付を選択してください。'); return; }
  showError('');

  const date = new Date(`${dateVal}T${timeVal || '22:00'}:00`);
  if (isNaN(date.getTime())) { showError('日時の形式が正しくありません。'); return; }

  showLoading(true);
  document.getElementById('optimal-list').classList.add('hidden');
  state.selectedResult = null;

  state.weatherData = await fetchWeather(state.location.lat, state.location.lon);
  showLoading(false);
  showResult(true);
  renderSkyAndCondition(date);
}

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  // 今日の日付をデフォルト
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('date-input').value = today;

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
    searchResults.innerHTML = '<div class="search-result-item">検索中...</div>';
    searchResults.classList.remove('hidden');
    const results = await geocodeSearch(q);
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-result-item">見つかりませんでした</div>';
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
        if (state.mode === 'optimal') runOptimal();
      });
      searchResults.appendChild(item);
    });
  }

  searchBtn.addEventListener('click', doSearch);
  locationInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== locationInput) {
      searchResults.classList.add('hidden');
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
  document.getElementById('fov-toggle').addEventListener('change', e => {
    state.showFov = e.target.checked;
    if (state.selectedResult) renderSkyAndCondition(state.selectedResult.optimalTime || state.selectedResult.date);
    else if (state.mode === 'simulate') {
      const d = new Date(`${document.getElementById('date-input').value}T${document.getElementById('time-input').value}:00`);
      if (!isNaN(d)) renderSkyAndCondition(d);
    }
  });

  // 地図初期化
  initMap(loc => {
    state.location = loc;
    locationInput.value = loc.name.split(',')[0];
    if (state.mode === 'optimal') runOptimal();
  });
});
