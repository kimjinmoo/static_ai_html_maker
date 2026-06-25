const downloadModal = document.getElementById("download-modal");
const linkActionModal = document.getElementById("link-action-modal");
const elementActionModal = document.getElementById("element-action-modal");
let pendingLinkHref = "";
let pendingLinkElement = null;
const startDownloadBtn = document.getElementById("start-download-btn");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const progressSpeed = document.getElementById("progress-speed");
const downloadStatus = document.getElementById("download-status");
const statusMessage = document.getElementById("status-message");
const downloadProgress = document.getElementById("download-progress");
const modelInfoDisplay = document.getElementById("model-info-display");
const connectionStatus = document.getElementById("connection-status");

let currentStep = 1;
let selectedType = null;
let selectedTemplate = null;
let selectedDesignContent = "";
let chatHistory = [];
let isGenerating = false;
let modelReady = false;
let generatedHtml = "";
let currentProjectId = null;
let projectTitle = "";
let selectedElement = null;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Robust HTML extraction from AI response
function extractHtml(content) {
  if (!content) return null;

  // Strategy 1: ===HTML_START=== ... ===HTML_END=== markers
  const startIdx = content.indexOf('===HTML_START===');
  const endIdx = content.indexOf('===HTML_END===');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const html = content.slice(startIdx + 16, endIdx).trim();
    if (html) return html;
  }

  // Strategy 2: ```html ... ``` code block (greedy, closing ``` must be on its own line)
  const codeBlockMatch = content.match(/```(?:html)?\n([\s\S]*)\n```/i);
  if (codeBlockMatch) {
    const html = codeBlockMatch[1].trim();
    if (html) return html;
  }

  // Strategy 3: ``` with optional language, no trailing newline requirement
  const codeBlockMatch2 = content.match(/```(?:html)?\n([\s\S]+)```/i);
  if (codeBlockMatch2) {
    const html = codeBlockMatch2[1].trim();
    if (html) return html;
  }

  // Strategy 4: Raw HTML - DOCTYPE + <html>...</html>
  const rawMatch = content.match(/(?:(<!DOCTYPE\s+html[^>]*>)\s*)?(<html[\s>][\s\S]*<\/html>)/i);
  if (rawMatch) {
    return (rawMatch[1] || '') + rawMatch[2];
  }

  // Strategy 5: Just <html>...</html> without DOCTYPE
  const htmlOnlyMatch = content.match(/<html[\s>][\s\S]*<\/html>/i);
  if (htmlOnlyMatch) {
    return htmlOnlyMatch[0];
  }

  return null;
}

// Marker-only extraction for new pages (no regex, guaranteed)
function extractHtmlMarker(content) {
  if (!content) return null;
  const startIdx = content.indexOf('===HTML_START===');
  const endIdx = content.indexOf('===HTML_END===');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.slice(startIdx + 16, endIdx).trim();
  }
  return null;
}
let pendingPageName = "";
let pendingMainHtml = "";
let pendingLinkHrefValue = "";
let pendingLinkTextValue = "";
let currentViewPath = "index.html";
let pendingElementAction = false;

// Auto-resize textarea
document.querySelectorAll("textarea").forEach((el) => {
  el.addEventListener("input", () => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (el.id === "user-input") sendMessage();
    }
  });
});

// Check connection
async function checkConnection() {
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (data.status === "ready") {
      connectionStatus.className = "status connected";
      connectionStatus.querySelector(".status-text").textContent = "연결됨";
      modelInfoDisplay.textContent = data.models[0];
      modelReady = true;
    } else if (data.status === "no_model") {
      connectionStatus.className = "status disconnected";
      connectionStatus.querySelector(".status-text").textContent = "모델 없음";
      modelInfoDisplay.textContent = "모델 미설치";
      modelReady = false;
      if (!downloadModal.classList.contains("showing")) {
        showDownloadModal(data);
      }
    }
  } catch (e) {
    connectionStatus.className = "status disconnected";
    connectionStatus.querySelector(".status-text").textContent =
      "서버 연결 안됨";
    modelInfoDisplay.textContent = "연결 대기 중";
  }
}

checkConnection();
setInterval(checkConnection, 10000);
loadProjects();

// Handle messages from preview iframe
window.addEventListener("message", function (e) {
  if (!e.data || !e.data.type) return;

  if (e.data.type === "preview-link-clicked") {
    pendingLinkHref = e.data.href;
    pendingLinkElement = e.data;
    showLinkActionModal(e.data.href, e.data);
  } else if (e.data.type === "preview-load-page") {
    loadSubPageInPreview(e.data.path);
  } else if (e.data.type === "preview-load-main") {
    currentViewPath = "index.html";
    updatePreview(generatedHtml);
    loadFileTree(currentProjectId);
  } else if (e.data.type === "element-selected") {
    selectedElement = e.data;
    showElementActionModal(e.data);
  } else if (e.data.type === "element-deselected") {
    if (!pendingElementAction) {
      selectedElement = null;
      const input = document.getElementById("user-input");
      input.placeholder = "회사 소개, 서비스, 강조 포인트를 입력하세요...";
    }
  }
});

