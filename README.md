# 가계부 (Galaxy S22+용)

개인 가계부. 같은 화면 코드로 두 가지 형태를 제공합니다.

| | 웹앱 (PWA) | 안드로이드 앱 (APK) |
|---|---|---|
| 설치 | Chrome에서 https://khseong0418-star.github.io/gagyebu/ → 앱 설치 | 같은 주소의 `gagyebu.apk` 내려받아 설치 |
| **결제 알림 자동 기록** | ✗ (웹은 다른 앱 알림을 못 읽음) | ✅ |
| 데이터 위치 | 폰의 Chrome 저장소 | 앱 저장소 |

**데이터는 폰 안에만 저장되며 어디로도 전송되지 않습니다.** 웹앱과 APK의 데이터는 서로 따로이니, 옮길 때는 백업 → 복원을 쓰세요.

## 기능
- **내역**: 지출/수입 기록 (금액·카테고리·날짜·결제수단·메모), 날짜별 묶음, 전체/지출/수입 필터, 전체 기간 검색
- **월 예산**: 사용률 막대, 남은 금액, "남은 n일 동안 하루 얼마" 안내, 카테고리별 예산과 초과 경고
- **달력**: 날짜별 수입/지출 합계, 날짜를 누르면 그날 내역과 바로 추가
- **통계**: 최근 6개월 추이, 전월 대비 증감, 카테고리별 비중(누르면 해당 내역)
- **매월 반복**: 월세·통신비·급여 등을 매달 같은 날 자동 기록 (31일 설정 시 짧은 달은 말일)
- **관리**: 카테고리(이모지 아이콘)·결제수단 추가/편집/순서 변경, 통화(SGD/KRW/USD/EUR/JPY), 라이트/다크 테마
- **백업**: JSON 백업을 Google Drive·메일 등으로 공유 또는 파일 저장, 복원, CSV(엑셀) 내보내기
- 좌우 스와이프로 월 이동, 뒤로가기 제스처로 창 닫기

## 결제 알림 자동 기록 (APK)
은행·카드·결제 앱의 알림과 은행 문자를 읽어 금액·가맹점을 찾아 자동으로 기록합니다.
- 인식 대상 예: OCBC·UOB·Citi 카드/PayNow 알림·문자, Grab·YouTrip·Trust, KB·신한·삼성·현대카드 승인 문자, 토스, 카카오톡 알림톡
- 무시: OTP·인증번호, 결제 실패/거절, 결제 예정·청구 안내, 광고, 채팅 (금액이 없으면 아예 저장 안 함)
- 카테고리: 같은 가맹점의 이전 기록을 따라가고, 처음 보는 곳은 이름(GrabFood→식비, NTUC→생활용품 등)으로 추정, 모르면 '기타'
- 다른 통화: 알림에 SGD 금액이 같이 있으면(YouTrip 등) 그 금액 사용, 없으면 설정한 환율로 환산, 환율이 없으면 **확인 필요**에 모아 둠
- 중복: 같은 결제가 문자와 앱 알림으로 두 번 와도 10분 안 같은 금액·가맹점이면 한 번만 기록
- 설정 → 결제 알림 자동 기록 → **인식 기록**에서 모든 처리 결과 확인, 엉뚱한 앱은 '이 앱 무시'
- 설정 → **알림 문구 테스트**에 실제 알림 문구를 붙여 넣으면 어떻게 기록될지 미리 볼 수 있음 (웹앱에서도 가능)

### APK 설치 (처음 한 번)
1. 폰 Chrome에서 https://khseong0418-star.github.io/gagyebu/gagyebu.apk 열기 → 다운로드 → 열기
2. "출처를 알 수 없는 앱" 경고 → **설정** → **이 출처 허용** → 설치 (Play 프로텍트 경고가 나오면 **무시하고 설치**)
3. 앱을 열면 **알림 접근 권한** 안내가 뜸 → **알림 접근 설정 열기** → 가계부 켜기
   - 스위치가 막혀 있으면(**제한된 설정**): 안내의 **앱 정보 열기** → 오른쪽 위 ⋮ → **제한된 설정 허용** → 다시 켜기
4. 기존 웹앱 기록 옮기기: 웹앱 설정 → **백업 파일 저장** → APK 설정 → **백업에서 복원** → 다운로드 폴더의 `gagyebu-backup-….json` 선택
5. 옮긴 뒤 웹앱은 홈 화면에서 지워도 됩니다

### APK 업데이트
앱 설정 → **앱 업데이트 받기** → 새 APK 설치 (같은 서명이라 덮어쓰기 설치되고 기록은 그대로).

## 개발

### 웹 (docs/)
```bash
node serve.js
```
http://localhost:5180 에서 확인. `docs/` 수정 후 `docs/sw.js`의 `CACHE` 버전을 올리고 커밋·push 하면 1~2분 뒤 Pages에 반영됩니다.

알림 분석기 테스트:
```bash
node tools/test-notif.js
```

### 안드로이드 (android/)
WebView로 `docs/`를 그대로 띄우고(빌드 시 APK 안에 복사), 알림 리스너가 금액이 든 알림을 모아 웹앱에 넘깁니다.
분석(결제 여부·금액·가맹점·카테고리)은 모두 `docs/notif.js`가 합니다.

빌드 도구는 `%USERPROFILE%\android-dev` (JDK 17, Android SDK 34, Gradle 8.7)에 있습니다.
```bash
cd android && JAVA_HOME="$USERPROFILE/android-dev/jdk" ./gradlew.bat assembleRelease && cp app/build/outputs/apk/release/app-release.apk ../docs/gagyebu.apk
```
- 버전을 올릴 때 `android/app/build.gradle`의 `versionCode`(+1)·`versionName`과 `docs/app.js`의 `APP_VERSION`을 함께 바꾸세요.
- **서명 키 `android/release.jks`와 `android/keystore.properties`는 git에 올리지 않습니다 (OneDrive에만 보관).** 이 키를 잃으면 업데이트를 덮어쓰기 설치할 수 없어 앱을 지우고(백업 후) 다시 설치해야 합니다.

## 파일 구조
```
docs/                 ← GitHub Pages로 공개되는 앱 (+ APK 안에도 그대로 들어감)
  index.html          화면 뼈대
  style.css           디자인 (라이트/다크)
  app.js              앱 로직 전체 (안드로이드 연결 포함)
  notif.js            결제 알림 문구 분석기
  sw.js               오프라인 캐시 (웹 전용)
  manifest.webmanifest 설치 정보
  icons/              앱 아이콘
  gagyebu.apk         안드로이드 앱
android/              안드로이드 앱 (WebView + 알림 리스너, Java)
serve.js              로컬 테스트 서버
tools/make-icons.js   아이콘 생성기 (웹·안드로이드)
tools/test-notif.js   알림 분석기 테스트
```
