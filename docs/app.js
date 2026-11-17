'use strict';
/* 가계부 — 오프라인 PWA. 모든 데이터는 이 기기(localStorage)에만 저장됩니다. */
const APP_VERSION = '1.2.0';
const STORE_KEY = 'gagyebu.v1';
/** 안드로이드 앱(APK) 안에서 실행될 때만 존재하는 네이티브 연결 */
const NATIVE = window.GagyebuNative || null;
const NP = window.GagyebuNotif;
const APK_URL = 'https://khseong0418-star.github.io/gagyebu/gagyebu.apk';

/* ================= 유틸 ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const ymOf = s => s.slice(0, 7);
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dim = (y, m) => new Date(y, m, 0).getDate();
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
const monthLabel = ym => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
const sortTx = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" style="color:var(--accent-ink)"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
};

/* ================= 통화 ================= */
const CUR = {
  SGD: { name: '싱가포르 달러', sym: 'S$', dec: 2 },
  KRW: { name: '대한민국 원', sym: '원', dec: 0, suffix: true },
  USD: { name: '미국 달러', sym: '$', dec: 2 },
  EUR: { name: '유로', sym: '€', dec: 2 },
  JPY: { name: '일본 엔', sym: '¥', dec: 0 },
};
const cur = () => CUR[S.settings.currency] || CUR.SGD;
const fmtNum = (n, dec = cur().dec) => Math.abs(n).toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
function money(n, { plus = false } = {}) {
  const c = cur();
  const sign = n < 0 ? '-' : plus && n > 0 ? '+' : '';
  return c.suffix ? `${sign}${fmtNum(n)}${c.sym}` : `${sign}${c.sym}${fmtNum(n)}`;
}
const trim1 = v => String(Math.round(v * 10) / 10);
function compact(n) {
  const c = cur(), a = Math.abs(n);
  if (c.dec === 0) {
    if (a >= 1e8) return trim1(a / 1e8) + '억';
    if (a >= 1e6) return Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    if (a >= 1e4) return trim1(a / 1e4) + '만';
    return Math.round(a).toLocaleString('ko-KR');
  }
  if (a >= 1e6) return trim1(a / 1e6) + 'M';
  if (a >= 1e4) return Math.round(a / 1e3) + 'k';
  return Math.round(a).toLocaleString('ko-KR');
}
const roundCur = v => { const f = 10 ** cur().dec; return Math.round(v * f) / f; };
function parseAmount(s) {
  const v = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return isFinite(v) ? roundCur(v) : 0;
}
/** 입력 중인 금액 문자열에 천 단위 쉼표를 넣습니다. */
function formatAmountInput(raw) {
  const dec = cur().dec;
  let v = String(raw).replace(/[^0-9.]/g, '');
  if (dec === 0) v = v.replace(/\./g, '');
  else {
    const i = v.indexOf('.');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, dec);
  }
  let [ip, fp] = v.split('.');
  ip = (ip || '').replace(/^0+(?=\d)/, '').slice(0, 12);
  const ipf = ip ? Number(ip).toLocaleString('ko-KR') : fp !== undefined ? '0' : '';
  return fp !== undefined ? `${ipf}.${fp}` : ipf;
}
const amountToInput = n => (n ? formatAmountInput(n.toFixed(cur().dec).replace(/\.?0+$/, m => (m.startsWith('.') ? '' : m))) : '');

/* ================= 데이터 ================= */
const DEFAULT_CATS = {
  expense: [
    ['food', '식비', '🍚'], ['cafe', '카페·간식', '☕'], ['transport', '교통', '🚇'], ['housing', '주거·관리비', '🏠'],
    ['phone', '통신', '📱'], ['living', '생활용품', '🧺'], ['shopping', '쇼핑', '🛍️'], ['health', '의료·건강', '💊'],
    ['leisure', '문화·여가', '🎬'], ['travel', '여행', '✈️'], ['edu', '교육', '📚'], ['gift', '경조사·선물', '🎁'],
    ['etc_e', '기타', '📦'],
  ],
  income: [
    ['salary', '급여', '💼'], ['bonus', '상여', '🎉'], ['interest', '이자·투자', '📈'],
    ['refund', '환급', '🔁'], ['allowance', '용돈', '💌'], ['etc_i', '기타', '💵'],
  ],
};
const EMOJIS = ['🍚', '🍜', '🍔', '🍱', '☕', '🧋', '🍺', '🍰', '🚇', '🚕', '🚗', '⛽', '🏠', '💡', '📱', '💻',
  '🧺', '🛒', '🛍️', '👕', '💄', '💇', '💊', '🏥', '🏋️', '🎬', '🎮', '🎵', '✈️', '🏨', '📚', '🎓',
  '🎁', '💐', '🐶', '👶', '🔧', '🧾', '💳', '🏦', '📦', '💼', '🎉', '📈', '💰', '🔁', '💌', '💵'];

function defaultState() {
  const mk = list => list.map(([id, name, icon]) => ({ id, name, icon }));
  return {
    version: 1,
    settings: { currency: 'SGD', theme: 'system', lastBackup: 0, autoNotif: true, rates: {}, notifBlock: [] },
    categories: { expense: mk(DEFAULT_CATS.expense), income: mk(DEFAULT_CATS.income) },
    methods: ['카드', '현금', '계좌이체'],
    tx: [],
    recurring: [],
    inbox: [],
    notifLog: [],
  };
}
const validType = t => t === 'income' || t === 'expense';
function migrate(d) {
  const base = defaultState();
  if (!d || typeof d !== 'object') return base;
  const cats = type => {
    const arr = d.categories && Array.isArray(d.categories[type]) ? d.categories[type] : null;
    const clean = (arr || [])
      .filter(c => c && c.id)
      .map(c => ({ id: String(c.id), name: String(c.name || '이름 없음').slice(0, 20), icon: String(c.icon || '📦').slice(0, 8) }));
    return clean.length ? clean : base.categories[type];
  };
  const num = v => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
  const ds = d.settings || {};
  const rates = {};
  if (ds.rates && typeof ds.rates === 'object')
    for (const [k, v] of Object.entries(ds.rates)) if (/^[A-Z]{3}$/.test(k) && num(v) > 0) rates[k] = num(v);
  const str = (v, n) => String(v ?? '').slice(0, n);
  return {
    version: 1,
    settings: {
      currency: CUR[ds.currency] ? ds.currency : base.settings.currency,
      theme: ['system', 'light', 'dark'].includes(ds.theme) ? ds.theme : 'system',
      lastBackup: num(ds.lastBackup),
      autoNotif: ds.autoNotif !== false,
      rates,
      notifBlock: Array.isArray(ds.notifBlock) ? ds.notifBlock.map(p => str(p, 120)).filter(Boolean) : [],
    },
    inbox: (Array.isArray(d.inbox) ? d.inbox : [])
      .filter(i => i && i.type === 'expense' && /^\d{4}-\d{2}-\d{2}$/.test(i.date))
      .map(i => ({
        id: str(i.id || uid(), 40), time: num(i.time), type: i.type, cat: str(i.cat, 40), memo: str(i.memo, 60),
        date: i.date, currency: str(i.currency, 4), amountOrig: num(i.amountOrig), app: str(i.app, 40),
        refund: i.refund ? 1 : undefined,
      })),
    notifLog: (Array.isArray(d.notifLog) ? d.notifLog : []).slice(0, 100).filter(l => l && typeof l === 'object')
      .map(l => ({
        id: str(l.id || uid(), 40), time: num(l.time), app: str(l.app, 40), pkg: str(l.pkg, 120), text: str(l.text, 400),
        status: str(l.status, 10), note: str(l.note, 80), txId: l.txId ? str(l.txId, 40) : undefined,
      })),
    categories: { expense: cats('expense'), income: cats('income') },
    methods: Array.isArray(d.methods) ? d.methods.map(m => String(m).slice(0, 20)).filter(Boolean) : base.methods,
    tx: (Array.isArray(d.tx) ? d.tx : [])
      .filter(t => t && validType(t.type) && num(t.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date))
      .map(t => ({
        id: String(t.id || uid()), type: t.type, amount: num(t.amount), cat: String(t.cat || ''),
        date: t.date, memo: String(t.memo || '').slice(0, 60), method: String(t.method || ''),
        rid: t.rid ? String(t.rid) : undefined, created: num(t.created),
        auto: t.auto ? 1 : undefined, orig: t.orig ? String(t.orig).slice(0, 30) : undefined,
        refund: t.refund ? 1 : undefined,
      })),
    recurring: (Array.isArray(d.recurring) ? d.recurring : [])
      .filter(r => r && validType(r.type) && num(r.amount) > 0 && /^\d{4}-\d{2}$/.test(r.last))
      .map(r => ({
        id: String(r.id || uid()), type: r.type, amount: num(r.amount), cat: String(r.cat || ''),
        memo: String(r.memo || ''), method: String(r.method || ''),
        day: Math.min(31, Math.max(1, Math.round(num(r.day)) || 1)), last: r.last,
      })),
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('load failed', e);
  }
  return defaultState();
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
  }
}
let S = load();

const UI = {
  tab: 'home',
  month: ymOf(todayStr()),
  selDay: todayStr(),
  searchOpen: false,
  query: '',
};