// Load sub-page in preview iframe
async function loadSubPageInPreview(path) {
  if (!currentProjectId) return;
  try {
    const res = await fetch(`/api/projects/${currentProjectId}/read_file?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.content) {
      currentViewPath = path;
      updatePreview(data.content);
      loadFileTree(currentProjectId);
    } else {
      console.warn("No content for path:", path);
    }
  } catch (e) {
    console.warn("Failed to load sub-page:", e);
  }
}

// Load file in preview from file tree
async function loadFileInPreview(path) {
  if (!currentProjectId) return;
  if (path === "index.html") {
    currentViewPath = "index.html";
    updatePreview(generatedHtml);
    loadFileTree(currentProjectId);
    return;
  }
  try {
    const res = await fetch(`/api/projects/${currentProjectId}/read_file?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.content) {
      currentViewPath = path;
      updatePreview(data.content);
      loadFileTree(currentProjectId);
    }
  } catch (e) {
    console.warn("Failed to load file:", e);
  }
}
window.loadFileInPreview = loadFileInPreview;

// Element action modal
function showElementActionModal(elementData) {
  const infoEl = document.getElementById("element-action-info");
  const tagLabel = `<${elementData.tag}${elementData.id ? " id=\"" + elementData.id + "\"" : ""}${elementData.classes ? " class=\"" + elementData.classes + "\"" : ""}>`;
  let infoText = `"${tagLabel}" 요소를 선택했습니다.`;
  if (elementData.text) infoText += `\n\n현재 내용: "${elementData.text}"`;
  infoEl.textContent = infoText;
  elementActionModal.classList.remove("hidden");
}

function hideElementActionModal(keepSelection) {
  elementActionModal.classList.add("hidden");
  if (!keepSelection) {
    selectedElement = null;
    const frame = document.getElementById("preview-frame");
    if (frame) {
      frame.contentWindow.postMessage({ type: "deselect" }, "*");
    }
  }
}

function elementActionNewPage() {
  if (!selectedElement) return;
  const linkText = (selectedElement.text) || "페이지";
  const slug = linkText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const pageName = (slug || 'page') + ".html";
  pendingPageName = pageName;
  pendingMainHtml = generatedHtml;
  pendingLinkHrefValue = "#";
  pendingLinkTextValue = linkText;
  const message = `"${linkText}" 페이지를 생성해주세요. 현재 프로젝트와 일관된 디자인으로 완전한 HTML 파일을 생성하세요.`;
  addMessage("messages", "user", `📄 "${linkText}" 페이지 생성 요청`);
  hideElementActionModal();
  chatHistory.push({ role: "user", content: message });
  sendMessageAuto(message);
}

function elementActionLink() {
  if (!selectedElement) return;
  const input = document.getElementById("user-input");
  input.placeholder = "어디로 연결할지 입력하세요...";
  input.focus();
  const tagLabel = `<${selectedElement.tag}${selectedElement.id ? " id=\"" + selectedElement.id + "\"" : ""}${selectedElement.classes ? " class=\"" + selectedElement.classes + "\"" : ""}>`;
  let infoText = `🔗 링크를 만들겠습니다.`;
  infoText += `\n\n선택한 요소: **${tagLabel}**`;
  if (selectedElement.text) infoText += `\n현재 텍스트: "${selectedElement.text}"`;
  infoText += `\n\n어디로 연결할지 입력해주세요. (예: "회사소개 페이지로", "#contact 섹션으로")`;
  addMessage("messages", "assistant", infoText);
  scrollToBottom("messages");
  pendingElementAction = true;
  hideElementActionModal(true);
}

function elementActionEdit() {
  if (!selectedElement) return;
  const input = document.getElementById("user-input");
  input.placeholder = "선택한 요소에 대해 원하는 작업을 입력하세요...";
  input.focus();
  const tagLabel = `<${selectedElement.tag}${selectedElement.id ? " id=\"" + selectedElement.id + "\"" : ""}${selectedElement.classes ? " class=\"" + selectedElement.classes + "\"" : ""}>`;
  let infoText = `✏️ 요소를 수정하겠습니다.`;
  infoText += `\n\n선택한 요소: **${tagLabel}**`;
  if (selectedElement.text) infoText += `\n현재 내용: "${selectedElement.text}"`;
  infoText += `\n\n어떻게 수정할지 입력해주세요.`;
  addMessage("messages", "assistant", infoText);
  scrollToBottom("messages");
  pendingElementAction = true;
  hideElementActionModal(true);
}

// Link action modal
function showLinkActionModal(href, elementData) {
  const urlEl = document.getElementById("link-action-url");
  urlEl.textContent = `"${href}" 링크를 클릭했습니다. 무엇을 하시겠습니까?`;
  linkActionModal.classList.remove("hidden");
}

function hideLinkActionModal() {
  linkActionModal.classList.add("hidden");
  pendingLinkHref = "";
  pendingLinkElement = null;
}

function linkActionNavigate() {
  if (!pendingLinkHref) return;
  const href = pendingLinkHref;
  hideLinkActionModal();
  if (href.startsWith("pages/")) {
    loadSubPageInPreview(href);
  } else if (href === "index.html" || href === "/" || href === "./") {
    currentViewPath = "index.html";
    updatePreview(generatedHtml);
    loadFileTree(currentProjectId);
  } else if (href.startsWith("#")) {
    const frame = document.getElementById("preview-frame");
    if (frame) {
      frame.contentWindow.postMessage({ type: "navigate", href: href }, "*");
    }
  }
}

