const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const multer = require("multer");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT || 3000);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 20,
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("jpg, png, webp 이미지만 업로드할 수 있습니다."));
      return;
    }
    cb(null, true);
  },
});

app.use(express.static(__dirname));

app.post("/api/generate", (req, res) => {
  upload.array("images", 20)(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        const error = new Error(uploadError.message || "이미지 업로드 중 문제가 발생했습니다.");
        error.status = 400;
        throw error;
      }

      ensureApiKey();
      validateRequest(req);

      const result = await generateBlogPost({
        fields: req.body,
        files: req.files,
      });

      res.json({ result });
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message || "블로그 포스팅 생성 중 문제가 발생했습니다.",
      });
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`OPENAI_API_KEY loaded: ${Boolean(process.env.OPENAI_API_KEY)}`);
  console.log(`Photo blog writer running at http://localhost:${port}`);
});

async function generateBlogPost({ fields, files }) {
  const useWebSearch = shouldUseWebSearch(fields);
  const content = [
    {
      type: "input_text",
      text: buildPrompt(fields, files.length, useWebSearch),
    },
    ...files.map((file) => ({
      type: "input_image",
      image_url: toDataUrl(file),
      detail: "auto",
    })),
  ];

  const requestBody = {
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content,
      },
    ],
    max_output_tokens: outputTokenLimit(fields.length),
  };

  if (useWebSearch) {
    requestBody.tools = [{ type: process.env.OPENAI_WEB_SEARCH_TOOL || "web_search_preview" }];
    requestBody.tool_choice = "auto";
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await response.text();
  const data = parseJsonResponse(rawText, response.status);

  if (!response.ok) {
    const error = new Error(data.error?.message || "OpenAI API 요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }

  return extractOutputText(data);
}

function buildPrompt(fields, imageCount, useWebSearch) {
  const category = normalizeCategory(fields.category);
  const topic = clean(fields.topic);
  const keywords = clean(fields.keywords);
  const memo = clean(fields.memo);
  const postType = normalizePostType(fields.postType);
  const length = ["1500", "2000"].includes(fields.length) ? fields.length : "1500";
  const requiredSections = Array.from({ length: imageCount }, (_, index) => index + 1).join(", ");
  const bodyTemplate = Array.from(
    { length: imageCount },
    (_, index) => `${index + 1}\n${index === 0 ? "방문 시작 흐름" : "앞 번호에서 자연스럽게 이어지는 방문 경험"}`,
  ).join("\n\n");

  return buildPromptByType({
    postType,
    category,
    imageCount,
    topic,
    keywords,
    memo,
    length,
    requiredSections,
    bodyTemplate,
    useWebSearch,
  });
}

function buildPromptByType({ postType, category, imageCount, topic, keywords, memo, length, requiredSections, bodyTemplate, useWebSearch }) {
  const guide = postTypeGuide(postType);
  const categoryGuide = categoryPromptGuide(category);
  const mainKeyword = keywords || topic;

  return `
너는 한국어 네이버 블로그 글을 쓰는 에디터야.
사용자가 업로드한 사진 ${imageCount}장을 직접 분석하고, 아래 입력값과 글 종류를 반영해서 블로그 포스팅을 작성해.
사진 이름이나 파일명은 사용하지 말고, 업로드된 순서대로 1, 2, 3 번호를 사용해 방문 흐름을 구성해.

[사용자 입력]
- 카테고리: ${categoryGuide.name}
- 글 종류: ${guide.name}
- 주제: ${topic}
- 메인 키워드: ${mainKeyword}
- 사용자가 넣고 싶은 메모: ${memo || "없음"}
- 목표 글자 수: 본문 기준 약 ${length}자
- 말투: 담백하고 현실적인 네이버 블로그 말투

[카테고리 방향]
${categoryGuide.prompt}

[글 종류별 방향]
${guide.prompt}

[최신 정보 검색 반영]
${webSearchPrompt(useWebSearch)}

[반드시 먼저 내부적으로 할 일]
- 카테고리에 맞춰 사진을 분석해.
- 물건추천이면 제품명, 브랜드, 가격, 용량, 구성, 사용 주기, 사용 방법, 기능성 문구, 주의사항, 추천 대상, 아쉬운 점을 분석해.
- 맛집추천이면 음식, 메뉴, 분위기, 공간감, 주문 흐름, 방문 포인트를 분석해.
- 패키지나 라벨에 적힌 글자가 보이면 적극적으로 읽어서 반영해.
- 제품 사진은 포장지 방향에 따라 전면, 측면, 후면에 적힌 정보를 구분해서 읽어.
- 제품명, 가격, 용량, 개수, 사용 주기, 성분, 기능성 문구, 주의사항은 사진에서 확인되는 표기 그대로 반영해.
- 사진에서 정확히 읽히지 않는 가격, 용량, 개수, 성분, 사용법은 절대 추측하지 마. "사진상 정확한 표기는 확인이 어려웠어요"처럼 써.
- 사진에 없는 가격이나 용량을 임의로 만들지 마.
- 예를 들어 가격이 사진에 안 보이면 6,000원, 5,000원처럼 숫자를 만들어 쓰지 마.
- 제품명도 포장지에 적힌 순서와 표현을 최대한 그대로 사용해.
- 사진이 기울어져 있거나 일부가 잘렸다면, 보이는 부분만 기준으로 써.
- 구매하거나 실제 사용했다고 단정하지 마. 사진과 메모 기준으로 확인한 후기/추천/정보처럼 작성해.
- 메모에 실제 구매/사용했다는 말이 없으면 구매, 결제, 집에 와서 사용, 직접 써봄, 며칠 써봄, 사용 후 변화 같은 경험을 절대 지어내지 마.
- 단, 최종 출력에서는 분석 결과를 항목별로 나열하지 말고 본문 속에 자연스럽게 녹여.

[작성 규칙]
- AI가 사진을 단순 설명하는 글이 아니라 실제 방문자가 경험을 회상하듯 작성해.
- 기계적인 문장 금지.
- 사진 속 사물을 줄줄이 나열하지 않기.
- "사진에는 ~가 보입니다" 같은 표현 금지.
- "첫 번째 사진", "두 번째 사진", "사진에서 보이는 것처럼", "사진 속", "이미지에서", "업로드된 사진" 같은 표현은 절대 사용하지 마.
- 사진을 설명하지 말고, 실제 방문 경험을 자연스럽게 회상하듯 작성해.
- 블로그 작가처럼 정돈해서 쓰지 말고, 실제 일반인이 네이버에 올리는 후기처럼 작성해.
- 너무 정리된 문장보다 현실적인 말투와 경험 중심 흐름을 우선해.
- 감각을 과하게 꾸미는 표현은 쓰지 마. 소리, 냄새, 맛을 묘사하더라도 평범한 말투로 짧게 써.
- "혀가 돌게", "군침이 돌게", "자꾸 생각나는 향", "먹는 순간", "입에서 풀리는", "사르르", "녹아내리는" 같은 작가스러운 표현은 쓰지 마.
- 고기나 음식 묘사는 "금방 익어서 바로 먹기 좋았어요", "생각보다 양이 괜찮았어요", "간이 세지 않아서 먹기 편했어요"처럼 일상적인 표현으로 써.
- 광고 문구처럼 과장하지 않기.
- 같은 표현 반복하지 않기.
- 문장 끝은 주로 "~했어요", "~였어요", "~더라고요", "~좋았어요"를 자연스럽게 사용해.
- 너무 문학적이거나 감성적인 표현은 줄여.
- 실제 네이버 맛집 블로그 후기처럼 현실적인 표현, 짧은 감탄, 자연스러운 말 흐름, 일상 대화체를 사용해.
- 실제 20~30대 일반인이 네이버 블로그에 올리는 후기처럼 작성해.
- 친구에게 경험을 말해주듯 작성해.
- 너무 설명문처럼 쓰지 말고, 중간중간 현실적인 경험과 사소한 감상을 섞어.
- 문학적인 표현, 과장된 감탄, 에세이 같은 표현은 사용하지 마.
- 완벽하게 잘 쓴 글보다 현실적인 경험과 자연스러운 말 흐름을 우선해.
- 중간중간 짧은 문장과 생활형 표현을 섞어.
- 생활형 디테일을 사진과 메모에 어울릴 때 자연스럽게 포함해:
  메뉴를 추가로 주문한 이야기, 예상과 달랐던 부분, 기다린 이야기, 같이 간 사람 반응, 배불렀는데도 볶음밥이나 사이드를 시킨 이야기.
- 예시 같은 현실적인 표현을 상황에 맞으면 자연스럽게 포함해:
  "배부른데도 볶음밥 시켰어요", "금방 익어서 계속 먹게 되더라고요", "생각보다 사람이 많았어요", "괜히 소주 생각나는 맛이었어요".
- 단, 사진이나 메모에 전혀 근거가 없으면 너무 구체적인 사실처럼 지어내지 말고 "이럴 때 추가로 시키기 좋겠다", "같이 간 사람이 좋아할 만했다" 정도로 자연스럽게 완화해.
- "최고였다", "감동이었다", "환상적이었다" 같은 과장 표현은 최소화해.
- 아래 표현은 사용하지 마:
  풍미, 감동, 입안 가득, 최고의 조화, 특별한 경험, 행복한 시간, 완벽한 식감, 웅장하게 등장, 기대감이 커졌어요, 혀가 돌게, 군침이 돌게, 사르르, 녹아내리는
- 사진 번호는 반드시 사용하되, 여러 사진을 각각 따로 설명하는 독립 리뷰처럼 쓰지 말고 하나의 실제 방문 경험으로 자연스럽게 이어줘.
- 사진 순서를 참고해서 1 → 2 → 3 흐름이 자연스럽게 이어지게 작성해. 맛집추천이면 입장 → 주문 → 먹는 과정 → 분위기 → 마무리, 물건추천이면 제품 발견/확인 → 전면 패키지 → 구성/가격 → 사용법/주의사항 → 추천 대상/마무리 흐름을 우선해.
- 각 번호마다 새로운 리뷰를 시작하지 말고, 앞 번호의 경험이 다음 번호로 자연스럽게 넘어가게 써.
- 전체 흐름은 서론, 본론, 결론처럼 자연스럽게 이어지게 작성해.
- 음식 맛, 분위기, 공간감, 방문 느낌을 자연스럽게 연결해.
- 사용자가 적은 메모는 자연스럽게 반영해.
- 네이버 블로그 후기 스타일로 작성해.
- 메인 키워드는 제목 추천 중 최소 2개 이상에 포함해.
- 메인 키워드는 본문 초반, 가능하면 1번 섹션의 첫 문단 안에 자연스럽게 포함해.
- 메인 키워드는 본문 전체에서 3~5회만 사용해.
- 키워드를 억지로 반복하지 말고, 실제 사람이 검색 유입을 고려해 작성한 후기처럼 자연스럽게 녹여.
- 대표 키워드와 주제 관련 SEO 키워드도 과하게 반복하지 말고 문맥에 맞게만 사용해.
- [본문]만 기준으로 약 ${length}자에 맞춰 작성해. 제목 추천과 해시태그는 글자 수에 포함하지 마.
- 1500자를 선택했다면 짧고 핵심적인 후기로, 2000자를 선택했다면 방문 흐름과 음식 평가를 조금 더 자세히 써.
- 선택한 글자 수보다 너무 짧게 끝내지 마. 목표 글자 수의 90% 이상은 채워.
- 필요 이상으로 길게 쓰지 말고 목표 글자 수를 크게 넘기지 마.
- 음식이 볶음밥이면 밥알, 간, 재료 조합을 평가하고, 고기면 결, 식감, 곁들임을 평가하는 식으로 음식명에 맞게 써.
- 물건추천이면 실제 구매 확정 후기처럼 쓰지 말고, 패키지와 표기 기준으로 살펴본 추천/정보 글처럼 써. "구매했어요", "써봤어요"는 메모에 근거가 있을 때만 사용해.
- 물건추천에서는 두루뭉술한 제품 평가보다 포장지에 적힌 정보와 실제로 보이는 구성 중심으로 써.
- 가격, 용량, 구성, 사용 주기, 성분, 기능성 문구는 사진에서 보이거나 메모에 있을 때만 구체적으로 써.
- 제품 정보형에서는 "집에 와서 사용해봤어요", "직접 써보니", "며칠 사용해보니", "구매해서 써봤는데", "사용 후" 같은 표현을 절대 쓰지 마.
- 본문에서 파일명, 이미지명, 사진 파일 이름은 절대 언급하지 마.
- 본문에서 사진 자체를 지칭하지 마. 번호는 흐름 구분용일 뿐이고, 내용은 방문 경험만 써.
- [본문] 바로 아래에는 번호 없는 도입문을 쓰지 말고 반드시 "1"부터 시작해.
- 각 번호는 줄 하나에 숫자만 써. "1.", "1번", "첫 번째"라고 쓰지 마.
- 업로드된 사진 수만큼 번호 섹션을 작성해.
- 이번 요청에는 사진이 ${imageCount}장 있으므로 [본문]에는 반드시 ${requiredSections} 섹션이 모두 있어야 해.
- 중간 번호를 생략하지 마. 1부터 ${imageCount}까지 전부 작성해.
- 제목 추천과 해시태그의 번호는 별개이고, 본문 번호는 반드시 사진 수와 같아야 해.
- 너무 완벽하게 정리된 글보다, 실제 사람이 식사 후 편하게 작성한 후기 느낌을 우선해.

[출력 형식]
[제목 추천]
1.
2.
3.
4.
5.

[본문]
${bodyTemplate}

[해시태그]

해시태그는 10개 추천해.
`.trim();
}

function normalizePostType(postType) {
  return ["recommendation", "review", "comparison", "information"].includes(postType)
    ? postType
    : "recommendation";
}

function normalizeCategory(category) {
  return ["product", "restaurant"].includes(category) ? category : "product";
}

function categoryPromptGuide(category) {
  const guides = {
    product: {
      name: "물건추천",
      prompt:
        "- 물건추천 카테고리는 구매를 단정하지 말고, 제품 사진과 표기 기준으로 정보를 살펴본 글처럼 써.\n- 포장지 전면, 측면, 후면에 적힌 문구를 우선해서 읽고, 제품명/가격/용량/구성/사용법/주의사항을 정확히 반영해.\n- 가격, 용량, 구성, 사용법, 주의사항, 추천 대상, 장단점을 우선해.\n- 보이지 않는 숫자 정보는 절대 추측하지 마.\n- 실제 사용 경험은 메모에 근거가 있을 때만 써.",
    },
    restaurant: {
      name: "맛집추천",
      prompt:
        "- 맛집추천 카테고리는 실제 방문 후기처럼 음식, 주문 흐름, 분위기, 동행 반응, 마무리를 자연스럽게 연결해.\n- 사진 속 메뉴와 공간을 참고하되 사진 설명처럼 쓰지 말고 방문 경험처럼 써.",
    },
  };

  return guides[category] || guides.product;
}

function postTypeGuide(postType) {
  const guides = {
    recommendation: {
      name: "추천형",
      prompt:
        "- 추천형은 누구에게 맞는지, 어떤 상황에서 고르면 좋은지 중심으로 써.\n- 단정적인 광고 문구처럼 쓰지 말고, 사진과 표기 기준으로 추천 포인트를 현실적으로 정리해.\n- 제품이면 추천 대상과 주의할 사람을 함께 써.",
    },
    review: {
      name: "후기형",
      prompt:
        "- 후기형은 직접 살펴본 느낌과 사용/방문 흐름을 중심으로 써.\n- 실제 구매나 사용 여부는 메모에 근거가 있을 때만 단정해.\n- 좋았던 점과 아쉬운 점을 자연스럽게 섞어.",
    },
    comparison: {
      name: "비교형",
      prompt:
        "- 비교형은 비슷한 제품/메뉴/장소와 비교하는 관점으로 써.\n- 사진과 메모에 비교 대상이 없으면 일반적인 입문용/고강도, 데일리용/집중관리용, 가성비/프리미엄 같은 기준으로 조심스럽게 비교해.\n- 무엇이 더 맞는지는 상황별로 나눠서 설명해.",
    },
    information: {
      name: "정보형",
      prompt:
        "- 정보형은 제품이나 장소를 찾는 사람이 궁금해할 정보를 정리하는 방식으로 써.\n- 가격, 구성, 사용 주기, 사용 방법, 주의사항, 위치나 메뉴 같은 확인 가능한 정보를 우선해.\n- 정보형에서는 실제 구매나 사용 경험을 절대 지어내지 마.\n- 제품이면 '패키지 기준으로 보면', '표기상으로는', '확인되는 문구는'처럼 매장/패키지에서 살펴본 정보형 문장으로 써.\n- 너무 후기 감정보다 정보 전달이 자연스럽게 느껴지게 써.",
    },
  };

  return guides[postType] || guides.recommendation;
}

function validateRequest(req) {
  if (!req.files || req.files.length === 0) {
    const error = new Error("사진을 1장 이상 업로드해주세요.");
    error.status = 400;
    throw error;
  }

  if (req.files.length > 20) {
    const error = new Error("사진은 최대 20장까지만 업로드할 수 있습니다.");
    error.status = 400;
    throw error;
  }

  if (!clean(req.body.topic)) {
    const error = new Error("주제를 입력해주세요.");
    error.status = 400;
    throw error;
  }
}

function shouldUseWebSearch(fields) {
  const enabled = fields.latestSearch === "on" || fields.latestSearch === "true";
  return enabled;
}

function webSearchPrompt(useWebSearch) {
  if (!useWebSearch) {
    return "- 최신 정보 검색은 사용하지 않아. 사진과 사용자 입력만 기준으로 작성해.";
  }

  return `
- 최신 정보 검색이 켜져 있으므로 현재 날짜 2026-05-09 기준과 비슷한 시기의 정보를 확인할 필요가 있으면 웹 검색 도구를 사용해.
- 사용자가 최신 관련 키워드를 직접 쓰지 않았더라도, 주제와 관련된 최근 가격, 판매처, 출시/리뉴얼, 행사, 재고, 공식 표기, 영업 정보처럼 최신성이 중요한 내용은 검색으로 확인해.
- 검색 결과는 2026-05-09에 가까운 최신 정보를 우선하고, 오래된 정보는 단정하지 마.
- 제품 가격, 용량, 구성처럼 포장지 사진에서 확인 가능한 정보는 사진을 최우선으로 해. 검색 결과가 사진과 다르면 사진 기준으로 작성해.
- 웹 검색으로 찾은 가격이나 용량은 사진에서 확인되지 않으면 "온라인 정보 기준"처럼 출처 성격을 조심스럽게 구분해.
- 검색 결과를 그대로 길게 나열하지 말고, 본문에 필요한 정보만 짧게 녹여.
- 출처가 불확실한 정보는 단정하지 마.
- 사진이나 메모와 충돌하는 정보가 있으면 사진/메모를 우선하고, 최신 정보는 참고 수준으로 표현해.
`.trim();
}

function ensureApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error(".env 파일에 OPENAI_API_KEY를 설정해주세요.");
    error.status = 500;
    throw error;
  }
}

function toDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function clean(value) {
  return String(value || "").trim();
}

function outputTokenLimit(length) {
  const limits = {
    1500: 2300,
    2000: 3200,
  };

  return limits[length] || limits[1500];
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text.trim();

  const message = data.output?.find((item) => item.type === "message");
  const text = message?.content?.find((item) => item.type === "output_text")?.text;

  if (!text) {
    throw new Error("OpenAI 응답에서 결과 텍스트를 찾지 못했습니다.");
  }

  return text.trim();
}

function parseJsonResponse(rawText, status) {
  if (!rawText) {
    const error = new Error(`OpenAI API가 빈 응답을 반환했습니다. 상태 코드: ${status}`);
    error.status = status || 502;
    throw error;
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    const preview = rawText.slice(0, 300);
    const wrapped = new Error(`OpenAI API 응답을 읽지 못했습니다. 상태 코드: ${status}. 응답 일부: ${preview}`);
    wrapped.status = status || 502;
    throw wrapped;
  }
}
