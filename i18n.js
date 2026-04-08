/* =========================================================
   i18n.js — 天の川撮影プランナー / Milky Way Planner
   Supported languages: ja (Japanese), en (English)
   ========================================================= */

const I18N_KEY = 'starweb-lang';

const TRANSLATIONS = {
  ja: {
    // Page
    'page.title': '天の川撮影プランナー',
    // Header
    'header.title': '🌌 天の川撮影プランナー',
    'header.subtitle': '最適な撮影日時を見つけて、天の川をイメージしよう',
    'header.settings': '設定',
    'header.langToggle': 'EN',
    // Settings modal
    'settings.heading': '⚙️ 設定',
    'settings.camera.heading': '📷 カメラのデフォルト',
    'settings.focal': '焦点距離',
    'settings.sensor': 'センサーサイズ',
    'settings.sensor.full': 'フルサイズ (36×24mm)',
    'settings.sensor.apsc': 'APS-C (23.5×15.6mm)',
    'settings.sensor.m43': 'マイクロフォーサーズ (17.3×13mm)',
    'settings.orientation': 'カメラ向き',
    'settings.display.heading': '🖼️ 表示設定',
    'settings.showFov': '画角枠をデフォルトで表示',
    'settings.hfov': '参照ビュー画角',
    'settings.hfov.narrow': '狭め (80°)',
    'settings.hfov.standard': '標準 (100°)',
    'settings.hfov.wide': '広め (110°)',
    'settings.hfov.ultrawide': '超広角 (130°)',
    'settings.search.heading': '🔍 最適日時の検索設定',
    'settings.count': '表示件数',
    'settings.count.3': '3件',
    'settings.count.5': '5件',
    'settings.count.10': '10件',
    'settings.minAlt': '銀河中心の最小高度',
    'settings.reset': 'リセット',
    'settings.save': '💾 保存して閉じる',
    // Tabs
    'tab.optimal': '📅 最適日時を探す',
    'tab.simulate': '🔭 日時指定シミュレーション',
    // Location
    'location.label': '📍 撮影場所',
    'location.placeholder': '地名を入力（例: 富士山、北海道）',
    'location.search': '検索',
    'location.favTitle': '現在地をお気に入りに追加',
    'location.favList': '⭐ お気に入り',
    'location.mapHint': '地図をクリックして撮影場所を選択することもできます',
    // Favorites
    'fav.empty': 'まだお気に入りがありません',
    'fav.add': 'お気に入りに追加',
    'fav.added': 'お気に入り登録済み',
    'fav.edit': '名前を編集',
    'fav.delete': '削除',
    // Date/time inputs
    'dt.label': '🕐 日時指定',
    'dt.date': '📅 日付',
    'dt.time': '🕐 時刻',
    'dt.today': '今日',
    'dt.3m': '+3ヶ月',
    'dt.6m': '+6ヶ月',
    'dt.9m': '+9ヶ月',
    'dt.1y': '+1年',
    // Calculate
    'calc': '✨ 計算する',
    // Results
    'result.optimalTitle': '📆 最適撮影日時 TOP',
    'result.skyTitle': '🌠 星空シミュレーション',
    'result.condTitle': '📋 撮影条件',
    'cond.datetime': '日時',
    'cond.altitude': '銀河中心高度',
    'cond.azimuth': '銀河中心方位',
    'cond.moon': '月齢',
    'cond.twilightEnd': '天文薄明終了',
    'cond.twilightStart': '天文薄明開始',
    'cond.weather': '雲量 / 快晴度',
    'cond.score': '総合スコア',
    // Camera section
    'camera.title': '📷 カメラ設定（任意）',
    'camera.focal': '焦点距離',
    'camera.sensor': 'センサーサイズ',
    'camera.orientation': '向き',
    'camera.fov': '画角',
    'camera.showFov': '画角枠を表示',
    // Loading / errors
    'loading': '計算中...',
    'error.noLocation': '場所を選択してください。',
    'error.noResults': 'この場所では天の川の撮影に適した日時が見つかりませんでした。',
    'error.noDate': '日付を選択してください。',
    'error.invalidDate': '日時の形式が正しくありません。',
    // Search
    'search.loading': '検索中...',
    'search.notFound': '見つかりませんでした',
    // Sky canvas
    'sky.galCenter': '銀河中心',
    'sky.moon': '月',
    // Sky title (dynamic)
    'sky.titleSuffix': ' の空',
    // Weather labels
    'weather.clear5': '絶好',
    'weather.clear4': '良好',
    'weather.clear3': '普通',
    'weather.clear2': '不向き',
    'weather.clear1': '厳しい',
    'weather.outOfRange': '予報範囲外',
    'weather.cloudCover': '雲量',
    // Altitude labels
    'alt.above': '（撮影可）',
    'alt.below': '（地平線下）',
    // FOV
    'fov.h': '水平',
    'fov.v': '垂直',
    // Score
    'score.suffix': '点',
    // Card twilight
    'card.twilight': '天文薄明',
    // Rank labels (0-indexed)
    'rank.0': '1位',
    'rank.1': '2位',
    'rank.2': '3位',
    'rank.3': '4位',
    'rank.4': '5位',
    'rank.5': '6位',
    'rank.6': '7位',
    'rank.7': '8位',
    'rank.8': '9位',
    'rank.9': '10位',
    // Compass directions
    'dir.N':   '北',
    'dir.NNE': '北北東',
    'dir.NE':  '北東',
    'dir.ENE': '東北東',
    'dir.E':   '東',
    'dir.ESE': '東南東',
    'dir.SE':  '南東',
    'dir.SSE': '南南東',
    'dir.S':   '南',
    'dir.SSW': '南南西',
    'dir.SW':  '南西',
    'dir.WSW': '西南西',
    'dir.W':   '西',
    'dir.WNW': '西北西',
    'dir.NW':  '北西',
    'dir.NNW': '北北西',
    // Orientation labels
    'orient.portrait':  '縦',
    'orient.landscape': '横',
    // Footer
    'footer': '天文データ: Astronomy Engine ／ 地図: OpenStreetMap ／ 天気: Open-Meteo',
  },

  en: {
    // Page
    'page.title': 'Milky Way Planner',
    // Header
    'header.title': '🌌 Milky Way Planner',
    'header.subtitle': 'Find the perfect time and date to photograph the Milky Way',
    'header.settings': 'Settings',
    'header.langToggle': 'JA',
    // Settings modal
    'settings.heading': '⚙️ Settings',
    'settings.camera.heading': '📷 Camera Defaults',
    'settings.focal': 'Focal Length',
    'settings.sensor': 'Sensor Size',
    'settings.sensor.full': 'Full Frame (36×24mm)',
    'settings.sensor.apsc': 'APS-C (23.5×15.6mm)',
    'settings.sensor.m43': 'Micro Four Thirds (17.3×13mm)',
    'settings.orientation': 'Orientation',
    'settings.display.heading': '🖼️ Display Settings',
    'settings.showFov': 'Show FOV frame by default',
    'settings.hfov': 'Reference View FOV',
    'settings.hfov.narrow': 'Narrow (80°)',
    'settings.hfov.standard': 'Standard (100°)',
    'settings.hfov.wide': 'Wide (110°)',
    'settings.hfov.ultrawide': 'Ultra-wide (130°)',
    'settings.search.heading': '🔍 Search Settings',
    'settings.count': 'Results to show',
    'settings.count.3': '3 results',
    'settings.count.5': '5 results',
    'settings.count.10': '10 results',
    'settings.minAlt': 'Min Galactic Center Altitude',
    'settings.reset': 'Reset',
    'settings.save': '💾 Save & Close',
    // Tabs
    'tab.optimal': '📅 Find Best Dates',
    'tab.simulate': '🔭 Simulate Date & Time',
    // Location
    'location.label': '📍 Shooting Location',
    'location.placeholder': 'Enter a place name (e.g. Mount Fuji)',
    'location.search': 'Search',
    'location.favTitle': 'Add current location to favorites',
    'location.favList': '⭐ Favorites',
    'location.mapHint': 'You can also click the map to select a location',
    // Favorites
    'fav.empty': 'No favorites yet',
    'fav.add': 'Add to favorites',
    'fav.added': 'Already in favorites',
    'fav.edit': 'Edit name',
    'fav.delete': 'Delete',
    // Date/time inputs
    'dt.label': '🕐 Date & Time',
    'dt.date': '📅 Date',
    'dt.time': '🕐 Time',
    'dt.today': 'Today',
    'dt.3m': '+3mo',
    'dt.6m': '+6mo',
    'dt.9m': '+9mo',
    'dt.1y': '+1yr',
    // Calculate
    'calc': '✨ Calculate',
    // Results
    'result.optimalTitle': '📆 Best Shooting Times TOP',
    'result.skyTitle': '🌠 Sky Simulation',
    'result.condTitle': '📋 Conditions',
    'cond.datetime': 'Date & Time',
    'cond.altitude': 'Galactic Center Alt.',
    'cond.azimuth': 'Galactic Center Az.',
    'cond.moon': 'Moon Phase',
    'cond.twilightEnd': 'Astro. Twilight End',
    'cond.twilightStart': 'Astro. Twilight Start',
    'cond.weather': 'Cloud Cover / Clarity',
    'cond.score': 'Total Score',
    // Camera section
    'camera.title': '📷 Camera Settings (optional)',
    'camera.focal': 'Focal Length',
    'camera.sensor': 'Sensor Size',
    'camera.orientation': 'Orientation',
    'camera.fov': 'FOV',
    'camera.showFov': 'Show FOV frame',
    // Loading / errors
    'loading': 'Calculating...',
    'error.noLocation': 'Please select a location.',
    'error.noResults': 'No suitable dates found for Milky Way photography at this location.',
    'error.noDate': 'Please select a date.',
    'error.invalidDate': 'Invalid date/time format.',
    // Search
    'search.loading': 'Searching...',
    'search.notFound': 'Not found',
    // Sky canvas
    'sky.galCenter': 'Galactic Center',
    'sky.moon': 'Moon',
    // Sky title (dynamic)
    'sky.titleSuffix': '',
    // Weather labels
    'weather.clear5': 'Excellent',
    'weather.clear4': 'Good',
    'weather.clear3': 'Fair',
    'weather.clear2': 'Poor',
    'weather.clear1': 'Very Poor',
    'weather.outOfRange': 'Out of forecast',
    'weather.cloudCover': 'Cloud',
    // Altitude labels
    'alt.above': ' (visible)',
    'alt.below': ' (below horizon)',
    // FOV
    'fov.h': 'H',
    'fov.v': 'V',
    // Score
    'score.suffix': 'pts',
    // Card twilight
    'card.twilight': 'Astro. twilight',
    // Rank labels (0-indexed)
    'rank.0': '1st',
    'rank.1': '2nd',
    'rank.2': '3rd',
    'rank.3': '4th',
    'rank.4': '5th',
    'rank.5': '6th',
    'rank.6': '7th',
    'rank.7': '8th',
    'rank.8': '9th',
    'rank.9': '10th',
    // Compass directions
    'dir.N':   'N',
    'dir.NNE': 'NNE',
    'dir.NE':  'NE',
    'dir.ENE': 'ENE',
    'dir.E':   'E',
    'dir.ESE': 'ESE',
    'dir.SE':  'SE',
    'dir.SSE': 'SSE',
    'dir.S':   'S',
    'dir.SSW': 'SSW',
    'dir.SW':  'SW',
    'dir.WSW': 'WSW',
    'dir.W':   'W',
    'dir.WNW': 'WNW',
    'dir.NW':  'NW',
    'dir.NNW': 'NNW',
    // Orientation labels
    'orient.portrait':  'Portrait',
    'orient.landscape': 'Landscape',
    // Footer
    'footer': 'Astronomy data: Astronomy Engine / Map: OpenStreetMap / Weather: Open-Meteo',
  },
};