function linkActionMove() {
  if (!pendingLinkHref) return;
  const linkText = (pendingLinkElement && pendingLinkElement.text) || pendingLinkHref;
  let slug = linkText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!slug) slug = 'page';
  const pageName = slug + ".html";
  pendingPageName = pageName;
  pendingMainHtml = generatedHtml;
  pendingLinkHrefValue = pendingLinkHref;
  pendingLinkTextValue = linkText;
  const message = `"${linkText}" 페이지를 생성해주세요. 현재 프로젝트와 일관된 디자인으로 완전한 HTML 파일을 생성하세요.`;
  addMessage("messages", "user", `📄 "${linkText}" 페이지 생성 요청`);
  selectedElement = null;
  document.getElementById("user-input").value = "";
  document.getElementById("user-input").style.height = "auto";
  chatHistory.push({ role: "user", content: message });
  hideLinkActionModal();
  sendMessageAuto(message);
}

function linkActionEdit() {
  if (!pendingLinkHref) return;
  const input = document.getElementById("user-input");
  input.placeholder = "링크를 어떻게 수정할지 입력하세요...";
  input.focus();
  let infoText = `✏️ 링크를 수정하겠습니다.`;
  infoText += `\n\n현재 링크: **${pendingLinkHref}**`;
  if (pendingLinkElement && pendingLinkElement.text) {
    infoText += `\n링크 텍스트: "${pendingLinkElement.text}"`;
  }
  infoText += `\n\n어떻게 수정할지 입력해주세요.`;
  addMessage("messages", "assistant", infoText);
  scrollToBottom("messages");
  hideLinkActionModal();
}

window.linkActionMove = linkActionMove;
window.linkActionEdit = linkActionEdit;
window.linkActionNavigate = linkActionNavigate;
window.hideLinkActionModal = hideLinkActionModal;
window.hideElementActionModal = hideElementActionModal;
window.elementActionNewPage = elementActionNewPage;
window.elementActionLink = elementActionLink;
window.elementActionEdit = elementActionEdit;

// Download modal
function showDownloadModal(apiData) {
  downloadModal.classList.remove("hidden");
  downloadModal.classList.add("showing");
  downloadProgress.classList.add("hidden");
  downloadStatus.classList.add("hidden");
  startDownloadBtn.disabled = false;
  startDownloadBtn.textContent = "🚀 다운로드 시작";

  if (apiData && apiData.default_model) {
    const nameEl = document.getElementById("modal-model-name");
    const sizeEl = document.getElementById("modal-model-size");
    const backendEl = document.getElementById("modal-backend");
    if (nameEl) nameEl.textContent = apiData.default_model;
    if (sizeEl) sizeEl.textContent = apiData.default_model_size || "약 4.7GB";
    if (backendEl) backendEl.textContent = apiData.backend === "mlx" ? "MLX (Apple Silicon)" : "llama-cpp-python";
  }
}

function hideDownloadModal() {
  downloadModal.classList.add("hidden");
  downloadModal.classList.remove("showing");
}

