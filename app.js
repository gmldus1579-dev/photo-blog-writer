const MAX_IMAGES = 20;
const APP_PASSWORD = "9353";
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
const selectedFiles = [];

const lockScreen = document.querySelector("#lockScreen");
const lockForm = document.querySelector("#lockForm");
const passwordInput = document.querySelector("#passwordInput");
const lockError = document.querySelector("#lockError");
const dropZone = document.querySelector("#dropZone");
const imageInput = document.querySelector("#imageInput");
const pickButton = document.querySelector("#pickButton");
const resetButton = document.querySelector("#resetButton");
const postForm = document.querySelector("#postForm");
const generateButton = document.querySelector("#generateButton");
const copyButton = document.querySelector("#copyButton");
const statusText = document.querySelector("#statusText");
const previewGrid = document.querySelector("#previewGrid");
const previewTemplate = document.querySelector("#previewTemplate");
const output = document.querySelector("#output");

initLock();
pickButton.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => addFiles(imageInput.files));
resetButton.addEventListener("click", resetAll);
copyButton.addEventListener("click", copyOutput);
postForm.addEventListener("submit", submitPost);

function initLock() {
  if (sessionStorage.getItem("blogWriterUnlocked") === "true") {
    unlockApp();
  } else {
    document.body.classList.add("is-locked");
    setTimeout(() => passwordInput.focus(), 0);
  }

  lockForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (passwordInput.value === APP_PASSWORD) {
      sessionStorage.setItem("blogWriterUnlocked", "true");
      unlockApp();
      return;
    }

    lockError.textContent = "패스워드가 맞지 않습니다.";
    passwordInput.select();
  });
}

function unlockApp() {
  document.body.classList.remove("is-locked");
  lockError.textContent = "";
  passwordInput.value = "";
}

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

function addFiles(fileList) {
  const files = [...fileList].filter((file) => allowedTypes.includes(file.type));
  const slots = MAX_IMAGES - selectedFiles.length;
  const accepted = files.slice(0, slots);

  accepted.forEach((file) => selectedFiles.push(file));

  if (files.length > accepted.length) {
    setStatus("사진은 최대 20장까지만 업로드됩니다.");
  } else if (files.length !== fileList.length) {
    setStatus("jpg, png, webp 파일만 업로드할 수 있습니다.");
  }

  imageInput.value = "";
  renderPreviews();
}

function renderPreviews() {
  previewGrid.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const card = previewTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    const badge = card.querySelector(".order-badge");
    const remove = card.querySelector("button");

    image.src = URL.createObjectURL(file);
    image.alt = `${index + 1}번 사진`;
    badge.textContent = index + 1;
    image.onload = () => URL.revokeObjectURL(image.src);
    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderPreviews();
    });

    previewGrid.append(card);
  });

  setStatus(
    selectedFiles.length
      ? `${selectedFiles.length}장의 사진이 준비됐습니다.`
      : "아직 업로드된 사진이 없습니다.",
  );
}

async function submitPost(event) {
  event.preventDefault();

  if (!selectedFiles.length) {
    output.value = "사진을 1장 이상 업로드해주세요.";
    return;
  }

  const formData = new FormData(postForm);

  setBusy(true);
  output.value = "사진을 정리하고 블로그 포스팅을 작성하는 중입니다...";

  try {
    const compressedFiles = await Promise.all(selectedFiles.map(compressImage));
    compressedFiles.forEach((file) => formData.append("images", file));

    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });

    const data = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.error || "포스팅 생성에 실패했습니다.");
    }

    output.value = data.result;
    setStatus("블로그 포스팅이 완성됐습니다.");
  } catch (error) {
    output.value = `문제가 발생했습니다.\n\n${error.message}`;
    setStatus("오류가 발생했습니다. 메시지를 확인해주세요.");
  } finally {
    setBusy(false);
  }
}

async function copyOutput() {
  if (!output.value.trim()) return;

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(output.value);
  } else {
    output.select();
    document.execCommand("copy");
  }

  copyButton.textContent = "복사 완료";
  setTimeout(() => {
    copyButton.textContent = "복사";
  }, 1200);
}

function resetAll() {
  selectedFiles.splice(0, selectedFiles.length);
  postForm.reset();
  output.value = "";
  renderPreviews();
}

function setBusy(isBusy) {
  generateButton.disabled = isBusy;
  pickButton.disabled = isBusy;
  resetButton.disabled = isBusy;
}

function setStatus(message) {
  statusText.textContent = message;
}

function compressImage(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.86,
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    image.src = objectUrl;
  });
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return { error: `서버가 빈 응답을 반환했습니다. 상태 코드: ${response.status}` };
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      error: `서버 응답을 읽지 못했습니다. 상태 코드: ${response.status}. 응답 일부: ${text.slice(0, 200)}`,
    };
  }
}
