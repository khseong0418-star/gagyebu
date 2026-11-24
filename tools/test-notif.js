// 알림 분석기 테스트.  실행: node tools/test-notif.js
// 문구는 각 은행·카드사 알림의 일반적인 형식을 본뜬 예시입니다 (실제 문구는 앱 버전에 따라 다를 수 있음).
const N = require('../docs/notif.js');

const EXP = [
  { id: 'food', name: '식비' }, { id: 'cafe', name: '카페·간식' }, { id: 'transport', name: '교통' },
  { id: 'housing', name: '주거·관리비' }, { id: 'phone', name: '통신' }, { id: 'living', name: '생활용품' },
  { id: 'shopping', name: '쇼핑' }, { id: 'health', name: '의료·건강' }, { id: 'beauty', name: '미용' }, { id: 'leisure', name: '문화·여가' },
  { id: 'travel', name: '여행' }, { id: 'edu', name: '교육' }, { id: 'gift', name: '경조사·선물' }, { id: 'etc_e', name: '기타' },
];
const INC = [
  { id: 'salary', name: '급여' }, { id: 'bonus', name: '상여' }, { id: 'interest', name: '이자·투자' },
  { id: 'refund', name: '환급' }, { id: 'allowance', name: '용돈' }, { id: 'etc_i', name: '기타' },
];