function commit() {
  save();
  render();
  for (const s of sheets) if (s.live) s.refresh();
}
const catOf = t => S.categories[t.type].find(c => c.id === t.cat) || { id: t.cat, name: '미분류', icon: '❔' };
/** 지출만 기록하는 가계부: 예전에 넣은 수입 내역이 있어도 저장소(백업)에만 두고 화면·합계에서는 뺍니다. */
const expTx = () => S.tx.filter(t => t.type === 'expense');
const txOfMonth = ym => S.tx.filter(t => t.type === 'expense' && t.date.startsWith(ym));
/** 그 달의 하루 평균 지출 (이번 달은 오늘까지, 지난달은 전체 일수, 미래 달은 0) */
function dailyAvg(ym, total) {
  const now = todayStr();
  if (ym > ymOf(now)) return 0;
  const [y, m] = ym.split('-').map(Number);
  const days = ym === ymOf(now) ? Number(now.slice(8, 10)) : dim(y, m);
  return total / days;
}
/** 환불·결제취소(refund)는 지출에서 빠지는 금액 */
const signed = t => (t.refund ? -t.amount : t.amount);
function sums(list) {
  let inc = 0, exp = 0;
  for (const t of list) if (t.type === 'income') inc += t.amount; else exp += signed(t);
  return { inc, exp, net: inc - exp };
}
/** 합계 표시: 환불이 더 많아 음수면 '+금액'(돌려받음)으로 */
const netMoney = v => (v < 0 ? `<span class="inc-ink">+${money(-v)}</span>` : money(v));
let persistAsked = false;
function requestPersist() {
  if (persistAsked) return;
  persistAsked = true;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/* 매월 반복 내역 자동 생성 */
function runRecurring() {
  const today = todayStr(), curYm = ymOf(today);
  let added = 0;
  for (const r of S.recurring) {
    if (r.type !== 'expense') continue; // 지출만 기록
    let m = addMonths(r.last, 1);
    while (m <= curYm) {
      const [y, mo] = m.split('-').map(Number);
      const date = `${m}-${pad(Math.min(r.day, dim(y, mo)))}`;
      if (date > today) break;
      S.tx.push({ id: uid(), type: r.type, amount: r.amount, cat: r.cat, date, memo: r.memo, method: r.method, rid: r.id, created: Date.now() });
      r.last = m;
      added++;
      m = addMonths(m, 1);
    }
  }
  if (added) save();
  return added;
}

/* ================= 화면 ================= */
function render() {
  applyTheme();
  renderTop();
  const v = $('#view');
  v.innerHTML =
    UI.tab === 'home' ? (UI.searchOpen ? viewSearch() : viewHome())
      : UI.tab === 'calendar' ? viewCalendar()
        : UI.tab === 'stats' ? viewStats()
          : viewSettings();
  $$('.tabbar [data-act="tab"]').forEach(b => b.classList.toggle('on', b.dataset.v === UI.tab));
  $('#fab').hidden = UI.tab === 'settings' || UI.searchOpen;
}

function renderTop() {
  const t = $('#topbar');
  if (UI.tab === 'settings') {
    t.innerHTML = '<h1 class="title">설정</h1>';
    return;
  }
  if (UI.tab === 'home' && UI.searchOpen) {
    if (!$('#q')) {
      t.innerHTML = `<button class="icon-btn" data-act="searchClose" aria-label="검색 닫기">${ICON.back}</button>
        <input id="q" class="search-in" type="search" placeholder="메모·카테고리·금액 검색" autocomplete="off" enterkeyhint="search">`;
      const q = $('#q');
      q.value = UI.query;
      q.addEventListener('input', () => {
        UI.query = q.value;
        $('#view').innerHTML = viewSearch();
      });
      q.addEventListener('keydown', e => { if (e.key === 'Enter') q.blur(); });
    }
    return;
  }
  const thisMonth = ymOf(todayStr());
  t.innerHTML = `
    <button class="icon-btn" data-act="prev" aria-label="이전 달">${ICON.left}</button>
    <button class="month-title" data-act="monthpick">${monthLabel(UI.month)}</button>
    <button class="icon-btn" data-act="next" aria-label="다음 달">${ICON.right}</button>
    <span class="grow"></span>
    ${UI.month !== thisMonth ? '<button class="pill" data-act="thisMonth">이번 달</button>' : ''}
    ${UI.tab === 'home' ? `<button class="icon-btn" data-act="search" aria-label="검색">${ICON.search}</button>` : ''}`;
}

/* ---------- 내역(홈) ---------- */
function viewHome() {
  const list = txOfMonth(UI.month);
  const s = sums(list);
  let html = summaryCard(s, list.length);
  if (S.inbox.length) {
    html += `<button class="card nudge inbox-nudge" data-act="inbox"><span>🔔</span>
      <span class="grow">확인이 필요한 결제 알림 <b>${S.inbox.length}건</b></span>${ICON.chev}</button>`;
  }
  html += backupNudge();
  if (!list.length) {
    return html + `<div class="empty"><div class="empty-ico">📝</div>
      <div>${monthLabel(UI.month)}에 기록된 내역이 없어요</div>
      <button class="btn primary" data-act="add">${ICON.plus} 내역 기록하기</button></div>`;
  }
  return html + txGroups(list);
}

function summaryCard(s, count) {
  const avg = dailyAvg(UI.month, s.exp);
  return `<section class="card summary">
    <div class="sum-label">${Number(UI.month.slice(5))}월 지출</div>
    <div class="sum-big">${money(s.exp)}</div>
    <div class="sum-row"><span>${count}건</span>${avg > 0 ? `<span>하루 평균<b>${money(avg)}</b></span>` : ''}</div>
  </section>`;
}

function backupNudge() {
  const last = S.settings.lastBackup;
  if (S.tx.length < 15 || (last && Date.now() - last < 30 * 864e5)) return '';
  return `<div class="card nudge"><span>💾</span><span class="grow">${last ? '마지막 백업 후 30일이 지났어요' : '아직 백업한 적이 없어요'}</span>
    <button class="btn primary" data-act="backupShare">백업</button></div>`;
}

function txGroups(list, { withYear = false } = {}) {
  const groups = new Map();
  for (const t of [...list].sort(sortTx)) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const today = todayStr();
  let html = '';
  for (const [date, items] of groups) {
    const d = parseYmd(date);
    const s = sums(items);
    const label = (withYear ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ` : '') + `${d.getDate()}일 ${WD[d.getDay()]}요일` + (date === today ? ' · 오늘' : '');
    html += `<section><header class="day-head"><span>${label}</span><span class="day-sum">${netMoney(s.exp)}</span></header>
      <ul class="tx-list card">${items.map(t => `<li>${txRow(t)}</li>`).join('')}</ul></section>`;
  }
  return html;
}

function txRow(t) {
  const c = catOf(t);
  const sub = [t.memo ? c.name : '', t.method, t.refund ? '↩ 환불·취소' : '', t.rid ? '🔁 반복' : '', t.auto ? '🔔 자동' : '', t.orig || '']
    .filter(Boolean).join(' · ');
  return `<button class="tx" data-act="edit" data-id="${esc(t.id)}">
    <span class="tx-icon">${esc(c.icon)}</span>
    <span class="tx-main"><span class="tx-title">${esc(t.memo || c.name)}</span>${sub ? `<span class="tx-sub">${esc(sub)}</span>` : ''}</span>
    ${t.refund ? `<span class="tx-amt inc-ink">+${money(t.amount)}</span>` : `<span class="tx-amt">${money(t.amount)}</span>`}
  </button>`;
}

function viewSearch() {
  const q = UI.query.trim().toLowerCase();
  if (!q) return '<p class="empty-sm">메모, 카테고리, 결제수단, 금액으로<br>전체 기간의 내역을 찾아요.</p>';
  const res = expTx().filter(t => {
    const c = catOf(t);
    return [t.memo, c.name, t.method, String(t.amount)].some(x => x && String(x).toLowerCase().includes(q));
  });
  if (!res.length) return `<p class="empty-sm">‘${esc(UI.query.trim())}’ 검색 결과가 없어요</p>`;
  const s = sums(res);
  return `<section class="card search-sum"><span>${res.length}건</span><span>합계 <b>${netMoney(s.exp)}</b></span></section>` +
    txGroups(res, { withYear: true });
}

/* ---------- 달력 ---------- */
function viewCalendar() {
  const [y, m] = UI.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const n = dim(y, m);
  const monthTx = txOfMonth(UI.month);
  const byDay = {};
  for (const t of monthTx) byDay[t.date] = (byDay[t.date] || 0) + signed(t);
  const today = todayStr();
  if (ymOf(UI.selDay) !== UI.month) UI.selDay = UI.month === ymOf(today) ? today : `${UI.month}-01`;
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div></div>';
  for (let d = 1; d <= n; d++) {
    const key = `${UI.month}-${pad(d)}`;
    const v = byDay[key];
    const wd = (first + d - 1) % 7;
    const cls = [key === UI.selDay && 'sel', key === today && 'today', wd === 0 && 'sun', wd === 6 && 'sat'].filter(Boolean).join(' ');
    cells += `<button class="cal-cell ${cls}" data-act="day" data-v="${key}" aria-label="${m}월 ${d}일">
      <span class="cal-d">${d}</span>
      ${v > 0 ? `<span class="cal-exp">${compact(v)}</span>` : v < 0 ? `<span class="cal-inc">+${compact(-v)}</span>` : ''}
    </button>`;
  }
  const s = sums(monthTx);
  const sd = parseYmd(UI.selDay);
  const dayList = expTx().filter(t => t.date === UI.selDay).sort(sortTx);
  const ds = sums(dayList);
  const avg = dailyAvg(UI.month, s.exp);
  return `<section class="card cal-sum">
      <div>지출<b>${money(s.exp)}</b></div><div>하루 평균<b>${avg > 0 ? money(avg) : '—'}</b></div><div>기록<b>${monthTx.length}건</b></div>
    </section>
    <section class="card cal no-swipe-y">
      <div class="cal-wd">${WD.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </section>
    <header class="day-head"><span>${sd.getMonth() + 1}월 ${sd.getDate()}일 ${WD[sd.getDay()]}요일${UI.selDay === today ? ' · 오늘' : ''}</span>
      <span class="day-sum">${dayList.length ? netMoney(ds.exp) : ''}</span></header>
    ${dayList.length
      ? `<ul class="tx-list card">${dayList.map(t => `<li>${txRow(t)}</li>`).join('')}</ul>`
      : '<p class="empty-sm">이 날의 내역이 없어요 · + 버튼으로 추가</p>'}`;
}

/* ---------- 통계 ---------- */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function trendChart(months, vals) {
  const W = 340, H = 170, top = 24, bottom = 26, padX = 4, gutter = 38;
  const ch = H - top - bottom;
  const max = niceMax(Math.max(...vals));
  const plotR = W - gutter;
  const slot = (plotR - padX) / months.length;
  const bw = Math.min(30, slot * 0.55);
  const base = top + ch;
  let g = '';
  for (const f of [0.5, 1]) {
    const yy = top + ch * (1 - f);
    g += `<line class="grid" x1="${padX}" x2="${plotR}" y1="${yy}" y2="${yy}"/>`;
    g += `<text class="tick" x="${W - 2}" y="${yy + 3.5}" text-anchor="end">${compact(max * f)}</text>`;
  }
  g += `<line class="axis" x1="${padX}" x2="${plotR}" y1="${base}" y2="${base}"/>`;
  months.forEach((m, i) => {
    const v = vals[i];
    const sel = m === UI.month;
    const cx = padX + slot * i + slot / 2;
    const x = cx - bw / 2;
    const h = v > 0 ? Math.max(2, (v / max) * ch) : 0;
    if (h) {
      const r = Math.min(4, h, bw / 2);
      const y = base - h;
      g += `<path class="mk ${sel ? '' : 'dim'}" d="M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z"/>`;
    }
    if (sel) g += `<text class="vlabel" x="${cx}" y="${base - h - 6}" text-anchor="middle">${compact(v)}</text>`;
    g += `<text class="mlabel ${sel ? 'on' : ''}" x="${cx}" y="${H - 8}" text-anchor="middle">${Number(m.slice(5))}월</text>`;
    g += `<rect class="hit" data-act="month" data-v="${m}" x="${padX + slot * i}" y="0" width="${slot}" height="${H}"><title>${monthLabel(m)} ${money(v)}</title></rect>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 6개월 추이">${g}</svg>`;
}

function viewStats() {
  const type = 'expense';
  const months = Array.from({ length: 6 }, (_, i) => addMonths(UI.month, i - 5));
  const vals = months.map(m => sums(txOfMonth(m)).exp);
  const curV = vals[5], prevV = vals[4];
  let delta = '';
  if (prevV > 0) {
    const d = (curV - prevV) / prevV;
    if (Math.abs(d) < 0.005) delta = '<span class="delta">전월과 같음</span>';
    else {
      const up = d > 0;
      delta = `<span class="delta ${up ? 'bad' : 'good'}">${up ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}%</span><span>전월 대비</span>`;
    }
  }
  const prevVals = vals.slice(0, 5).filter(v => v > 0);
  const avg = prevVals.length ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : 0;

  const list = txOfMonth(UI.month);
  const byCat = new Map();
  for (const t of list) byCat.set(t.cat, (byCat.get(t.cat) || 0) + signed(t));
  const rows = [...byCat].sort((a, b) => b[1] - a[1]);
  const maxV = Math.max(1e-9, ...rows.map(r => r[1]));

  const catRows = rows.map(([id, v]) => {
    const c = catOf({ type, cat: id });
    const pct = curV > 0 && v > 0 ? Math.round((v / curV) * 100) : 0;
    return `<button class="cat-row" data-act="catdetail" data-id="${esc(id)}">
      <span class="tx-icon">${esc(c.icon)}</span>
      <span class="cat-main">
        <span class="cat-line"><span class="nm">${esc(c.name)}</span><span class="pct">${v >= 0.005 ? `${pct}%` : v > -0.005 ? '전액 취소' : '환불'}</span><b>${netMoney(v)}</b></span>
        <span class="bar thin"><i style="width:${(Math.max(0, v / maxV) * 100).toFixed(1)}%"></i></span>
      </span></button>`;
  }).join('');

  return `<div class="stats" data-type="${type}">
    <section class="card stat-head">
      <div class="sum-label">${Number(UI.month.slice(5))}월 지출</div>
      <div class="sum-big">${money(curV)}</div>
      <div class="stat-meta">${delta}${avg ? `<span>· 이전 ${prevVals.length}개월 평균 ${money(avg)}</span>` : ''}</div>
      ${trendChart(months, vals)}
    </section>
    <section class="card cat-card">
      <h3 class="card-title">카테고리별 지출</h3>
      ${catRows || `<p class="empty-sm">${monthLabel(UI.month)} 지출 내역이 없어요</p>`}
    </section>
  </div>`;
}

/* ---------- 설정 ---------- */
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches;
function setRow(act, icon, label, value = '') {
  return `<button class="row" data-act="${act}"><span class="row-icon">${icon}</span><span class="grow">${label}</span>
    <span class="row-val">${esc(value)}</span>${ICON.chev}</button>`;
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function viewSettings() {
  const c = cur();
  const themes = [['system', '자동'], ['light', '라이트'], ['dark', '다크']];
  let install = '';
  let notif;
  if (NATIVE) {
    const perm = nativeCall('listenerEnabled', false);
    const nRates = Object.keys(S.settings.rates).filter(k => k !== S.settings.currency).length;
    notif = `<section><h3 class="sec-title">결제 알림 자동 기록</h3><div class="card list">
      <div class="row"><span class="row-icon">🔔</span><span class="grow">알림으로 자동 기록</span>
        <button class="switch ${S.settings.autoNotif ? 'on' : ''}" data-act="autoNotif" role="switch" aria-checked="${S.settings.autoNotif}" aria-label="알림으로 자동 기록"><i></i></button></div>
      ${perm ? setRow('notifPerm', '✅', '알림 접근 권한', '허용됨') : setRow('notifPerm', '⚠️', '<b>알림 접근 권한 허용하기</b>', '필요')}
      ${setRow('inbox', '📥', '확인 필요한 알림', `${S.inbox.length}건`)}
      ${setRow('notifLog', '📜', '인식 기록', `${S.notifLog.length}건`)}
      ${setRow('rates', '💱', '다른 통화 환율', nRates ? `${nRates}개 설정` : '설정 안 함')}
      ${setRow('notifTest', '🧪', '알림 문구 테스트')}
      ${setRow('appUpdate', '⬇️', '앱 업데이트 받기', `v${APP_VERSION}`)}
    </div><p class="hint">은행·카드·결제 앱의 알림과 문자에서 금액·가맹점을 읽어 자동으로 기록해요. 카테고리는 같은 가맹점의 이전 기록을 따라가요. 알림 내용은 이 폰 밖으로 나가지 않아요.</p></section>`;
  } else {
    notif = `<section><h3 class="sec-title">결제 알림 자동 기록</h3><div class="card list">
      <a class="row" href="gagyebu.apk" download><span class="row-icon">📲</span><span class="grow">안드로이드 앱 받기 (APK)</span>${ICON.chev}</a>
      ${setRow('notifTest', '🧪', '알림 문구 테스트')}
    </div><p class="hint">웹앱은 다른 앱의 알림을 읽을 수 없어서 이 기능은 안드로이드 앱에서만 동작해요. 앱을 설치한 뒤 여기서 <b>백업 파일 저장</b> → 앱에서 <b>백업에서 복원</b>으로 기록을 옮기세요.</p></section>`;
  }
  if (!isStandalone() && !NATIVE) {
    install = deferredInstall
      ? `<section><h3 class="sec-title">앱 설치</h3><div class="card list">${setRow('install', '📲', '홈 화면에 앱 설치')}</div></section>`
      : `<section><h3 class="sec-title">앱 설치</h3><p class="hint">Chrome 메뉴(⋮) → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르면 일반 앱처럼 전체 화면·오프라인으로 사용할 수 있어요.</p></section>`;
  }
  return `
  <section><h3 class="sec-title">기본 설정</h3><div class="card list">
    ${setRow('currency', '💱', '통화', `${S.settings.currency} (${c.sym})`)}
    <div class="row"><span class="row-icon">🌓</span><span class="grow">화면 테마</span>
      <div class="seg sm">${themes.map(([v, l]) => `<button data-act="theme" data-v="${v}" class="${S.settings.theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  </div></section>
  <section><h3 class="sec-title">항목 관리</h3><div class="card list">
    ${setRow('cats', '🗂️', '카테고리', `${S.categories.expense.length}개`)}
    ${setRow('methods', '💳', '결제수단', `${S.methods.length}개`)}
    ${setRow('recurring', '🔁', '매월 반복 내역', `${S.recurring.length}개`)}
  </div></section>
  ${notif}
  <section><h3 class="sec-title">데이터 백업</h3><div class="card list">
    ${setRow('backupShare', '📤', '백업 보내기', '드라이브·메일 등')}
    ${setRow('backupSave', '💾', '백업 파일 저장', '다운로드')}
    ${setRow('restore', '📥', '백업에서 복원')}
    ${setRow('csv', '📊', 'CSV 내보내기', '엑셀용')}
  </div>
  <p class="hint">모든 데이터는 이 휴대폰 안에만 저장돼요. 앱을 지우거나 Chrome 사이트 데이터를 삭제하면 함께 지워지니 가끔 백업해 두세요.<br>마지막 백업: ${S.settings.lastBackup ? fmtDateTime(S.settings.lastBackup) : '없음'}</p></section>
  ${install}
  <section><h3 class="sec-title">초기화</h3><div class="card list">${setRow('reset', '🗑️', '<span class="danger-ink">전체 데이터 삭제</span>')}</div>
  <p class="hint center">가계부 v${APP_VERSION} · 내역 ${S.tx.length.toLocaleString('ko-KR')}건</p></section>`;
}

/* ================= 테마 ================= */
function applyTheme() {
  const t = S.settings.theme;
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  const cs = getComputedStyle(root);
  const bg = cs.getPropertyValue('--bg').trim();
  if (bg) $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', bg));
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) nativeCall('setBars', null, bg, cs.colorScheme === 'dark');
}
/** 네이티브 함수를 안전하게 호출 (웹앱이면 fallback) */
function nativeCall(name, fallback, ...args) {
  try {
    return NATIVE && typeof NATIVE[name] === 'function' ? NATIVE[name](...args) : fallback;
  } catch (e) {
    console.warn('native', name, e);
    return fallback;
  }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ================= 바텀시트 ================= */
const sheets = [];
function openSheet({ title, body, footer = '', mount, live = false, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="grab"></div>
      <header class="sheet-head"><h2>${esc(title)}</h2>
        <button class="icon-btn" data-sheet-close aria-label="닫기">${ICON.close}</button></header>
      <div class="sheet-body"></div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </section>`;
  const bodyEl = $('.sheet-body', wrap);
  const s = {
    el: wrap,
    live,
    onClose,
    refresh() {
      const top = bodyEl.scrollTop;
      bodyEl.innerHTML = typeof body === 'function' ? body() : body;
      bodyEl.scrollTop = top;
    },
  };
  s.refresh();
  $('#sheets').appendChild(wrap);
  sheets.push(s);
  history.pushState({ sheet: sheets.length, search: UI.searchOpen ? 1 : 0 }, '');
  document.body.classList.add('locked');
  $('.backdrop', wrap).addEventListener('click', () => closeSheet());
  $('[data-sheet-close]', wrap).addEventListener('click', () => closeSheet());
  if (mount) mount(wrap, s);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return s;
}
function closeSheet() {
  if (sheets.length) history.back();
}
window.addEventListener('popstate', e => {
  const st = e.state || {};
  const depth = st.sheet || 0;
  while (sheets.length > depth) {
    const s = sheets.pop();
    s.el.classList.remove('open');
    setTimeout(() => s.el.remove(), 280);
    if (s.onClose) s.onClose();
  }
  if (!sheets.length) document.body.classList.remove('locked');
  if (!st.search && UI.searchOpen && !sheets.length) {
    UI.searchOpen = false;
    UI.query = '';
    render();
  }
});

function confirmBox(msg, { ok = '확인', danger = false } = {}) {
  return new Promise(resolve => {
    let result = false;
    openSheet({
      title: '확인',
      body: `<p class="confirm-msg">${msg}</p>`,
      footer: `<button class="btn grow" data-c="0">취소</button><button class="btn ${danger ? 'danger-fill' : 'primary'} grow" data-c="1">${esc(ok)}</button>`,
      onClose: () => resolve(result), // 시트가 완전히 닫힌 뒤 결과 전달
      mount(w) {
        $('.sheet-foot', w).addEventListener('click', e => {
          const b = e.target.closest('[data-c]');
          if (!b) return;
          result = b.dataset.c === '1';
          closeSheet();
        });
      },
    });
  });
}

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', t).addEventListener('click', () => { t.classList.remove('show'); action.fn(); });
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2200);
}

/* ================= 내역 입력 ================= */
function defaultDate() {
  if (UI.tab === 'calendar') return UI.selDay;
  return todayStr();
}
const curAffix = () => {
  const c = cur();
  return c.suffix ? ['', `<span class="amount-cur">${c.sym}</span>`] : [`<span class="amount-cur">${c.sym}</span>`, ''];
};

function openTxForm(tx, preset = {}) {
  const editing = !!tx;
  const f = editing
    ? { ...tx }
    : { type: 'expense', cat: preset.cat || null, date: preset.date || defaultDate(), memo: preset.memo || '', method: S.methods[0] || '' };
  const [pre, suf] = curAffix();
  const memos = [...new Set(expTx().sort((a, b) => (b.created || 0) - (a.created || 0)).map(t => t.memo).filter(Boolean))].slice(0, 40);
  const body = `
    <label class="amount-box" id="f-amt-box">${pre}<input id="f-amt" inputmode="decimal" enterkeyhint="done" placeholder="0" autocomplete="off" aria-label="금액" value="${editing ? amountToInput(tx.amount) : amountToInput(preset.amount || 0)}">${suf}</label>
    <div class="f-label">카테고리</div>
    <div class="cat-grid" id="f-cats"></div>
    <div class="f-label">날짜</div>
    <div class="date-row"><input type="date" id="f-date" class="input" value="${f.date}" aria-label="날짜">
      <button class="chip" data-q="0">오늘</button><button class="chip" data-q="-1">어제</button></div>
    <div id="f-mwrap"><div class="f-label">결제수단</div><div class="chips" id="f-methods"></div></div>
    <div class="f-label">메모</div>
    <input id="f-memo" class="input" maxlength="60" placeholder="예: 점심, 마트 장보기" list="f-memo-list" value="${esc(f.memo)}" enterkeyhint="done" autocomplete="off">
    <datalist id="f-memo-list">${memos.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
    ${preset.note ? `<p class="note">${preset.note}</p>` : ''}
    <label class="check"><input type="checkbox" id="f-refund" ${(editing ? tx.refund : preset.refund) ? 'checked' : ''}>
      <span><b>환불·결제취소</b><small>돌려받은 금액이에요. 이번 달 지출 합계에서 빠져요.</small></span></label>
    ${editing
      ? (tx.rid ? '<p class="note">🔁 매월 반복으로 자동 기록된 내역이에요. 여기서 고치면 이 내역만 바뀝니다.</p>' : '') +
        (tx.auto ? `<p class="note">🔔 결제 알림에서 자동 기록된 내역이에요${tx.orig ? ` (원래 금액 ${esc(tx.orig)})` : ''}. 카테고리를 바꾸면 다음부터 같은 가맹점은 그 카테고리로 기록돼요.</p>` : '')
      : `<label class="check"><input type="checkbox" id="f-rec" ${preset.rec ? 'checked' : ''}>
          <span><b>매월 반복</b><small>매달 같은 날짜에 자동으로 기록돼요 (월세·통신비·구독료 등)</small></span></label>`}`;

  openSheet({
    title: editing ? '내역 수정' : '내역 추가',
    body,
    footer: `${editing ? '<button class="btn ghost danger-ink" data-f="del">삭제</button>' : ''}<button class="btn primary grow" data-f="save">저장</button>`,
    mount(w) {
      const amt = $('#f-amt', w), cats = $('#f-cats', w), methods = $('#f-methods', w);
      cats.innerHTML = S.categories.expense
        .map(c => `<button class="cat-btn ${c.id === f.cat ? 'on' : ''}" data-c="${esc(c.id)}"><span>${esc(c.icon)}</span><small>${esc(c.name)}</small></button>`)
        .join('');
      $('#f-mwrap', w).hidden = !S.methods.length;
      const drawMethods = () => {
        methods.innerHTML = S.methods.map(m => `<button class="chip ${m === f.method ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('');
      };
      drawMethods();
      cats.addEventListener('click', e => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        f.cat = b.dataset.c;
        $$('.cat-btn', cats).forEach(x => x.classList.toggle('on', x === b));
        cats.classList.remove('err');
      });
      methods.addEventListener('click', e => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        f.method = f.method === b.dataset.m ? '' : b.dataset.m;
        drawMethods();
      });
      $$('[data-q]', w).forEach(b => b.addEventListener('click', () => {
        const d = new Date();
        d.setDate(d.getDate() + Number(b.dataset.q));
        $('#f-date', w).value = ymd(d);
      }));
      amt.addEventListener('input', () => {
        amt.value = formatAmountInput(amt.value);
        $('#f-amt-box', w).classList.remove('err');
      });
      amt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); amt.blur(); } });
      $('#f-memo', w).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
      if (!editing && !preset.amount) amt.focus({ preventScroll: true });

      $('.sheet-foot', w).addEventListener('click', e => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        if (b.dataset.f === 'del') {
          const i = S.tx.indexOf(tx);
          if (i >= 0) S.tx.splice(i, 1);
          commit();
          closeSheet();
          toast('삭제했어요', { label: '되돌리기', fn: () => { S.tx.push(tx); commit(); } });
          return;
        }
        const amount = parseAmount(amt.value);
        if (!(amount > 0)) {
          const box = $('#f-amt-box', w);
          box.classList.remove('err');
          void box.offsetWidth;
          box.classList.add('err');
          toast('금액을 입력해 주세요');
          return;
        }
        if (!f.cat) {
          cats.classList.remove('err');
          void cats.offsetWidth;
          cats.classList.add('err');
          toast('카테고리를 선택해 주세요');
          return;
        }
        const date = /^\d{4}-\d{2}-\d{2}$/.test($('#f-date', w).value) ? $('#f-date', w).value : todayStr();
        const memo = $('#f-memo', w).value.trim();
        const method = f.type === 'expense' ? f.method : '';
        const refund = $('#f-refund', w).checked ? 1 : 0;
        if (editing) {
          Object.assign(tx, { type: f.type, amount, cat: f.cat, date, memo, method, refund: refund || undefined });
        } else {
          const t = { id: uid(), type: f.type, amount, cat: f.cat, date, memo, method, created: Date.now() };
          if (refund) t.refund = 1;
          const rec = $('#f-rec', w);
          if (rec && rec.checked && !refund) {
            const r = { id: uid(), type: f.type, amount, cat: f.cat, memo, method, day: Number(date.slice(8, 10)), last: ymOf(date) };
            S.recurring.push(r);
            t.rid = r.id;
          }
          if (preset.inboxId) {
            t.auto = 1;
            if (preset.orig) t.orig = preset.orig;
            S.inbox = S.inbox.filter(i => i.id !== preset.inboxId);
          }
          S.tx.push(t);
          requestPersist();
        }
        if (sheets.length === 1) {
          UI.month = ymOf(date);
          if (UI.tab === 'calendar') UI.selDay = date;
        }
        commit();
        closeSheet();
        toast(editing ? '수정했어요' : '기록했어요');
      });
    },
  });
}

/* ================= 기타 시트 ================= */
function openMonthPicker() {
  let y = Number(UI.month.slice(0, 4));
  const has = new Set(S.tx.map(t => ymOf(t.date)));
  openSheet({
    title: '월 선택',
    body: '',
    mount(w) {
      const b = $('.sheet-body', w);
      const draw = () => {
        b.innerHTML = `<div class="yr"><button class="icon-btn" data-y="-1" aria-label="이전 해">${ICON.left}</button><b>${y}년</b>
          <button class="icon-btn" data-y="1" aria-label="다음 해">${ICON.right}</button></div>
          <div class="mgrid">${Array.from({ length: 12 }, (_, i) => {
            const k = `${y}-${pad(i + 1)}`;
            return `<button class="mcell ${k === UI.month ? 'on' : ''}" data-m="${k}">${i + 1}월${has.has(k) ? '<i></i>' : ''}</button>`;
          }).join('')}</div>`;
      };
      draw();
      b.addEventListener('click', e => {
        const yb = e.target.closest('[data-y]');
        if (yb) { y += Number(yb.dataset.y); draw(); return; }
        const mb = e.target.closest('[data-m]');
        if (mb) { UI.month = mb.dataset.m; render(); closeSheet(); }
      });
    },
  });
}

function openCatDetail(type, catId, month) {
  const c = catOf({ type, cat: catId });
  openSheet({
    title: `${c.icon} ${c.name} · ${Number(month.slice(5))}월`,
    live: true,
    body: () => {
      const list = txOfMonth(month).filter(t => t.type === type && t.cat === catId).sort(sortTx);
      if (!list.length) return '<p class="empty-sm">내역이 없어요</p>';
      const s = sums(list);
      return `<p class="detail-sum">${list.length}건 · <b>${money(s.exp)}</b></p>
        <ul class="tx-list card-in">${list.map(t => `<li>${txRow(t)}</li>`).join('')}</ul>`;
    },
  });
}

function openCurrency() {
  openSheet({
    title: '통화 선택',
    body: `<div class="card-in list">${Object.entries(CUR).map(([k, c]) => `<button class="row" data-k="${k}"><span class="row-icon cur-sym">${c.sym}</span>
      <span class="grow">${c.name} <span class="muted">${k}</span></span>${S.settings.currency === k ? ICON.check : ''}</button>`).join('')}</div>
      <p class="hint">통화를 바꿔도 기존 금액은 환산되지 않고 표시 단위만 바뀌어요.</p>`,
    mount(w) {
      $('.sheet-body', w).addEventListener('click', e => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        S.settings.currency = b.dataset.k;
        commit();
        closeSheet();
      });
    },
  });
}

function openCatManager() {
  const type = 'expense';
  const count = (tp, id) => S.tx.filter(t => t.type === tp && t.cat === id).length;
  openSheet({
    title: '카테고리 관리',
    live: true,
    body: () => `
      <div class="card-in list">${S.categories[type].map((c, i) => `<div class="row">
        <span class="row-icon">${esc(c.icon)}</span><span class="grow">${esc(c.name)} <span class="muted">· ${count(type, c.id)}건</span></span>
        <button class="icon-btn sm" data-x="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="위로">${ICON.up}</button>
        <button class="icon-btn sm" data-x="edit" data-i="${i}" aria-label="편집">${ICON.edit}</button></div>`).join('')}</div>
      <button class="btn block" data-x="add">${ICON.plus} 카테고리 추가</button>`,
    mount(w) {
      $('.sheet-body', w).addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        const x = b.dataset.x, i = Number(b.dataset.i), arr = S.categories[type];
        if (x === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; commit(); }
        else if (x === 'edit') openCatEdit(type, arr[i]);
        else if (x === 'add') openCatEdit(type, null);
      });
    },
  });
}

function openCatEdit(type, cat) {
  const editing = !!cat;
  let icon = cat ? cat.icon : EMOJIS[0];
  openSheet({
    title: editing ? '카테고리 편집' : '카테고리 추가',
    body: `<div class="f-label">이름</div>
      <input id="c-name" class="input" maxlength="12" value="${esc(cat ? cat.name : '')}" placeholder="예: 반려동물" autocomplete="off">
      <div class="f-label">아이콘</div>
      <div class="emoji-grid" id="c-emoji">${(EMOJIS.includes(icon) ? EMOJIS : [icon, ...EMOJIS]).map(e => `<button class="${e === icon ? 'on' : ''}" data-e="${esc(e)}">${esc(e)}</button>`).join('')}</div>`,
    footer: `${editing ? '<button class="btn ghost danger-ink" data-f="del">삭제</button>' : ''}<button class="btn primary grow" data-f="save">저장</button>`,
    mount(w) {
      $('#c-emoji', w).addEventListener('click', e => {
        const b = e.target.closest('[data-e]');
        if (!b) return;
        icon = b.dataset.e;
        $$('#c-emoji button', w).forEach(x => x.classList.toggle('on', x === b));
      });
      $('.sheet-foot', w).addEventListener('click', async e => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        const arr = S.categories[type];
        if (b.dataset.f === 'save') {
          const name = $('#c-name', w).value.trim();
          if (!name) { toast('이름을 입력해 주세요'); return; }
          if (editing) Object.assign(cat, { name, icon });
          else arr.push({ id: uid(), name, icon });
          commit();
          closeSheet();
          return;
        }
        if (arr.length <= 1) { toast('카테고리는 최소 1개가 필요해요'); return; }
        const used = S.tx.filter(t => t.type === type && t.cat === cat.id);
        const fallback = arr.find(c => c.id !== cat.id && c.name === '기타') || arr.find(c => c.id !== cat.id);
        const ok = await confirmBox(
          `‘${esc(cat.name)}’ 카테고리를 삭제할까요?` + (used.length ? `<br><small>이 카테고리의 내역 ${used.length}건은 ‘${esc(fallback.name)}’(으)로 옮겨져요.</small>` : ''),
          { ok: '삭제', danger: true });
        if (!ok) return;
        used.forEach(t => { t.cat = fallback.id; });
        S.recurring.forEach(r => { if (r.type === type && r.cat === cat.id) r.cat = fallback.id; });
        arr.splice(arr.indexOf(cat), 1);
        commit();
        closeSheet();
      });
    },
  });
}

function openMethods() {
  openSheet({
    title: '결제수단 관리',
    live: true,
    body: () => `
      ${S.methods.length ? `<div class="card-in list">${S.methods.map((m, i) => `<div class="row"><span class="grow">${esc(m)}${i === 0 ? ' <span class="muted">· 기본값</span>' : ''}</span>
        <button class="icon-btn sm" data-x="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="위로">${ICON.up}</button>
        <button class="icon-btn sm" data-x="del" data-i="${i}" aria-label="삭제">${ICON.close}</button></div>`).join('')}</div>`
        : '<p class="empty-sm">결제수단이 없어요</p>'}
      <div class="add-row"><input id="m-new" class="input" maxlength="12" placeholder="예: PayNow, 체크카드" autocomplete="off" enterkeyhint="done">
        <button class="btn primary" data-x="add">추가</button></div>
      <p class="hint">맨 위 항목이 새 내역의 기본 결제수단이 돼요. 삭제해도 지난 내역은 그대로 남아요.</p>`,
    mount(w) {
      const add = () => {
        const inp = $('#m-new', w);
        const v = inp.value.trim();
        if (!v) return;
        if (S.methods.includes(v)) { toast('이미 있는 결제수단이에요'); return; }
        S.methods.push(v);
        commit();
        $('#m-new', w).focus();
      };
      const body = $('.sheet-body', w);
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        const i = Number(b.dataset.i);
        if (b.dataset.x === 'add') add();
        else if (b.dataset.x === 'del') { S.methods.splice(i, 1); commit(); }
        else if (b.dataset.x === 'up' && i > 0) { [S.methods[i - 1], S.methods[i]] = [S.methods[i], S.methods[i - 1]]; commit(); }
      });
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'm-new') { e.preventDefault(); add(); } });
    },
  });
}

function openRecurring() {
  openSheet({
    title: '매월 반복 내역',
    live: true,
    body: () => {
      const addBtn = `<button class="btn block" data-x="add">${ICON.plus} 반복 내역 추가</button>`;
      const recs = S.recurring.filter(r => r.type === 'expense');
      if (!recs.length) {
        return `<p class="empty-sm">등록된 반복 내역이 없어요.<br>내역을 추가할 때 ‘매월 반복’을 체크하면<br>매달 같은 날 자동으로 기록돼요.</p>${addBtn}`;
      }
      let fe = 0;
      const rows = recs.sort((a, b) => a.day - b.day).map(r => {
        fe += r.amount;
        const c = catOf(r);
        return `<button class="tx" data-x="edit" data-id="${esc(r.id)}"><span class="tx-icon">${esc(c.icon)}</span>
          <span class="tx-main"><span class="tx-title">${esc(r.memo || c.name)}</span><span class="tx-sub">매월 ${r.day}일 · ${esc(c.name)}${r.method ? ' · ' + esc(r.method) : ''}</span></span>
          <span class="tx-amt">${money(r.amount)}</span></button>`;
      }).join('');
      return `<div class="card-in">${rows}</div>
        <p class="hint">매월 고정 지출 합계 ${money(fe)}</p>${addBtn}`;
    },
    mount(w) {
      $('.sheet-body', w).addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'add') openTxForm(null, { rec: true });
        else {
          const r = S.recurring.find(x => x.id === b.dataset.id);
          if (r) openRecEdit(r);
        }
      });
    },
  });
}

function openRecEdit(r) {
  const c = catOf(r);
  const [pre, suf] = curAffix();
  openSheet({
    title: '반복 내역 편집',
    body: `<p class="note">${esc(c.icon)} ${esc(c.name)}${r.method ? ' · ' + esc(r.method) : ''}</p>
      <div class="f-label">금액</div>
      <label class="amount-box sm">${pre}<input id="r-amt" inputmode="decimal" autocomplete="off" value="${amountToInput(r.amount)}">${suf}</label>
      <div class="f-label">매월 기록일</div>
      <select id="r-day" class="input">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${r.day === i + 1 ? 'selected' : ''}>${i + 1}일${i + 1 >= 29 ? ' (없는 달은 말일)' : ''}</option>`).join('')}</select>
      <div class="f-label">메모</div>
      <input id="r-memo" class="input" maxlength="60" value="${esc(r.memo)}" autocomplete="off">
      <p class="hint">변경 내용은 앞으로 기록될 내역부터 적용돼요. 삭제해도 이미 기록된 내역은 남아 있어요.</p>`,
    footer: '<button class="btn ghost danger-ink" data-f="del">삭제</button><button class="btn primary grow" data-f="save">저장</button>',
    mount(w) {
      const amt = $('#r-amt', w);
      amt.addEventListener('input', () => { amt.value = formatAmountInput(amt.value); });
      $('.sheet-foot', w).addEventListener('click', async e => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        if (b.dataset.f === 'save') {
          const v = parseAmount(amt.value);
          if (!(v > 0)) { toast('금액을 입력해 주세요'); return; }
          Object.assign(r, { amount: v, day: Number($('#r-day', w).value), memo: $('#r-memo', w).value.trim() });
          commit();
          closeSheet();
          toast('반복 내역을 수정했어요');
          return;
        }
        const ok = await confirmBox('이 반복 내역을 삭제할까요?<br><small>이미 기록된 내역은 지워지지 않아요.</small>', { ok: '삭제', danger: true });
        if (!ok) return;
        S.recurring.splice(S.recurring.indexOf(r), 1);
        commit();
        closeSheet();
      });
    },
  });
}

/* ================= 결제 알림 자동 기록 ================= */
const RATE_CURS = {
  SGD: '싱가포르 달러', KRW: '대한민국 원', USD: '미국 달러', MYR: '말레이시아 링깃', JPY: '일본 엔', EUR: '유로',
  GBP: '영국 파운드', AUD: '호주 달러', HKD: '홍콩 달러', THB: '태국 바트', IDR: '인도네시아 루피아', CNY: '중국 위안',
};
const DOLLAR_BASES = ['SGD', 'USD', 'AUD', 'HKD'];
const NOTIF_STATUS = {
  saved: ['기록됨', 'ok'], review: ['확인 필요', 'warn'], ignored: ['무시', 'mute'],
  dup: ['중복', 'mute'], blocked: ['차단한 앱', 'mute'], off: ['꺼짐', 'mute'],
};
const fmtTime = ts => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 알림을 보낸 앱 이름과 비슷한 결제수단이 있으면 그것, 없으면 기본 결제수단 */
function guessMethod(app) {
  const k = NP.normKey(app);
  if (k.length >= 2) {
    const m = S.methods.find(x => {
      const mk = NP.normKey(x);
      return mk.length >= 2 && (k.includes(mk) || mk.includes(k));
    });
    if (m) return m;
  }
  return S.methods[0] || '';
}

/** 알림 하나를 어떻게 처리할지 결정합니다 (데이터는 바꾸지 않음). */
function analyzeNotif(n) {
  const time = Number(n.time) || Date.now();
  const app = String(n.app || n.pkg || '알림').slice(0, 40);
  if (!S.settings.autoNotif) return { status: 'off', note: '자동 기록이 꺼져 있음' };
  if (n.pkg && S.settings.notifBlock.includes(n.pkg)) return { status: 'blocked', note: '무시하도록 설정한 앱' };
  const p = NP.parse(n);
  if (!p.ok) return { status: 'ignored', note: p.reason };
  if (p.type !== 'expense' && !p.refund) return { status: 'ignored', note: '입금 알림 (지출만 기록)' };
  const refund = p.refund ? 1 : 0;
  const base = S.settings.currency;
  // '$'만 있으면 기본 통화가 달러 계열일 때 기본 통화로 간주
  const amounts = p.amounts.map(a => ({ ...a, currency: a.currency || (DOLLAR_BASES.includes(base) && a.raw.includes('$') ? base : null) }));
  const hit = amounts.find(a => a.currency === base) || amounts[0];
  let amount = null, orig = '';
  if (hit.currency === base) amount = roundCur(hit.amount);
  else if (hit.currency && S.settings.rates[hit.currency] > 0) {
    amount = roundCur(hit.amount / S.settings.rates[hit.currency]);
    orig = hit.raw;
  }
  const memo = p.merchant || app;
  const key = NP.normKey(memo);
  const near = t0 => Math.abs(t0 - time) < 10 * 60 * 1000;
  // 결제 직후 취소가 오는 경우가 있으므로 환불 여부까지 같아야 중복으로 봄
  const dup =
    S.tx.some(t => t.auto && t.type === 'expense' && !!t.refund === !!refund && amount !== null && Math.abs(t.amount - amount) < 0.005 && NP.normKey(t.memo) === key && near(t.created || 0)) ||
    S.inbox.some(i => !!i.refund === !!refund && i.amountOrig === hit.amount && NP.normKey(i.memo) === key && near(i.time));
  if (dup) return { status: 'dup', note: '같은 결제가 이미 기록됨 (문자·앱 알림 중복 등)' };
  const cat = NP.guessCategory(memo, 'expense', expTx().sort(sortTx), S.categories.expense, `${n.title || ''} ${n.text || ''}`);
  const info = { type: 'expense', refund, memo, merchantFound: !!p.merchant, date: ymd(new Date(time)), cat, time, app, hit, amount, orig, method: guessMethod(app) };
  if (amount === null) return { status: 'review', note: hit.currency ? `${hit.currency} 환율이 없어 확인 필요` : '통화를 알 수 없어 확인 필요', ...info };
  return { status: 'saved', note: '', ...info };
}

/** 분석 결과를 실제로 반영하고 인식 기록에 남깁니다. */
function processNotif(n) {
  const a = analyzeNotif(n);
  const entry = {
    id: uid(), time: Number(n.time) || Date.now(), app: String(n.app || n.pkg || '').slice(0, 40), pkg: String(n.pkg || ''),
    text: [n.title, n.text].filter(Boolean).join(' · ').slice(0, 400), status: a.status, note: a.note,
  };
  if (a.status === 'saved') {
    const tx = { id: uid(), type: a.type, amount: a.amount, cat: a.cat, date: a.date, memo: a.memo, method: a.method, created: a.time, auto: 1 };
    if (a.orig) tx.orig = a.orig;
    if (a.refund) tx.refund = 1;
    S.tx.push(tx);
    entry.txId = tx.id;
    entry.note = `${catOf(tx).name} · ${a.refund ? `환불 +${money(a.amount)}` : money(a.amount)}`;
  } else if (a.status === 'review') {
    S.inbox.unshift({ id: uid(), time: a.time, type: a.type, cat: a.cat, memo: a.memo, date: a.date, currency: a.hit.currency || '?', amountOrig: a.hit.amount, app: a.app, refund: a.refund || undefined });
    if (S.inbox.length > 50) S.inbox.length = 50;
  }
  S.notifLog.unshift(entry);
  if (S.notifLog.length > 100) S.notifLog.length = 100;
  return entry;
}

/** 안드로이드 쪽에 쌓인 알림을 가져와 처리 (앱을 열거나 알림이 올 때 호출) */
function pullNative() {
  if (!NATIVE) return;
  let list = [];
  try {
    list = JSON.parse(nativeCall('takePending', '[]') || '[]');
  } catch {
    list = [];
  }
  if (!Array.isArray(list) || !list.length) {
    render();
    for (const s of sheets) if (s.live) s.refresh();
    return;
  }
  list.sort((a, b) => (a.time || 0) - (b.time || 0));
  const res = list.map(processNotif);
  const saved = res.filter(r => r.status === 'saved').length;
  const review = res.filter(r => r.status === 'review').length;
  commit();
  if (saved || review) toast(`결제 알림 ${saved}건 자동 기록${review ? ` · 확인 필요 ${review}건` : ''}`, { label: '보기', fn: openNotifLog });
}
window.__gagyebuNativeNotif = pullNative;

function openInbox() {
  openSheet({
    title: '확인이 필요한 결제 알림',
    live: true,
    body: () => {
      if (!S.inbox.length) return '<p class="empty-sm">확인할 알림이 없어요 👍</p>';
      return `<p class="hint">환율이 없거나 통화를 알 수 없는 알림이에요. 눌러서 금액을 확인하고 기록하세요.</p>
        <div class="card-in">${S.inbox.map(i => {
          const c = catOf(i);
          const rate = S.settings.rates[i.currency];
          return `<div class="inbox-row"><button class="tx" data-x="rec" data-id="${esc(i.id)}"><span class="tx-icon">${esc(c.icon)}</span>
            <span class="tx-main"><span class="tx-title">${esc(i.memo)}</span>
              <span class="tx-sub">${esc(i.currency)} ${i.amountOrig.toLocaleString('ko-KR')} · ${fmtTime(i.time)} · ${esc(i.app)}</span></span>
            <span class="tx-amt ${i.refund ? 'inc-ink' : ''}">${rate > 0 ? (i.refund ? '+' : '≈ ') + money(i.amountOrig / rate) : (i.refund ? '환불 ' : '') + '기록 ›'}</span></button>
            <button class="icon-btn sm" data-x="del" data-id="${esc(i.id)}" aria-label="삭제">${ICON.close}</button></div>`;
        }).join('')}</div>
        <button class="btn block" data-x="rates">💱 환율 설정</button>`;
    },
    mount(w) {
      $('.sheet-body', w).addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        const item = S.inbox.find(i => i.id === b.dataset.id);
        if (b.dataset.x === 'rates') openRates();
        else if (b.dataset.x === 'del' && item) { S.inbox = S.inbox.filter(i => i !== item); commit(); }
        else if (b.dataset.x === 'rec' && item) {
          const rate = S.settings.rates[item.currency];
          const orig = `${item.currency} ${item.amountOrig.toLocaleString('ko-KR')}`;
          openTxForm(null, {
            type: item.type, cat: item.cat, memo: item.memo, date: item.date, inboxId: item.id, orig, refund: !!item.refund,
            amount: rate > 0 ? roundCur(item.amountOrig / rate) : 0,
            note: `🔔 ${esc(item.app)} 알림 · 원래 금액 <b>${esc(orig)}</b>` +
              (rate > 0 ? ' (설정한 환율로 환산)' : ` — ${esc(S.settings.currency)} 금액을 입력해 주세요`),
          });
        }
      });
    },
  });
}

function openNotifLog() {
  openSheet({
    title: '알림 인식 기록',
    live: true,
    body: () => {
      if (!S.notifLog.length) {
        return `<p class="empty-sm">아직 인식한 알림이 없어요.<br>${NATIVE ? '금액이 들어 있는 알림이 오면 여기에 표시돼요.' : '안드로이드 앱에서 동작해요.'}</p>`;
      }
      return '<p class="hint">금액이 들어 있는 알림만 최근 100건까지 보여요. 결제와 상관없는 앱은 ‘이 앱 무시’로 막을 수 있어요.</p>' +
        S.notifLog.map(l => {
          const [label, cls] = NOTIF_STATUS[l.status] || [l.status, 'mute'];
          const blocked = l.pkg && S.settings.notifBlock.includes(l.pkg);
          const linked = l.txId && S.tx.some(t => t.id === l.txId);
          return `<div class="log-item">
            <div class="log-head"><span class="badge ${cls}">${label}</span><b>${esc(l.app)}</b><span class="muted">${fmtTime(l.time)}</span>
              ${l.pkg ? `<button class="chip sm" data-x="block" data-pkg="${esc(l.pkg)}">${blocked ? '무시 해제' : '이 앱 무시'}</button>` : ''}</div>
            <div class="log-text">${esc(l.text)}</div>
            ${l.note ? `<div class="log-note">${linked ? `<button class="link-btn" data-act="edit" data-id="${esc(l.txId)}">${esc(l.note)} ›</button>` : esc(l.note)}</div>` : ''}
          </div>`;
        }).join('') +
        '<button class="btn block" data-x="clear">인식 기록 지우기</button>';
    },
    mount(w) {
      $('.sheet-body', w).addEventListener('click', e => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.dataset.x === 'block') {
          const arr = S.settings.notifBlock, i = arr.indexOf(b.dataset.pkg);
          if (i >= 0) arr.splice(i, 1); else arr.push(b.dataset.pkg);
          commit();
          toast(i >= 0 ? '이 앱 알림을 다시 인식해요' : '이 앱 알림은 앞으로 무시해요');
        } else if (b.dataset.x === 'clear') {
          S.notifLog = [];
          commit();
        }
      });
    },
  });
}

function openNotifPerm() {
  openSheet({
    title: '알림 접근 권한',
    live: true,
    body: () => {
      const ok = nativeCall('listenerEnabled', false);
      return `<p class="confirm-msg">${ok ? '✅ 권한이 허용되어 있어요. 결제 알림이 오면 자동으로 기록돼요.' : '결제 알림을 읽으려면 <b>알림 접근</b> 권한이 필요해요.'}</p>
        <ol class="steps">
          <li><b>알림 접근 설정 열기</b> → <b>가계부</b>를 켜고 <b>허용</b>을 누르세요.</li>
          <li>스위치가 회색으로 막혀 있거나 <b>‘제한된 설정’</b> 안내가 뜨면: <b>앱 정보 열기</b> → 오른쪽 위 <b>⋮</b> → <b>제한된 설정 허용</b> → 다시 1번.</li>
          <li>가계부로 돌아오면 자동으로 확인돼요.</li>
        </ol>
        <p class="hint">알림 내용은 이 폰 안에서만 처리되고 인터넷으로 보내지 않아요. 금액이 들어 있는 알림만 저장해요.</p>`;
    },
    footer: '<button class="btn grow" data-f="app">앱 정보 열기</button><button class="btn primary grow" data-f="listener">알림 접근 설정 열기</button>',
    mount(w) {
      $('.sheet-foot', w).addEventListener('click', e => {
        const b = e.target.closest('[data-f]');
        if (b) nativeCall(b.dataset.f === 'app' ? 'openAppSettings' : 'openListenerSettings', null);
      });
    },
  });
}

function openRates() {
  const base = S.settings.currency;
  const list = Object.keys(RATE_CURS).filter(k => k !== base);
  openSheet({
    title: '다른 통화 환율',
    body: `<p class="hint">알림 금액이 ${esc(base)}가 아니면 아래 환율로 바꿔서 기록해요. 비워 두면 ‘확인 필요’에 모아 둬요. 환율은 자동으로 바뀌지 않으니 가끔 고쳐 주세요.</p>
      <div class="card-in list">${list.map(k => `<label class="row"><span class="grow">1 ${esc(base)} = <span class="muted">${esc(RATE_CURS[k])}</span></span>
        <input class="input mini" inputmode="decimal" autocomplete="off" data-r="${k}" placeholder="—" value="${S.settings.rates[k] || ''}"><span class="rate-cur">${k}</span></label>`).join('')}</div>`,
    footer: '<button class="btn primary grow" data-f="save">저장</button>',
    mount(w) {
      $('.sheet-foot', w).addEventListener('click', e => {
        if (!e.target.closest('[data-f]')) return;
        const rates = {};
        $$('[data-r]', w).forEach(i => {
          const v = parseFloat(i.value.replace(/,/g, ''));
          if (v > 0) rates[i.dataset.r] = v;
        });
        S.settings.rates = rates;
        commit();
        closeSheet();
        toast('환율을 저장했어요');
      });
    },
  });
}

function openNotifTest() {
  openSheet({
    title: '알림 문구 테스트',
    body: `<p class="hint">받은 결제 알림이나 문자 내용을 붙여 넣으면 어떻게 기록될지 미리 보여 줘요. 실제로 저장되지는 않아요.</p>
      <textarea id="nt-text" class="input area" rows="5" placeholder="예) You spent S$6.50 at Toast Box&#10;예) KB국민카드1234승인 홍*동 12,000원 일시불 11/17 12:34 스타벅스"></textarea>
      <div id="nt-out" class="nt-out"></div>`,
    mount(w) {
      const ta = $('#nt-text', w), out = $('#nt-out', w);
      ta.addEventListener('input', () => {
        const v = ta.value.trim();
        if (!v) { out.innerHTML = ''; return; }
        const keep = S.settings.autoNotif;
        S.settings.autoNotif = true;
        const a = analyzeNotif({ title: '', text: v, app: '테스트', time: Date.now() });
        S.settings.autoNotif = keep;
        if (a.status !== 'saved' && a.status !== 'review') {
          out.innerHTML = `<p class="note">❌ 기록하지 않아요 — ${esc(a.note)}</p>`;
          return;
        }
        const c = catOf(a);
        const amt = a.amount !== null ? (a.refund ? '+' : '') + money(a.amount) + (a.orig ? ` <span class="muted">(${esc(a.orig)})</span>` : '') : esc(a.hit.raw);
        out.innerHTML = `<table class="nt-table">
          <tr><th>처리</th><td>${a.status === 'saved' ? (a.refund ? '✅ 환불·취소로 기록 (지출에서 빠짐)' : '✅ 자동 기록') : `⚠️ ${esc(a.note)}`}</td></tr>
          <tr><th>금액</th><td>${amt}</td></tr>
          <tr><th>가맹점</th><td>${a.merchantFound ? esc(a.memo) : '<span class="muted">찾지 못함 (앱 이름으로 기록)</span>'}</td></tr>
          <tr><th>카테고리</th><td>${esc(c.icon)} ${esc(c.name)}</td></tr></table>`;
      });
      ta.focus({ preventScroll: true });
    },
  });
}

/* ================= 백업 / 복원 ================= */
const backupName = ext => `gagyebu-backup-${todayStr()}.${ext}`;
const backupJson = () => JSON.stringify({ app: 'gagyebu', version: APP_VERSION, exported: new Date().toISOString(), data: S });
function markBackup() {
  S.settings.lastBackup = Date.now();
  commit();
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
/** 안드로이드 앱에서는 WebView가 파일 다운로드를 못 해서 네이티브로 저장/공유 */
function nativeSaveFile(name, mime, content, share) {
  const r = nativeCall('saveFile', 'error', name, mime, content, !!share);
  if (r !== 'ok') toast('파일을 저장하지 못했어요');
  return r === 'ok';
}
function backupSave() {
  if (NATIVE) {
    if (nativeSaveFile(backupName('json'), 'application/json', backupJson(), false)) {
      markBackup();
      toast('다운로드/가계부 폴더에 저장했어요');
    }
    return;
  }
  downloadBlob(new Blob([backupJson()], { type: 'application/json' }), backupName('json'));
  markBackup();
  toast('백업 파일을 다운로드 폴더에 저장했어요');
}
async function backupShare() {
  if (NATIVE) {
    if (nativeSaveFile(backupName('json'), 'application/json', backupJson(), true)) markBackup();
    return;
  }
  const json = backupJson();
  const files = [
    new File([json], backupName('json'), { type: 'application/json' }),
    new File([json], backupName('txt'), { type: 'text/plain' }),
  ];
  for (const file of files) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '가계부 백업' });
        markBackup();
      } catch (e) {
        if (e.name !== 'AbortError') toast('공유하지 못했어요');
      }
      return;
    }
  }
  backupSave(); // 공유 기능이 없으면 파일 저장
}
function exportCsv() {
  const safe = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // 엑셀 수식 실행 방지
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['날짜', '카테고리', '금액', '결제수단', '메모', '반복', '알림 자동', '환불']];
  const list = expTx().sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
  for (const t of list) rows.push([t.date, catOf(t).name, signed(t), t.method, t.memo, t.rid ? 'Y' : '', t.auto ? 'Y' : '', t.refund ? 'Y' : '']);
  const csv = '﻿' + rows.map(r => r.map((v, i) => (i === 2 ? String(v) : safe(v))).join(',')).join('\r\n');
  if (NATIVE) {
    if (nativeSaveFile(`가계부_${todayStr()}.csv`, 'text/csv', csv, false)) toast(`다운로드/가계부 폴더에 CSV 저장 (${list.length}건)`);
    return;
  }
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `가계부_${todayStr()}.csv`);
  toast(`CSV 파일 저장 (${list.length}건)`);
}
$('#file-in').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    const j = JSON.parse(await file.text());
    data = j && j.app === 'gagyebu' ? j.data : j;
    if (!data || !Array.isArray(data.tx)) throw new Error('bad format');
  } catch {
    toast('가계부 백업 파일이 아니에요');
    return;
  }
  const ok = await confirmBox(
    `백업 파일의 내역 <b>${data.tx.length}건</b>으로 현재 데이터를 교체할까요?<br><small>지금 있는 내역 ${S.tx.length}건은 사라져요.</small>`,
    { ok: '복원' });
  if (!ok) return;
  S = migrate(data);
  runRecurring();
  commit();
  toast(`복원했어요 · 내역 ${S.tx.length}건`);
});
async function resetAll() {
  const ok = await confirmBox('모든 내역·카테고리·반복 설정이 삭제돼요.<br><b>되돌릴 수 없으니</b> 먼저 백업해 두는 것을 권장해요.', { ok: '전체 삭제', danger: true });
  if (!ok) return;
  const theme = S.settings.theme, currency = S.settings.currency;
  S = defaultState();
  Object.assign(S.settings, { theme, currency });
  commit();
  toast('모든 데이터를 삭제했어요');
}