async function startDownload() {
  startDownloadBtn.disabled = true;
  startDownloadBtn.textContent = "⏳ 다운로드 중...";
  downloadProgress.classList.remove("hidden");
  downloadStatus.classList.add("hidden");
  progressBar.style.width = "0%";
  progressText.textContent = "0%";
  progressSpeed.textContent = "";

  const response = await fetch("/api/download_default_model", {
    method: "POST",
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.progress !== undefined) {
              progressBar.style.width = data.progress + "%";
              progressText.textContent = Math.round(data.progress) + "%";
            }
            if (data.speed) {
              progressSpeed.textContent = data.speed;
            }
            if (data.status === "complete") {
              downloadStatus.classList.remove("hidden");
              downloadStatus.className = "download-status success";
              statusMessage.textContent =
                "✅ 다운로드 완료! 페이지를 다시 로드합니다...";
              setTimeout(() => location.reload(), 2000);
            } else if (data.status === "error") {
              downloadStatus.classList.remove("hidden");
              downloadStatus.className = "download-status error";
              statusMessage.textContent =
                "❌ " + (data.error || "다운로드 실패");
              startDownloadBtn.disabled = false;
              startDownloadBtn.textContent = "🔄 다시 시도";
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    downloadStatus.classList.remove("hidden");
    downloadStatus.className = "download-status error";
    statusMessage.textContent = "❌ 연결 오류: " + e.message;
    startDownloadBtn.disabled = false;
    startDownloadBtn.textContent = "🔄 다시 시도";
  }
}

// Step navigation
function goToStep(step) {
  document
    .querySelectorAll(".wizard-step")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("step-" + step).classList.add("active");

  document.querySelectorAll(".stepper .step").forEach((el) => {
    const s = parseInt(el.dataset.step);
    el.classList.remove("active", "completed");
    if (s === step) el.classList.add("active");
    else if (s < step) el.classList.add("completed");
  });

  currentStep = step;

  if (step === 3) {
    updateDesignSummary();
    showWelcomeMessage();
  }
}

// Inject interaction script into iframe
function injectInteractionScript(frame) {
  try {
    const doc = frame.contentDocument;
    if (!doc) return;

    const oldScript = doc.getElementById("wgen-interaction");
    if (oldScript) oldScript.remove();
    const oldStyle = doc.getElementById("wgen-style");
    if (oldStyle) oldStyle.remove();

    const style = doc.createElement("style");
    style.id = "wgen-style";
    style.textContent = `
      .wgen-selected { outline: 3px solid #6c5ce7 !important; outline-offset: 2px; cursor: pointer; }
      .wgen-hover { outline: 2px dashed #00cec9 !important; outline-offset: 1px; cursor: pointer; }
      body { cursor: crosshair; }
    `;
    doc.head.appendChild(style);

    const script = doc.createElement("script");
    script.id = "wgen-interaction";
    script.textContent = `
      (function() {
        var selectedEl = null;
        document.addEventListener("mouseover", function(e) {
          if (e.target.tagName === "BODY" || e.target.tagName === "HTML") return;
          if (selectedEl === e.target) return;
          document.querySelectorAll(".wgen-hover").forEach(function(el) { el.classList.remove("wgen-hover"); });
          e.target.classList.add("wgen-hover");
        });
        document.addEventListener("mouseout", function(e) {
          if (selectedEl !== e.target) {
            e.target.classList.remove("wgen-hover");
          }
        });
         document.addEventListener("click", function(e) {
            e.stopPropagation();
            var link = e.target.closest("a");
            if (link) {
              var href = link.getAttribute("href");
              if (href && !href.startsWith("javascript:") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
                e.preventDefault();
                window.parent.postMessage({ type: "preview-link-clicked", href: href, text: (link.innerText || "").substring(0, 100).trim(), tag: "a", classes: (link.className || "").toString().trim() }, "*");
                return;
              }
            }
            if (e.target.tagName === "BODY" || e.target.tagName === "HTML") return;
          document.querySelectorAll(".wgen-selected").forEach(function(el) { el.classList.remove("wgen-selected"); });
          if (selectedEl === e.target) {
            selectedEl = null;
            window.parent.postMessage({ type: "element-deselected" }, "*");
            return;
          }
          selectedEl = e.target;
          e.target.classList.remove("wgen-hover");
          e.target.classList.add("wgen-selected");
          var info = {
            type: "element-selected",
            tag: e.target.tagName.toLowerCase(),
            id: e.target.id || "",
            classes: (e.target.className || "").toString().trim(),
            text: (e.target.innerText || "").substring(0, 100).trim(),
            html: e.target.outerHTML.substring(0, 500),
          };
          if (e.target.getAttribute("src")) info.src = e.target.getAttribute("src");
          if (e.target.getAttribute("alt")) info.alt = e.target.getAttribute("alt");
          window.parent.postMessage(info, "*");
        });
        window.addEventListener("message", function(e) {
          if (e.data && e.data.type === "deselect") {
            document.querySelectorAll(".wgen-selected").forEach(function(el) { el.classList.remove("wgen-selected"); });
            selectedEl = null;
          }
          if (e.data && e.data.type === "navigate") {
            var href = e.data.href;
            if (href.startsWith("#")) {
              var target = document.querySelector(href);
              if (target) target.scrollIntoView({ behavior: "smooth" });
            }
          }
        });
      })();
    `;
    doc.body.appendChild(script);
  } catch (e) {
    console.warn("iframe injection failed:", e);
  }
}

// Update preview iframe
function updatePreview(html) {
  const frame = document.getElementById("preview-frame");
  const placeholder = document.getElementById("preview-placeholder");
  const generating = document.getElementById("preview-generating");
  if (frame && html) {
    frame.srcdoc = html;
    frame.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");
    if (generating) generating.classList.add("hidden");

    // iframe 로드 후 스크립트 주입
    frame.addEventListener("load", function onIframeLoad() {
      frame.removeEventListener("load", onIframeLoad);
      setTimeout(function() {
        injectInteractionScript(frame);
      }, 100);
    });
  }
}

// Show generating state
function showGenerating() {
  const placeholder = document.getElementById("preview-placeholder");
  const generating = document.getElementById("preview-generating");
  if (placeholder) placeholder.classList.add("hidden");
  if (generating) generating.classList.remove("hidden");
}

// Hide generating state
function hideGenerating() {
  const generating = document.getElementById("preview-generating");
  if (generating) generating.classList.add("hidden");
}

// Show welcome message on step 3
function showWelcomeMessage() {
  const messages = document.getElementById("messages");
  if (messages.children.length > 0) return;

  const typeNames = {
    company: "회사 사이트",
    landing: "랜딩 페이지",
    promotion: "프로모션 페이지",
  };
  const templateNames = {
    minimal_clean: "Minimal Clean",
    bold_modern: "Bold Modern",
    elegant_warm: "Elegant Warm",
    custom: "URL 기반 커스텀",
  };

  const welcomeText = `선택하신 **${typeNames[selectedType]}** + **${templateNames[selectedTemplate]}** 스타일로 홈페이지를 생성하겠습니다.

아래에 홈페이지에 들어갈 내용을 설명해주세요. 예를 들어:

- 회사/제품 소개
- 주요 기능或服务
- 타겟 고객
- 강조하고 싶은 포인트
- 포함하고 싶은 섹션

상세하게 작성할수록 더 정확한 결과가 나옵니다.`;

  addMessage("messages", "assistant", welcomeText);
}

// Step 1: Select page type
function selectType(type) {
  if (!modelReady) {
    showDownloadModal();
    return;
  }

  selectedType = type;
  document
    .querySelectorAll(".type-card")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelector('.type-card[data-type="' + type + '"]')
    .classList.add("selected");
  goToStep(2);
}

// Step 2: Select template
async function selectTemplate(template) {
  selectedTemplate = template;
  selectedDesignContent = "";
  document
    .querySelectorAll(".template-card")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelector('.template-card[data-template="' + template + '"]')
    .classList.add("selected");
  document.getElementById("to-step-3").disabled = false;

  // Load design template content
  if (template !== "custom") {
    try {
      const res = await fetch(`/api/design_template/${template}`);
      if (res.ok) {
        const data = await res.json();
        selectedDesignContent = data.content;
      }
    } catch (e) {
      console.warn("Design template load failed:", e);
    }
  }
}

// Generate design from URL
async function generateDesignFromUrl() {
  const url = document.getElementById("ref-url").value.trim();
  if (!url) return;

  const statusEl = document.getElementById("design-generation-status");
  statusEl.className = "loading";
  statusEl.textContent = "🔄 URL 분석 중...";
  statusEl.classList.remove("hidden");

  const btn = document.getElementById("generate-design-btn");
  btn.disabled = true;

  try {
    const res = await fetch("/api/generate_design_from_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url }),
    });
    const data = await res.json();

    if (data.status === "success") {
      statusEl.className = "success";
      statusEl.textContent = "✅ 디자인 분석 완료! 템플릿이 생성되었습니다.";
      selectedTemplate = "custom";
      selectedDesignContent = data.design;
      document.getElementById("to-step-3").disabled = false;
    } else {
      statusEl.className = "error";
      statusEl.textContent = "❌ " + (data.error || "분석 실패");
    }
  } catch (e) {
    statusEl.className = "error";
    statusEl.textContent = "❌ 연결 오류: " + e.message;
  }

  btn.disabled = false;
}

