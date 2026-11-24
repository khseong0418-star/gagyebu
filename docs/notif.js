/* 결제 알림 문구 분석기 — DOM 없이 동작 (브라우저: window.GagyebuNotif, Node: require) */
(function (root) {
  'use strict';

  /* ---------- 통화·금액 ---------- */
  const CUR_TOKENS = {
    'S$': 'SGD', 'SG$': 'SGD', SGD: 'SGD', 'US$': 'USD', USD: 'USD', 'A$': 'AUD', AUD: 'AUD',
    'HK$': 'HKD', HKD: 'HKD', KRW: 'KRW', '₩': 'KRW', '￦': 'KRW', '원': 'KRW', MYR: 'MYR', RM: 'MYR',
    EUR: 'EUR', '€': 'EUR', JPY: 'JPY', '¥': 'JPY', '円': 'JPY', GBP: 'GBP', '£': 'GBP',
    THB: 'THB', IDR: 'IDR', CNY: 'CNY', TWD: 'TWD', VND: 'VND', PHP: 'PHP', '$': null,
  };
  const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const PREFIX = new RegExp(
    '(?<![A-Za-z])(S\\$|SG\\$|US\\$|A\\$|HK\\$|SGD|USD|AUD|HKD|KRW|MYR|EUR|JPY|GBP|THB|IDR|CNY|TWD|VND|PHP|RM|₩|￦|€|¥|£|\\$)\\s?' + NUM, 'g');
  const SUFFIX = new RegExp(NUM + '\\s?(원|円|SGD|USD|AUD|HKD|KRW|MYR|EUR|JPY|GBP)(?![A-Za-z])', 'g');
  // 바로 앞에 이런 단어가 있으면 잔액·누적·한도 금액이라 결제 금액이 아님
  const BALANCE_BEFORE = /(bal(ance)?|avail(able)?|limit|잔액|잔고|누적|한도|사용\s?가능|가용)[^0-9]{0,14}$/i;

  /** 결제 금액 후보를 문구 순서대로 모두 돌려줍니다 (잔액·누적 제외). */
  function findAmounts(text) {
    const hits = [];
    for (const m of text.matchAll(PREFIX)) hits.push({ idx: m.index, cur: m[1], num: m[2] });
    for (const m of text.matchAll(SUFFIX)) hits.push({ idx: m.index, cur: m[2], num: m[1] });
    hits.sort((a, b) => a.idx - b.idx);
    const out = [];
    for (const h of hits) {
      if (BALANCE_BEFORE.test(text.slice(Math.max(0, h.idx - 24), h.idx))) continue;
      const amount = parseFloat(h.num.replace(/,/g, ''));
      if (!(amount > 0)) continue;
      if (out.some(o => o.idx === h.idx)) continue;
      const raw = /^[A-Z]{3}$/.test(h.cur) ? `${h.cur} ${h.num}` : /^(원|円)$/.test(h.cur) ? `${h.num}${h.cur}` : `${h.cur}${h.num}`;
      out.push({ idx: h.idx, amount, currency: CUR_TOKENS[h.cur] !== undefined ? CUR_TOKENS[h.cur] : null, raw });
    }
    return out;
  }

  /* ---------- 키워드 ---------- */
  const IGNORE = /(\botp\b|one[- ]?time|verification code|인증\s?번호|비밀번호|결제\s?예정|청구\s?(금액|예정)|statement|minimum payment|payment due|due date|reminder|declined|unsuccessful|failed|거절|실패|한도\s?초과|이벤트|혜택|쿠폰|coupon|promo|% off|\boffer\b)/i;
  const INCOME = /(received|credited|incoming|refund|reversal|cashback received|환불|입금|승인\s?취소|결제\s?취소|출금\s?취소|취소\s?승인|매출\s?취소)/i;
  // 환불·결제취소: 이전 지출을 되돌리는 알림 (단순 입금과 구분)
  const REFUND = /(refund|reversal|reversed|cancell?ed|cancellation|\bvoid(ed)?\b|환불|(?:승인|결제|구매|주문|거래|매출|출금|사용)[가이]?\s?취소|취소\s?(?:승인|완료|처리)|[\d,]+원\s+\S.*\s취소$)/i;
  // 취소 '수수료'는 환불이 아니라 지출
  const NOT_REFUND = /(cancell?ation fee|cancel fee|no[- ]show fee|취소\s?수수료|위약금)/i;
  const EXPENSE = /(spent|paid|payment|purchase|transaction|\btxn\b|charged|debited|\bdebit\b|was used|used at|card ending|you sent|sent \S+ to|transferred|transfer of|paynow|승인|결제|사용|출금|이체|일시불|할부|체크카드|신용카드)/i;

  /* ---------- 가맹점 ---------- */
  const STOP_EN = '(?=\\s+(?:on|using|with|via|if|for|ref|from|at|is|was|has|have|been|will)\\b|\\s+\\d{1,2}[\\/\\-.]\\d{1,2}|\\s*\\(|[.;,]\\s|[.;,]?\\s*$|\\s+-\\s|\\s*\\|)';
  const STOP_KO = '(?=\\s*(?:누적|잔액|잔고|사용가능)|\\s+(?:일시|금액|카드)\\s*[:：]|\\s+[^\\s:：]+\\s*[:：]|$)';
  const MERCHANT_PATTERNS = [
    // 가맹점: 스타벅스 / Merchant: GRAB
    new RegExp('(?:가맹점|사용처|merchant)\\s*[:：]\\s*(.+?)' + STOP_KO, 'gi'),
    new RegExp('\\bat\\s+([^\\n]+?)' + STOP_EN, 'gi'),
    new RegExp('\\b(?:paid|sent|transfer(?:red)?(?:\\s+of)?|payment(?:\\s+of)?)\\s+(?:\\S+\\s+)?to\\s+([^\\n]+?)' + STOP_EN, 'gi'),
    new RegExp('\\bto\\s+([^\\n]+?)' + STOP_EN, 'gi'),
    new RegExp('\\bfrom\\s+([^\\n]+?)' + STOP_EN, 'gi'),
    // 계좌 입출금 (KB스타뱅킹 등): 11/18 09:59 123456**789 카카오_택 체크카드출금 8,000 잔액…
    new RegExp('\\d+\\*+\\d+\\s+(.+?)\\s+\\S*(?:출금|입금|이체)(?:\\s?취소)?\\s+[\\d,]+', 'g'),
    // 카드 앱 (KB Pay 등): 11/24 18:42 11,586원 행복온누리약국 사용 / … 취소
    /[\d,]+원\s+(.+?)\s+(?:(?:사용|승인|결제)(?:\s?취소)?|취소)$/g,
    // 11/17 12:34 스타벅스 누적…
    new RegExp('\\d{1,2}[\\/.-]\\d{1,2}\\s+\\d{1,2}:\\d{2}\\s+([^\\n]+?)' + STOP_KO, 'g'),
    // 12,000원 일시불 스타벅스
    new RegExp('(?:일시불|할부\\s?\\d*\\s?(?:개월)?)\\)?\\s*([^\\d\\s][^\\n]*?)' + STOP_KO, 'g'),
    // 스타벅스에서 12,000원 결제
    /((?:[^\s\d,.|\]]+\s)?[^\s\d,.|\]]+)에서\s*(?:[\d,.]+\s*원|결제|사용|승인)/g,
    // 결제 | 스타벅스
    /(?:결제|승인|사용)\s*[|·]\s*([^\n|]+)/g,
    // 스타벅스 결제가 취소됐어요
    /(?:^|\]\s*)([^\d\s[\]][^\n]{0,24}?)\s+(?:결제|승인|구매|주문|거래)[가이]?\s?취소/g,
  ];
  const GENERIC_TITLE = /(payment|transaction|alert|notification|successful|success|approved|card|bank|결제|승인|알림|입금|출금|카드|은행|뱅크|이체|완료|web발신|문자)/i;

  function cleanMerchant(s) {
    if (!s) return '';
    let m = s
      .replace(/\b(?:card|카드)\s*(?:ending|끝자리)?\s*\d{3,4}\b.*/i, '')
      .replace(/\s+(?:singapore|sgp|sg|sin|kr|kor|seoul)\b.*$/i, '')
      .replace(/^(?:체크카드|신용카드|카드|통장|계좌)\s+/, '')
      .replace(/[*#]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s:,.\-–|()]+|[\s:,.\-–|(]+$/g, '')
      .trim();
    if (/^\d/.test(m) || m.length < 2) return '';
    if (/^(your|the|you|a|an|account|card|this|me|us)\b/i.test(m)) return '';
    return m.slice(0, 40);
  }

  function findMerchant(text, title) {
    for (const re of MERCHANT_PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const c = cleanMerchant(m[1]);
        if (c) return c;
      }
    }
    const t = (title || '').trim();
    if (t && t.length <= 30 && !GENERIC_TITLE.test(t) && !/\d{3,}/.test(t)) return t;
    return '';
  }

  /**
   * 알림 하나를 분석합니다.
   * @param {{title?:string,text?:string}} n
   * @returns {{ok:true,type:'expense'|'income',refund:boolean,amount:number,currency:string|null,amounts:Array,merchant:string}|{ok:false,reason:string}}
   *   refund=true: 환불·결제취소 (type은 'income'), refund=false & type='income': 단순 입금
   */
  function parse(n) {
    const title = String((n && n.title) || '').replace(/\s+/g, ' ').trim();
    const body = String((n && n.text) || '').replace(/\s+/g, ' ').trim();
    const text = title && !body.includes(title) ? `${title} ${body}`.trim() : body || title;
    if (!text) return { ok: false, reason: '내용 없음' };
    if (IGNORE.test(text)) return { ok: false, reason: '결제 내역이 아닌 알림 (인증·안내·실패 등)' };
    const amounts = findAmounts(text);
    if (!amounts.length) return { ok: false, reason: '금액을 찾지 못함' };
    const refund = REFUND.test(text) && !NOT_REFUND.test(text);
    const income = refund || (INCOME.test(text) && !NOT_REFUND.test(text));
    if (!income && !EXPENSE.test(text)) return { ok: false, reason: '결제·입금 관련 단어가 없음' };
    return {
      ok: true,
      type: income ? 'income' : 'expense',
      refund,
      amount: amounts[0].amount,
      currency: amounts[0].currency,
      amounts,
      merchant: findMerchant(body, title) || findMerchant(text, ''),
    };
  }

  /* ---------- 카테고리 추정 ---------- */
  const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  const KEYWORDS = [
    ['food', /grab\s?food|foodpanda|deliveroo|mcdonald|kfc|burger|subway|kopitiam|koufu|food ?(court|republic)|restaurant|hawker|bistro|kitchen|식당|배달의민족|배민|요기요|쿠팡이츠|김밥|치킨|분식|맥도날드|버거/i],
    ['cafe', /starbucks|coffee|cafe|café|toast ?box|ya ?kun|luckin|bubble ?tea|boba|bakery|스타벅스|커피|카페|이디야|투썸|메가커피|빽다방|컴포즈|베이커리|파리바게뜨|뚜레쥬르/i],
    ['transport', /\bgrab\b(?!\s?(food|mart|pay))|gojek|tada|comfort|\bcdg\b|taxi|transit ?link|simply ?go|\bbus\b|\bmrt\b|ez-?link|카카오[\s_]?(?:t|택)|택시|버스|지하철|코레일|ktx|srt|티머니|주유|\bshell\b|esso|caltex|\bspc\b|parking|주차/i],
    ['living', /ntuc|fair ?price|cold storage|giant|sheng siong|don ?don ?donki|daiso|7-?eleven|cheers|grab ?mart|redmart|이마트|홈플러스|롯데마트|다이소|gs25|\bcu\b|세븐일레븐|편의점|마트/i],
    ['shopping', /shopee|lazada|amazon|taobao|uniqlo|zara|h&m|ikea|qoo10|쿠팡|무신사|11번가|지마켓|g마켓|올리브영|에이블리|지그재그/i],
    ['phone', /singtel|starhub|\bm1\b|circles|giga|simba|\bskt\b|\bkt\b|lg ?u\+|알뜰폰|통신/i],
    ['health', /guardian|watsons|clinic|hospital|pharmacy|dental|polyclinic|medical|병원|약국|의원|치과|한의원|외과|내과|피부과|이비인후과/i],
    ['beauty', /hair|salon|barber|\bnails?\b|\bspa\b|beauty|\blash(es)?\b|\bbrows?\b|waxing|미용|헤어|네일|바버|왁싱|속눈썹|뷰티|피부관리|에스테틱/i],
    ['leisure', /netflix|spotify|disney|youtube|steam|playstation|nintendo|cinema|golden village|\bgv\b|shaw|cathay|cgv|롯데시네마|메가박스|영화|멜론|티빙|왓챠/i],
    ['travel', /airbnb|agoda|booking\.com|expedia|trip\.com|hotel|scoot|singapore airlines|airasia|jetstar|klook|항공|호텔|여기어때|야놀자/i],
    ['housing', /\brent\b|월세|관리비|sp services|sp group|utilities|town council|전기요금|도시가스|수도요금/i],
    ['edu', /udemy|coursera|kinokuniya|popular book|book ?store|교보|서점|yes24|알라딘|학원/i],
  ];
  const INCOME_KEYWORDS = [
    ['salary', /salary|payroll|급여|월급/i],
    ['refund', /refund|reversal|cashback|환불|취소/i],
    ['interest', /interest|dividend|이자|배당/i],
  ];

  /**
   * @param {string} merchant
   * @param {'expense'|'income'} type
   * @param {Array<{type:string,cat:string,memo:string}>} history 최근 순
   * @param {Array<{id:string,name:string}>} cats 해당 유형의 카테고리 목록
   * @param {string} text 알림 전체 문구 (수입 키워드용)
   */
  function guessCategory(merchant, type, history, cats, text) {
    const has = id => cats.some(c => c.id === id);
    const key = normKey(merchant).slice(0, 14);
    if (key.length >= 3) {
      for (const t of history) {
        if (t.type !== type || !has(t.cat)) continue;
        const k = normKey(t.memo).slice(0, 14);
        if (k.length >= 3 && (k === key || k.startsWith(key) || key.startsWith(k))) return t.cat;
      }
    }
    if (type === 'income') {
      const hay = `${merchant} ${text || ''}`;
      for (const [id, re] of INCOME_KEYWORDS) if (has(id) && re.test(hay)) return id;
    } else if (merchant) {
      for (const [id, re] of KEYWORDS) if (has(id) && re.test(merchant)) return id;
    }
    const etc = cats.find(c => c.name === '기타');
    return (etc || cats[cats.length - 1] || {}).id || '';
  }

  const api = { parse, guessCategory, normKey, findAmounts, findMerchant };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GagyebuNotif = api;
})(typeof window !== 'undefined' ? window : globalThis);