/* ================= 이벤트 ================= */
function shiftMonth(n) {
  UI.month = addMonths(UI.month, n);
  render();
  const v = $('#view');
  v.classList.remove('anim');
  void v.offsetWidth;
  v.classList.add('anim');
}

const ACT = {
  tab: v => {
    if (UI.searchOpen) { UI.tab = v; history.back(); return; }
    UI.tab = v;
    render();
    window.scrollTo(0, 0);
  },
  prev: () => shiftMonth(-1),
  next: () => shiftMonth(1),
  thisMonth: () => { UI.month = ymOf(todayStr()); UI.selDay = todayStr(); render(); },
  monthpick: openMonthPicker,
  search: () => {
    UI.searchOpen = true;
    UI.query = '';
    history.pushState({ search: 1 }, '');
    render();
    $('#q').focus();
  },
  searchClose: () => history.back(),
  add: () => openTxForm(null),
  edit: (v, el) => { const t = S.tx.find(x => x.id === el.dataset.id); if (t) openTxForm(t); },
  day: v => { UI.selDay = v; render(); },
  month: v => { UI.month = v; render(); },
  catdetail: (v, el) => openCatDetail('expense', el.dataset.id, UI.month),
  currency: openCurrency,
  theme: v => { S.settings.theme = v; commit(); },
  cats: openCatManager,
  methods: openMethods,
  recurring: openRecurring,
  backupShare,
  backupSave,
  restore: () => $('#file-in').click(),
  csv: exportCsv,
  reset: resetAll,
  inbox: openInbox,
  notifLog: openNotifLog,
  notifPerm: openNotifPerm,
  notifTest: openNotifTest,
  rates: openRates,
  autoNotif: () => {
    S.settings.autoNotif = !S.settings.autoNotif;
    commit();
    if (S.settings.autoNotif && !nativeCall('listenerEnabled', true)) openNotifPerm();
  },
  appUpdate: () => nativeCall('openUrl', null, APK_URL),
  install: async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null;
    render();
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset.v, el, e);
});