// Update design summary
function updateDesignSummary() {
  const summary = document.getElementById("design-summary");
  const typeNames = {
    company: "🏢 회사 사이트",
    landing: "🎯 랜딩 페이지",
    promotion: "🔥 프로모션 페이지",
  };
  const templateNames = {
    minimal_clean: "Minimal Clean",
    bold_modern: "Bold Modern",
    elegant_warm: "Elegant Warm",
    custom: "URL 커스텀",
  };

  summary.innerHTML = `
        <div class="summary-item">
            <span class="summary-value">${typeNames[selectedType] || "-"}</span>
        </div>
        <div class="summary-item" style="color: var(--text-muted);">|</div>
        <div class="summary-item">
            <span class="summary-value">${templateNames[selectedTemplate] || "-"}</span>
        </div>
    `;
}

// Step 3: Send message
async function sendMessage() {
  const input = document.getElementById("user-input");
  let message = input.value.trim();
  if (!message || isGenerating) return;

  if (!modelReady) {
    showDownloadModal();
    return;
  }

  input.value = "";
  input.style.height = "auto";

  // If element is selected, prepend context
  let displayMessage = message;
  let elementContext = "";
  if (selectedElement) {
    const elDesc = `<${selectedElement.tag}${selectedElement.id ? " id=\"" + selectedElement.id + "\"" : ""}${selectedElement.classes ? " class=\"" + selectedElement.classes + "\"" : ""}>`;
    displayMessage = `[선택된 요소: ${elDesc}] ${message}`;
    chatHistory.push({ role: "user", content: displayMessage });
    elementContext = `## 선택된 요소 수정 요청\n\n### 요소 정보:\n- 태그: <${selectedElement.tag}>\n- ID: ${selectedElement.id || "(없음)"}\n- 클래스: ${selectedElement.classes || "(없음)"}\n- 현재 텍스트: ${selectedElement.text || "(없음)"}\n- 전체 HTML: ${selectedElement.html || "(없음)"}\n\n### 사용자 요청:\n${message}\n\n### 작업 유형 판단:\n- "이동해죠", "연결해죠", "링크" → 해당 요소에 href를 추가하거나 href를 변경\n- "메뉴로 만들어죠", "항목으로" → nav/ul/li 구조로 변환\n- "바꿔줘", "수정해줘" → 텍스트나 속성 변경\n- "삭제해줘" → 요소 제거\n- "추가해줘" → 자식 요소 추가`;
  } else {
    chatHistory.push({ role: "user", content: displayMessage });
  }

  addMessage("messages", "user", displayMessage);

  isGenerating = true;
  document.getElementById("send-btn").disabled = true;
  document.getElementById("typing-indicator").classList.remove("hidden");
  scrollToBottom("messages");
  showGenerating();

  // 채팅창에 "생성 중" 표시
  const assistantDiv = addMessage("messages", "assistant", "⏳ 홈페이지 생성 중...");

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        history: chatHistory.slice(0, -1),
        page_type: selectedType,
        template: selectedTemplate,
        design_content: selectedDesignContent,
        current_html: generatedHtml,
        element_context: elementContext,
        is_new_page: false,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
           if (parsed.content) {
                fullContent += parsed.content;

                // HTML 추출하여 실시간 미리보기 업데이트
                const extracted = extractHtml(fullContent);
                if (extracted) {
                  generatedHtml = extracted;
                  updatePreview(generatedHtml);
                }
              }
          } catch (e) {}
        }
      }
    }

   chatHistory.push({ role: "assistant", content: fullContent });

            // 최종 HTML 추출
            if (!generatedHtml) {
              const extracted = extractHtml(fullContent);
              if (extracted) {
                generatedHtml = extracted;
              }
            }

            if (generatedHtml) {
      updatePreview(generatedHtml);
      selectedElement = null;
      pendingElementAction = false;
      // 채팅창에 "완료" 표시
      assistantDiv.innerHTML = "✅ 홈페이지 생성 완료! 오른쪽 미리보기를 확인하세요.";
      if (!currentProjectId) {
        const titleInput = document.getElementById("project-title");
        projectTitle =
          (titleInput && titleInput.value.trim()) ||
          message.slice(0, 30) + (message.length > 30 ? "..." : "");
      }
      saveProject();
    } else {
      // HTML이 없으면 AI 응답 표시
      assistantDiv.innerHTML = formatContent(fullContent);
      hideGenerating();
      const placeholder = document.getElementById("preview-placeholder");
      if (placeholder) placeholder.classList.remove("hidden");
    }
  } catch (e) {
    assistantDiv.innerHTML = `<span style="color: var(--error);">⚠️ 네트워크 오류: ${e.message}</span>`;
    hideGenerating();
  } finally {
    pendingElementAction = false;
    isGenerating = false;
    document.getElementById("send-btn").disabled = false;
    document.getElementById("typing-indicator").classList.add("hidden");
  }
}