const cases = [
  // ---- OCBC / UOB / Citi (문자·앱 알림) ----
  { app: 'Messages', title: 'OCBC', text: 'OCBC: Your OCBC card ending 1234 was used for SGD 23.50 at FAIRPRICE XTRA - JURONG on 17/11/2026 12:30 PM. If unauthorised, call 1800 363 3333.',
    want: { type: 'expense', amount: 23.5, currency: 'SGD', merchant: 'FAIRPRICE XTRA', cat: 'living' } },
  { app: 'Messages', title: '72222', text: 'A transaction of SGD 12.80 was made with your UOB Card ending 5678 on 17/11/26 at GRAB*FOOD. If unauthorised, call 24/7 Fraud Hotline now',
    want: { type: 'expense', amount: 12.8, currency: 'SGD', merchant: 'GRAB FOOD', cat: 'food' } },
  { app: 'Citi Mobile', title: 'Citi Alerts', text: 'A purchase of SGD 45.00 was charged to your Citi card ending 9999 at NETFLIX.COM on 17 Nov 2026.',
    want: { type: 'expense', amount: 45, currency: 'SGD', merchant: 'NETFLIX.COM', cat: 'leisure' } },
  { app: 'OCBC', title: 'Transaction alert', text: 'SGD 12.50 debited from your account 601-123456-001. Avail bal SGD 1,234.56',
    want: { type: 'expense', amount: 12.5, currency: 'SGD' } },
  { app: 'UOB TMRW', title: 'PayNow', text: 'You have sent SGD 50.00 to JOHN TAN via PayNow.',
    want: { type: 'expense', amount: 50, currency: 'SGD', merchant: 'JOHN TAN', cat: 'etc_e' } },
  { app: 'OCBC', title: 'PayNow received', text: 'You have received SGD 100.00 from ALICE LIM via PayNow.',
    want: { type: 'income', amount: 100, currency: 'SGD', merchant: 'ALICE LIM', cat: 'etc_i' } },
  { app: 'OCBC', title: 'Incoming funds', text: 'SALARY credited SGD 5,200.00 to your account 601-123456-001.',
    want: { type: 'income', amount: 5200, currency: 'SGD', cat: 'salary' } },
  // ---- Grab / YouTrip / Trust ----
  { app: 'Grab', title: 'Payment successful', text: "You've paid S$8.90 to Hawker Chan using GrabPay Wallet.",
    want: { type: 'expense', amount: 8.9, currency: 'SGD', merchant: 'Hawker Chan', cat: 'food' } },
  { app: 'Grab', title: 'Thanks for riding with Grab', text: 'You paid S$14.20 for your ride. Charged to Mastercard 1234.',
    want: { type: 'expense', amount: 14.2, currency: 'SGD' } },
  { app: 'YouTrip', title: 'YouTrip', text: 'You spent SGD 15.00 at UNIQLO ION ORCHARD',
    want: { type: 'expense', amount: 15, currency: 'SGD', merchant: 'UNIQLO ION ORCHARD', cat: 'shopping' } },
  { app: 'YouTrip', title: 'YouTrip', text: 'You spent JPY 1,200 at LAWSON (≈ SGD 10.85)',
    want: { type: 'expense', amount: 1200, currency: 'JPY', merchant: 'LAWSON', alt: { currency: 'SGD', amount: 10.85 } } },
  { app: 'Trust', title: 'Trust', text: 'You spent $6.50 at Toast Box',
    want: { type: 'expense', amount: 6.5, currency: null, merchant: 'Toast Box', cat: 'cafe' } },
  // ---- 한국 카드사·은행 ----
  { app: '메시지', title: '15881688', text: '[Web발신]\nKB국민카드1234승인\n홍*동님\n12,000원 일시불\n11/17 12:34\n스타벅스\n누적1,234,567원',
    want: { type: 'expense', amount: 12000, currency: 'KRW', merchant: '스타벅스', cat: 'cafe' } },
  { app: '신한 SOL페이', title: '신한카드', text: '신한카드(1234)승인 홍*동 32,500원(일시불)11/17 19:02 교촌치킨 누적1,234,567원',
    want: { type: 'expense', amount: 32500, currency: 'KRW', merchant: '교촌치킨', cat: 'food' } },
  { app: '삼성카드', title: '삼성카드 승인', text: '삼성1234승인 홍*동 4,500원 일시불 11/17 08:10 GS25 강남점 누적567,890원',
    want: { type: 'expense', amount: 4500, currency: 'KRW', merchant: 'GS25 강남점', cat: 'living' } },
  { app: '현대카드', title: '현대카드', text: '현대카드 승인 홍*동 89,000원 3개월 할부 11/17 14:20 쿠팡 누적 1,000,000원',
    want: { type: 'expense', amount: 89000, currency: 'KRW', merchant: '쿠팡', cat: 'shopping' } },
  { app: '토스', title: '토스뱅크', text: '스타벅스 강남점에서 6,500원 결제했어요',
    want: { type: 'expense', amount: 6500, currency: 'KRW', merchant: '스타벅스 강남점', cat: 'cafe' } },
  { app: '카카오톡', title: 'KB국민카드', text: '[KB국민카드] 승인 안내\n카드: 1234\n금액: 15,000원\n일시: 11/17 12:34\n가맹점: 카카오T 택시',
    want: { type: 'expense', amount: 15000, currency: 'KRW', merchant: '카카오T 택시', cat: 'transport' } },
  { app: 'KB국민카드', title: 'KB국민카드', text: 'KB국민카드1234 해외승인 홍*동 USD 12.50 11/17 12:34 AMAZON',
    want: { type: 'expense', amount: 12.5, currency: 'USD', merchant: 'AMAZON', cat: 'shopping' } },
  // ---- 환불·결제취소: 지출에서 빼는 항목 (카테고리는 원래 지출처럼 추정) ----
  { app: 'KB국민카드', title: 'KB국민카드', text: 'KB국민카드1234 승인취소 홍*동 12,000원 11/17 12:34 스타벅스',
    want: { type: 'income', refund: true, amount: 12000, currency: 'KRW', merchant: '스타벅스', cat: 'cafe' } },
  { app: '메시지', title: '15447200', text: '[Web발신] 신한카드(1234)취소승인 홍*동 32,500원 11/17 19:40 교촌치킨',
    want: { type: 'income', refund: true, amount: 32500, currency: 'KRW', merchant: '교촌치킨', cat: 'food' } },
  { app: '토스', title: '토스뱅크', text: '스타벅스 강남점 결제가 취소됐어요 6,500원',
    want: { type: 'income', refund: true, amount: 6500, currency: 'KRW', merchant: '스타벅스 강남점', cat: 'cafe' } },
  { app: 'Citi Mobile', title: 'Citi Alerts', text: 'Refund of SGD 12.50 from SHOPEE has been credited to your Citi card ending 9999.',
    want: { type: 'income', refund: true, amount: 12.5, currency: 'SGD', merchant: 'SHOPEE', cat: 'shopping' } },
  { app: 'OCBC', title: 'Transaction reversed', text: 'Your transaction of SGD 45.00 at NETFLIX.COM has been reversed.',
    want: { type: 'income', refund: true, amount: 45, currency: 'SGD', merchant: 'NETFLIX.COM', cat: 'leisure' } },
  { app: 'Grab', title: 'Order cancelled', text: 'Your GrabFood order from Hawker Chan was cancelled. S$8.90 has been refunded to your GrabPay Wallet.',
    want: { type: 'income', refund: true, amount: 8.9, currency: 'SGD', merchant: 'Hawker Chan', cat: 'food' } },
  // ---- KB스타뱅킹 계좌 입출금 알림 (가맹점 이름이 잘려서 옴) ----
  { app: 'KB Star Banking', title: '출금 8,000원', text: '홍*동님 11/18 09:59 123456**789 카카오_택 체크카드출금 8,000 잔액1,234,567',
    want: { type: 'expense', refund: false, amount: 8000, currency: 'KRW', merchant: '카카오_택', cat: 'transport' } },
  { app: 'KB Star Banking', title: '출금 9,400원', text: '홍*동님 11/18 12:15 123456**789 카카오T일 체크카드출금 9,400 잔액1,225,167',
    want: { type: 'expense', amount: 9400, currency: 'KRW', merchant: '카카오T일', cat: 'transport' } },
  { app: 'KB Star Banking', title: '출금 120,000원', text: '홍*동님 11/18 11:54 123456**789 연세튼튼치 체크카드출금 120,000 잔액1,105,167',
    want: { type: 'expense', amount: 120000, currency: 'KRW', merchant: '연세튼튼치' } },
  { app: 'KB Star Banking', title: '출금 33,000원', text: '홍*동님 11/18 17:20 123456**789 준오헤어강 체크카드출금 33,000 잔액1,072,067',
    want: { type: 'expense', amount: 33000, currency: 'KRW', merchant: '준오헤어강', cat: 'beauty' } },
  { app: 'YouTrip', title: 'YouTrip', text: 'You spent SGD 45.00 at NAILS GLAMOUR ORCHARD',
    want: { type: 'expense', amount: 45, currency: 'SGD', merchant: 'NAILS GLAMOUR ORCHARD', cat: 'beauty' } },
  { app: 'YouTrip', title: 'YouTrip', text: 'You spent SGD 8.50 at BROWNIE POINTS BAKERY',
    want: { type: 'expense', amount: 8.5, currency: 'SGD', merchant: 'BROWNIE POINTS BAKERY', cat: 'cafe' } },
  // ---- KB Pay 카드 사용 알림 (가맹점 이름이 온전함 → KB스타뱅킹 출금 알림보다 우선) ----
  { app: 'KB Pay', title: 'KB Pay', text: 'KB국민체크(1234) 홍*동님 11/24 18:42 11,586원 행복온누리약국 사용',
    want: { type: 'expense', amount: 11586, currency: 'KRW', merchant: '행복온누리약국', cat: 'health' } },
  { app: 'KB Pay', title: 'KB Pay', text: 'KB국민체크(1234) 홍*동님 11/24 18:35 30,480원 송도스포츠 정형외과 사용',
    want: { type: 'expense', amount: 30480, currency: 'KRW', merchant: '송도스포츠 정형외과', cat: 'health' } },
  { app: 'KB Pay', title: 'KB Pay', text: 'KB국민체크(1234) 홍*동님 11/19 15:08 6,400원 카카오T택시 취소',
    want: { type: 'income', refund: true, amount: 6400, currency: 'KRW', merchant: '카카오T택시', cat: 'transport' } },
  // 출금취소 = 결제 취소 (가맹점 이름 없이 옴 → 앱에서 같은 금액의 직전 결제를 찾아 맞춤)
  { app: 'KB Star Banking', title: '입금 8,900원', text: '홍*동님 11/18 11:57 123456**789 출금취소 8,900 잔액1,114,067',
    want: { type: 'income', refund: true, amount: 8900, currency: 'KRW', merchant: '' } },
  { app: 'KB Star Banking', title: '입금 50,000원', text: '홍*동님 11/18 13:00 123456**789 김철수 입금 50,000 잔액1,164,067',
    want: { type: 'income', refund: false, amount: 50000, currency: 'KRW' } },
  // 취소 '수수료'는 환불이 아니라 지출
  { app: 'Grab', title: 'Booking cancelled', text: 'A cancellation fee of S$4.00 has been charged to your card ending 1234.',
    want: { type: 'expense', refund: false, amount: 4, currency: 'SGD' } },
  // 단순 입금은 환불 아님 (앱에서 기록 안 함)
  { app: '카카오뱅크', title: '입금', text: '[입금] 1,000,000원 홍길동 잔액 2,345,678원',
    want: { type: 'income', refund: false, amount: 1000000, currency: 'KRW' } },
  // ---- 기록하면 안 되는 알림 ----
  { app: 'OCBC', title: 'OCBC OTP', text: 'Your OTP for transaction of SGD 25.00 at SHOPEE is 123456. Do not share it with anyone.', want: null },
  { app: 'UOB', title: 'UOB', text: 'Your card transaction of SGD 30.00 at XYZ PTE LTD was declined.', want: null },
  { app: 'WhatsApp', title: 'Mum', text: 'Can you buy dinner? I will give you $20 later', want: null },
  { app: '현대카드', title: '현대카드', text: '[현대카드] 12월 결제예정금액은 1,234,000원입니다.', want: null },
  { app: 'Shopee', title: 'Shopee', text: 'Flash sale! 50% off everything, from $1. Shop now!', want: null },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const p = N.parse(c);
  const errs = [];
  if (c.want === null) {
    if (p.ok) errs.push(`기록하면 안 되는데 인식됨: ${JSON.stringify(p)}`);
  } else if (!p.ok) {
    errs.push(`인식 실패: ${p.reason}`);
  } else {
    const w = c.want;
    if (p.type !== w.type) errs.push(`type ${p.type} ≠ ${w.type}`);
    if ('refund' in w && p.refund !== w.refund) errs.push(`refund ${p.refund} ≠ ${w.refund}`);
    if (p.amount !== w.amount) errs.push(`amount ${p.amount} ≠ ${w.amount}`);
    if ('currency' in w && p.currency !== w.currency) errs.push(`currency ${p.currency} ≠ ${w.currency}`);
    if ('merchant' in w && p.merchant !== w.merchant) errs.push(`merchant "${p.merchant}" ≠ "${w.merchant}"`);
    if (w.alt && !p.amounts.some(a => a.currency === w.alt.currency && a.amount === w.alt.amount)) errs.push(`대체 금액 ${w.alt.currency} ${w.alt.amount} 없음`);
    if (w.cat) {
      // 환불은 원래 지출과 같은 카테고리로 추정
      const asExpense = p.type === 'expense' || p.refund;
      const cat = N.guessCategory(p.merchant, asExpense ? 'expense' : 'income', [], asExpense ? EXP : INC, `${c.title} ${c.text}`);
      if (cat !== w.cat) errs.push(`cat ${cat} ≠ ${w.cat}`);
    }
  }
  const label = `${c.app} | ${c.text.replace(/\s+/g, ' ').slice(0, 60)}`;
  if (errs.length) { fail++; console.log(`✗ ${label}\n    ${errs.join('\n    ')}`); }
  else { pass++; console.log(`✓ ${label}`); }
}

// 같은 가맹점 과거 기록이 있으면 그 카테고리를 따름
const hist = [{ type: 'expense', cat: 'gift', memo: 'Hawker Chan' }];
const learned = N.guessCategory('HAWKER CHAN', 'expense', hist, EXP, '');
if (learned === 'gift') { pass++; console.log('✓ 과거 기록 기반 카테고리 추정'); }
else { fail++; console.log(`✗ 과거 기록 기반 카테고리 추정: ${learned}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
