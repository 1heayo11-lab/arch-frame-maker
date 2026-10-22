# ARCH 속성 프레임

사진은 그대로 두고, ARCH 7속성(불·물·바람·번개·얼음·풀·무속성) 이펙트 틀과 코드네임·랭크 프로필을 씌워 **무한루프 GIF / MP4 / PNG**로 저장하는 메이커예요. 빌드 과정 없이 브라우저에서 바로 돌아가는 순수 HTML·CSS·JS라서 GitHub Pages에 그대로 올리면 사이트가 돼요.

## 폴더 구성

```
arch-frame-maker/
├─ index.html        화면 구조
├─ css/style.css     편집기 화면 스타일
├─ js/assets.js      ARCH 시트에서 잘라낸 속성 아이콘·로고·서브마크 (이미지 데이터)
├─ js/engine.js      그리기 엔진 — 틀 이펙트, 메달리온, 프로필, 배경
├─ js/state.js       기본값 — 기본 코드네임, 속성, 랭크, 예시 사진
├─ js/export.js      GIF·MP4·PNG 저장 (X 용량 자동 맞춤)
├─ js/ui.js          편집 패널과 미리보기 조작
└─ .nojekyll         GitHub Pages가 파일을 그대로 쓰게 하는 빈 파일
```

## GitHub에 올리기

1. GitHub에서 **New repository**로 새 저장소를 만들어요. 이름은 예를 들어 `arch-frame`. **Public**으로 만들어야 무료 Pages가 열려요.
2. 저장소 화면에서 **Add file → Upload files**를 눌러요.
3. 압축을 푼 `arch-frame-maker` 폴더 **안의 내용물 전부**(index.html, css, js, README.md, .nojekyll)를 끌어다 놓고 **Commit changes**를 눌러요.
   - 폴더 째로 올리면 주소 뒤에 `/arch-frame-maker/`가 붙어요. 내용물만 올리는 걸 추천해요.
   - `.nojekyll`이 숨김 파일이라 안 보이면 없어도 동작해요.
4. 저장소의 **Settings → Pages**로 가서 **Source: Deploy from a branch**, **Branch: main / (root)**를 고르고 **Save**를 눌러요.
5. 1~2분 뒤 `https://내아이디.github.io/저장소이름/` 주소로 열려요.

수정할 때는 저장소에서 파일을 열고 연필 아이콘으로 고치거나, 같은 이름의 파일을 다시 올리면 덮어써져요.

## 내 컴퓨터에서 보기

`index.html`을 더블클릭하면 바로 열려요. 글꼴(Google Fonts)과 GIF·MP4 인코더(jsDelivr)를 인터넷에서 불러오므로 인터넷 연결은 필요해요.

## 기본값 바꾸기

처음 열었을 때 나오는 값은 `js/state.js`의 `defaultState()`에 있어요.

| 바꾸고 싶은 것 | 위치 |
| --- | --- |
| 기본 코드네임 (RABBIT · EDEN · SANTA · PEACH) | `slots` 안의 `name` |
| 사진별 속성 | `slots` 안의 `attr` — `fire` `water` `wind` `lightning` `ice` `grass` `neutral` |
| 센티넬 / 가이드 | `slots` 안의 `cls` — `sentinel` `guide` `none` |
| 랭크 | `slots` 안의 `rank` — `F` `E` `D` `C` `B` `A` `S` `SS` |
| 투샷 오른쪽 인물 | 1번 슬롯의 `p2` |
| 상단·하단 문구 | `texts` |
| 바탕 | `tone` — `obsidian`(다크) `album`(화이트) `attr`(속성 그라데이션) `custom`(색 선택) |

한 번이라도 편집한 브라우저는 작업 내용이 저장돼 있어서 기본값이 바로 안 보일 수 있어요. 화면 오른쪽 위 **처음 상태로**를 두 번 누르면 기본값으로 돌아가요.

## 저장 방식

- 편집 중인 설정과 넣은 사진은 그 브라우저 안(IndexedDB)에만 저장돼요. 서버로 보내지 않아요.
- GIF는 X 웹(15MB)·앱(5MB) 용량에 맞게 크기와 프레임을 자동으로 줄여요.
- MP4는 크롬·사파리 최신 버전에서 가장 잘 만들어져요. 지원하지 않는 브라우저에서는 WebM으로 저장될 수 있어요.

## 외부에서 불러오는 것

- 글꼴: Google Fonts
- GIF 인코더: `gifenc@1.0.3` (jsDelivr)
- MP4 묶음: `mp4-muxer@5.2.1` (jsDelivr)