// Send message without input field (for auto-triggered actions)
async function sendMessageAuto(message) {
  if (!message || isGenerating) return;

  if (!modelReady) {
    showDownloadModal();
    return;
  }

  const isPageCreation = !!pendingPageName;
  const maxRetries = isPageCreation ? 3 : 1;
  let attempt = 0;

  isGenerating = true;
  document.getElementById("send-btn").disabled = true;
  document.getElementById("typing-indicator").classList.remove("hidden");
  scrollToBottom("messages");
  showGenerating();

  const assistantDiv = addMessage("messages", "assistant", "⏳ 홈페이지 생성 중...");

  while (attempt < maxRetries) {
    attempt++;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          history: chatHistory.slice(0, -1),
          page_type: selectedType,
          template: selectedTemplate,
          design_content: selectedDesignContent,
          current_html: generatedHtml,
          element_context: "",
          is_new_page: pendingPageName ? true : false,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let newPageHtml = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                  fullContent += parsed.content;

                  if (pendingPageName) {
                    const extracted = extractHtmlMarker(fullContent) || extractHtml(fullContent);
                    if (extracted) {
                      newPageHtml = extracted;
                      updatePreview(extracted);
                    }
                  } else {
                    const extracted = extractHtml(fullContent);
                    if (extracted) {
                      generatedHtml = extracted;
                      updatePreview(extracted);
                    }
                  }
                }
            } catch (e) {}
          }
        }
      }

     chatHistory.push({ role: "assistant", content: fullContent });

            // 최종 HTML 추출
            if (!newPageHtml && !generatedHtml) {
              if (pendingPageName) {
                const extracted = extractHtmlMarker(fullContent) || extractHtml(fullContent);
                if (extracted) newPageHtml = extracted;
              } else {
                const extracted = extractHtml(fullContent);
                if (extracted) generatedHtml = extracted;
              }
            }

            // 신규 페이지 생성 성공
      if (pendingPageName && newPageHtml && pendingMainHtml) {
        try {
          await fetch(`/api/projects/${currentProjectId}/save_file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: `pages/${pendingPageName}`,
              content: newPageHtml,
            }),
          });
          const linkPath = `pages/${pendingPageName}`;
          const escapedText = escapeRegex(pendingLinkTextValue);
          const linkRegex = new RegExp(`(<a\\b[^>]*>\\s*)${escapedText}(\\s*</a>)`, 'i');
          const replacedHtml = pendingMainHtml.replace(linkRegex, (full, openTag, closeTag) => {
            return openTag.replace(/href=["'][^"']*["']/i, `href="${linkPath}"`) + pendingLinkTextValue + closeTag;
          });
          // 텍스트 기반으로 교체가 안 되면 href 기반으로 첫 링크만 교체
          generatedHtml = (replacedHtml !== pendingMainHtml)
            ? replacedHtml
            : pendingMainHtml.replace(
                new RegExp(`href=["']${escapeRegex(pendingLinkHrefValue)}["']`),
                `href="${linkPath}"`
              );
          // 새 페이지를 미리보기에 표시
          updatePreview(newPageHtml);
          assistantDiv.innerHTML = `✅ 페이지 "${pendingPageName}" 생성 완료! 링크가 연결되었습니다.`;
        } catch (e) {
          assistantDiv.innerHTML = `⚠️ 페이지 생성은 완료되었지만 저장에 실패했습니다.`;
        }
        pendingPageName = "";
        pendingMainHtml = "";
        pendingLinkHrefValue = "";
        pendingLinkTextValue = "";
        saveProject();
        loadFileTree(currentProjectId);
        break;
      }

      // 신규 페이지인데 HTML 추출 실패 → 재시도
      if (pendingPageName && !newPageHtml) {
        if (attempt < maxRetries) {
          assistantDiv.innerHTML = `⚠️ HTML 추출 실패, ${maxRetries - attempt}회 남음... 자동으로 재시도 중...`;
          chatHistory.pop();
          await new Promise(r => setTimeout(r, 1500));
          continue;
        } else {
          assistantDiv.innerHTML = `⚠️ 페이지 생성에 실패했습니다. (${maxRetries}회 시도 후 실패)`;
          pendingPageName = "";
          pendingMainHtml = "";
          pendingLinkHrefValue = "";
          pendingLinkTextValue = "";
          break;
        }
      }

      // 일반 페이지 생성
      if (generatedHtml) {
        updatePreview(generatedHtml);
        selectedElement = null;
        assistantDiv.innerHTML = "✅ 홈페이지 생성 완료! 오른쪽 미리보기를 확인하세요.";
        if (!currentProjectId) {
          const titleInput = document.getElementById("project-title");
          projectTitle =
            (titleInput && titleInput.value.trim()) ||
            message.slice(0, 30) + (message.length > 30 ? "..." : "");
        }
        saveProject();
        break;
      }

      assistantDiv.innerHTML = formatContent(fullContent);
      hideGenerating();
      const placeholder = document.getElementById("preview-placeholder");
      if (placeholder) placeholder.classList.remove("hidden");
      break;

    } catch (e) {
      if (attempt < maxRetries) {
        assistantDiv.innerHTML = `⚠️ 오류 발생, 자동으로 재시도 중... (${attempt}/${maxRetries})`;
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      assistantDiv.innerHTML = `<span style="color: var(--error);">⚠️ 네트워크 오류: ${e.message}</span>`;
      hideGenerating();
      break;
    }
  }

  isGenerating = false;
  document.getElementById("send-btn").disabled = false;
  document.getElementById("typing-indicator").classList.add("hidden");
}

