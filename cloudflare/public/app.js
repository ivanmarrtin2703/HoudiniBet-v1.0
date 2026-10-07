const API = '';

/** 'hoy' | '5d' | 'all' | 'date' */
let windowMode = 'hoy';
let selectedDate = new Date().toISOString().slice(0, 10);
let scopeFilter = 'all'; // all | clubs | intl
let liveOnly = false;
let leagueFilterIds = new Set(); // empty = todas; otherwise selected league ids
let leaguesPanelOpen = true;
let cachedMatches = [];
let cachedMode = 'live';
let cachedBets = [];
let bestBetsLimit = 30;
let bestBetsHasMore = false;
let livePollTimer = null;
/** '1' | '2' | '3' | '4' | '5' — history selection; combos only for 2–5 */
let oddsBandFilter = '2';
let oddsHistoryFilter = 'all'; // all | miss | hit
let cachedOddsBandBets = [];
let cachedOddsBandPerf = null;
let cachedOddsRecent = [];
let cachedOddsCombos = [];
/** @type {{ hits: number, misses: number, decided: number, hitRate: number|null, pending: number, windowLabel?: string|null }|null} */
let cachedOddsGlobal = null;

const COUNTRY_FLAG = {
  Spain: '🇪🇸',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Italy: '🇮🇹',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Portugal: '🇵🇹',
  Netherlands: '🇳🇱',
  Belgium: '🇧🇪',
  Brazil: '🇧🇷',
  Argentina: '🇦🇷',
  Mexico: '🇲🇽',
  USA: '🇺🇸',
  'United States': '🇺🇸',
  World: '🌍',
  Europe: '🇪🇺',
};

const COUNTRY_ES = {
  Spain: 'España',
  England: 'Inglaterra',
  Italy: 'Italia',
  Germany: 'Alemania',
  France: 'Francia',
  Portugal: 'Portugal',
  Netherlands: 'Países Bajos',
  Belgium: 'Bélgica',
  Brazil: 'Brasil',
  Argentina: 'Argentina',
  Mexico: 'México',
  USA: 'EE. UU.',
  'United States': 'EE. UU.',
  World: 'Internacional',
  Europe: 'Europa',
};

const BET_LABELS = {
  HOME_WIN: 'Victoria local',
  DRAW: 'Empate',
  AWAY_WIN: 'Victoria visitante',
  OVER_15: 'Más de 1,5 goles',
  UNDER_15: 'Menos de 1,5 goles',
  OVER_25: 'Más de 2,5 goles',
  UNDER_25: 'Menos de 2,5 goles',
  OVER_35: 'Más de 3,5 goles',
  UNDER_35: 'Menos de 3,5 goles',
  BTTS_YES: 'Ambos marcan — Sí',
  BTTS_NO: 'Ambos marcan — No',
  HOME_OVER_05: 'Local · Más de 0,5 goles',
  HOME_UNDER_05: 'Local · Menos de 0,5 goles',
  HOME_OVER_15: 'Local · Más de 1,5 goles',
  HOME_UNDER_15: 'Local · Menos de 1,5 goles',
  HOME_OVER_25: 'Local · Más de 2,5 goles',
  HOME_UNDER_25: 'Local · Menos de 2,5 goles',
  HOME_OVER_35: 'Local · Más de 3,5 goles',
  HOME_UNDER_35: 'Local · Menos de 3,5 goles',
  AWAY_OVER_05: 'Visitante · Más de 0,5 goles',
  AWAY_UNDER_05: 'Visitante · Menos de 0,5 goles',
  AWAY_OVER_15: 'Visitante · Más de 1,5 goles',
  AWAY_UNDER_15: 'Visitante · Menos de 1,5 goles',
  AWAY_OVER_25: 'Visitante · Más de 2,5 goles',
  AWAY_UNDER_25: 'Visitante · Menos de 2,5 goles',
  AWAY_OVER_35: 'Visitante · Más de 3,5 goles',
  AWAY_UNDER_35: 'Visitante · Menos de 3,5 goles',
  CORNERS_OVER_85: 'Más de 8,5 córners',
  CORNERS_UNDER_85: 'Menos de 8,5 córners',
  CORNERS_OVER_95: 'Más de 9,5 córners',
  CORNERS_UNDER_95: 'Menos de 9,5 córners',
  CORNERS_OVER_105: 'Más de 10,5 córners',
  CORNERS_UNDER_105: 'Menos de 10,5 córners',
  CARDS_OVER_35: 'Más de 3,5 amarillas',
  CARDS_UNDER_35: 'Menos de 3,5 amarillas',
  CARDS_OVER_45: 'Más de 4,5 amarillas',
  CARDS_UNDER_45: 'Menos de 4,5 amarillas',
};

const FAMILY_LABELS = {
  '1X2': '1X2',
  goles: 'Goles',
  corners: 'Córners',
  cards: 'Amarillas',
  otros: 'Otros',
};

/** "15" → "1,5" ; "105" → "10,5" */
function lineFromSuffix(suffix) {
  const s = String(suffix || '');
  if (!/^\d+$/.test(s)) return s.replace('.', ',');
  if (s.length === 1) return s;
  return `${s.slice(0, -1)},${s.slice(-1)}`;
}

function labelBetFallback(code, homeName, awayName) {
  const raw = String(code || '').toUpperCase();
  if (!raw) return '—';
  const home = String(homeName || '').trim();
  const away = String(awayName || '').trim();
  if (raw === 'HOME_WIN') return home ? `Victoria ${home}` : 'Victoria local';
  if (raw === 'AWAY_WIN') return away ? `Victoria ${away}` : 'Victoria visitante';
  if (raw === 'DRAW') return 'Empate';
  if (raw === 'BTTS_YES') return 'Ambos marcan — Sí';
  if (raw === 'BTTS_NO') return 'Ambos marcan — No';

  const m = raw.match(/^(HOME_|AWAY_|CORNERS_|CARDS_)?(OVER|UNDER)_(\d+)$/);
  if (!m) return code;
  const scope = m[1] || '';
  const side = m[2] === 'OVER' ? 'Más de' : 'Menos de';
  const line = lineFromSuffix(m[3]);
  let unit = 'goles';
  let who = '';
  if (scope === 'HOME_') who = home ? `${home} · ` : 'Local · ';
  else if (scope === 'AWAY_') who = away ? `${away} · ` : 'Visitante · ';
  else if (scope === 'CORNERS_') unit = 'córners';
  else if (scope === 'CARDS_') unit = 'amarillas';
  return `${who}${side} ${line} ${unit}`;
}

/** ISO2 for flagcdn when team looks like a national side */
const TEAM_FLAG_ISO = {
  spain: 'es',
  england: 'gb-eng',
  italy: 'it',
  germany: 'de',
  france: 'fr',
  portugal: 'pt',
  netherlands: 'nl',
  belgium: 'be',
  brazil: 'br',
  argentina: 'ar',
  mexico: 'mx',
  wales: 'gb-wls',
  scotland: 'gb-sct',
  'northern ireland': 'gb-nir',
  norway: 'no',
  sweden: 'se',
  denmark: 'dk',
  austria: 'at',
  switzerland: 'ch',
  poland: 'pl',
  croatia: 'hr',
  serbia: 'rs',
  greece: 'gr',
  turkey: 'tr',
  turkiye: 'tr',
  ukraine: 'ua',
  ireland: 'ie',
  'republic of ireland': 'ie',
  iceland: 'is',
  finland: 'fi',
  romania: 'ro',
  hungary: 'hu',
  czechia: 'cz',
  'czech republic': 'cz',
  slovakia: 'sk',
  slovenia: 'si',
  bulgaria: 'bg',
  albania: 'al',
  'north macedonia': 'mk',
  bosnia: 'ba',
  'bosnia and herzegovina': 'ba',
  montenegro: 'me',
  kosovo: 'xk',
  malta: 'mt',
  gibraltar: 'gi',
  liechtenstein: 'li',
  andorra: 'ad',
  'san marino': 'sm',
  luxembourg: 'lu',
  cyprus: 'cy',
  georgia: 'ge',
  armenia: 'am',
  azerbaijan: 'az',
  kazakhstan: 'kz',
  israel: 'il',
  russia: 'ru',
  moldova: 'md',
  belarus: 'by',
  latvia: 'lv',
  lithuania: 'lt',
  estonia: 'ee',
  'faroe islands': 'fo',
  japan: 'jp',
  'south korea': 'kr',
  korea: 'kr',
  australia: 'au',
  canada: 'ca',
  'united states': 'us',
  usa: 'us',
  colombia: 'co',
  chile: 'cl',
  uruguay: 'uy',
  peru: 'pe',
  ecuador: 'ec',
  paraguay: 'py',
  venezuela: 've',
  bolivia: 'bo',
  morocco: 'ma',
  egypt: 'eg',
  nigeria: 'ng',
  senegal: 'sn',
  ghana: 'gh',
  cameroon: 'cm',
  'ivory coast': "ci",
  "côte d'ivoire": 'ci',
  algeria: 'dz',
  tunisia: 'tn',
  guinea: 'gn',
  kenya: 'ke',
  namibia: 'na',
  mali: 'ml',
  uganda: 'ug',
  angola: 'ao',
  benin: 'bj',
  'burkina faso': 'bf',
  comoros: 'km',
  gambia: 'gm',
  malawi: 'mw',
  niger: 'ne',
  'south africa': 'za',
  'dr congo': 'cd',
  congo: 'cg',
  'democratic republic of the congo': 'cd',
  jamaica: 'jm',
  'costa rica': 'cr',
  panama: 'pa',
  honduras: 'hn',
  'el salvador': 'sv',
  guatemala: 'gt',
  haiti: 'ht',
  nicaragua: 'ni',
  belize: 'bz',
  cuba: 'cu',
  bahamas: 'bs',
  aruba: 'aw',
  bonaire: 'bq',
  'dominican republic': 'do',
  'puerto rico': 'pr',
  'cayman islands': 'ky',
  'trinidad and tobago': 'tt',
  curacao: 'cw',
  'curaçao': 'cw',
  suriname: 'sr',
  guyana: 'gy',
  dominica: 'dm',
  grenada: 'gd',
  barbados: 'bb',
  bermuda: 'bm',
  'cayman virgin islands': 'vg',
  'u.s. virgin islands': 'vi',
  'us virgin islands': 'vi',
  anguilla: 'ai',
  montserrat: 'ms',
  'antigua and barbuda': 'ag',
  'saint martin': 'mf',
  'sint maarten': 'sx',
  'saint lucia': 'lc',
  'st lucia': 'lc',
  'saint vincent and the grenadines': 'vc',
  'st. vincent and the grenadines': 'vc',
  'st vincent and the grenadines': 'vc',
  'st. kitts and nevis': 'kn',
  'saint kitts and nevis': 'kn',
  'st kitts and nevis': 'kn',
  martinique: 'mq',
  guadeloupe: 'gp',
  'french guiana': 'gf',
  'turks and caicos islands': 'tc',
  thailand: 'th',
  philippines: 'ph',
  vietnam: 'vn',
  china: 'cn',
  palestine: 'ps',
  pakistan: 'pk',
  india: 'in',
  indonesia: 'id',
  malaysia: 'my',
  cambodia: 'kh',
  'hong kong': 'hk',
  'new zealand': 'nz',
  fiji: 'fj',
  vanuatu: 'vu',
  uzbekistan: 'uz',
  kyrgyzstan: 'kg',
  lebanon: 'lb',
  jordan: 'jo',
  tajikistan: 'tj',
  mauritius: 'mu',
  'sri lanka': 'lk',
};

