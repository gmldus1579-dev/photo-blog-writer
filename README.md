# 사진 기반 블로그 포스팅 생성기

음식점 사진 여러 장과 간단한 메모를 입력하면, 서버에서 OpenAI Responses API로 이미지를 분석하고 자연스러운 한국어 블로그 포스팅을 생성하는 앱입니다.

## 구성

- Frontend: `index.html`, `style.css`, `app.js`
- Backend: `server.js`
- Runtime: Node.js + Express
- AI: OpenAI Responses API, `gpt-4o-mini`
- API Key: 서버 `.env`의 `OPENAI_API_KEY` 사용

## 기능

- jpg, png, webp 이미지 업로드
- 이미지 최대 20장 제한
- 카테고리 선택: 물건추천 / 맛집추천
- 글 종류 선택: 정보형 / 추천형 / 후기형 / 비교형
- 주제, 대표 키워드, 메모 입력
- 최신 정보 검색 반영 on/off: 켜면 현재 날짜 기준으로 최근 정보가 필요한 부분을 검색해 반영
- 글자 수 선택: 1500자 / 2000자
- 제목 5개, 본문, 해시태그 10개 생성

## 실행 방법

1. 패키지를 설치합니다.

```bash
npm install
```

2. `.env.example`을 참고해서 `.env` 파일을 만듭니다.

```bash
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

3. 서버를 실행합니다.

```bash
npm start
```

4. 브라우저에서 접속합니다.

```text
http://localhost:3000
```

## 사용 방법

1. 음식점 사진을 업로드합니다.
2. 글 종류에서 `추천형`, `후기형`, `비교형`, `정보형` 중 하나를 선택합니다.
3. 주제, 대표 키워드, 메모를 입력합니다.
4. 글자 수를 선택합니다.
5. `블로그 포스팅 생성` 버튼을 누릅니다.
6. 생성된 결과를 복사해 블로그에 활용합니다.

## 보안

- API Key는 프론트엔드에 절대 노출하지 않습니다.
- `.env` 파일은 커밋하거나 공유하지 마세요.
- 서버가 `.env`의 `OPENAI_API_KEY`를 사용해 OpenAI API를 호출합니다.

## 참고

- `file://`로 직접 열면 서버 API를 사용할 수 없습니다.
- 반드시 `npm start` 후 `http://localhost:3000`에서 사용하세요.