// Regenerate
function regenerate() {
  currentProjectId = null;
  projectTitle = "";
  selectedElement = null;
  chatHistory = [];
  generatedHtml = "";
  document.getElementById("messages").innerHTML = "";
  document.getElementById("preview-frame").srcdoc = "";
  document.getElementById("preview-frame").classList.add("hidden");
  hideGenerating();
  const placeholder = document.getElementById("preview-placeholder");
  if (placeholder) placeholder.classList.remove("hidden");
  const titleInput = document.getElementById("project-title");
  if (titleInput) titleInput.value = "";
  showWelcomeMessage();
  document.getElementById("user-input").placeholder =
    "원하는 홈페이지를 설명해주세요...";
}

// Copy messages to preview panel (no longer needed)
function copyMessagesToPreview() {}

// Add message
function addMessage(containerId, role, content) {
  const container = document.getElementById(containerId);
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = formatContent(content);

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  container.appendChild(messageDiv);
  return contentDiv;
}

// Format content
function formatContent(content) {
  const codeBlocks = [];
  let processed = content.replace(
    /```(\w*)\n([\s\S]*)```/g,
    (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || "html", code: code.trim() });
      return `%%CODEBLOCK_${idx}%%`;
    },
  );

  processed = processed
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (match, idx) => {
    const block = codeBlocks[parseInt(idx)];
    return createCodeBlock(block.code, block.lang);
  });

  return processed;
}

function createCodeBlock(code, lang) {
  const id = "code-" + Date.now() + Math.random().toString(36).substr(2, 5);
  return `
        <div class="code-block-wrapper">
            <div class="code-header">
                <span>${lang}</span>
                <div class="code-actions">
                    <button onclick="window.copyCodeBlock('${id}')">📋 복사</button>
                </div>
            </div>
            <pre><code id="${id}" class="language-${lang}">${escapeHtml(code)}</code></pre>
        </div>
    `;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.copyCodeBlock = function (id) {
  const code = document.getElementById(id).textContent;
  navigator.clipboard.writeText(code);
};

window.copyCode = function () {
  navigator.clipboard.writeText(generatedHtml);
};

window.downloadHtml = function () {
  const blob = new Blob([generatedHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "index.html";
  a.click();
  URL.revokeObjectURL(url);
};

// Export project as ZIP
function exportProject() {
  if (!currentProjectId) {
    alert("저장된 프로젝트가 없습니다.");
    return;
  }
  const link = document.createElement("a");
  link.href = `/api/projects/${currentProjectId}/export`;
  link.download = `${currentProjectId}.zip`;
  link.click();
}

window.selectType = selectType;
window.selectTemplate = selectTemplate;
window.generateDesignFromUrl = generateDesignFromUrl;
window.sendMessage = sendMessage;
window.regenerate = regenerate;
window.copyCode = window.copyCode;
window.downloadHtml = window.downloadHtml;
window.exportProject = exportProject;
window.newWizard = newWizard;
window.loadProject = loadProject;
window.deleteProject = deleteProject;
window.updateProjectTitle = function (val) {
  projectTitle = val || "제목 없음";
  if (currentProjectId) {
    saveProject();
  }
};

function scrollToBottom(containerId) {
  const container = document.getElementById(containerId).closest(".chat-area");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// Reset wizard
function resetWizard() {
  selectedType = null;
  selectedTemplate = null;
  selectedDesignContent = "";
  selectedElement = null;
  chatHistory = [];
  generatedHtml = "";
  currentProjectId = null;
  projectTitle = "";
  currentStep = 1;

  document
    .querySelectorAll(".type-card")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelectorAll(".template-card")
    .forEach((el) => el.classList.remove("selected"));
  document.getElementById("to-step-3").disabled = true;
  document.getElementById("messages").innerHTML = "";
  document.getElementById("user-input").value = "";
  document.getElementById("preview-frame").srcdoc = "";
  document.getElementById("preview-frame").classList.add("hidden");
  hideGenerating();
  const placeholder = document.getElementById("preview-placeholder");
  if (placeholder) placeholder.classList.remove("hidden");
  const titleInput = document.getElementById("project-title");
  if (titleInput) titleInput.value = "";
  document.getElementById("file-tree-section").classList.add("hidden");

  goToStep(1);
}

// New wizard (alias for reset)
function newWizard() {
  resetWizard();
}

// Save project
async function saveProject() {
  if (!generatedHtml) return;
  if (!currentProjectId) {
    currentProjectId = crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  }
  try {
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: currentProjectId,
        title: projectTitle,
        page_type: selectedType,
        template: selectedTemplate,
        html: generatedHtml,
        history: chatHistory,
        design_content: selectedDesignContent,
      }),
    });
    loadProjects();
    loadFileTree(currentProjectId);
    const titleInput = document.getElementById("project-title");
    if (titleInput) titleInput.value = projectTitle;
  } catch (e) {
    console.warn("Project save failed:", e);
  }
}

// Load projects list
async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    renderProjects(data.projects);
  } catch (e) {
    console.warn("Failed to load projects:", e);
  }
}