const INTL_NAME_RE =
  /^(Friendlies|UEFA Nations League|Champions League|Europa League|UEFA Champions League|UEFA Europa League)/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Human tip label. Pass home/away so HOME_/AWAY_ markets use team names
 * instead of «Local/Visitante».
 */
function labelBet(code, homeName, awayName) {
  if (!code) return '—';
  const home = String(homeName || '').trim();
  const away = String(awayName || '').trim();
  const raw = String(code).toUpperCase();
  if (raw === 'HOME_WIN') return home ? `Victoria ${home}` : BET_LABELS.HOME_WIN;
  if (raw === 'AWAY_WIN') return away ? `Victoria ${away}` : BET_LABELS.AWAY_WIN;
  if (raw.startsWith('HOME_') && home) {
    return labelBetFallback(raw, home, away);
  }
  if (raw.startsWith('AWAY_') && away) {
    return labelBetFallback(raw, home, away);
  }
  return BET_LABELS[code] || labelBetFallback(code, home, away);
}

function labelFamily(family) {
  return FAMILY_LABELS[family] || family || '—';
}

function teamInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function flagUrlForTeam(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/nott'?m\b/g, 'nottm')
    .replace(/[^a-z0-9.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const iso = TEAM_FLAG_ISO[key];
  if (!iso) return null;
  return `https://flagcdn.com/w80/${iso}.png`;
}

const CLUB_CREST_IDS = {
  'az alkmaar': 201,
  anderlecht: 554,
  'ararat armenia': 3424,
  'ararat-armenia': 3424,
  benfica: 211,
  besiktas: 549,
  celtic: 247,
  'dinamo zagreb': 620,
  'gnk dinamo': 620,
  ferencvaros: 651,
  'hapoel beer sheva': 420,
  'h. beer-sheva': 420,
  jagiellonia: 347,
  'jagiellonia bialystok': 347,
  'lech poznan': 339,
  'levski sofia': 565,
  lillestrom: 327,
  'nec nijmegen': 413,
  'n.e.c.': 413,
  celje: 696,
  'nk celje': 696,
  'ofi crete': 545,
  olympiacos: 553,
  omonia: 558,
  'omonia nicosia': 558,
  salzburg: 571,
  'rb salzburg': 571,
  'sparta prague': 570,
  'sparta praha': 570,
  'sturm graz': 568,
  torreense: 4758,
  'union st.gilloise': 1393,
  'union st gilloise': 1393,
  'union sg': 1393,
  'viktoria plzen': 567,
  'club brugge': 569,
  'bodo glimt': 311,
  atleti: 530,
  'atletico madrid': 530,
  'b. dortmund': 165,
  'borussia dortmund': 165,
  feyenoord: 209,
  fenerbahce: 611,
  galatasaray: 645,
  porto: 212,
  'sporting cp': 228,
  psv: 197,
  shakhtar: 556,
  'shakhtar donetsk': 556,
  'slavia praha': 560,
  'slavia prague': 560,
  's. bratislava': 572,
  'slovan bratislava': 572,
  lask: 652,
  'aek athens': 557,
  viking: 320,
  paris: 85,
  'paris saint germain': 85,
  psg: 85,
  arsenal: 42,
  barcelona: 529,
  'real madrid': 541,
  liverpool: 40,
  'manchester city': 50,
  'man city': 50,
  'manchester united': 33,
  'man utd': 33,
  'man united': 33,
  inter: 505,
  milan: 489,
  'ac milan': 489,
  juventus: 496,
  napoli: 492,
  roma: 497,
  bayern: 157,
  'bayern munich': 157,
  'bayern munchen': 157,
  chelsea: 49,
  tottenham: 47,
  villarreal: 533,
  'real sociedad': 548,
  'real betis': 543,
  celta: 538,
  lens: 116,
  lille: 79,
  lyon: 80,
  marseille: 81,
  rennes: 94,
  leverkusen: 168,
  leipzig: 173,
  stuttgart: 172,
  hoffenheim: 167,
  como: 895,
  sunderland: 746,
  bournemouth: 35,
  'crystal palace': 52,
  'aston villa': 66,
};

function clubCrestUrl(name) {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return null;
  const id = CLUB_CREST_IDS[key];
  if (id != null) return `https://media.api-sports.io/football/teams/${id}.png`;
  const stripped = key
    .replace(/^(fc|cf|ac|as|ssc|rc|rcd|gnk|nk|sk|fk|rsc|sl)\s+/, '')
    .replace(/\s+(fc|cf|ac|afc|sc|sv|jk)$/, '')
    .trim();
  if (stripped && CLUB_CREST_IDS[stripped] != null) {
    return `https://media.api-sports.io/football/teams/${CLUB_CREST_IDS[stripped]}.png`;
  }
  return null;
}

function resolveCrestUrl(logo, name) {
  return clubCrestUrl(name) || (logo ? String(logo) : null) || flagUrlForTeam(name);
}

function crestHtml(name, logo, size = 'md') {
  const src = resolveCrestUrl(logo, name);
  const initials = escapeHtml(teamInitials(name));
  const alt = escapeHtml(name || 'Equipo');
  if (src) {
    return `<span class="crest-wrap crest-wrap--${size}">
      <img class="crest crest--${size}" src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" />
      <span class="crest crest--fallback crest--${size}" style="display:none" aria-hidden="true">${initials}</span>
    </span>`;
  }
  return `<span class="crest crest--fallback crest--${size}" aria-hidden="true">${initials}</span>`;
}

function crestsRowHtml(homeName, homeLogo, awayName, awayLogo) {
  return `
    <div class="crests-row" aria-hidden="true">
      ${crestHtml(homeName, homeLogo)}
      <span class="crests-row__vs">vs</span>
      ${crestHtml(awayName, awayLogo)}
    </div>`;
}

function confClass(score) {
  const n = Number(score);
  if (n >= 60) return 'conf-hi';
  if (n >= 45) return 'conf-mid';
  return 'conf-lo';
}

function pct(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Number(n);
}

function pctLabel(n) {
  const p = pct(n);
  if (p == null) return '—';
  return `${(p * 100).toFixed(0)}%`;
}

function probBar(label, prob) {
  const p = pct(prob);
  if (p == null) return '';
  const width = Math.max(4, Math.min(100, Math.round(p * 100)));
  return `
    <div class="prob-row">
      <div class="prob-row__label">${escapeHtml(label)}</div>
      <div class="prob-row__track" aria-hidden="true"><span class="prob-row__fill" style="width:${width}%"></span></div>
      <div class="prob-row__pct">${pctLabel(prob)}</div>
    </div>`;
}

function marketSection(title, rowsHtml) {
  if (!rowsHtml || !String(rowsHtml).trim()) return '';
  return `
    <div class="market-block">
      <div class="market-block__title">${escapeHtml(title)}</div>
      ${rowsHtml}
    </div>`;
}

function formatMatchDate(value) {
  if (!value) return 'Fecha no disponible';
  const raw = String(value).trim().replace(' ', 'T');
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(value);
  const opts = { timeZone: 'Europe/Madrid' };
  const weekday = d.toLocaleDateString('es-ES', { ...opts, weekday: 'short' });
  const datePart = d.toLocaleDateString('es-ES', {
    ...opts,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('es-ES', {
    ...opts,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${weekday} ${datePart} · ${timePart}`;
}

function formHtml(form) {
  if (!form || !form.length) {
    return `<span class="muted">Sin historial suficiente</span>`;
  }
  return form
    .map((f) => `<span class="badge ${escapeHtml(f)}">${escapeHtml(f)}</span>`)
    .join('');
}

function isInternationalMatch(item) {
  const country = String(item.leagueCountry || item.country || '');
  const name = String(item.leagueName || item.league || '');
  if (/Club Friendlies/i.test(name)) return false;
  if (country === 'World') return true;
  return INTL_NAME_RE.test(name);
}

function filterByScope(items) {
  let list = items || [];
  if (scopeFilter === 'clubs') list = list.filter((x) => !isInternationalMatch(x));
  if (scopeFilter === 'intl') list = list.filter((x) => isInternationalMatch(x));
  if (liveOnly) list = list.filter((x) => x.status === 'live');
  if (leagueFilterIds.size > 0) {
    list = list.filter((x) => leagueFilterIds.has(Number(x.leagueId)));
  }
  return list;
}

function selectedLeagueCount() {
  return leagueFilterIds.size;
}

function pruneLeagueSelection(leagues) {
  if (!leagueFilterIds.size) return;
  const valid = new Set((leagues || []).map((l) => Number(l.id)));
  for (const id of [...leagueFilterIds]) {
    if (!valid.has(id)) leagueFilterIds.delete(id);
  }
}

function shortLeagueName(name) {
  const n = String(name || '').trim();
  if (!n) return 'Liga';
  return n
    .replace(/^UEFA\s+/i, '')
    .replace(/\s+Grp\.\s*.+$/i, '')
    .replace(/\s+\d{4}.*$/i, '')
    .slice(0, 28);
}

function countryFlag(country) {
  const c = String(country || '').trim();
  return COUNTRY_FLAG[c] || '🏳️';
}

function countryLabel(country) {
  const c = String(country || '').trim();
  return COUNTRY_ES[c] || c || '—';
}

function collectLeagues(matches, scope) {
  let list = matches || [];
  if (scope === 'clubs') list = list.filter((x) => !isInternationalMatch(x));
  if (scope === 'intl') list = list.filter((x) => isInternationalMatch(x));
  const map = new Map();
  for (const m of list) {
    const id = m.leagueId;
    if (id == null) continue;
    const prev = map.get(id);
    if (prev) {
      prev.count += 1;
      continue;
    }
    map.set(id, {
      id,
      name: m.leagueName || m.league || 'Liga',
      country: m.leagueCountry || m.country || '',
      count: 1,
    });
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.name).localeCompare(String(b.name), 'es');
  });
}

function renderLeagueCategories(matches) {
  const block = document.getElementById('league-block');
  const cats = document.getElementById('league-cats');
  const label = document.getElementById('league-block-label');
  const toggle = document.getElementById('league-toggle');
  if (!block || !cats) return;

  const showCats = scopeFilter === 'clubs' || scopeFilter === 'intl';
  block.hidden = !showCats;
  if (!showCats) {
    leagueFilterIds.clear();
    cats.innerHTML = '';
    return;
  }

  const leagues = collectLeagues(matches, scopeFilter);
  pruneLeagueSelection(leagues);

  const nSel = selectedLeagueCount();
  if (label) {
    const base = scopeFilter === 'intl' ? 'Competiciones' : 'Ligas';
    label.textContent = nSel ? `${base} · ${nSel} seleccionada${nSel === 1 ? '' : 's'}` : `${base} · todas`;
  }
  block.classList.toggle('is-collapsed', !leaguesPanelOpen);
  if (toggle) toggle.setAttribute('aria-expanded', leaguesPanelOpen ? 'true' : 'false');

  if (!leagues.length) {
    cats.innerHTML = `<p class="league-cats__empty">No hay categorías en esta ventana.</p>`;
    return;
  }

  const allActive = nSel === 0;
  const totalMatches = leagues.reduce((n, l) => n + l.count, 0);
  cats.innerHTML = [
    `<div class="league-cats__toolbar">
      <button type="button" class="league-cat league-cat--all${allActive ? ' active' : ''}" data-league-action="all" aria-pressed="${allActive}">
        <span class="league-cat__check" aria-hidden="true"></span>
        <span class="league-cat__flag" aria-hidden="true">🏟️</span>
        <span class="league-cat__body">
          <span class="league-cat__name">${scopeFilter === 'intl' ? 'Todas las competiciones' : 'Todas las ligas'}</span>
          <span class="league-cat__meta">${totalMatches} partidos</span>
        </span>
      </button>
      ${
        nSel
          ? `<button type="button" class="league-cats__clear" data-league-action="clear">Limpiar</button>`
          : ''
      }
    </div>`,
    ...leagues.map((l) => {
      const id = Number(l.id);
      const active = leagueFilterIds.has(id);
      return `<button type="button" class="league-cat${active ? ' active' : ''}" role="option" aria-selected="${active}" data-league="${id}">
        <span class="league-cat__check" aria-hidden="true"></span>
        <span class="league-cat__flag" aria-hidden="true">${countryFlag(l.country)}</span>
        <span class="league-cat__body">
          <span class="league-cat__name">${escapeHtml(shortLeagueName(l.name))}</span>
          <span class="league-cat__meta">${escapeHtml(countryLabel(l.country))} · ${l.count} partido${l.count === 1 ? '' : 's'}</span>
        </span>
      </button>`;
    }),
  ].join('');

  cats.querySelectorAll('[data-league-action="all"], [data-league-action="clear"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      leagueFilterIds.clear();
      applyFilters();
    });
  });
  cats.querySelectorAll('.league-cat[data-league]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-league'));
      if (!Number.isFinite(id)) return;
      if (leagueFilterIds.has(id)) leagueFilterIds.delete(id);
      else leagueFilterIds.add(id);
      applyFilters();
    });
  });
}

function showBanner(message, kind = 'info') {
  const el = document.getElementById('global-banner');
  if (!message) {
    el.className = 'banner hidden';
    el.textContent = '';
    return;
  }
  el.className = `banner banner-${kind}`;
  el.textContent = message;
}

function setLoading(containerId, rows = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({ length: rows }, () => `<div class="skeleton" aria-hidden="true"></div>`).join('');
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    throw new Error((data && data.error) || res.statusText || 'Error de red');
  }
  return data || {};
}

function setModeBadge(status) {
  const el = document.getElementById('mode-badge');
  if (!el) return;
  el.classList.remove('hidden', 'demo', 'live');
  // Solo avisar en demo; en datos reales no ensuciamos el header
  if (status?.demo) {
    el.textContent = 'DEMO';
    el.classList.add('demo');
    el.title = status.message || 'Modo demo — actualiza el calendario';
    el.hidden = false;
  } else {
    el.textContent = '';
    el.classList.add('hidden');
    el.hidden = true;
    el.title = status?.message || '';
  }
}

function setHitBadge(perf) {
  const badge = document.getElementById('hit-badge');
  if (!badge) return;
  const valueEl = badge.querySelector('.hit-badge__value');
  const hintEl = badge.querySelector('.hit-badge__hint');
  const prev = valueEl?.textContent;
  badge.classList.remove('hidden', 'is-empty');
  let next = '—';
  if (perf?.hitRate != null && perf.decided > 0) {
    next = `${(Number(perf.hitRate) * 100).toFixed(0)}%`;
    if (hintEl) hintEl.textContent = 'Aciertos';
    badge.title = `Aciertos ${perf.hits}/${perf.decided}`;
  } else if (perf?.pending > 0) {
    next = String(perf.pending);
    if (hintEl) hintEl.textContent = 'Pend.';
    badge.title = 'Tips pendientes de liquidar';
    badge.classList.add('is-empty');
  } else {
    if (hintEl) hintEl.textContent = 'Aciertos';
    badge.title = 'Sin tips cerrados todavía';
    badge.classList.add('is-empty');
  }
  if (valueEl) {
    valueEl.textContent = next;
    if (next !== prev) {
      valueEl.classList.remove('is-reveal');
      void valueEl.offsetWidth;
      valueEl.classList.add('is-reveal');
    }
  } else {
    badge.textContent = next;
  }
}

function setSyncLabel(status) {
  const el = document.getElementById('sync-label');
  const dateEl = document.getElementById('today-label');
  if (!el) return;
  const raw = status?.lastSyncAt;
  if (!raw) {
    el.hidden = true;
    el.textContent = '';
    if (dateEl) dateEl.removeAttribute('title');
    return;
  }
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    el.hidden = true;
    return;
  }
  const hours = Math.max(0, Math.round((Date.now() - t) / 36e5));
  const short =
    hours <= 0 ? 'Sync hace un momento' : hours === 1 ? 'Sync hace 1 h' : `Sync hace ${hours} h`;
  const full = `Última sincronización: ${new Date(t).toLocaleString('es-ES')}`;
  el.hidden = false;
  el.textContent = short;
  el.title = full;
  if (dateEl) dateEl.title = full;
}

function updateTitles() {
  const listTitle = document.getElementById('list-title');
  const bestTitle = document.getElementById('best-title');
  if (windowMode === 'all') {
    listTitle.textContent = 'Próximos 14 días';
    bestTitle.textContent = 'Top predicciones · 14 días';
  } else if (windowMode === '5d') {
    listTitle.textContent = 'Próximos 5 días';
    bestTitle.textContent = 'Top predicciones · 5 días';
  } else if (windowMode === 'date' && selectedDate !== todayYmd()) {
    listTitle.textContent = `Partidos · ${selectedDate}`;
    bestTitle.textContent = `Top predicciones · ${selectedDate}`;
  } else {
    listTitle.textContent = 'Partidos de hoy';
    bestTitle.textContent = 'Top predicciones de hoy';
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function matchListQuery() {
  if (windowMode === 'all') return 'all=1';
  if (windowMode === '5d') return 'days=5';
  const d = windowMode === 'hoy' ? todayYmd() : selectedDate;
  return `date=${encodeURIComponent(d)}`;
}

function syncWindowChips() {
  const hoy = document.getElementById('chip-hoy');
  const d5 = document.getElementById('chip-5d');
  const all = document.getElementById('chip-all');
  const dateBtn = document.getElementById('chip-date');
  const dateInput = document.getElementById('match-date');
  hoy?.classList.toggle('active', windowMode === 'hoy');
  d5?.classList.toggle('active', windowMode === '5d');
  all?.classList.toggle('active', windowMode === 'all');
  dateBtn?.classList.toggle('is-picked', windowMode === 'date');
  dateBtn?.classList.toggle('active', windowMode === 'date');
  if (dateInput) {
    dateInput.classList.toggle('is-picked', windowMode === 'date');
    if (windowMode === 'date') dateInput.value = selectedDate;
    else if (windowMode === 'hoy') dateInput.value = todayYmd();
  }
}

function syncLiveChip() {
  const chip = document.getElementById('chip-live');
  if (!chip) return;
  chip.classList.toggle('active', liveOnly);
  chip.setAttribute('aria-pressed', liveOnly ? 'true' : 'false');
}

function formatOdds(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Number(n).toFixed(2);
}

function tipOddsFromBundle(suggestedBet, oddsRow) {
  if (!oddsRow || !suggestedBet) return null;
  const map = {
    HOME_WIN: oddsRow.home_odds,
    DRAW: oddsRow.draw_odds,
    AWAY_WIN: oddsRow.away_odds,
    OVER_25: oddsRow.over25_odds,
    UNDER_25: oddsRow.under25_odds,
  };
  return formatOdds(map[suggestedBet]);
}

function tipMetaHtml({ tipOdds, valueEdge, valueMarket, home, away }) {
  const bits = [];
  const odds = formatOdds(tipOdds);
  if (odds) bits.push(`<span class="tip-odds">@${odds}</span>`);
  if (valueEdge != null && valueEdge >= 0.05) {
    bits.push(
      `<span class="value">Valor +${(Number(valueEdge) * 100).toFixed(0)}%${
        valueMarket ? ` · ${escapeHtml(labelBet(valueMarket, home, away))}` : ''
      }</span>`
    );
  }
  return bits.length ? `<div class="tip-meta">${bits.join(' · ')}</div>` : '';
}

function tipCardHtml({
  matchId,
  home,
  away,
  homeLogo,
  awayLogo,
  league,
  when,
  tip,
  conf,
  secondary,
  tipOdds,
  valueEdge,
  valueMarket,
  liveHtml = '',
  clickable = false,
  analyzeBtn = false,
}) {
  const tipLabel = tip ? escapeHtml(labelBet(tip, home, away)) : 'Sin tip';
  const confLabel =
    tip && conf != null && !Number.isNaN(Number(conf)) ? `${Math.round(Number(conf))}%` : '';
  const classes = [
    'card',
    'card--tip',
    clickable ? 'card--clickable' : '',
    analyzeBtn ? 'card--row' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const attrs = clickable
    ? ` data-analyze="${Number(matchId)}" role="button" tabindex="0"`
    : '';
  return `
    <article class="${classes}"${attrs}>
      <div class="card-tip__body">
        <div class="card-tip__primary">
          <span class="card-tip__bet tip-accent">${tipLabel}</span>
          ${confLabel ? `<span class="${confClass(conf)} card-tip__conf">${confLabel}</span>` : ''}
        </div>
        ${tipMetaHtml({ tipOdds, valueEdge, valueMarket, home, away })}
        ${crestsRowHtml(home, homeLogo, away, awayLogo)}
        <p class="card-tip__match">${escapeHtml(home)} vs ${escapeHtml(away)}</p>
        <p class="card-tip__league muted">${escapeHtml(league)}${liveHtml ? ` · ${liveHtml}` : ''}</p>
        <p class="card-tip__when match-date">${escapeHtml(when)}</p>
        ${
          secondary
            ? `<p class="card-tip__sec muted">Secundaria · ${escapeHtml(
                labelBet(secondary, home, away)
              )}</p>`
            : ''
        }
      </div>
      ${
        analyzeBtn
          ? `<button class="primary card-tip__action" data-analyze="${Number(matchId)}" type="button">Analizar</button>`
          : ''
      }
    </article>`;
}

function bindAnalyze(root) {
  root.querySelectorAll('[data-analyze]').forEach((node) => {
    const open = () => openPrediction(Number(node.dataset.analyze));
    if (node.tagName === 'BUTTON') {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
      });
      return;
    }
    node.addEventListener('click', open);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function updateFilterChip() {
  const el = document.getElementById('filter-chip');
  if (!el) return;
  const parts = [];
  if (windowMode === '5d') parts.push('5 días');
  else if (windowMode === 'all') parts.push('14 días');
  else if (windowMode === 'date') parts.push(selectedDate);
  else parts.push('Hoy');
  if (scopeFilter === 'clubs') parts.push('Clubes');
  else if (scopeFilter === 'intl') parts.push('Selecciones');
  if (leagueFilterIds.size === 1) parts.push('1 liga');
  else if (leagueFilterIds.size > 1) parts.push(`${leagueFilterIds.size} ligas`);
  el.textContent = `Filtros: ${parts.join(' · ')}`;
}

function formatPctCell(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return `${Math.round(Number(v))}%`;
}

function tipMarketHighlight(suggestedBet) {
  const b = String(suggestedBet || '');
  return {
    home: b === 'HOME_WIN',
    draw: b === 'DRAW',
    away: b === 'AWAY_WIN',
    over25: b === 'OVER_25',
    under25: b === 'UNDER_25',
    bttsYes: b === 'BTTS_YES',
    bttsNo: b === 'BTTS_NO',
  };
}

function resolveMarkets(m) {
  if (m.markets) return m.markets;
  const toPct = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n <= 1 ? Number((n * 100).toFixed(1)) : Number(n.toFixed(1));
  };
  return {
    home: toPct(m.homeWinProb),
    draw: toPct(m.drawProb),
    away: toPct(m.awayWinProb),
    over25: toPct(m.over25Prob),
    under25: toPct(m.under25Prob),
    bttsYes: toPct(m.bttsYesProb),
    bttsNo: toPct(m.bttsNoProb),
  };
}

function marketCell(label, value, hot) {
  return `<span class="mb-cell${hot ? ' is-hot' : ''}"><span class="mb-cell__k">${label}</span><span class="mb-cell__v">${formatPctCell(
    value
  )}</span></span>`;
}

function matchBoardHeaderHtml() {
  return `<div class="match-board__head" aria-hidden="true">
    <span class="match-board__h-match">Partido</span>
    <span class="match-board__h-mk">1X2</span>
    <span class="match-board__h-mk">O/U 2.5</span>
    <span class="match-board__h-mk">BTTS</span>
    <span class="match-board__h-tip">Tip</span>
  </div>`;
}

function matchBoardRowHtml(raw) {
  const id = raw.id ?? raw.matchId;
  const home = raw.homeTeam?.name || raw.home || '';
  const away = raw.awayTeam?.name || raw.away || '';
  const homeLogo = raw.homeTeam?.logo || raw.homeLogo;
  const awayLogo = raw.awayTeam?.logo || raw.awayLogo;
  const league = raw.leagueName || raw.league || '';
  const tip = raw.suggestedBet || raw.tip;
  const conf = raw.confidenceScore ?? raw.conf;
  const tipOdds = raw.tipOdds;
  const markets = resolveMarkets(raw) || {};
  const hot = tipMarketHighlight(tip);
  const liveBadge =
    raw.status === 'live' ? '<span class="badge live">EN VIVO</span>' : '';
  const score =
    raw.homeGoals != null && raw.awayGoals != null
      ? `<span class="match-score">${Number(raw.homeGoals)}-${Number(raw.awayGoals)}</span>`
      : '';
  const minute =
    raw.status === 'live' && raw.elapsedMinute != null
      ? `<span class="match-minute">${Number(raw.elapsedMinute)}'</span>`
      : '';
  const liveBits = [liveBadge, score, minute].filter(Boolean).join(' ');
  const tipLabel = tip ? escapeHtml(labelBet(tip, home, away)) : '—';
  const confLabel =
    tip && conf != null && !Number.isNaN(Number(conf)) ? `${Math.round(Number(conf))}%` : '';
  const oddsLabel =
    tipOdds != null && !Number.isNaN(Number(tipOdds)) ? `@${Number(tipOdds).toFixed(2)}` : '';

  return `
    <button type="button" class="match-board__row" data-analyze="${Number(id)}" role="listitem">
      <span class="match-board__match">
        <span class="match-board__crests" aria-hidden="true">
          ${crestHtml(home, homeLogo, 'sm')}
          ${crestHtml(away, awayLogo, 'sm')}
        </span>
        <span class="match-board__names">
          <span class="match-board__vs">${escapeHtml(home)} · ${escapeHtml(away)}</span>
          <span class="match-board__meta muted">${escapeHtml(league)} · ${escapeHtml(
            formatMatchDate(raw.matchDate)
          )}${liveBits ? ` · ${liveBits}` : ''}</span>
        </span>
      </span>
      <span class="match-board__mk" data-label="1X2">
        ${marketCell('1', markets.home, hot.home)}
        ${marketCell('X', markets.draw, hot.draw)}
        ${marketCell('2', markets.away, hot.away)}
      </span>
      <span class="match-board__mk" data-label="O/U 2.5">
        ${marketCell('O', markets.over25, hot.over25)}
        ${marketCell('U', markets.under25, hot.under25)}
      </span>
      <span class="match-board__mk" data-label="BTTS">
        ${marketCell('Sí', markets.bttsYes, hot.bttsYes)}
        ${marketCell('No', markets.bttsNo, hot.bttsNo)}
      </span>
      <span class="match-board__tip">
        <span class="match-board__tip-bet tip-accent">${tipLabel}</span>
        <span class="match-board__tip-meta">
          ${confLabel ? `<span class="${confClass(conf)}">${confLabel}</span>` : ''}
          ${oddsLabel ? `<span class="muted">${oddsLabel}</span>` : ''}
        </span>
      </span>
    </button>`;
}

function renderMatchBoard(el, rows, emptyHtml) {
  if (!el) return;
  if (!rows.length) {
    el.className = 'match-board';
    el.innerHTML = emptyHtml;
    return;
  }
  el.className = 'match-board';
  el.innerHTML = matchBoardHeaderHtml() + rows.map(matchBoardRowHtml).join('');
  bindAnalyze(el);
}

function tipCardFromRow(m) {
  const liveBadge =
    m.status === 'live' ? '<span class="badge live">EN VIVO</span>' : '';
  const score =
    m.homeGoals != null && m.awayGoals != null
      ? `<span class="match-score">${Number(m.homeGoals)}-${Number(m.awayGoals)}</span>`
      : '';
  const minute =
    m.status === 'live' && m.elapsedMinute != null
      ? `<span class="match-minute">${Number(m.elapsedMinute)}'</span>`
      : '';
  const liveHtml = [liveBadge, score, minute].filter(Boolean).join(' · ');
  return tipCardHtml({
    matchId: m.id ?? m.matchId,
    home: m.homeTeam?.name,
    away: m.awayTeam?.name,
    homeLogo: m.homeTeam?.logo,
    awayLogo: m.awayTeam?.logo,
    league: m.leagueName || m.league || '',
    when: formatMatchDate(m.matchDate),
    tip: m.suggestedBet,
    conf: m.confidenceScore,
    secondary: m.secondaryBet,
    tipOdds: m.tipOdds,
    valueEdge: m.valueEdge,
    valueMarket: m.valueMarket,
    liveHtml,
    analyzeBtn: true,
  });
}

function renderBest(bets) {
  const el = document.getElementById('best-bets');
  updateFilterChip();
  const filtered = filterByScope(bets)
    .slice()
    .sort((a, b) => Number(b.confidenceScore || 0) - Number(a.confidenceScore || 0));
  if (!filtered.length) {
    el.className = 'stack stack--matches';
    el.innerHTML = `<div class="empty-board">${
      bets.length
        ? 'No hay tips con estos filtros.'
        : 'Sin predicciones en esta ventana. Prueba otra fecha o Administración → Actualizar.'
    }</div>`;
    return;
  }
  el.className = 'stack stack--matches';
  const moreBtn =
    bestBetsHasMore && bestBetsLimit < 200
      ? `<button type="button" class="ghost best-more" id="best-more">Ver más tips</button>`
      : '';
  el.innerHTML = filtered.map(tipCardFromRow).join('') + moreBtn;
  bindAnalyze(el);
  document.getElementById('best-more')?.addEventListener('click', () => {
    loadMoreBestBets().catch((err) => showBanner(err.message, 'error'));
  });
}

function renderMatches(matches, mode) {
  const el = document.getElementById('matches');
  const countEl = document.getElementById('match-count');
  const filtered = filterByScope(matches);
  if (countEl) {
    countEl.textContent = matches.length
      ? `${filtered.length} partidos · horario España`
      : '';
  }
  if (!filtered.length) {
    el.className = 'stack stack--matches';
    const scopeHint =
      leagueFilterIds.size > 0
        ? 'No hay partidos en las ligas seleccionadas con los filtros actuales.'
        : scopeFilter === 'intl'
          ? 'No hay selecciones en esta ventana.'
          : scopeFilter === 'clubs'
            ? 'No hay clubes en esta ventana.'
            : mode === 'demo'
              ? 'Sin calendario. Usa Administración → Actualizar.'
              : 'No hay partidos en esta ventana.';
    el.innerHTML = `<div class="empty-board">${scopeHint}</div>`;
    return;
  }
  el.className = 'stack stack--matches';
  el.innerHTML = filtered.map(tipCardFromRow).join('');
  bindAnalyze(el);
}

function applyFilters() {
  renderLeagueCategories(cachedMatches);
  renderBest(cachedBets);
  renderMatches(cachedMatches, cachedMode);
  if (document.getElementById('views')?.dataset.view === 'cuotas') {
    loadOddsBandBets().catch(() => {});
  } else if (cachedOddsBandBets.length) {
    renderOddsBandBets(cachedOddsBandBets);
  }
}

function outcomeBadge(outcome) {
  if (outcome === 'hit') return '<span class="outcome outcome--hit">Acertó</span>';
  if (outcome === 'miss') return '<span class="outcome outcome--miss">Falló</span>';
  return `<span class="outcome">${escapeHtml(outcome || '—')}</span>`;
}

function renderPerformance(perf) {
  const summary = document.getElementById('perf-summary');
  const recent = document.getElementById('perf-recent');
  if (!summary || !recent) return;
  if (perf) applyOddsPerformance(perf);
  if (!perf) {
    summary.innerHTML = `<div class="empty-board">Sin datos de aciertos todavía.</div>`;
    recent.innerHTML = '';
    return;
  }
  const rate =
    perf.hitRate != null ? `${(Number(perf.hitRate) * 100).toFixed(0)}%` : '—';
  const calib = perf.calibration;
  let calibLine = '';
  if (calib?.updatedAt) {
    const d = new Date(calib.updatedAt);
    const when = Number.isNaN(d.getTime())
      ? calib.updatedAt.slice(0, 10)
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const n =
      calib.decided != null ? ` · ${calib.decided} tips` : '';
    calibLine = `<p class="perf-calib muted">Calibrado · ${escapeHtml(when)}${escapeHtml(n)}</p>`;
  }
  const families = (perf.byFamily || [])
    .map((f) => {
      const hr = f.hitRate != null ? `${(Number(f.hitRate) * 100).toFixed(0)}%` : '—';
      return `<div class="perf-family"><span>${escapeHtml(labelFamily(f.family))}</span><strong>${hr}</strong><span class="muted">${f.hits}/${f.hits + f.misses}</span></div>`;
    })
    .join('');
  const bands = (perf.byOddsBand || [])
    .map((b) => {
      const hr = b.hitRate != null ? `${(Number(b.hitRate) * 100).toFixed(0)}%` : '—';
      const decided = (b.hits || 0) + (b.misses || 0);
      const bandLabel = STAT_BAND_LABELS[String(b.band)] || String(b.band);
      const kind = b.source === 'combos' ? 'comb.' : 'tips';
      return `<div class="perf-family perf-family--band"><span class="perf-family__label">${escapeHtml(
        bandLabel
      )} · ${kind}</span><strong>${hr}</strong><span class="muted">${b.hits || 0}/${decided}${
        b.pending ? ` · ${b.pending}p` : ''
      }</span></div>`;
    })
    .join('');
  summary.innerHTML = `
    <div class="perf-hero">
      <div class="perf-hero__rate">${rate}</div>
      <div class="perf-hero__label">Aciertos</div>
      <div class="perf-hero__stats">${perf.hits} aciertos · ${perf.misses} fallos · ${perf.pending} pendientes</div>
      ${calibLine}
    </div>
    ${families ? `<p class="perf-block-title">Por mercado</p><div class="perf-families">${families}</div>` : ''}
    ${bands ? `<p class="perf-block-title">Por cuota</p><div class="perf-families perf-families--bands">${bands}</div>` : ''}`;

  const rows = perf.recent || [];
  if (!rows.length) {
    recent.innerHTML = `<div class="empty-board">Aún no hay tips cerrados. Cuando terminen partidos, aparecen aquí.</div>`;
    return;
  }
  recent.innerHTML = rows
    .map(
      (r) => `
    <article class="card">
      <div class="row">
        <div class="crests-row crests-row--compact" aria-hidden="true">
          ${crestHtml(r.homeName, r.homeLogo, 'sm')}
          <span class="crests-row__vs">vs</span>
          ${crestHtml(r.awayName, r.awayLogo, 'sm')}
        </div>
        ${outcomeBadge(r.outcome)}
      </div>
      <p class="card-tip__match">${escapeHtml(r.homeName)} vs ${escapeHtml(r.awayName)}</p>
      <div class="muted">${escapeHtml(r.leagueName)} · ${escapeHtml(formatMatchDate(r.matchDate))}</div>
      <div class="tip-accent">${escapeHtml(
        labelBet(r.suggestedBet, r.homeName, r.awayName)
      )}</div>
      <div class="muted">${r.homeGoals != null ? `${r.homeGoals}-${r.awayGoals}` : '—'}${
        r.confidenceScore != null ? ` · confianza ${Number(r.confidenceScore).toFixed(0)}%` : ''
      }${r.tipOdds != null ? ` · @${Number(r.tipOdds).toFixed(2)}` : ''}${
        r.oddsBand ? ` · cuota ~${r.oddsBand}` : ''
      }</div>
    </article>`
    )
    .join('');
}

async function loadPerformance() {
  const summary = document.getElementById('perf-summary');
  const recent = document.getElementById('perf-recent');
  if (summary && !summary.querySelector('.perf-hero')) setLoading('perf-summary', 1);
  try {
    const q = matchListQuery();
    const perf = await api(`/api/v1/tips/performance?${q}`);
    applyOddsPerformance(perf);
    renderPerformance(perf);
    setHitBadge(perf);
  } catch (err) {
    if (summary) {
      summary.innerHTML = `<div class="empty-board conf-lo">${escapeHtml(err.message)}</div>`;
    }
    if (recent) recent.innerHTML = '';
    setHitBadge(null);
  }
}

function openPanel(html) {
  const panel = document.getElementById('panel');
  const backdrop = document.getElementById('panel-backdrop');
  document.getElementById('panel-body').innerHTML = html;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  document.getElementById('close-panel')?.focus({ preventScroll: true });
}

function closePanel() {
  const panel = document.getElementById('panel');
  const backdrop = document.getElementById('panel-backdrop');
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
}

function setActiveNav(hash, { pushHash = true } = {}) {
  const id = (hash || '').replace('#', '') || 'mejores';
  const view =
    id === 'partidos' || id === 'aciertos' || id === 'cuotas' ? id : 'mejores';
  const views = document.getElementById('views');
  if (views) views.dataset.view = view;
  document.querySelectorAll('.nav-link').forEach((link) => {
    const target = (link.getAttribute('href') || '').replace('#', '');
    link.classList.toggle('is-active', target === view);
  });
  if (pushHash && location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
  window.scrollTo(0, 0);
  if (view === 'aciertos') loadPerformance().catch(() => {});
  if (view === 'cuotas') loadOddsBandBets().catch(() => {});
}

function syncOddsBandChips() {
  /* Band picker lives in #odds-band-stats tiles (chips bar removed for iPhone). */
}

const ODDS_BAND_RANGES = {
  '1': '1.05–1.69',
  '2': '1.65–2.54',
  '3': '2.55–3.54',
  '4': '3.55–4.44',
  '5': '4.45–6.50',
};

const STAT_BAND_LABELS = {
  '1': 'Cortas',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
};

function tipStatsBand(row) {
  const o = Number(row?.tipOdds);
  if (Number.isFinite(o) && o > 1) {
    if (o < 1.7) return '1';
    if (o < 2.5) return '2';
    if (o < 3.5) return '3';
    if (o < 4.5) return '4';
    if (o <= 6.5) return '5';
  }
  const b = row?.oddsBand != null ? String(row.oddsBand) : '';
  return ['1', '2', '3', '4', '5'].includes(b) ? b : null;
}

function applyOddsPerformance(perf) {
  if (!perf) return;
  cachedOddsBandPerf = perf.byOddsBand || null;
  cachedOddsRecent = Array.isArray(perf.recent) ? perf.recent : [];
  cachedOddsCombos = Array.isArray(perf.recentCombos) ? perf.recentCombos : [];
  cachedOddsGlobal = {
    hits: Number(perf.hits || 0),
    misses: Number(perf.misses || 0),
    decided: Number(perf.decided || 0),
    hitRate: perf.hitRate != null ? Number(perf.hitRate) : null,
    pending: Number(perf.pending || 0),
    windowLabel: perf.windowLabel || null,
  };
  renderOddsBandStats(cachedOddsBandPerf);
  renderOddsBandHistory(oddsBandFilter);
}

function renderOddsBandStats(byOddsBand) {
  const wrap = document.getElementById('odds-band-stats');
  if (!wrap) return;
  const rows = byOddsBand || [];
  const map = new Map(rows.map((r) => [String(r.band), r]));
  const g = cachedOddsGlobal;
  const gDecided = Number(g?.decided || 0);
  const gHits = Number(g?.hits || 0);
  const gRate =
    g?.hitRate != null && gDecided > 0
      ? `${Math.round(Number(g.hitRate) * 100)}%`
      : gDecided > 0
        ? `${Math.round((gHits / gDecided) * 100)}%`
        : '—';
  const period = g?.windowLabel ? escapeHtml(g.windowLabel) : 'ventana';
  const globalHtml = `<div class="odds-global" aria-label="Aciertos tips">
    <div class="odds-global__main">
      <span class="odds-global__label">Tips</span>
      <span class="odds-global__rate">${gRate}</span>
      <span class="odds-global__sub">${
        gDecided > 0 ? `${gHits}/${gDecided}` : 'sin tips cerrados'
      }</span>
    </div>
    <span class="odds-global__period">${period} · Cortas=tips · 2–5=combinadas</span>
  </div>`;
  const cards = ['1', '2', '3', '4', '5']
    .map((band) => {
      const b = map.get(band);
      const hits = Number(b?.hits || 0);
      const misses = Number(b?.misses || 0);
      const pending = Number(b?.pending || 0);
      const decided = hits + misses;
      const rate =
        b?.hitRate != null && decided > 0
          ? `${Math.round(Number(b.hitRate) * 100)}%`
          : decided > 0
            ? `${Math.round((hits / decided) * 100)}%`
            : '—';
      const sub =
        decided > 0
          ? `${hits} aciertos · ${misses} fallos`
          : pending > 0
            ? `${pending} pend.`
            : 'sin muestra';
      const label = STAT_BAND_LABELS[band] || band;
      const range = ODDS_BAND_RANGES[band] || '';
      const kind = band === '1' ? 'tips' : 'comb.';
      const active = band === oddsBandFilter ? ' is-active' : '';
      return `<button type="button" class="odds-stat${active}" data-odds-band="${band}" aria-pressed="${
        band === oddsBandFilter ? 'true' : 'false'
      }">
        <span class="odds-stat__band">${escapeHtml(label)}</span>
        <span class="odds-stat__range">${escapeHtml(range)} · ${kind}</span>
        <span class="odds-stat__rate">${rate}</span>
        <span class="odds-stat__sub">${escapeHtml(sub)}</span>
      </button>`;
    })
    .join('');
  wrap.innerHTML = `${globalHtml}<div class="odds-stats" role="group" aria-label="Bandas">${cards}</div>`;
  wrap.querySelectorAll('button[data-odds-band]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const band = btn.getAttribute('data-odds-band') || '2';
      oddsBandFilter = band;
      renderOddsBandStats(cachedOddsBandPerf);
      renderOddsBandHistory(band);
      if (band !== '1') {
        loadOddsBandBets().catch((err) => showBanner(err.message, 'error'));
      } else {
        const hint = document.getElementById('odds-band-hint');
        const el = document.getElementById('odds-band-bets');
        if (hint) hint.textContent = 'Cortas = tips individuales · historial arriba · combinadas en bandas 2–5';
        if (el) {
          el.className = 'combo-board';
          el.innerHTML = '';
        }
      }
    });
  });
}

function tipHistoryRowHtml(r) {
  const country = r.leagueCountry || '';
  const flag = countryFlag(country);
  const countryEs = countryLabel(country);
  const odds =
    r.tipOdds != null && !Number.isNaN(Number(r.tipOdds))
      ? Number(r.tipOdds).toFixed(2)
      : '—';
  return `
    <article class="odds-history__row">
      <div class="odds-history__top">
        ${outcomeBadge(r.outcome)}
        <span class="odds-history__tip tip-accent">${escapeHtml(
          labelBet(r.suggestedBet, r.homeName, r.awayName)
        )}</span>
        <span class="odds-history__odds">@${odds}</span>
      </div>
      <p class="odds-history__match">${escapeHtml(r.homeName || '')} vs ${escapeHtml(
        r.awayName || ''
      )}</p>
      <p class="odds-history__meta muted">
        <span class="odds-history__flag" aria-hidden="true">${flag}</span>
        ${escapeHtml(countryEs)} · ${escapeHtml(r.leagueName || '—')}
      </p>
    </article>`;
}

function comboHistoryRowHtml(c) {
  const legs = c.legs || [];
  const total =
    c.combinedOdds != null && !Number.isNaN(Number(c.combinedOdds))
      ? Number(c.combinedOdds).toFixed(2)
      : '—';
  const legsHtml = legs
    .map((leg) => {
      const home = leg.homeName || leg.homeTeam?.name || '';
      const away = leg.awayName || leg.awayTeam?.name || '';
      const flag = countryFlag(leg.leagueCountry || '');
      return `<li class="odds-history-combo__leg">
        <span class="odds-history-combo__match">${escapeHtml(home)} · ${escapeHtml(away)}</span>
        <span class="odds-history-combo__tip tip-accent">${escapeHtml(
          labelBet(leg.suggestedBet, home, away)
        )}</span>
        <span class="odds-history-combo__meta muted">${flag} ${escapeHtml(
          leg.league || '—'
        )} · ${leg.tipOdds != null ? Number(leg.tipOdds).toFixed(2) : '—'}</span>
      </li>`;
    })
    .join('');
  return `
    <article class="odds-history__row odds-history-combo">
      <div class="odds-history__top">
        ${outcomeBadge(c.outcome)}
        <span class="odds-history__tip">Combinada · ${legs.length} piernas</span>
        <span class="odds-history__odds">@${total}</span>
      </div>
      <ul class="odds-history-combo__legs">${legsHtml}</ul>
    </article>`;
}

function renderOddsBandHistory(band) {
  const el = document.getElementById('odds-band-history');
  if (!el) return;
  const wasOpen = el.querySelector('details.odds-history')?.open === true;
  const b = String(band || oddsBandFilter || '2');
  const label = STAT_BAND_LABELS[b] || b;
  const range = ODDS_BAND_RANGES[b] || '';
  const tabs = [
    ['all', 'Todos'],
    ['miss', 'Fallos'],
    ['hit', 'Aciertos'],
  ]
    .map(([id, lab]) => {
      const active = oddsHistoryFilter === id ? ' is-active' : '';
      return `<button type="button" class="odds-history__tab${active}" data-hist-filter="${id}">${lab}</button>`;
    })
    .join('');

  const wrapHistory = (summaryLabel, closedCount, subtitle, body) => {
    el.innerHTML = `
      <details class="odds-history"${wasOpen ? ' open' : ''}>
        <summary class="odds-history__summary">
          <span class="odds-history__summary-title">Historial · ${escapeHtml(summaryLabel)}</span>
          <span class="odds-history__summary-meta muted">${closedCount} cerrada${closedCount === 1 ? '' : 's'}</span>
        </summary>
        <div class="odds-history__head">
          <div>
            <p class="odds-history__title">${escapeHtml(subtitle)}</p>
            <p class="odds-history__range muted">${escapeHtml(range)}</p>
          </div>
          <div class="odds-history__tabs" role="tablist">${tabs}</div>
        </div>
        <div class="odds-history__list">${body}</div>
      </details>`;
    el.querySelectorAll('[data-hist-filter]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        oddsHistoryFilter = btn.getAttribute('data-hist-filter') || 'all';
        renderOddsBandHistory(oddsBandFilter);
      });
    });
  };

  if (b === '1') {
    const all = (cachedOddsRecent || []).filter((r) => tipStatsBand(r) === '1');
    let list = all;
    if (oddsHistoryFilter === 'miss') list = list.filter((r) => r.outcome === 'miss');
    if (oddsHistoryFilter === 'hit') list = list.filter((r) => r.outcome === 'hit');
    const body = list.length
      ? list.slice(0, 12).map(tipHistoryRowHtml).join('')
      : `<div class="empty-board odds-history__empty">Sin tips Cortas cerrados en esta ventana.</div>`;
    wrapHistory('Cortas', all.length, 'Tips oficiales por partido', body);
    return;
  }

  const all = filterCombosByScope(cachedOddsCombos || []).filter(
    (c) => String(c.oddsBand) === b
  );
  let list = all;
  if (oddsHistoryFilter === 'miss') list = list.filter((c) => c.outcome === 'miss');
  if (oddsHistoryFilter === 'hit') list = list.filter((c) => c.outcome === 'hit');
  const body = list.length
    ? list.slice(0, 10).map(comboHistoryRowHtml).join('')
    : `<div class="empty-board odds-history__empty">Sin combinadas cerradas en banda ${escapeHtml(
        label
      )} para esta ventana.</div>`;
  wrapHistory(`banda ${label}`, all.length, `Combinadas · acierto = todas las piernas`, body);
}

function comboCardHtml(combo) {
  const legs = combo.legs || [];
  const total =
    combo.combinedOdds != null ? Number(combo.combinedOdds).toFixed(2) : '—';
  const conf =
    combo.avgConfidence != null && !Number.isNaN(Number(combo.avgConfidence))
      ? `${Math.round(Number(combo.avgConfidence))}%`
      : '';
  const legsHtml = legs
    .map((leg) => {
      const home = leg.homeTeam?.name || '';
      const away = leg.awayTeam?.name || '';
      return `
      <button type="button" class="combo-leg" data-analyze="${Number(leg.matchId)}">
        <span class="combo-leg__crests" aria-hidden="true">
          ${crestHtml(home, leg.homeTeam?.logo, 'sm')}
          ${crestHtml(away, leg.awayTeam?.logo, 'sm')}
        </span>
        <span class="combo-leg__body">
          <span class="combo-leg__match">${escapeHtml(home)} · ${escapeHtml(away)}</span>
          <span class="combo-leg__meta muted">${escapeHtml(leg.league || '')} · ${escapeHtml(
            formatMatchDate(leg.matchDate)
          )}</span>
          <span class="combo-leg__tip tip-accent">${escapeHtml(
            labelBet(leg.suggestedBet, home, away)
          )}</span>
        </span>
        <span class="combo-leg__odds">${
          leg.confidenceScore != null && !Number.isNaN(Number(leg.confidenceScore))
            ? `${Math.round(Number(leg.confidenceScore))}% · `
            : ''
        }${leg.tipOdds != null ? Number(leg.tipOdds).toFixed(2) : '—'}</span>
      </button>`;
    })
    .join('');

  return `
    <article class="combo-card" role="listitem">
      <div class="combo-card__head">
        <div>
          <div class="combo-card__label">Combinada · ${legs.length} piernas</div>
          <div class="combo-card__odds tip-accent">${total}</div>
        </div>
        <div class="combo-card__side">
          ${conf ? `<span class="${confClass(combo.avgConfidence)}">${conf}</span>` : ''}
          <span class="muted">media conf.</span>
        </div>
      </div>
      <div class="combo-card__legs">${legsHtml}</div>
    </article>`;
}

function filterCombosByScope(combos) {
  return (combos || []).filter((c) => {
    const legs = c.legs || [];
    if (!legs.length) return false;
    return legs.every((leg) => filterByScope([leg]).length === 1);
  });
}

function renderOddsBandBets(combos) {
  const el = document.getElementById('odds-band-bets');
  const hint = document.getElementById('odds-band-hint');
  const wrap = document.getElementById('odds-band-bets-wrap');
  if (!el) return;
  syncOddsBandChips();
  const range = ODDS_BAND_RANGES[oddsBandFilter] || '';
  const filtered = filterCombosByScope(combos)
    .slice()
    .sort(
      (a, b) =>
        Number(b.avgConfidence || 0) - Number(a.avgConfidence || 0) ||
        Number(a.combinedOdds || 0) - Number(b.combinedOdds || 0)
    )
    .slice(0, 5);
  if (hint) {
    const leagueBit =
      leagueFilterIds.size > 0
        ? ` · ${leagueFilterIds.size} liga${leagueFilterIds.size === 1 ? '' : 's'}`
        : '';
    hint.innerHTML = filtered.length
      ? `<span class="odds-board__top-title">Top 5 combinadas · mayor %</span><span class="odds-board__top-meta">${filtered.length} mostrada${filtered.length === 1 ? '' : 's'} · ${escapeHtml(range || '—')}${leagueBit}</span>`
      : `Sin combinadas en banda ${oddsBandFilter} (${range || '—'}) para esta ventana${leagueBit}`;
  }
  if (wrap) wrap.hidden = false;
  if (!filtered.length) {
    el.className = 'combo-board';
    el.innerHTML = `<div class="empty-board">${
      (combos || []).length
        ? 'Ninguna combina encaja con estos filtros de liga.'
        : 'Sin combinadas cerca de banda ' + oddsBandFilter + ' en la ventana.'
    }</div>`;
    return;
  }
  el.className = 'combo-board';
  el.innerHTML = filtered.map(comboCardHtml).join('');
  bindAnalyze(el);
}

async function loadOddsBandBets() {
  const el = document.getElementById('odds-band-bets');
  const hint = document.getElementById('odds-band-hint');
  syncOddsBandChips();
  const q = matchListQuery();

  // Always refresh performance so history + counter match the calendar window
  try {
    const perf = await api(`/api/v1/tips/performance?${q}`);
    applyOddsPerformance(perf);
  } catch (_) {
    renderOddsBandHistory(oddsBandFilter);
  }

  if (oddsBandFilter === '1') {
    const wrap = document.getElementById('odds-band-bets-wrap');
    if (wrap) wrap.hidden = false;
    if (hint) {
      hint.innerHTML =
        '<span class="odds-board__top-title">Top 5 combinadas</span><span class="odds-board__top-meta">Cortas = tips · combinadas solo en bandas 2–5</span>';
    }
    if (el) {
      el.className = 'combo-board';
      el.innerHTML = '';
    }
    return;
  }

  if (el) {
    el.className = 'combo-board';
    el.innerHTML = `<div class="muted odds-board__loading">Cargando combinadas banda ${oddsBandFilter}…</div>`;
  }
  try {
    const leagueQ =
      leagueFilterIds.size > 0
        ? `&leagueIds=${encodeURIComponent([...leagueFilterIds].join(','))}`
        : '';
    const data = await api(
      `/api/v1/matches/best-bets?${q}&oddsBand=${encodeURIComponent(oddsBandFilter)}&limit=5${leagueQ}`
    );
    cachedOddsBandBets = data.combos || [];
    renderOddsBandBets(cachedOddsBandBets);
  } catch (err) {
    cachedOddsBandBets = [];
    if (el) {
      el.innerHTML = `<div class="empty-board conf-lo">${escapeHtml(err.message)}</div>`;
    }
  }
}

async function openPrediction(id) {
  openPanel(`<div class="muted">Cargando análisis…</div>`);
  try {
    const bundle = await api(`/api/v1/matches/${id}/prediction`);
    const p = bundle.prediction || {};
    const m = bundle.match || {};
    const homeName = m.homeTeam?.name || '';
    const awayName = m.awayTeam?.name || '';
    const home = escapeHtml(homeName);
    const away = escapeHtml(awayName);
    openPanel(`
      ${crestsRowHtml(homeName, m.homeTeam?.logo, awayName, m.awayTeam?.logo)}
      <h2 class="panel-title">${home} vs ${away}</h2>
      <div class="muted">${escapeHtml(m.leagueName)}</div>
      <div class="muted">${escapeHtml(formatMatchDate(m.matchDate))}</div>
      <div class="panel-suggest">
        <div class="panel-suggest__label">Houdini sugiere</div>
        <div class="panel-suggest__bet">${escapeHtml(
          labelBet(p.suggested_bet, homeName, awayName)
        )}</div>
        <div class="${confClass(p.confidence_score)}">${
          p.confidence_score != null ? Number(p.confidence_score).toFixed(0) : '—'
        }% ${bundle.highConfidence ? 'Alta' : ''}</div>
        ${
          tipOddsFromBundle(p.suggested_bet, bundle.odds)
            ? `<div class="tip-odds">Cuota @${tipOddsFromBundle(p.suggested_bet, bundle.odds)}</div>`
            : ''
        }
        <div class="muted">Secundaria: ${escapeHtml(
          labelBet(p.secondary_bet, homeName, awayName)
        )}</div>
        ${
          p.value_edge != null && p.value_edge >= 0.05
            ? `<div class="value">Valor +${(p.value_edge * 100).toFixed(0)}% (${escapeHtml(
                labelBet(p.value_market, homeName, awayName)
              )})</div>`
            : ''
        }
      </div>
      <p>Forma local: ${formHtml(bundle.form?.home)}</p>
      <p>Forma visitante: ${formHtml(bundle.form?.away)}</p>
      ${
        bundle.dataQuality === 'low'
          ? `<div class="muted">Datos limitados (${bundle.sampleSize ?? 0} partidos) — confianza reducida.</div>`
          : ''
      }
      ${marketSection(
        'Goles del partido',
        [
          probBar('Más de 1,5 goles', p.over15_prob),
          probBar('Menos de 1,5 goles', p.under15_prob),
          probBar('Más de 2,5 goles', p.over25_prob),
          probBar('Menos de 2,5 goles', p.under25_prob),
          probBar('Más de 3,5 goles', p.over35_prob),
          probBar('Menos de 3,5 goles', p.under35_prob),
        ].join('')
      )}
      ${marketSection(
        `Goles de ${m.homeTeam?.name || 'local'}`,
        [
          probBar('Marca (0,5+)', p.home_over05_prob),
          probBar('No marca', p.home_under05_prob),
          probBar('Más de 1,5', p.home_over15_prob),
          probBar('Menos de 1,5', p.home_under15_prob),
          probBar('Más de 2,5', p.home_over25_prob),
          probBar('Menos de 2,5', p.home_under25_prob),
          probBar('Más de 3,5', p.home_over35_prob),
          probBar('Menos de 3,5', p.home_under35_prob),
        ].join('')
      )}
      ${marketSection(
        `Goles de ${m.awayTeam?.name || 'visitante'}`,
        [
          probBar('Marca (0,5+)', p.away_over05_prob),
          probBar('No marca', p.away_under05_prob),
          probBar('Más de 1,5', p.away_over15_prob),
          probBar('Menos de 1,5', p.away_under15_prob),
          probBar('Más de 2,5', p.away_over25_prob),
          probBar('Menos de 2,5', p.away_under25_prob),
          probBar('Más de 3,5', p.away_over35_prob),
          probBar('Menos de 3,5', p.away_under35_prob),
        ].join('')
      )}
      ${marketSection(
        'Resultado · Ambos marcan',
        [
          probBar('Gana local', p.home_win_prob),
          probBar('Empate', p.draw_prob),
          probBar('Gana visitante', p.away_win_prob),
          probBar('Ambos marcan — Sí', p.btts_yes_prob),
          probBar('Ambos marcan — No', p.btts_no_prob),
        ].join('')
      )}
      ${
        p.corners_over95_prob != null
          ? marketSection(
              'Córners del partido',
                [
                probBar('Más de 8,5 córners', p.corners_over85_prob),
                probBar('Menos de 8,5 córners', p.corners_under85_prob),
                probBar('Más de 9,5 córners', p.corners_over95_prob),
                probBar('Menos de 9,5 córners', p.corners_under95_prob),
                probBar('Más de 10,5 córners', p.corners_over105_prob),
                probBar('Menos de 10,5 córners', p.corners_under105_prob),
              ].join('')
            )
          : `<div class="market-block"><div class="market-block__title">Córners del partido</div><div class="muted">Sin datos de córners — hace falta enriquecer con API key.</div></div>`
      }
      ${
        p.cards_over35_prob != null
          ? marketSection(
              'Amarillas del partido',
              [
                probBar('Más de 3,5 amarillas', p.cards_over35_prob),
                probBar('Menos de 3,5 amarillas', p.cards_under35_prob),
                probBar('Más de 4,5 amarillas', p.cards_over45_prob),
                probBar('Menos de 4,5 amarillas', p.cards_under45_prob),
              ].join('')
            )
          : `<div class="market-block"><div class="market-block__title">Amarillas del partido</div><div class="muted">Sin datos de amarillas — hace falta enriquecer con API key.</div></div>`
      }
      ${
        bundle.recentAvgs
          ? `<div class="market-block">
              <div class="market-block__title">Promedios recientes</div>
              <div class="muted">Córners: ${home} ${bundle.recentAvgs.home?.corners ?? '—'} · ${away} ${bundle.recentAvgs.away?.corners ?? '—'}</div>
              <div class="muted">Amarillas: ${home} ${bundle.recentAvgs.home?.yellows ?? '—'} · ${away} ${bundle.recentAvgs.away?.yellows ?? '—'}</div>
              <div class="muted">Tiros a puerta: ${home} ${bundle.recentAvgs.home?.shotsOnTarget ?? '—'} · ${away} ${bundle.recentAvgs.away?.shotsOnTarget ?? '—'}</div>
            </div>`
          : ''
      }
    `);
  } catch (err) {
    openPanel(`<div class="conf-lo">${escapeHtml(err.message)}. Cierra e inténtalo de nuevo.</div>`);
  }
}

async function searchTeam(q) {
  const box = document.getElementById('search-results');
  if (!q || q.trim().length < 2) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.className = 'search-panel';
  box.innerHTML = `<div class="search-panel__status">Buscando…</div>`;
  try {
    const data = await api(`/api/v1/teams/search?q=${encodeURIComponent(q.trim())}`);
    const teams = data.teams || [];
    if (!teams.length) {
      box.innerHTML = `<div class="search-panel__status">Sin resultados.</div>`;
      return;
    }
    box.innerHTML = teams
      .map(
        (t) => `
    <button class="search-hit" type="button" data-team="${Number(t.id)}" role="option">
      ${crestHtml(t.name, t.logo_url || t.logo, 'sm')}
      <span>
        <span class="search-hit__name">${escapeHtml(t.name)}</span>
        <span class="search-hit__meta">${escapeHtml(t.league_name)}</span>
      </span>
      <span class="search-hit__go">Abrir</span>
    </button>`
      )
      .join('');
    box.querySelectorAll('[data-team]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const insight = await api(`/api/v1/teams/${btn.dataset.team}`);
          document.getElementById('team-search').value = '';
          box.classList.add('hidden');
          box.innerHTML = '';
          if (insight.nextMatch?.id) openPrediction(insight.nextMatch.id);
          else openPanel(`<div class="muted">Sin próximo partido para ${escapeHtml(insight.team?.name)}.</div>`);
        } catch (err) {
          openPanel(`<div class="conf-lo">${escapeHtml(err.message)}</div>`);
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<div class="search-panel__status conf-lo">${escapeHtml(err.message)}</div>`;
  }
}

async function loadPerformanceBadge() {
  try {
    const q = matchListQuery();
    const perf = await api(`/api/v1/tips/performance?${q}`);
    applyOddsPerformance(perf);
    renderPerformance(perf);
    setHitBadge(perf);
  } catch (_) {
    setHitBadge(null);
  }
}

async function load() {
  updateTitles();
  syncWindowChips();
  syncLiveChip();
  bestBetsLimit = 30;
  const label = document.getElementById('today-label');
  if (label) {
    label.textContent = new Date().toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  setLoading('best-bets', 2);
  setLoading('matches', 4);
  const countEl = document.getElementById('match-count');
  if (countEl) countEl.textContent = 'Cargando partidos…';

  const q = matchListQuery();
  const bestP = api(`/api/v1/matches/best-bets?${q}&limit=${bestBetsLimit}`);
  const todayP = api(`/api/v1/matches/today?${q}`);
  const statusP = api('/api/v1/status');

  const errors = [];

  bestP
    .then((best) => {
      cachedBets = best.bets || [];
      bestBetsHasMore = cachedBets.length >= bestBetsLimit && bestBetsLimit < 200;
      renderBest(cachedBets);
    })
    .catch((err) => {
      cachedBets = [];
      document.getElementById('best-bets').innerHTML =
        `<div class="empty-board conf-lo">No se pudieron cargar las mejores apuestas. ${escapeHtml(err.message || '')}</div>`;
      errors.push('Mejores');
    });

  todayP
    .then((today) => {
      cachedMatches = today.matches || [];
      cachedMode = today.mode || 'live';
      renderLeagueCategories(cachedMatches);
      renderMatches(cachedMatches, cachedMode);
    })
    .catch((err) => {
      cachedMatches = [];
      renderLeagueCategories([]);
      document.getElementById('matches').innerHTML =
        `<div class="empty-board conf-lo">No se pudieron cargar los partidos. ${escapeHtml(err.message || '')}</div>`;
      if (countEl) countEl.textContent = '';
      errors.push('Partidos');
    });

  statusP
    .then((status) => {
      setModeBadge(status);
      setSyncLabel(status);
    })
    .catch(() => {
      errors.push('Estado no disponible');
    });

  await Promise.allSettled([statusP, bestP, todayP]);

  if (errors.length === 3) {
    showBanner('No hay conexión con la API. Revisa la red e inténtalo de nuevo.', 'error');
  } else if (errors.length) {
    showBanner(`Algunas secciones fallaron (${errors.join(', ')}). El resto sigue disponible.`, 'error');
  } else {
    showBanner('');
  }

  loadPerformanceBadge().catch(() => {});

  // Always refresh Cuotas counters for the selected window (even off the Cuotas tab)
  const onCuotas = document.getElementById('views')?.dataset.view === 'cuotas';
  if (onCuotas) {
    loadOddsBandBets().catch(() => {});
  } else {
    api(`/api/v1/tips/performance?${q}`)
      .then((perf) => applyOddsPerformance(perf))
      .catch(() => {});
  }
}

async function loadMoreBestBets() {
  bestBetsLimit = Math.min(200, bestBetsLimit + 50);
  const q = matchListQuery();
  const best = await api(`/api/v1/matches/best-bets?${q}&limit=${bestBetsLimit}`);
  cachedBets = best.bets || [];
  bestBetsHasMore = cachedBets.length >= bestBetsLimit && bestBetsLimit < 200;
  renderBest(cachedBets);
}

function patchLiveFromMatches(freshMatches) {
  if (!Array.isArray(freshMatches) || !freshMatches.length) return;
  const byId = new Map(freshMatches.map((m) => [m.id, m]));
  let changed = false;
  for (const m of cachedMatches) {
    const next = byId.get(m.id);
    if (!next) continue;
    if (
      m.status !== next.status ||
      m.homeGoals !== next.homeGoals ||
      m.awayGoals !== next.awayGoals ||
      m.elapsedMinute !== next.elapsedMinute
    ) {
      m.status = next.status;
      m.homeGoals = next.homeGoals;
      m.awayGoals = next.awayGoals;
      m.elapsedMinute = next.elapsedMinute;
      changed = true;
    }
  }
  for (const b of cachedBets) {
    const next = byId.get(b.matchId || b.id);
    if (!next) continue;
    if (b.status !== next.status) {
      b.status = next.status;
      b.homeGoals = next.homeGoals;
      b.awayGoals = next.awayGoals;
      b.elapsedMinute = next.elapsedMinute;
      changed = true;
    }
  }
  if (changed) {
    renderBest(cachedBets);
    renderMatches(cachedMatches, cachedMode);
  }
}

async function refreshLiveAndReload() {
  if (document.visibilityState !== 'visible') return;
  try {
    await api('/api/v1/matches/refresh-live', { method: 'POST' });
  } catch (_) {
    /* ignore refresh errors */
  }
  try {
    const q = matchListQuery();
    const today = await api(`/api/v1/matches/today?${q}`);
    cachedMatches = today.matches || cachedMatches;
    cachedMode = today.mode || cachedMode;
    patchLiveFromMatches(cachedMatches);
    renderLeagueCategories(cachedMatches);
    renderMatches(cachedMatches, cachedMode);
    if (liveOnly) renderBest(cachedBets);
  } catch (_) {
    /* ignore */
  }
}

function startLivePoll() {
  if (livePollTimer) clearInterval(livePollTimer);
  livePollTimer = setInterval(() => {
    refreshLiveAndReload();
  }, 60_000);
}

document.getElementById('close-panel').addEventListener('click', closePanel);
document.getElementById('panel-backdrop').addEventListener('click', closePanel);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('panel').classList.contains('is-open')) {
    closePanel();
  }
});

document.querySelectorAll('a.nav-link, a.brand').forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#')) return;
    e.preventDefault();
    setActiveNav(href);
  });
});

const viewsEl = document.getElementById('views');
const viewsTrack = document.getElementById('views-track');
let swipeStartX = 0;
let swipeStartY = 0;
let swipeDx = 0;
let swipeActive = false;
let swipeLocked = null; // 'h' | 'v'

function currentViewIndex() {
  const v = viewsEl?.dataset.view;
  if (v === 'partidos') return 1;
  if (v === 'aciertos') return 2;
  if (v === 'cuotas') return 3;
  return 0;
}

const VIEW_HASHES = ['#mejores', '#partidos', '#aciertos', '#cuotas'];

function onSwipeStart(x, y) {
  if (document.body.classList.contains('panel-open')) return;
  swipeStartX = x;
  swipeStartY = y;
  swipeDx = 0;
  swipeActive = true;
  swipeLocked = null;
  viewsEl?.classList.add('views--dragging');
}

function onSwipeMove(x, y) {
  if (!swipeActive || !viewsTrack || !viewsEl) return;
  const dx = x - swipeStartX;
  const dy = y - swipeStartY;
  if (!swipeLocked) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    swipeLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (swipeLocked === 'v') {
      swipeActive = false;
      viewsEl.classList.remove('views--dragging');
      viewsTrack.style.transform = '';
      return;
    }
  }
  if (swipeLocked !== 'h') return;
  swipeDx = dx;
  const idx = currentViewIndex();
  const base = idx * -100;
  const width = viewsEl.clientWidth || 1;
  const pct = (dx / width) * 100;
  let next = base + pct;
  if (idx === 0 && dx > 0) next = pct * 0.25;
  if (idx === 3 && dx < 0) next = -300 + pct * 0.25;
  viewsTrack.style.transform = `translateX(${next}%)`;
}

function onSwipeEnd() {
  if (!viewsEl || !viewsTrack) return;
  viewsEl.classList.remove('views--dragging');
  viewsTrack.style.transform = '';
  if (!swipeActive || swipeLocked !== 'h') {
    swipeActive = false;
    return;
  }
  swipeActive = false;
  const width = viewsEl.clientWidth || 1;
  let idx = currentViewIndex();
  if (Math.abs(swipeDx) > width * 0.22) {
    if (swipeDx < 0) idx = Math.min(3, idx + 1);
    else idx = Math.max(0, idx - 1);
  }
  setActiveNav(VIEW_HASHES[idx]);
}

viewsEl?.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1) return;
    onSwipeStart(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: true }
);
viewsEl?.addEventListener(
  'touchmove',
  (e) => {
    if (!swipeActive || e.touches.length !== 1) return;
    onSwipeMove(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: true }
);
viewsEl?.addEventListener('touchend', onSwipeEnd);
viewsEl?.addEventListener('touchcancel', onSwipeEnd);

window.addEventListener('hashchange', () => {
  const h = location.hash || '#mejores';
  setActiveNav(h, { pushHash: false });
});

const initialHash =
  location.hash === '#partidos' ||
  location.hash === '#aciertos' ||
  location.hash === '#cuotas'
    ? location.hash
    : '#mejores';
setActiveNav(initialHash, { pushHash: false });

document.getElementById('hit-badge')?.addEventListener('click', () => setActiveNav('#aciertos'));

document.getElementById('chip-hoy').addEventListener('click', () => {
  windowMode = 'hoy';
  selectedDate = todayYmd();
  syncWindowChips();
  load().catch((err) => showBanner(err.message, 'error'));
});

document.getElementById('chip-5d').addEventListener('click', () => {
  windowMode = '5d';
  syncWindowChips();
  load().catch((err) => showBanner(err.message, 'error'));
});

document.getElementById('chip-all').addEventListener('click', () => {
  windowMode = 'all';
  syncWindowChips();
  load().catch((err) => showBanner(err.message, 'error'));
});

document.getElementById('match-date').addEventListener('change', (e) => {
  const v = e.target.value;
  if (!v) return;
  windowMode = 'date';
  selectedDate = v;
  syncWindowChips();
  load().catch((err) => showBanner(err.message, 'error'));
});

document.getElementById('chip-date')?.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'match-date') return;
  const input = document.getElementById('match-date');
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.click();
  } catch (_) {
    input.focus();
  }
});

document.getElementById('chip-live')?.addEventListener('click', () => {
  liveOnly = !liveOnly;
  syncLiveChip();
  applyFilters();
});

document.querySelectorAll('.seg__btn[data-scope]').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.seg__btn[data-scope]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    scopeFilter = chip.dataset.scope || 'all';
    leagueFilterIds.clear();
    if (scopeFilter === 'clubs' || scopeFilter === 'intl') leaguesPanelOpen = true;
    applyFilters();
  });
});

document.getElementById('league-toggle')?.addEventListener('click', () => {
  leaguesPanelOpen = !leaguesPanelOpen;
  renderLeagueCategories(cachedMatches);
});

let searchTimer;
document.getElementById('team-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchTeam(e.target.value), 250);
});

const refreshBtnLabel = () => {
  const btn = document.getElementById('btn-sync');
  if (!btn) return;
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 12a7.5 7.5 0 0 1 12.7-5.4M19.5 12a7.5 7.5 0 0 1-12.7 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M17 3.5v4h-4M7 20.5v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Actualizar</span>`;
};

document.getElementById('btn-sync').addEventListener('click', async () => {
  const secret = prompt('Clave de actualización (SYNC_SECRET):', 'change-me-houdini');
  if (secret == null) return;
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  btn.innerHTML = '<span>Actualizando…</span>';
  showBanner('Actualizando calendario… puede tardar unos segundos.', 'info');
  try {
    const res = await api('/api/v1/sync/manual', {
      method: 'POST',
      headers: { 'x-sync-secret': secret },
    });
    const intl = res.internationalsSynced != null ? ` · Selecciones ${res.internationalsSynced}` : '';
    const seg = res.segundaSynced != null ? ` · Segunda ${res.segundaSynced}` : '';
    showBanner(
      `Calendario al día: ${res.savedFixtures ?? '—'} partidos · historial ${res.savedHistory ?? 0} · tips ${res.predicted ?? 0}${intl}${seg}`,
      'ok'
    );
    await load();
  } catch (err) {
    showBanner(`No se pudo actualizar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    refreshBtnLabel();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshLiveAndReload();
});

const dateInputInit = document.getElementById('match-date');
if (dateInputInit) dateInputInit.value = todayYmd();

function dismissBootSplash() {
  const splash = document.getElementById('boot-splash');
  document.body.classList.remove('boot-pending');
  document.documentElement.setAttribute('aria-busy', 'false');
  if (!splash) return;
  splash.classList.add('is-done');
  const finish = () => {
    splash.hidden = true;
    splash.setAttribute('aria-hidden', 'true');
  };
  splash.addEventListener('transitionend', finish, { once: true });
  window.setTimeout(finish, 450);
}

startLivePoll();
load()
  .then(() => {
    dismissBootSplash();
  })
  .catch((err) => {
    showBanner(err.message || 'Error al cargar', 'error');
    document.getElementById('best-bets').innerHTML =
      `<div class="empty-board conf-lo">${escapeHtml(err.message)}</div>`;
    document.getElementById('matches').innerHTML =
      `<div class="empty-board conf-lo">No se pudo iniciar la página. Recarga e inténtalo de nuevo.</div>`;
    dismissBootSplash();
  });
