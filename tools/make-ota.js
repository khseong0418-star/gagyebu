#!/usr/bin/env node
/*
 * 폰에서 바로 받는 업데이트(앱 화면 코드) 묶음 만들기.
 *
 *   node tools/make-ota.js           docs/ota/latest.json + docs/ota/bundle-<버전>.json 생성
 *   node tools/make-ota.js --keygen  서명 키 처음 만들기 (android/ota-key.pem, git에 올리지 않음)
 *
 * 안드로이드 앱(Ota.java)은 android/ota-key.pem 의 짝인 공개키로 서명을 확인한 묶음만 받아들입니다.
 * 버전은 docs/app.js 의 APP_VERSION, 필요한 앱 본체 versionCode 는 MIN_NATIVE 를 읽습니다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(DOCS, 'ota');
const KEY = path.join(ROOT, 'android', 'ota-key.pem');
// 묶음에 넣지 않는 것: APK, 웹 전용 서비스워커, 업데이트 파일 자신
const SKIP = new Set(['gagyebu.apk', 'sw.js', 'ota']);

function fail(msg) {
  console.error('오류: ' + msg);
  process.exit(1);
}

function publicKeyB64(priv) {
  return crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64');
}

if (process.argv.includes('--keygen')) {
  if (fs.existsSync(KEY)) fail(`${KEY} 가 이미 있어요. 새로 만들면 지금 설치된 앱이 업데이트를 받지 못해요.`);
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  fs.writeFileSync(KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log('서명 키를 만들었어요:', KEY);
  console.log('Ota.java 의 PUBLIC_KEY 에 넣을 값:\n' + publicKeyB64(privateKey));
  process.exit(0);
}

if (!fs.existsSync(KEY)) fail('android/ota-key.pem 이 없어요 (OneDrive 백업에서 되살리거나 --keygen).');
const priv = crypto.createPrivateKey(fs.readFileSync(KEY));

const app = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8');
const version = (app.match(/const APP_VERSION = '(\d+\.\d+\.\d+)'/) || [])[1];
const minNative = Number((app.match(/const MIN_NATIVE = (\d+)/) || [])[1]);
if (!version) fail('docs/app.js 에서 APP_VERSION 을 찾지 못했어요.');
if (!(minNative > 0)) fail('docs/app.js 에서 MIN_NATIVE 를 찾지 못했어요.');
const sw = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
if (!sw.includes(`'gagyebu-v${version}'`)) console.warn(`주의: docs/sw.js 의 CACHE 가 gagyebu-v${version} 이 아니에요 (웹앱 업데이트용).`);

// Ota.java 가 받아들이는 경로 모양과 같아야 함
const PATH_OK = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const files = {};
(function walk(dir, rel) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (!rel && SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (fs.statSync(p).isDirectory()) walk(p, r);
    else {
      if (!PATH_OK.test(r)) fail(`파일 이름에 쓸 수 없는 글자가 있어요: ${r}`);
      files[r] = fs.readFileSync(p).toString('base64');
    }
  }
})(DOCS, '');
for (const must of ['index.html', 'app.js']) if (!files[must]) fail(`${must} 가 없어요.`);

const bundle = Buffer.from(JSON.stringify({ version, minNative, created: new Date().toISOString(), files }));
const sig = crypto.sign('sha256', bundle, priv);
if (!crypto.verify('sha256', bundle, crypto.createPublicKey(priv), sig)) fail('서명 확인 실패');

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^bundle-.*\.json$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const bundleName = `bundle-${version}.json`;
fs.writeFileSync(path.join(OUT, bundleName), bundle);
const latest = {
  version,
  minNative,
  bundle: bundleName,
  size: bundle.length,
  sha256: crypto.createHash('sha256').update(bundle).digest('hex'),
  sig: sig.toString('base64'),
};
fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(latest, null, 2) + '\n');

console.log(`v${version} 업데이트 묶음을 만들었어요 (파일 ${Object.keys(files).length}개, ${(bundle.length / 1024).toFixed(0)}KB, 앱 본체 ${minNative} 이상).`);
console.log('공개키:', publicKeyB64(priv));