// Render projects in sidebar
function renderProjects(projects) {
  const list = document.getElementById("projects-list");
  if (!projects || projects.length === 0) {
    list.innerHTML = '<div class="projects-empty">프로젝트가 없습니다</div>';
    return;
  }

  const typeIcons = {
    company: "🏢",
    landing: "🎯",
    promotion: "🔥",
  };

  list.innerHTML = projects
    .map((p) => {
      const isActive = p.id === currentProjectId ? "active" : "";
      return `
        <div class="project-item ${isActive}" onclick="loadProject('${p.id}')">
          <div class="project-item-header">
            <span class="project-item-title">${p.title || "제목 없음"}</span>
            <button class="project-item-delete" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="삭제">✕</button>
          </div>
          <div class="project-item-meta">
            <span class="project-item-type">${typeIcons[p.page_type] || ""} ${p.page_type || "-"}</span>
            <span>${p.updated_at || p.created_at || ""}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

// Load a specific project
async function loadProject(id) {
  try {
    const res = await fetch(`/api/projects/${id}`);
    const project = await res.json();

    if (project.error) return;

    currentProjectId = project.id;
    projectTitle = project.title;
    selectedType = project.page_type;
    selectedTemplate = project.template;
    selectedDesignContent = project.design_content || "";
    chatHistory = project.history || [];
    generatedHtml = project.html || "";

    // Restore messages
    const messagesEl = document.getElementById("messages");
    messagesEl.innerHTML = "";
    chatHistory.forEach((msg) => {
      addMessage("messages", msg.role, msg.content);
    });

    // Update preview
    if (generatedHtml) {
      updatePreview(generatedHtml);
    }

    // Update type/template selection UI
    document
      .querySelectorAll(".type-card")
      .forEach((el) => el.classList.remove("selected"));
    if (selectedType) {
      const typeCard = document.querySelector(
        `.type-card[data-type="${selectedType}"]`,
      );
      if (typeCard) typeCard.classList.add("selected");
    }

    document
      .querySelectorAll(".template-card")
      .forEach((el) => el.classList.remove("selected"));
    if (selectedTemplate && selectedTemplate !== "custom") {
      const tmplCard = document.querySelector(
        `.template-card[data-template="${selectedTemplate}"]`,
      );
      if (tmplCard) tmplCard.classList.add("selected");
    }

    goToStep(3);
    const titleInput = document.getElementById("project-title");
    if (titleInput) titleInput.value = projectTitle;
    loadProjects();
    loadFileTree(id);
  } catch (e) {
    console.error("Failed to load project:", e);
  }
}

// File tree
async function loadFileTree(projectId) {
  if (!projectId) {
    document.getElementById("file-tree-section").classList.add("hidden");
    return;
  }
  try {
    const res = await fetch(`/api/projects/${projectId}/tree`);
    const data = await res.json();
    renderFileTree(data.tree);
    document.getElementById("file-tree-section").classList.remove("hidden");
  } catch (e) {
    console.warn("Failed to load file tree:", e);
  }
}

function renderFileTree(tree) {
  const container = document.getElementById("file-tree");
  if (!tree || tree.length === 0) {
    container.innerHTML = '<div class="projects-empty">파일이 없습니다</div>';
    return;
  }

  const iconMap = {
    folder: "📁",
    ".html": "🌐",
    ".css": "🎨",
    ".js": "⚡",
    ".png": "🖼",
    ".jpg": "🖼",
    ".jpeg": "🖼",
    ".gif": "🖼",
    ".svg": "🖼",
    ".webp": "🖼",
    ".ttf": "🔤",
    ".woff": "🔤",
    ".woff2": "🔤",
  };

  container.innerHTML = tree
    .map((item) => {
      const indent = item.depth * 16;
      const icon = item.type === "folder"
        ? iconMap.folder
        : (iconMap[item.ext] || "📄");
      const isActive = item.path === currentViewPath;
      const cls = item.type === "folder"
        ? "folder"
        : (item.pending ? "file pending" : "file" + (isActive ? " active" : ""));
      const badge = item.pending
        ? '<span class="tree-badge pending">대기</span>'
        : (item.ext ? `<span class="tree-badge">${item.ext.slice(1).toUpperCase()}</span>` : "");
      const padding = `padding-left: ${indent + 8}px`;
      const clickHandler = (item.ext === ".html" && !item.pending)
        ? `onclick="loadFileInPreview('${item.path.replace(/'/g, "\\'")}')"`
        : "";
      return `<div class="tree-item ${cls}" style="${padding}" title="${item.path}" ${clickHandler}>
        <span class="tree-icon">${icon}</span>
        <span class="tree-name">${item.name}</span>
        ${badge}
      </div>`;
    })
    .join("");
}

function toggleFileTree() {
  const tree = document.getElementById("file-tree");
  const toggle = document.getElementById("file-tree-toggle");
  if (tree.style.display === "none") {
    tree.style.display = "block";
    toggle.textContent = "▼";
  } else {
    tree.style.display = "none";
    toggle.textContent = "▶";
  }
}
window.toggleFileTree = toggleFileTree;

// Delete a project
async function deleteProject(id) {
  if (!confirm("프로젝트를 삭제하시겠습니까?")) return;

  try {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (currentProjectId === id) {
      resetWizard();
    } else if (currentProjectId === id) {
      document.getElementById("file-tree-section").classList.add("hidden");
    }
    loadProjects();
  } catch (e) {
    console.error("Failed to delete project:", e);
  }
}