/* 좌우 스와이프로 월 이동 */
(() => {
  let sx = 0, sy = 0, st = 0;
  const view = $('#view');
  view.addEventListener('touchstart', e => {
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (UI.searchOpen || UI.tab === 'settings' || sheets.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - st < 600) shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  if (UI.tab === 'settings') render();
});
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('홈 화면에 설치했어요'); });

/* 앱으로 돌아올 때 날짜가 바뀌었으면 반복 내역 반영 */
let lastDay = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const n = runRecurring();
  if (n || todayStr() !== lastDay) {
    if (UI.month === ymOf(lastDay)) UI.month = ymOf(todayStr());
    lastDay = todayStr();
    render();
    if (n) toast(`반복 내역 ${n}건을 자동으로 기록했어요`);
  }
});
/* 다른 탭에서 데이터가 바뀌면 다시 불러오기 */
window.addEventListener('storage', e => {
  if (e.key === STORE_KEY) { S = load(); render(); }
});

/* ================= 시작 ================= */
(function init() {
  if (history.state && (history.state.sheet || history.state.search)) history.replaceState(null, '');
  const added = runRecurring();
  render();
  if (added) toast(`반복 내역 ${added}건을 자동으로 기록했어요`);
  const params = new URLSearchParams(location.search);
  const add = params.get('add');
  if (params.has('add') || params.has('source')) history.replaceState(null, '', location.pathname);
  if (add === 'expense') openTxForm(null);
  if (NATIVE) {
    pullNative();
    // 앱 첫 실행 때 알림 접근 권한 안내
    let intro = '1';
    try { intro = localStorage.getItem('gagyebu.nativeIntro'); localStorage.setItem('gagyebu.nativeIntro', '1'); } catch {}
    if (!intro && !nativeCall('listenerEnabled', true)) openNotifPerm();
  } else if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