/* ---- Language detection ---- */

function _detectLang() {
  try {
    const saved = localStorage.getItem(I18N_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {}
  // Default: Japanese if browser language starts with 'ja', else English
  return (navigator.language || '').startsWith('ja') ? 'ja' : 'en';
}

let currentLang = _detectLang();

/* ---- Public API ---- */

/**
 * Translate a key into the current language.
 * Falls back to Japanese if the key is missing in the current language.
 */
function t(key) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.ja;
  return dict[key] !== undefined ? dict[key] : (TRANSLATIONS.ja[key] || key);
}

/** Returns the BCP-47 locale string for the current language. */
function getCurrentLocale() {
  return currentLang === 'ja' ? 'ja-JP' : 'en-US';
}

/** Apply all data-i18n* attribute translations to the DOM. */
function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.title = t('page.title');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  // Update lang-toggle button label
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.textContent = t('header.langToggle');
}

/** Switch to the given language ('ja' or 'en') and update the DOM. */
function setLang(lang) {
  if (lang !== 'ja' && lang !== 'en') return;
  currentLang = lang;
  try { localStorage.setItem(I18N_KEY, lang); } catch {}
  applyTranslations();
}

/* Apply translations as soon as the DOM is ready */
document.addEventListener('DOMContentLoaded', applyTranslations);
