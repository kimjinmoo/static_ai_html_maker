/* ============================================================
   WebGen AI - Main Application
   ============================================================ */

// ── State ──
const state = {
  currentStep: 1,
  selectedType: null,
  selectedTemplate: null,
  selectedDesignContent: "",
  chatHistory: [],
  isGenerating: false,
  generatingFiles: {},
  abortController: null,
  htmlHistory: [],
  modelReady: false,
  generatedHtml: "",
  currentProjectId: null,
  projectTitle: "",
  selectedElement: null,
  reasoningEnabled: true,
  directMode: true, // 단일 생성 기본값 활성화
  multiPageMode: false,
  multiPageHtmls: {},
  multiPageMenuItems: [],
  multiPagePlanPages: [],
  pendingPageName: "",
  pendingMainHtml: "",
  pendingLinkHrefValue: "",
  pendingLinkTextValue: "",
  pendingLinkHref: "",
  pendingLinkElement: null,
  pendingElementAction: false,
  uploadedImages: [],
  reactRejected: false,
  currentViewPath: "index.html",
  treeCollapsed: {},
  devMode: true,
  designSystem: null, // 서버 단일 진실원 (프로젝트 로드 시 복원)
};

// ── DOM Ref shortcuts ──
const $ = (id) => document.getElementById(id);
const el = {
  downloadModal: $("download-modal"),
  progressBar: $("progress-bar"),
  progressText: $("progress-text"),
  progressSpeed: $("progress-speed"),
  downloadStatus: $("download-status"),
  statusMessage: $("status-message"),
  downloadProgress: $("download-progress"),
  modelInfoDisplay: $("model-info-display"),
  connectionStatus: $("connection-status"),
  messages: $("messages"),
  userInput: $("user-input"),
  sendBtn: $("send-btn"),
  typingIndicator: $("typing-indicator"),
  previewFrame: $("preview-frame"),
  previewPlaceholder: $("preview-placeholder"),
  previewGenerating: $("preview-generating"),
  generatingProgressList: $("generating-progress-list"),
  generatingStatusText: $("generating-status-text"),
  generatingProgressBar: $("generating-progress-bar"),
  generatingProgressPercent: $("generating-progress-percent"),
  projectTitle: $("project-title"),
  designSummary: $("design-summary"),
  fileTreeSection: $("file-tree-section"),
  fileTree: $("file-tree"),
  projectsList: $("projects-list"),
  reviewPanel: $("review-panel"),
  btnReview: $("btn-review"),
  devModeToggle: $("devmode-toggle"),
};

// ── Utilities ──
function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function scrollToBottom(containerId) {
  const c = document.getElementById(containerId);
  if (c) {
    const area = c.closest(".chat-area") || c;
    area.scrollTop = area.scrollHeight;
  }
}

function stripCodeFences(html) {
  if (!html) return html;
  return html.replace(/^```(?:html|HTML)?\s*\n?/, "").replace(/\n?\s*```$/, "").trim();
}

function stripThinkingTags(text) {
  if (!text) return text;
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

function stripThinkingBlock(text) {
  if (!text) return text;
  let result = text;

  // 1. 이미 완전히 닫힌 태그 블록 제거
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "");
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");

  // 2. 아직 닫히지 않고 열려만 있는 태그들 뒤쪽 내용 전부 제거 (실시간 스트리밍 필터링)
  const openTags = ["<thinking>", "<think>", "<reasoning>"];
  for (const tag of openTags) {
    const idx = result.toLowerCase().indexOf(tag);
    if (idx !== -1) {
      result = result.substring(0, idx);
    }
  }

  // 3. 한글/영어 생각 과정 마커 처리
  const markers = ["Thinking Process:", "\uc0dd\uac01 \uacfc\uc815:", "Thinking:", "thought:", "thought \u2014"];
  for (const marker of markers) {
    const idx = result.indexOf(marker);
    if (idx === -1) continue;
    
    // 마커 이후에 진짜 HTML 시작점(===HTML_START===, <!DOCTYPE 등)이 있으면 마커~시작점 사이를 제거
    const after = result.substring(idx);
    const endPatterns = [/===HTML_START===/, /```html\s*\n/, /<!DOCTYPE/i, /---\s*\r?\n/, /===\s*\r?\n/];
    let endIdx = -1;
    for (const pat of endPatterns) {
      const m = after.match(pat);
      if (m && m.index > 0) { endIdx = idx + m.index; break; }
    }
    
    if (endIdx === -1) {
      // HTML 시작 전인 스트리밍 도중이라면 마커 뒤쪽은 모두 생각 과정이므로 날려버림
      result = result.substring(0, idx);
    } else {
      result = result.substring(0, idx) + result.substring(endIdx);
    }
  }

  // 4. HTML 시작 마커 전의 긴 텍스트를 제거하는 기존 분리선 처리
  if (result === text) {
    const htmlStart = result.search(/===HTML_START===|```html\s*\n|<!DOCTYPE\s+html/i);
    if (htmlStart > 50) {
      const before = result.substring(0, htmlStart);
      const lastSep = before.search(/\n---\s*\r?\n|\n===\s*\r?\n/);
      if (lastSep >= 0) {
        result = result.substring(lastSep).replace(/^[\n\r]+---\s*\r?\n/, "").replace(/^[\n\r]+===\s*\r?\n/, "");
      }
    }
  }
  return result.trim();
}

function sanitizeReactHtml(html) {
  if (!html) return { html: null, wasReact: false };
  const hasReactCDN = /unpkg\.com\/react|cdn\.reactjs\.org/.test(html);
  const hasRootDiv = /<div\s+id=["']root["'][^>]*>\s*<\/div>/i.test(html);
  const hasCreateElement = /createElement\s*\(/.test(html);
  const hasReactHooks = /useState|useEffect|useRef/.test(html);
  const isReact = (hasReactCDN && hasCreateElement) || (hasRootDiv && hasCreateElement) || (hasReactHooks && hasCreateElement);
  if (!isReact) return { html, wasReact: false };
  console.error("[sanitizeReactHtml] React detected - rejecting");
  state.reactRejected = true;
  return { html: null, wasReact: true };
}

function extractHtmlMarker(content) {
  if (!content) return null;
  const si = content.indexOf("===HTML_START===");
  if (si === -1) return null;
  const ei = content.indexOf("===HTML_END===", si);
  let html = ei > si ? content.slice(si + 16, ei).trim() : content.slice(si + 16).trim();
  html = stripCodeFences(html).replace(/===HTML_END===/g, "").replace(/===HTML_START===/g, "").trim();
  if (!html) return null;
  const san = sanitizeReactHtml(html);
  return san.wasReact && !san.html ? null : san.html || html;
}

function extractHtmlStreaming(content) {
  if (!content) return null;
  let di = content.toLowerCase().indexOf("<!doctype html");
  if (di === -1) {
    const sm = content.indexOf("===HTML_START===");
    if (sm === -1) return null;
    di = sm + 16;
  }
  let html = content.slice(di).trim();
  const ei = html.indexOf("===HTML_END===");
  if (ei !== -1) html = html.slice(0, ei).trim();
  html = html.replace(/===HTML_START===/g, "").trim();
  if (html.length <= 50) return null;
  const san = sanitizeReactHtml(html);
  return san.wasReact && !san.html ? null : san.html || html;
}

function extractHtml(content) {
  if (!content) return null;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let raw = null;
  const stripped = stripCodeFences(text);
  const si = stripped.indexOf("===HTML_START===");
  if (si !== -1) {
    const ei = stripped.indexOf("===HTML_END===");
    let h = ei > si ? stripped.slice(si + 16, ei).trim() : stripped.slice(si + 16).trim();
    h = stripCodeFences(h);
    if (h && h.length > 10) raw = h;
  }

  if (!raw) {
    const oi = text.indexOf("===HTML_START===");
    if (oi !== -1) {
      const ei = text.indexOf("===HTML_END===");
      let h = ei > oi ? text.slice(oi + 16, ei).trim() : text.slice(oi + 16).trim();
      h = stripCodeFences(h);
      if (h && h.length > 10) raw = h;
    }
  }

  if (!raw) {
    const cm = text.match(/```(?:html)?[\s\n]/i);
    if (cm) {
      const after = text.slice(cm.index + cm[0].length);
      const lc = after.lastIndexOf("\n```");
      let h = lc !== -1 ? after.slice(0, lc).trim() : after.trim();
      h = h.replace(/===HTML_START===/g, "").replace(/===HTML_END===/g, "").trim();
      if (h && h.length > 100) raw = h;
    }
  }

  if (!raw) {
    const dm = text.match(/<!DOCTYPE\s+html[^>]*>/i);
    if (dm) {
      let after = text.slice(dm.index).replace(/===HTML_START===/g, "").replace(/===HTML_END===/g, "").trim();
      const hm = after.match(/<html[\s>][\s\S]*<\/html>/i);
      raw = hm ? dm[0] + hm[0] : after.length > 100 ? after : null;
    }
  }

  if (!raw) {
    const hm = text.match(/<html[\s>][\s\S]*<\/html>/i);
    if (hm) raw = hm[0].replace(/===HTML_END===/g, "").replace(/===HTML_START===/g, "").trim();
  }

  if (!raw) return null;
  const san = sanitizeReactHtml(raw);
  return san.wasReact && !san.html ? null : san.html || raw;
}

// ── Formatting ──
function formatContent(content) {
  const blocks = [];
  let processed = content.replace(/===HTML_START===\s*/g, "").replace(/\s*===HTML_END===/g, "");
  processed = processed.replace(/```(\w*)\n([\s\S]*)```/g, (m, lang, code) => {
    const idx = blocks.length;
    blocks.push({ lang: lang || "html", code: code.trim() });
    return `%%CODEBLOCK_${idx}%%`;
  });
  processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (m, idx) => {
    const b = blocks[parseInt(idx)];
    const id = "cb-" + Date.now() + Math.random().toString(36).substr(2, 5);
    return `<div class="code-block-wrapper"><div class="code-header"><span>${b.lang}</span><div class="code-actions"><button onclick="window.copyCodeBlock('${id}')">\ud83d\udccb \ubcf5\uc0ac</button></div></div><pre><code id="${id}" class="language-${b.lang}">${escapeHtml(b.code)}</code></pre></div>`;
  });
  return processed;
}

window.copyCodeBlock = function (id) {
  const code = document.getElementById(id).textContent;
  navigator.clipboard.writeText(code);
};

function addMessage(containerId, role, content) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "\ud83d\udc64" : "\ud83e\udd16";
  const cd = document.createElement("div");
  cd.className = "message-content";
  cd.innerHTML = formatContent(content);
  div.appendChild(avatar);
  div.appendChild(cd);
  container.appendChild(div);
  return cd;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

// ── Reasoning toggle ──
function toggleReasoning() {
  const cb = $("reasoning-toggle");
  state.reasoningEnabled = cb ? cb.checked : true;
}

function toggleDirectMode() {
  const cb = $("direct-mode-toggle");
  state.directMode = cb ? cb.checked : true;
}

function toggleReasoningBlock(id) {
  const c = document.getElementById(id);
  if (!c) return;
  c.classList.toggle("hidden");
  const h = c.previousElementSibling;
  if (h) h.classList.toggle("collapsed");
}

// ── Connection & Model ──
async function checkConnection() {
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (data.status === "ready") {
      el.connectionStatus.className = "status connected";
      el.connectionStatus.querySelector(".status-text").textContent = "\uc5f0\uacb0\ub428";
      el.modelInfoDisplay.textContent = data.models[0];
      state.modelReady = true;
    } else if (data.status === "no_model") {
      el.connectionStatus.className = "status disconnected";
      el.connectionStatus.querySelector(".status-text").textContent = "\ubaa8\ub378 \uc5c6\uc74c";
      el.modelInfoDisplay.textContent = "\ubaa8\ub378 \ubbf8\uc124\uce58";
      state.modelReady = false;
      if (!el.downloadModal.classList.contains("showing")) showDownloadModal(data);
    }
  } catch (e) {
    el.connectionStatus.className = "status disconnected";
    el.connectionStatus.querySelector(".status-text").textContent = "\uc11c\ubc84 \uc5f0\uacb0 \uc548\ub428";
    el.modelInfoDisplay.textContent = "\uc5f0\uacb0 \ub300\uae30 \uc911";
  }
}

function showDownloadModal(apiData) {
  el.downloadModal.classList.remove("hidden");
  el.downloadModal.classList.add("showing");
  el.downloadProgress.classList.add("hidden");
  el.downloadStatus.classList.add("hidden");
  $("start-download-btn").disabled = false;
  $("start-download-btn").textContent = "\ud83d\ude80 \ub2e4\uc6b4\ub85c\ub4dc \uc2dc\uc791";
  if (apiData && apiData.default_model) {
    const nameEl = $("modal-model-name");
    const sizeEl = $("modal-model-size");
    const backendEl = $("modal-backend");
    if (nameEl) nameEl.textContent = apiData.default_model;
    if (sizeEl) sizeEl.textContent = apiData.default_model_size || "\uc57d 4.7GB";
    if (backendEl) backendEl.textContent = apiData.backend === "mlx" ? "MLX (Apple Silicon)" : "llama-cpp-python";
  }
}

function hideDownloadModal() {
  el.downloadModal.classList.add("hidden");
  el.downloadModal.classList.remove("showing");
}

async function startDownload() {
  const btn = $("start-download-btn");
  btn.disabled = true;
  btn.textContent = "\u23f3 \ub2e4\uc6b4\ub85c\ub4dc \uc911...";
  el.downloadProgress.classList.remove("hidden");
  el.downloadStatus.classList.add("hidden");
  el.progressBar.style.width = "0%";
  el.progressText.textContent = "0%";
  el.progressSpeed.textContent = "";

  const resp = await fetch("/api/download_default_model", { method: "POST" });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const d = JSON.parse(line.slice(6));
        if (d.progress !== undefined) { el.progressBar.style.width = d.progress + "%"; el.progressText.textContent = Math.round(d.progress) + "%"; }
        if (d.speed) el.progressSpeed.textContent = d.speed;
        if (d.status === "complete") {
          el.downloadStatus.classList.remove("hidden");
          el.downloadStatus.className = "download-status success";
          el.statusMessage.textContent = "\u2705 \ub2e4\uc6b4\ub85c\ub4dc \uc644\ub8cc! \ud398\uc774\uc9c0\ub97c \ub2e4\uc2dc \ub85c\ub4dc\ud569\ub2c8\ub2e4...";
          setTimeout(() => location.reload(), 2000);
        } else if (d.status === "error") {
          el.downloadStatus.classList.remove("hidden");
          el.downloadStatus.className = "download-status error";
          el.statusMessage.textContent = "\u274c " + (d.error || "\ub2e4\uc6b4\ub85c\ub4dc \uc2e4\ud328");
          btn.disabled = false;
          btn.textContent = "\ud83d\udd04 \ub2e4\uc2dc \uc2dc\ub3c4";
        }
      }
    }
  } catch (e) {
    el.downloadStatus.classList.remove("hidden");
    el.downloadStatus.className = "download-status error";
    el.statusMessage.textContent = "\u274c \uc5f0\uacb0 \uc624\ub958: " + e.message;
    btn.disabled = false;
    btn.textContent = "\ud83d\udd04 \ub2e4\uc2dc \uc2dc\ub3c4";
  }
}

// ── Step Navigation ──
function goToStep(step) {
  document.querySelectorAll(".wizard-step").forEach((el) => el.classList.remove("active"));
  $("step-" + step).classList.add("active");
  document.querySelectorAll(".stepper .step").forEach((el) => {
    const s = parseInt(el.dataset.step);
    el.classList.remove("active", "completed");
    if (s === step) el.classList.add("active");
    else if (s < step) el.classList.add("completed");
  });
  state.currentStep = step;
  if (step === 3) { updateDesignSummary(); showWelcomeMessage(); }
}

function selectType(type) {
  if (!state.modelReady) { showDownloadModal(); return; }
  state.selectedType = type;
  document.querySelectorAll(".type-card").forEach((el) => el.classList.remove("selected"));
  document.querySelector(`.type-card[data-type="${type}"]`).classList.add("selected");
  goToStep(2);
}

async function selectTemplate(template) {
  state.selectedTemplate = template;
  state.selectedDesignContent = "";
  document.querySelectorAll(".template-card").forEach((el) => el.classList.remove("selected"));
  document.querySelector(`.template-card[data-template="${template}"]`).classList.add("selected");
  $("to-step-3").disabled = false;
  if (template !== "custom") {
    try {
      const res = await fetch(`/api/design_template/${template}`);
      if (res.ok) state.selectedDesignContent = (await res.json()).content;
    } catch (e) { console.warn("Design template load failed:", e); }
  }
}

async function generateDesignFromUrl() {
  const url = $("ref-url").value.trim();
  if (!url) return;
  const statusEl = $("design-generation-status");
  statusEl.className = "loading";
  statusEl.textContent = "\ud83d\udd04 URL \ubd84\uc11d \uc911...";
  statusEl.classList.remove("hidden");
  const btn = $("generate-design-btn");
  btn.disabled = true;
  try {
    const res = await fetch("/api/generate_design_from_url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.status === "success") {
      statusEl.className = "success";
      statusEl.textContent = "\u2705 \ub514\uc790\uc778 \ubd84\uc11d \uc644\ub8cc!";
      state.selectedTemplate = "custom";
      state.selectedDesignContent = data.design;
      $("to-step-3").disabled = false;
    } else {
      statusEl.className = "error";
      statusEl.textContent = "\u274c " + (data.error || "\ubd84\uc11d \uc2e4\ud328");
    }
  } catch (e) {
    statusEl.className = "error";
    statusEl.textContent = "\u274c \uc5f0\uacb0 \uc624\ub958: " + e.message;
  }
  btn.disabled = false;
}

function selectPageMode(mode) {
  state.multiPageMode = mode === "multi";
  ["page-mode-single", "page-mode-multi"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", el.id === id && mode === (el.id === "page-mode-single" ? "single" : "multi"));
  });
}

function detectMultiPage(message) {
  if (!message) return null;
  const msg = message.toLowerCase();
  const single = ["\ud55c \ud398\uc774\uc9c0", "\ud55c\uc7a5", "\uc2f1\uae00", "\ub2e8\uc77c", "1\ud398\uc774\uc9c0", "1 \ud398\uc774\uc9c0", "\uc6d0\ud398\uc774\uc9c0", "one page", "one-page", "single page", "\ub2e8\uc77c\ud398\uc774\uc9c0", "\uc2a4\ud06c\ub864\ud615", "1 \uc7a5", "1\uc7a5"];
  for (const kw of single) { if (msg.includes(kw)) return false; }
  const multi = ["\uc5ec\ub7ec \ud398\uc774\uc9c0", "\uc5ec\ub7ec\ud398\uc774\uc9c0", "\uba40\ud2f0", "\ub2e4\uc911 \ud398\uc774\uc9c0", "\uba54\ub274", "\uc11c\ube0c\ud398\uc774\uc9c0", "\ud558\uc704 \ud398\uc774\uc9c0", "\uc0ac\uc774\ud2b8\ub9f5", "\ub124\ube44\uac8c\uc774\uc158 \uba54\ub274", "\ud398\uc774\uc9c0\ub4e4", "\ub2e4\uc911\ud398\uc774\uc9c0"];
  for (const kw of multi) { if (msg.includes(kw)) return true; }
  return null;
}

function updateDesignSummary() {
  if (!el.designSummary) return;
  const types = { company: "\ud83c\udfe2 \ud68c\uc0ac \uc0ac\uc774\ud2b8", landing: "\ud83c\udfaf \ub79c\ub529 \ud398\uc774\uc9c0", promotion: "\ud83d\udd25 \ud504\ub85c\ubaa8\uc158 \ud398\uc774\uc9c0" };
  const tmpl = { minimal_clean: "Minimal Clean", bold_modern: "Bold Modern", elegant_warm: "Elegant Warm", custom: "URL \ucee4\uc2a4\ud140" };
  el.designSummary.innerHTML = `<div class="summary-item"><span class="summary-value">${types[state.selectedType] || "-"}</span></div><div class="summary-item" style="color: var(--text-muted);">|</div><div class="summary-item"><span class="summary-value">${tmpl[state.selectedTemplate] || "-"}</span></div>`;
}

function showWelcomeMessage() {
  if (el.messages.children.length > 0) return;
  const types = { company: "\ud68c\uc0ac \uc0ac\uc774\ud2b8", landing: "\ub79c\ub529 \ud398\uc774\uc9c0", promotion: "\ud504\ub85c\ubaa8\uc158 \ud398\uc774\uc9c0" };
  const tmpl = { minimal_clean: "Minimal Clean", bold_modern: "Bold Modern", elegant_warm: "Elegant Warm", custom: "URL \uae30\ubc18 \ucee4\uc2a4\ud140" };
  addMessage("messages", "assistant", `\uc120\ud0dd\ud558\uc2e0 **${types[state.selectedType]}** + **${tmpl[state.selectedTemplate]}** \uc2a4\ud0c0\uc77c\ub85c \ud648\ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud558\uaca0\uc2b5\ub2c8\ub2e4.\n\n\uc0dd\uc131\uc774 \uc644\ub8cc\ub41c \ud6c4\uc5d0\ub294:\n- \uc694\uc18c\ub97c \ud074\ub9ad\ud558\uc5ec \uc218\uc815/\uc0ad\uc81c\n- \ub9c1\ud06c\ub97c \ud074\ub9ad\ud558\uc5ec \uc120\ud0dd \ud6c4 \ucc44\ud305\uc5d0 '\uc774\ub3d9\ud574\uc8fc\uc138\uc694' → \ub9c1\ud06c \uc774\ub3d9\n- \uc694\uc18c \uc120\ud0dd \ud6c4 '\uc0c8 \ud398\uc774\uc9c0' → \ud558\uc704 \ud398\uc774\uc9c0 \uc0dd\uc131\n\n\uc544\ub798\uc5d0 \ud648\ud398\uc774\uc9c0\uc5d0 \ub4e4\uc5b4\uac04 \ub0b4\uc6a9\uc744 \uc124\uba85\ud574\uc8fc\uc138\uc694. \uc608\ub97c \ub4e4\uc5b4:\n- \ud68c\uc0ac/\uc81c\ud488 \uc18c\uac1c\n- \uc8fc\uc694 \uae30\ub2a5 \ub610\ub294 \uc11c\ube44\uc2a4\n- \ud0c0\uac9f \uace0\uac1d\n- \uac15\uc870\ud558\uace0 \uc2f6\uc740 \ud3ec\uc778\ud2b8\n\n\uc0c1\uc138\ud558\uac8c \uc791\uc131\ud560\uc218\ub85d \ub354 \uc815\ud655\ud55c \uacb0\uacfc\uac00 \ub098\uc635\ub2c8\ub2e4.`);
}

// ── Image Upload ──
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!state.currentProjectId) { addMessage("messages", "assistant", "\u26a0\ufe0f \uba3c\uc800 \ud504\ub85c\uc81d\ud2b8\ub97c \uc2dc\uc791\ud574\uc8fc\uc138\uc694."); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const previewHtml = `<div class="image-attach-preview"><img src="${e.target.result}" alt="\ucca8\ubd80 \uc774\ubbf8\uc9c0" class="image-attach-thumb" /><span class="image-attach-name">${file.name}</span><span class="image-attach-status">\u23f3 \uc5c5\ub85c\ub4dc \uc911...</span></div>`;
    const msgEl = addMessage("messages", "user", previewHtml);
    scrollToBottom("messages");
    const formData = new FormData();
    formData.append("image", file);
    fetch(`/api/projects/${state.currentProjectId}/upload_image`, { method: "POST", body: formData })
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          state.uploadedImages.push({ url: data.url, path: data.path, name: file.name });
          const st = msgEl.querySelector(".image-attach-status");
          if (st) { st.textContent = "\u2705 \uc5c5\ub85c\ub4dc \uc644\ub8cc"; st.style.color = "var(--success, #00b894)"; }
          const imgEl = msgEl.querySelector(".image-attach-thumb");
          if (imgEl) imgEl.src = data.url;
          loadFileTree(state.currentProjectId);
          el.userInput.placeholder = "\uc774\ubbf8\uc9c0\uac00 \ucca8\ubd80\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc774 \uc774\ubbf8\uc9c0\ub97c \uc5b4\ub5bb\uac8c \uc0ac\uc6a9\ud560\uc9c0 \uc785\ub825\ud558\uc138\uc694...";
          el.userInput.focus();
        }
      }).catch(() => { });
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

function getImageContext() {
  if (state.uploadedImages.length === 0) return "";
  const paths = state.uploadedImages.map(img => img.url).join(", ");
  return `\n\n## \ucca8\ubd80\ub41c \uc774\ubbf8\uc9c0\n\ub2e4\uc74c \uc774\ubbf8\uc9c0\uac00 \ud504\ub85c\uc81d\ud2b8\uc5d0 \uc5c5\ub85c\ub4dc\ub418\uc5c8\uc2b5\ub2c8\ub2e4: ${paths}\n- \ud544\uc694\ud558\uba74 HTML\uc5d0\uc11c <img src="...">\ub85c \ucc38\uc870\ud558\uc138\uc694.\n- \uc774\ubbf8\uc9c0\ub97c \ucc38\uace0\ud558\uc5ec \ub514\uc790\uc778/\ub808\uc774\uc544\uc6c3/\uc0c9\uc0c1\uc744 \ubc18\uc601\ud574\ub3c4 \uad1c\ucc2e\uc2b5\ub2c8\ub2e4.`;
}

function clearUploadedImages() { state.uploadedImages = []; }

// ── Preview ──
function injectInteractionScript(frame) {
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    ["wgen-interaction", "wgen-style"].forEach(id => { const s = doc.getElementById(id); if (s) s.remove(); });
    if (!doc.body) { setTimeout(() => injectInteractionScript(frame), 100); return; }
    const style = doc.createElement("style");
    style.id = "wgen-style";
    style.textContent = "body.wgen-devmode { cursor: crosshair !important; } body.wgen-devmode .wgen-selected { outline: 3px solid #6c5ce7 !important; outline-offset: 2px; cursor: pointer !important; } body.wgen-devmode .wgen-hover { outline: 2px dashed #00cec9 !important; outline-offset: 1px; cursor: pointer !important; }";
    doc.head.appendChild(style);
    if (state.devMode) {
      doc.body.classList.add("wgen-devmode");
    } else {
      doc.body.classList.remove("wgen-devmode");
    }
    const script = doc.createElement("script");
    script.id = "wgen-interaction";
    script.textContent = `(function(){var el=null;var devMode=${state.devMode};function gi(e){var l=e.closest("a");var i={tag:e.tagName.toLowerCase(),id:e.id||"",classes:(e.className||"").toString().trim(),text:(e.innerText||"").substring(0,100).trim(),html:e.outerHTML.substring(0,500)};try{var cs=getComputedStyle(e);i.zIndex=cs.zIndex;i.position=cs.position}catch(ex){}if(e.getAttribute("src"))i.src=e.getAttribute("src");if(e.getAttribute("alt"))i.alt=e.getAttribute("alt");if(l){i.linkHref=l.getAttribute("data-nav")||l.getAttribute("href")||"";i.linkText=(l.innerText||"").substring(0,100).trim()}return i};document.addEventListener("mouseover",function(e){if(!devMode)return;if(e.target.tagName==="BODY"||e.target.tagName==="HTML")return;if(el===e.target)return;document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});e.target.classList.add("wgen-hover")});document.addEventListener("mouseout",function(e){if(!devMode)return;if(el!==e.target)e.target.classList.remove("wgen-hover")});document.addEventListener("click",function(e){if(e.button!==0)return;var l=e.target.closest("a");if(l){var h=l.getAttribute("data-nav")||l.getAttribute("href");if(!h||h===""||h.startsWith("javascript:")){e.preventDefault();return}e.preventDefault();e.stopPropagation();if(devMode){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===l){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=l;l.classList.remove("wgen-hover");l.classList.add("wgen-selected")}window.parent.postMessage({type:"preview-link-clicked",href:h,text:(l.innerText||"").substring(0,100).trim(),tag:"a",classes:(l.className||"").toString().trim()},"*");return}if(!devMode)return;e.stopPropagation();if(e.target.tagName==="BODY"||e.target.tagName==="HTML")return;document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===e.target){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=e.target;e.target.classList.remove("wgen-hover");e.target.classList.add("wgen-selected");if(!e.target.getAttribute("data-wgen-id")){e.target.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8))}var i=gi(e.target);i.wgen_id=e.target.getAttribute("data-wgen-id");i.type="element-selected";window.parent.postMessage(i,"*")});window.addEventListener("message",function(e){if(e.data&&e.data.type==="deselect"){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});el=null}if(e.data&&e.data.type==="navigate"){var h=e.data.href;if(h.startsWith("#")){var t=document.querySelector(h);if(t)t.scrollIntoView({behavior:"smooth"})}}if(e.data&&e.data.type==="set-dev-mode"){devMode=e.data.enabled;if(devMode){document.body.classList.add("wgen-devmode")}else{document.body.classList.remove("wgen-devmode");document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});el=null}}})})();`;
    doc.body.appendChild(script);
  } catch (e) { console.warn("iframe injection failed:", e); }
}

function buildInteractionScript() {
  return `<script id="wgen-interaction">(function(){
var el=null;
var devMode=${state.devMode};
var sty=document.getElementById("wgen-style")||function(){var s=document.createElement("style");s.id="wgen-style";s.textContent="body.wgen-devmode{cursor:crosshair!important}body.wgen-devmode .wgen-selected{outline:3px solid #6c5ce7!important;outline-offset:2px;cursor:pointer!important}body.wgen-devmode .wgen-hover{outline:2px dashed #00cec9!important;outline-offset:1px;cursor:pointer!important}";document.head.appendChild(s);return s}();
function applyDevMode(v){var b=document.body;if(b)b.classList.toggle("wgen-devmode",v)};
var _dm=devMode;applyDevMode(_dm);if(!document.body)document.addEventListener("DOMContentLoaded",function(){applyDevMode(_dm)});
window.addEventListener("message",function(e){if(e.data&&e.data.type==="set-dev-mode"){devMode=e.data.enabled;applyDevMode(devMode);if(!devMode){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});el=null}}else if(e.data&&e.data.type==="deselect"){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});el=null}});
document.addEventListener("mouseover",function(e){if(!devMode||e.target.tagName==="BODY"||e.target.tagName==="HTML"||el===e.target)return;document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});e.target.classList.add("wgen-hover")});
document.addEventListener("mouseout",function(e){if(!devMode)return;if(el!==e.target)e.target.classList.remove("wgen-hover")});
document.addEventListener("click",function(e){if(e.button!==0)return;var l=e.target.closest("a");if(l){var h=l.getAttribute("data-nav")||l.getAttribute("href");if(!h||h===""||h.startsWith("javascript:")){e.preventDefault();return}e.preventDefault();e.stopPropagation();if(devMode){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===l){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=l;l.classList.remove("wgen-hover");l.classList.add("wgen-selected")}window.parent.postMessage({type:"preview-link-clicked",href:h,text:(l.innerText||"").substring(0,100).trim(),tag:"a",classes:(l.className||"").toString().trim()},"*");return}if(!devMode)return;e.stopPropagation();if(e.target.tagName==="BODY"||e.target.tagName==="HTML")return;document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===e.target){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=e.target;e.target.classList.add("wgen-selected");if(!e.target.getAttribute("data-wgen-id")){e.target.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8))}var _wid=e.target.getAttribute("data-wgen-id");window.parent.postMessage({type:"element-selected",wgen_id:_wid,tag:e.target.tagName.toLowerCase(),id:e.target.id||"",classes:(e.target.className||"").toString().trim(),text:(e.target.innerText||"").substring(0,100).trim(),html:e.target.outerHTML.substring(0,500)},"*")});})();<\/script>`;
}

function showPreviewError(msg) {
  const frame = el.previewFrame;
  if (!frame) return;
  const safe = (msg || "미리보기 내용이 비어 있습니다.").replace(/</g, "&lt;");
  const body = '<body style="font-family:system-ui;padding:24px;color:#c0392b;background:#1a1a1a">' +
    '<h3>⚠️ 미리보기 오류</h3><p>' + safe + '</p></body>';
  try { frame.srcdoc = body; } catch (e) {}
  frame.style.display = "block";
  frame.classList.remove("hidden");
  if (el.previewPlaceholder) el.previewPlaceholder.classList.add("hidden");
}

function updatePreview(html, isStreaming) {
  const frame = el.previewFrame;
  if (!frame || !html) return;
  let processed = html.replace(/===HTML_START===|===HTML_END===/g, "").replace(/<script[\s\S]*?<\/script>/gi, "").trim();
  if (!processed || processed.length < 10) {
    // 빈 결과를 조용히 무시하지 않는다 — 스트리밍 중이 아니면 에러 표시
    if (!isStreaming) showPreviewError("생성된 HTML이 비어 있습니다. 다시 시도해 주세요.");
    return;
  }
  const headScripts = '<script id="wgen-error-catcher">window.onerror=function(m,u,l,c){window.parent.postMessage({type:"preview-error",message:m,line:l,col:c},"*");return false;};window.addEventListener("unhandledrejection",function(e){window.parent.postMessage({type:"preview-error",message:"Unhandled promise: "+(e.reason&&e.reason.message||e.reason),"line":0,"col":0},"*");});<\/script>' + buildInteractionScript();
  const hi = processed.toLowerCase().indexOf("<head");
  if (hi !== -1) {
    const ho = processed.indexOf(">", hi);
    if (ho !== -1) processed = processed.slice(0, ho + 1) + headScripts + processed.slice(ho + 1);
  }
  try {
    if (frame.srcdoc !== undefined) {
      frame.srcdoc = processed;
    } else {
      const doc = frame.contentDocument || frame.contentWindow.document;
      doc.open();
      doc.write(processed);
      doc.close();
    }
  } catch (e) {
    console.warn("[preview] srcdoc failed, trying blob URL", e);
    try {
      const blob = new Blob([processed], { type: "text/html;charset=utf-8" });
      frame.src = URL.createObjectURL(blob);
    } catch (e2) {
      console.error("[preview] all methods failed", e2);
    }
  }
  frame.style.display = "block";
  frame.classList.remove("hidden");
  if (el.previewPlaceholder) el.previewPlaceholder.classList.add("hidden");
}

function showGenerating(isEditing) {
  state.abortController = new AbortController();
  if (el.previewGenerating) {
    el.previewGenerating.classList.remove("hidden");
    const title = el.previewGenerating.querySelector("h3");
    if (title) title.textContent = isEditing ? "\uc218\uc815 \uc911" : "\ud648\ud398\uc774\uc9c0 \uc0dd\uc131 \uc911";
  }
  const cancelBtn = document.getElementById("btn-cancel-generate");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  if (el.generatingProgressList) el.generatingProgressList.innerHTML = "";
  if (el.generatingStatusText) el.generatingStatusText.textContent = isEditing ? "\uc218\uc815 \uc694\uccad\uc744 \ucc98\ub9ac \uc911\uc785\ub2c8\ub2e4..." : "AI\uac00 \ud398\uc774\uc9c0\ub97c \ub9cc\ub4e4\uace0 \uc788\uc2b5\ub2c8\ub2e4...";
  if (el.previewFrame) el.previewFrame.classList.add("hidden");
  // Create empty CSS/JS placeholder files at the start of any generation
  state.generatingFiles = { "assets/css/style.css": true, "assets/js/main.js": true };
  if (state.currentProjectId) {
    Promise.all([
      fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "assets/css/style.css", content: "/* style.css */\n" }),
      }).catch(() => {}),
      fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "assets/js/main.js", content: "// main.js\n" }),
      }).catch(() => {}),
    ]).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
  }
  updateProgressBar(0);
}

function hideGenerating(isFinal) {
  state.abortController = null;
  if (el.previewGenerating) el.previewGenerating.classList.add("hidden");
  const cancelBtn = document.getElementById("btn-cancel-generate");
  if (cancelBtn) cancelBtn.classList.add("hidden");
  if (isFinal !== false) updateProgressBar(100);
}

window.cancelGeneration = function () {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  state.isGenerating = false;
  state.pendingElementAction = false;
  el.sendBtn.disabled = false;
  el.typingIndicator.classList.add("hidden");
  hideGenerating();
  addMessage("messages", "assistant", "\u26a0\ufe0f \uc791\uc5c5\uc774 \ucde8\uc18c\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
};

function updateProgressBar(pct) {
  const clamped = Math.min(95, Math.max(0, pct));
  if (el.generatingProgressBar) el.generatingProgressBar.style.width = `${clamped}%`;
  if (el.generatingProgressPercent) el.generatingProgressPercent.textContent = `${Math.round(clamped)}%`;
}

let _lastSpeed = "";
function updateModularProgress(completedIds, completedCount, modules) {
  if (!el.previewGenerating || !el.generatingProgressList || !el.generatingStatusText) return;
  const set = new Set(completedIds);
  let activeIdx = -1;
  for (let i = 0; i < modules.length; i++) { if (!set.has(modules[i].id)) { activeIdx = i; break; } }
  const speedText = _lastSpeed ? ` [${_lastSpeed}]` : "";
  el.generatingStatusText.textContent = (activeIdx !== -1 ? `${activeIdx + 1}/${modules.length}: ${modules[activeIdx].description || modules[activeIdx].id} \uc0dd\uc131 \uc911...` : `${completedCount}/${modules.length} \ubaa8\ub4c8 \uc644\ub8cc`) + speedText;
  el.generatingProgressList.innerHTML = modules.map((m, i) => {
    let status = "pending", icon = "\u00b7";
    if (set.has(m.id)) { status = "completed"; icon = "\u2713"; }
    else if (i === activeIdx) { status = "active"; icon = "\u27f3"; }
    const speedInfo = (i === activeIdx && _lastSpeed) ? ` <span style="color:var(--text-muted);font-size:0.7rem;">${_lastSpeed}</span>` : "";
    return `<div class="generating-progress-item ${status}"><span class="generating-progress-icon">${icon}</span><span>${m.description || m.id}${speedInfo}</span></div>`;
  }).join("");
  updateProgressBar(modules.length ? (completedCount / modules.length) * 100 : 0);
  const a = el.generatingProgressList.querySelector(".active");
  if (a) a.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function updateMultiPageProgress(completedModules, currentPageMods, totalModules, totalPages, currentPageIdx, pageName) {
  if (!el.generatingProgressList || !el.generatingStatusText) return;
  if (!totalPages || totalPages <= 0) { el.generatingProgressList.innerHTML = '<div style="padding:4px;color:var(--text-muted);font-size:0.75rem;">\uacc4\ud68d \uc218\ub9bd \uc911...</div>'; return; }
  currentPageIdx = Math.min(currentPageIdx, totalPages - 1);
  el.generatingProgressList.innerHTML = "";
  for (let i = 0; i < totalPages; i++) {
    const isCurrent = i === currentPageIdx;
    const isCompleted = i < currentPageIdx;
    const status = isCompleted ? "completed" : (isCurrent ? "active" : "pending");
    const icon = isCompleted ? "\u2713" : (isCurrent ? "\u27f3" : "\u00b7");
    const modCount = currentPageMods && isCurrent ? `${completedModules}/${totalModules}` : "";
    const speedInfo = isCurrent && _lastSpeed ? ` <span style="color:var(--text-muted);font-size:0.7rem;">${_lastSpeed}</span>` : "";
    const pg = state.multiPagePlanPages[i] || {};
    const displayName = pg.label || pg.name || pg.file || pageName || `\ud398\uc774\uc9c0 ${i + 1}`;
    el.generatingProgressList.innerHTML += `<div class="generating-progress-item ${status}"><span class="generating-progress-icon">${icon}</span><span>${displayName} ${modCount ? `(${modCount})` : ""}${speedInfo}</span></div>`;
  }
  const currentLabel = (state.multiPagePlanPages[currentPageIdx] || {}).name || pageName || `\ud398\uc774\uc9c0 ${currentPageIdx + 1}`;
  const speedText = _lastSpeed ? ` [${_lastSpeed}]` : "";
  el.generatingStatusText.textContent = `\ud83d\udcc4 ${currentLabel} \uc0dd\uc131 \uc911${totalModules ? ` (${completedModules}/${totalModules})` : ""}...${speedText}`;
  const pct = Math.min(95, ((currentPageIdx) / Math.max(1, totalPages) * 100) + (totalModules ? (completedModules / Math.max(1, totalModules)) * (100 / Math.max(1, totalPages)) : 0));
  updateProgressBar(pct);
}

// ── Streaming Helpers ──
function createSSEReader(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handlers = {};
  const api = {
    on: (type, fn) => { handlers[type] = handlers[type] || []; handlers[type].push(fn); return api; },
    start: async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          if (dataStr === "[DONE]") { api.emit("done"); continue; }
          try { api.emit("message", JSON.parse(dataStr)); }
          catch (e) { /* skip invalid JSON */ }
        }
      }
      api.emit("stream_end");
    },
    emit: (event, data) => {
      const hs = handlers[event] || [];
      for (const fn of hs) fn(data);
      if (event === "message" && data && data.type) {
        const typed = handlers[data.type] || [];
        for (const fn of typed) fn(data);
      }
    }
  };
  return api;
}

// ── Send Message Flow ──
async function decideStrategy(message, hasHtml, hasElement) {
  try {
    const res = await fetch("/api/decide_strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, has_html: hasHtml, has_element: hasElement }),
    });
    const data = await res.json();
    return data.strategy || "edit";
  } catch (e) {
    console.warn("Strategy fetch failed:", e);
    const m = message.toLowerCase();
    if (m.includes("\uc18c\uac1c") || m.includes("1\uc7a5") || m.includes("\ud55c \uc7a5") || m.includes("\ub9cc\ub4e4")) return "direct";
    if (m.includes("\uc0c9\uc0c1") || m.includes("\uc218\uc815") || m.includes("\ubc14\uafb8")) return "edit";
    if (m.includes("\uc548\ub155") || m.includes("\uac10\uc0ac") || m.includes("\ubb50")) return "chat";
    return "edit";
  }
}

async function callChatStream(messages, onToken, onReasoning, onDone) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    const sse = createSSEReader(res);
    sse.on("content", (data) => { if (onToken) onToken(data.content); });
    sse.on("reasoning", (data) => { if (onReasoning) onReasoning(data.content); });
    sse.on("done", () => { if (onDone) onDone(); });
    sse.on("error", (data) => { throw new Error(data.error); });
    await sse.start();
  } finally {
    clearTimeout(timeout);
  }
}

async function generateProjectId() {
  state.currentProjectId = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
}

async function initProjectStructure(message) {
  if (!state.projectTitle) state.projectTitle = message.slice(0, 30) + (message.length > 30 ? "..." : "");
  try {
    await fetch("/api/projects/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.currentProjectId,
        title: state.projectTitle,
        page_type: state.selectedType,
        template: state.selectedTemplate,
      }),
    });
    loadFileTree(state.currentProjectId);
    loadProjects();
  } catch (e) { console.warn("Project init failed:", e); }
}

async function sendMessageDirect(message, assistantDiv) {
  if (!state.currentProjectId) {
    await generateProjectId();
    if (!state.projectTitle) state.projectTitle = message.slice(0, 30) + (message.length > 30 ? "..." : "");
    await initProjectStructure(message);
  }
  const directBody = {
    message,
    history: state.chatHistory.slice(-5),
    page_type: state.selectedType,
    template: state.selectedTemplate,
    design_content: state.selectedDesignContent,
    current_html: "",
    element_context: "",
    is_new_page: false,
    chat_only: false,
    strategy: "direct",
  };
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(directBody),
    signal: state.abortController?.signal,
  });
  const sse = createSSEReader(res);
  let fullContent = "";
  let lastPreviewUpdate = 0;
  const PREVIEW_THROTTLE_MS = 400;
  let fixedHtml = null;

  assistantDiv.innerHTML = "";

  sse.on("content", (t) => {
    const cText = t.content || t.text || "";
    if (cText) {
      fullContent += cText;
      const now = Date.now();
      if (now - lastPreviewUpdate > PREVIEW_THROTTLE_MS) {
        lastPreviewUpdate = now;
        const streamingHtml = extractHtmlStreaming(fullContent) || extractHtmlMarker(fullContent);
        if (streamingHtml && streamingHtml.length > 100) {
          state.generatedHtml = streamingHtml;
          updatePreview(streamingHtml, true);
        }
      }
    }
  });

  sse.on("html_fix", (d) => {
    if (d.content) {
      fixedHtml = d.content;
      state.generatedHtml = fixedHtml;
      updatePreview(fixedHtml, false);
    }
  });

  sse.on("stream_end", async () => {
    if (!fullContent || fullContent.trim() === "") { throw new Error("AI 응답이 비어있습니다"); }
    if (fixedHtml) {
      state.generatedHtml = fixedHtml;
      updatePreview(fixedHtml, false);
    } else {
      const extracted = extractHtmlMarker(fullContent) || extractHtml(fullContent);
      if (extracted) {
        state.generatedHtml = extracted;
        updatePreview(state.generatedHtml, false);
      } else {
        const di = fullContent.indexOf("<!DOCTYPE html>");
        if (di !== -1) {
          let raw = fullContent.slice(di).trim();
          const eiTag = raw.indexOf("===HTML_END===");
          if (eiTag !== -1) raw = raw.slice(0, eiTag).trim();
          state.generatedHtml = raw;
          updatePreview(state.generatedHtml, false);
        }
      }
    }
    if (state.generatedHtml && state.currentProjectId) {
      await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "index.html", content: state.generatedHtml }),
      }).catch(() => {});
      loadFileTree(state.currentProjectId);
    }
    hideGenerating();
    assistantDiv.innerHTML = "✅ 홈페이지 생성 완료! 오른쪽 미리보기를 확인하세요.";
    state.chatHistory.push({ role: "assistant", content: "홈페이지를 생성했습니다." });
    saveProject();
    enableReviewBtn();
  });
  await sse.start();
}

async function sendMessageModular(message, assistantDiv, history, currentHtml, isNewPage, skipFinalActions, multiPage) {
  if (!history) state.chatHistory.push({ role: "user", content: message });
  if (!state.currentProjectId) await generateProjectId();
  if (!state.projectTitle) state.projectTitle = message.slice(0, 30) + (message.length > 30 ? "..." : "");
  await initProjectStructure(message);

  const res = await fetch("/api/chat/stream/modular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: state.abortController?.signal,
    body: JSON.stringify({
      message,
      page_type: state.selectedType,
      template: state.selectedTemplate,
      design_content: state.selectedDesignContent,
      history: history || state.chatHistory.slice(0, -1),
      current_html: currentHtml || state.generatedHtml || "",
      is_new_page: isNewPage || false,
      multi_page: !!multiPage,
      direct_mode: !!state.directMode,
    }),
  });

  const sse = createSSEReader(res);
  let modules = [];
  let moduleHtmls = {};
  let completedCount = 0;
  let planText = "";
  let currentModuleId = "";
  let allPagesHtml = {};
  let currentPageName = "";
  let currentPageIdx = 0;
  let currentPageModules = {};
  let totalPages = 0;
  let mpMenuItems = [];
  let previewThrottle = 0;
  const PREVIEW_THROTTLE_MS = 400;

  sse.on("error", (d) => {
    const msg = d.content || d.error || "\uc624\ub958";
    if (el.generatingStatusText) {
      el.generatingStatusText.textContent = `\u26a0\ufe0f ${msg}`;
    }
    assistantDiv.innerHTML = `\u26a0\ufe0f ${msg}`;
    scrollToBottom("messages");
  });

  sse.on("multi_plan", (d) => {
    mpMenuItems = d.menu_items || [];
    state.multiPagePlanPages = d.pages || [];
    state.multiPageMode = state.multiPagePlanPages.length > 1;
    totalPages = state.multiPagePlanPages.length;
    state.multiPageMenuItems = mpMenuItems;
    // Mark all page files as generating (preserve CSS/JS from showGenerating)
    (d.pages || []).forEach(pg => { state.generatingFiles[pg.file] = true; });
    assistantDiv.innerHTML = `\ud83d\udccb \uba40\ud2f0\ud398\uc774\uc9c0 \uacc4\ud68d \uc644\ub8cc (${totalPages}\uac1c \ud398\uc774\uc9c0)<br><span style="color: var(--text-muted); font-size: 0.85rem;">\uba54\ub274: ${mpMenuItems.join(" | ")}</span>`;
    scrollToBottom("messages");
    // Create all page placeholder files immediately (CSS/JS already created by showGenerating)
    if (state.currentProjectId) {
      Promise.all((d.pages || []).map(pg => {
        const ph = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${pg.title || pg.name || ''}</title><link rel="stylesheet" href="assets/css/style.css"></head><body><p>${pg.file || pg.name} \uc0dd\uc131 \uc911...</p><script src="assets/js/main.js"></script></body></html>`;
        return fetch(`/api/projects/${state.currentProjectId}/save_file`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pg.file, content: ph }),
        }).catch(() => {});
      })).then(() => loadFileTree(state.currentProjectId));
    }
    updateMultiPageProgress(0, {}, 0, totalPages, 0, (d.pages?.[0] || {}).name || "");
    updateProgressBar(5);
  });

  sse.on("page_start", (d) => {
    currentPageName = d.name;
    currentPageIdx = d.index || 0;
    currentPageModules = {};
    const pageCount = d.total || totalPages || 0;
    assistantDiv.innerHTML = `\ud83d\udcc4 \ud398\uc774\uc9c0 \uc0dd\uc131 \uc911: <strong>${d.index + 1}/${pageCount}</strong> \u2014 ${d.file || d.name}`;
    scrollToBottom("messages");
    updateMultiPageProgress(0, currentPageModules, 0, pageCount, currentPageIdx, d.file || d.name);
  });

  sse.on("page_complete", async (d) => {
    const html = d.html || "";
    allPagesHtml[d.file] = html;
    delete state.generatingFiles[d.file];
    if (html) updatePreview(html.replace(/===MODULE_START===|===MODULE_END===/g, ""), false);
    if (state.currentProjectId && html) {
      await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: d.file, content: html }),
      }).then(r => r.ok && loadFileTree(state.currentProjectId)).catch(() => {});
    }
    updateProgressBar(((d.index + 1) / d.total) * 100);
  });

  sse.on("multi_done", async (d) => {
    if (d.pages && Object.keys(d.pages).length > 0) allPagesHtml = d.pages;
    state.generatedHtml = (allPagesHtml["index.html"] || "").replace(/===MODULE_START===|===MODULE_END===/g, "");
    state.multiPageMode = true;
    state.generatingFiles = {};
    state.multiPagePlanPages = Object.keys(allPagesHtml).map(f => ({ name: f.replace(/\.html$/, "").replace("pages/", ""), file: f }));
    if (state.generatedHtml) updatePreview(state.generatedHtml, false);
    if (!skipFinalActions) {
      hideGenerating();
      const pageList = Object.keys(allPagesHtml).join(", ");
      assistantDiv.innerHTML = `\u2705 \uba40\ud2f0\ud398\uc774\uc9c0 \uc0dd\uc131 \uc644\ub8cc! (${totalPages}\uac1c \ud398\uc774\uc9c0: ${pageList})`;
      state.chatHistory.push({ role: "assistant", content: `\uba40\ud2f0\ud398\uc774\uc9c0 \uc0dd\uc131 \uc644\ub8cc (${totalPages}\ud398\uc774\uc9c0: ${pageList})` });
      try {
        await fetch(`/api/projects/${state.currentProjectId}/save_multipage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: allPagesHtml, title: state.projectTitle, page_type: state.selectedType, template: state.selectedTemplate, history: state.chatHistory, design_content: state.selectedDesignContent, menu_items: mpMenuItems }),
        });
        // post-generation AI review 제거됨: 백엔드에서 결정적 조립 + ensure_complete_html로 보정
      } catch (e) { console.warn("Multi-page save failed:", e); }
      enableReviewBtn();
      loadFileTree(state.currentProjectId);
      loadProjects();
    }
  });

  sse.on("module_start", (d) => {
    if (d.page) {
      currentModuleId = d.id;
      if (!currentPageModules[d.page]) currentPageModules[d.page] = {};
      assistantDiv.innerHTML = `\u23f3 ${d.page} > \ubaa8\ub4c8 <strong>${d.index + 1}/${d.total}</strong> - ${d.id}`;
      scrollToBottom("messages");
      updateMultiPageProgress(0, currentPageModules[d.page], d.total, totalPages, currentPageIdx, d.page);
    } else {
      currentModuleId = d.id;
      const name = modules[d.index]?.description || d.id;
      assistantDiv.innerHTML = `\u23f3 \ubaa8\ub4c8 \uc0dd\uc131 \uc911: <strong>${d.index + 1}/${d.total}</strong> - ${name}`;
      scrollToBottom("messages");
      updateModularProgress(Object.keys(moduleHtmls), completedCount, modules);
    }
  });

  sse.on("module_token", (d) => {
    if (!moduleHtmls[currentModuleId]) moduleHtmls[currentModuleId] = "";
    moduleHtmls[currentModuleId] += d.content;
    // Real-time preview streaming for fast single-page mode
    const now = Date.now();
    if (currentModuleId === "full_page" && now - previewThrottle > PREVIEW_THROTTLE_MS) {
      previewThrottle = now;
      const raw = moduleHtmls["full_page"] || "";
      const streamingHtml = extractHtmlStreaming(raw) || extractHtmlMarker(raw);
      if (streamingHtml && streamingHtml.length > 100) {
        state.generatedHtml = streamingHtml;
        updatePreview(streamingHtml, true);
      }
    }
  });

  sse.on("module_complete", (d) => {
    if (d.speed) _lastSpeed = `${d.speed} tok/s`;
    if (d.page) {
      currentModuleId = "";
      if (!currentPageModules[d.page]) currentPageModules[d.page] = {};
      currentPageModules[d.page][d.id] = true;
      const doneMods = Object.keys(currentPageModules[d.page]).length;
      updateMultiPageProgress(doneMods, currentPageModules[d.page], d.total || totalPages, totalPages, currentPageIdx, d.page);
    } else {
      currentModuleId = "";
      completedCount++;
      const name = modules[d.index]?.description || d.id;
      assistantDiv.innerHTML = `\u2705 ${completedCount}/${modules.length} \uc644\ub8cc \u2014 ${name} ${_lastSpeed ? `(${_lastSpeed})` : ""}`;
      scrollToBottom("messages");
      let raw = moduleHtmls[d.id] || "";
      const ms = raw.indexOf("===MODULE_START===");
      if (ms !== -1) raw = raw.substring(ms + 19);
      const me = raw.indexOf("===MODULE_END===");
      if (me !== -1) raw = raw.substring(0, me);
      raw = raw.trim();
      if (raw.startsWith("```")) { const rl = raw.split("\n"); rl.shift(); if (rl.length && rl[rl.length - 1].trim() === "```") rl.pop(); raw = rl.join("\n").trim(); }
      moduleHtmls[d.id] = raw;
      updateModularProgress(Object.keys(moduleHtmls), completedCount, modules);
    }
  });

  sse.on("plan_token", (d) => {
    planText += d.content;
    // Don't show raw plan text — keep the initial "planning" status
  });

  sse.on("plan", (d) => {
    modules = d.modules || [];
    state.generatingFiles["index.html"] = true;
    assistantDiv.innerHTML = `\ud83d\udccb \ubaa8\ub4c8 \uacc4\ud68d \uc644\ub8cc (${modules.length}\uac1c \ubaa8\ub4c8)`;
    scrollToBottom("messages");
    updateModularProgress([], 0, modules);
    updateProgressBar(5);
  });

  sse.on("done", async (d) => {
    state.generatingFiles = {};
    state.generatedHtml = (d.html || state.generatedHtml).replace(/===MODULE_START===|===MODULE_END===/g, "");
    if (!state.generatedHtml || state.generatedHtml.length < 50) {
      let fallback = "";
      for (const mod of modules) { if (moduleHtmls[mod.id]) fallback += moduleHtmls[mod.id] + "\n"; }
      if (fallback.length > 50) state.generatedHtml = fallback;
    }
    if (state.generatedHtml && state.generatedHtml.length > 10) {
      updatePreview(state.generatedHtml, false);
    }
    if (!skipFinalActions) {
      if (state.currentProjectId && state.generatedHtml) {
        await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "index.html", content: state.generatedHtml }),
        }).catch(() => {});
        // post-generation AI review 제거됨: 백엔드에서 결정적 조립 + ensure_complete_html로 보정
      }
      hideGenerating();
      assistantDiv.innerHTML = `\u2705 \ud648\ud398\uc774\uc9c0 \uc0dd\uc131 \uc644\ub8cc! (${modules.length}\uac1c \ubaa8\ub4c8)`;
      state.chatHistory.push({ role: "assistant", content: `\ud648\ud398\uc774\uc9c0 \uc0dd\uc131 \uc644\ub8cc (${modules.length}\uac1c \ubaa8\ub4c8)` });
      saveProject();
      enableReviewBtn();
    }
  });

  sse.on("error", (d) => {
    assistantDiv.innerHTML = `<span style="color: var(--error);">\u26a0\ufe0f \uc624\ub958: ${d.content}</span>`;
    hideGenerating();
  });

  await sse.start();
}

function pushHtmlSnapshot() {
  if (state.generatedHtml) {
    state.htmlHistory.push(state.generatedHtml);
    if (state.htmlHistory.length > 20) state.htmlHistory.shift();
  }
}

// ── 모드 셀렉터 (자동 추천 + 수동 덮어쓰기) ──
function getSelectedMode() {
  const elSel = document.getElementById("mode-select");
  const v = elSel ? elSel.value : "auto";
  return v === "auto" ? undefined : v; // auto면 서버 자동 분류
}

// ── 통일 전송 (v2) ──
// /api/chat/stream/v2 + createSSEReader(type 라우팅).
// html→미리보기, chat→채팅창, status→모달. 콘텐츠 추측·덤프 없음.
async function sendMessageV2(message, displayMessage, elementContextObj) {
  if (!state.currentProjectId) {
    await generateProjectId();
    if (!state.projectTitle) state.projectTitle = message.slice(0, 30) + (message.length > 30 ? "..." : "");
    await initProjectStructure(message);
  }
  const savedHtml = state.generatedHtml || "";
  const isFirst = !savedHtml && !elementContextObj;
  const dm = detectMultiPage(message);
  const isMulti = isFirst && (dm !== null ? dm : state.multiPageMode);

  // design_system: 저장본이 있으면 사용(scaffold_css/menu 재사용), 최신 토큰 반영
  const designSystem = Object.assign(
    { template: "", page_type: "", design_content: "", scaffold_css: "", brand: "WebGen AI", menu_items: [] },
    state.designSystem || {}
  );
  designSystem.template = state.selectedTemplate || designSystem.template;
  designSystem.page_type = state.selectedType || designSystem.page_type;
  if (state.selectedDesignContent) designSystem.design_content = state.selectedDesignContent;
  if (state.projectTitle) designSystem.brand = state.projectTitle;

  const assistantDiv = addMessage("messages", "assistant", isFirst ? "⏳ 홈페이지 생성 중..." : "⏳ 처리 중...");
  showGenerating(!isFirst);

  let chatText = "";
  let finalHtml = "";
  let sawHtml = false;
  const multiPages = {};

  try {
    const response = await fetch("/api/chat/stream/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mode: getSelectedMode(),
        design_system: designSystem,
        history: state.chatHistory.slice(-5),
        current_html: savedHtml,           // 전체 — 절단 없음
        element_context: elementContextObj || null,
        multi_page: !!isMulti,
        page_type: state.selectedType,
        template: state.selectedTemplate,
      }),
      signal: state.abortController ? state.abortController.signal : undefined,
    });

    const sse = createSSEReader(response);
    sse.on("status", (d) => {
      const p = d.payload;
      if (typeof p === "string") { if (el.generatingStatusText) el.generatingStatusText.textContent = p.slice(0, 80); }
      else if (p && p.menu_items) { state.multiPageMenuItems = p.menu_items; }
    });
    sse.on("chat", (d) => {
      chatText += (d.payload || "");
      assistantDiv.innerHTML = formatContent(stripThinkingBlock(chatText));
      scrollToBottom("messages");
    });
    sse.on("html", (d) => {
      sawHtml = true;
      const p = d.payload;
      if (typeof p === "string") { finalHtml = p; state.generatedHtml = p; updatePreview(p, true); }
      else if (p && p.file) {
        multiPages[p.file] = p.html;
        if (p.file === "index.html") { finalHtml = p.html; state.generatedHtml = p.html; updatePreview(p.html, true); }
      }
    });
    sse.on("done", (d) => {
      const p = d && d.payload;
      if (p && p.html) { finalHtml = p.html; state.generatedHtml = p.html; }
    });
    sse.on("error", (d) => {
      assistantDiv.innerHTML = `<span style="color: var(--error);">⚠️ ${d.payload}</span>`;
    });
    await sse.start();

    if (finalHtml) {
      state.generatedHtml = finalHtml;
      updatePreview(finalHtml, false);
      if (Object.keys(multiPages).length) {
        state.multiPageHtmls = Object.assign(state.multiPageHtmls || {}, multiPages);
        state.multiPageMode = true;
        if (state.multiPageMenuItems && state.multiPageMenuItems.length) designSystem.menu_items = state.multiPageMenuItems;
      }
      state.designSystem = designSystem; // 갱신된 디자인 상태 보존
      if (state.currentProjectId) {
        await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "index.html", content: finalHtml }),
        }).catch(() => {});
        for (const [file, html] of Object.entries(multiPages)) {
          if (file === "index.html") continue;
          await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: file, content: html }),
          }).catch(() => {});
        }
        loadFileTree(state.currentProjectId);
      }
      state.chatHistory.push({ role: "assistant", content: "홈페이지를 생성했습니다. 미리보기를 확인하세요." });
      if (!chatText) assistantDiv.innerHTML = "<div>✅ 완료! 오른쪽 미리보기를 확인하세요.</div>";
      saveProject();
      enableReviewBtn();
    } else if (chatText) {
      // ASK 등 — 채팅만, 미리보기 불변
      state.chatHistory.push({ role: "assistant", content: stripThinkingBlock(chatText) });
    } else if (!sawHtml) {
      assistantDiv.innerHTML = "<span style=\"color: var(--error);\">⚠️ 응답을 받지 못했습니다. 다시 시도해 주세요.</span>";
    }
  } catch (e) {
    if (e.name === "AbortError") { assistantDiv.innerHTML = "⚠️ 작업이 취소되었습니다."; }
    else { assistantDiv.innerHTML = `<span style="color: var(--error);">⚠️ 오류: ${e.message}</span>`; }
  } finally {
    state.selectedElement = null;
    state.pendingElementAction = false;
    if (typeof hideSelectedElementBar === "function") hideSelectedElementBar();
    hideGenerating();
    state.isGenerating = false;
    el.sendBtn.disabled = false;
    el.typingIndicator.classList.add("hidden");
  }
}

// ── Main sendMessage ──
async function sendMessage() {
  const input = el.userInput;
  let message = input.value.trim();
  if (!message || state.isGenerating) return;
  if (!state.modelReady) { showDownloadModal(); return; }

  if (/^이동(해[주줘][세]?[요]?|해죠|$)/.test(message)) {
    if (!state.pendingLinkHref) {
      addMessage("messages", "assistant", `🔗 선택된 링크가 없습니다.\n\n미리보기에서 링크를 클릭하여 선택한 후 다시 시도해주세요.`);
      input.value = "";
      return;
    }
    const href = state.pendingLinkHref;
    addMessage("messages", "assistant", `➡️ **${href}**(으)로 이동합니다.`);
    if (href.startsWith("pages/")) {
      loadSubPageInPreview(href);
    } else if (href === "index.html" || href === "/" || href === "./") {
      state.currentViewPath = "index.html";
      updatePreview(state.generatedHtml, false);
      loadFileTree(state.currentProjectId);
    } else if (href.startsWith("#")) {
      const frame = el.previewFrame;
      if (frame) frame.contentWindow.postMessage({ type: "navigate", href }, "*");
    } else {
      window.open(href, "_blank");
    }
    state.pendingLinkHref = "";
    state.pendingLinkElement = null;
    hideSelectedElementBar();
    input.value = "";
    return;
  }

  if (message === "/undo") {
    if (state.htmlHistory.length === 0) {
      addMessage("messages", "assistant", "되돌릴 작업이 없습니다.");
      input.value = "";
      return;
    }
    const prev = state.htmlHistory.pop();
    state.generatedHtml = prev;
    updatePreview(prev, false);
    if (state.currentProjectId) {
      await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "index.html", content: prev }),
      }).catch(() => {});
      loadFileTree(state.currentProjectId);
    }
    addMessage("messages", "assistant", "⏪ 이전 상태로 되돌렸습니다.");
    input.value = "";
    return;
  }

  const isFirstGeneration = !state.generatedHtml && !state.selectedElement && !state.pendingElementAction;
  input.value = "";
  input.style.height = "auto";
  const savedHtml = state.generatedHtml;

  let displayMessage = message;
  let elementContext = "";

  if (state.selectedElement) {
    const elDesc = `<${state.selectedElement.tag}${state.selectedElement.id ? ` id="${state.selectedElement.id}"` : ""}${state.selectedElement.classes ? ` class="${state.selectedElement.classes}"` : ""}>`;
    displayMessage = `[\uc120\ud0dd\ub41c \uc694\uc18c: ${elDesc}] ${message}`;
    state.chatHistory.push({ role: "user", content: displayMessage });
    const z = state.selectedElement.zIndex;
    const p = state.selectedElement.position;
    const cssInfo = (z && z !== "auto") || (p && p !== "static") ? `- CSS position: ${p || "static"}\n- CSS z-index: ${z || "auto"}\n` : "";
    elementContext = `## \uc120\ud0dd\ub41c \uc694\uc18c \uc218\uc815 \uc694\uccad\n### \uc694\uc18c \uc815\ubcf4:\n- \ud0dc\uadf8: <${state.selectedElement.tag}>\n- ID: ${state.selectedElement.id || "(\uc5c6\uc74c)"}\n- \ud074\ub798\uc2a4: ${state.selectedElement.classes || "(\uc5c6\uc74c)"}\n- \ud604\uc7ac \ud14d\uc2a4\ud2b8: ${state.selectedElement.text || "(\uc5c6\uc74c)"}\n- \uc804\uccb4 HTML: ${state.selectedElement.html || "(\uc5c6\uc74c)"}\n${cssInfo}### \uc0ac\uc6a9\uc790 \uc694\uccad:\n${message}\n${getImageContext()}`;
  } else if (!isFirstGeneration) {
    const imgCtx = getImageContext();
    if (imgCtx) displayMessage += imgCtx;
    state.chatHistory.push({ role: "user", content: displayMessage });
  }

  pushHtmlSnapshot();

  if (isFirstGeneration) {
    const imgCtx = getImageContext();
    if (imgCtx) displayMessage += imgCtx;
  }

  message = displayMessage;
  addMessage("messages", "user", displayMessage);
  state.isGenerating = true;
  el.sendBtn.disabled = true;
  el.typingIndicator.classList.remove("hidden");
  scrollToBottom("messages");

  // 통일 경로(v2)로 라우팅. user history는 위에서 처리됨(첫 생성은 여기서 보강).
  if (isFirstGeneration) state.chatHistory.push({ role: "user", content: displayMessage });
  await sendMessageV2(message, displayMessage, state.selectedElement || null);
  return;

  try { // eslint-disable-line no-unreachable — 레거시 경로(Task 5.1에서 제거)
    if (isFirstGeneration) {
      const isMulti = detectMultiPage(message) !== null ? detectMultiPage(message) : state.multiPageMode;
      if (state.directMode && !isMulti) {
        showGenerating(false);
        const assistantDiv = addMessage("messages", "assistant", "⏳ 홈페이지 단일 생성 중...");
        await sendMessageDirect(message, assistantDiv);
      } else {
        showGenerating(false);
        const assistantDiv = addMessage("messages", "assistant", "⏳ 홈페이지 생성 중...");
        await sendMessageModular(message, assistantDiv, null, null, false, false, isMulti);
      }
    } else {
      const strategy = await decideStrategy(message, !!savedHtml, !!state.selectedElement);
      if (strategy === "new_page" && savedHtml) {
        state.generatedHtml = "";
        state.reactRejected = false;
        showGenerating(true);
        const assistantDiv = addMessage("messages", "assistant", "\u23f3 \uc0c8 \ud398\uc774\uc9c0 \uc0dd\uc131 \uc911...");
        await sendMessageModular(message, assistantDiv, null, savedHtml, true, true, false);
        if (state.generatedHtml && state.currentProjectId) {
          const pageName = "page_" + Date.now().toString(36).slice(-4) + ".html";
          const pageContent = state.generatedHtml;
          state.generatedHtml = savedHtml;
          updatePreview(state.generatedHtml, false);
          try {
            const pagePath = "pages/" + pageName;
            await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: pagePath, content: pageContent }),
            });
            state.multiPageHtmls[pagePath] = pageContent;
            assistantDiv.innerHTML = "\u2705 \uc0c8 \ud398\uc774\uc9c0 \u201c" + pageName + "\u201d\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc624\ub978\ucabd \ud30c\uc77c \ud2b8\ub9ac\uc5d0\uc11c \ud655\uc778\ud558\uace0, \ubbf8\ub9ac\ubcf4\uae30\uc5d0\uc11c \uc694\uc18c\ub97c \uc120\ud0dd\ud558\uc5ec \ub9c1\ud06c\ub97c \uac78\uc5b4\uc8fc\uc138\uc694.";
            saveProject();
            enableReviewBtn();
            loadFileTree(state.currentProjectId);
          } catch (e) {
            assistantDiv.innerHTML = "\u2705 \uc0c8 \ud398\uc774\uc9c0\uac00 \uc0dd\uc131\ub418\uc5c8\uc9c0\ub9cc \ud30c\uc77c \uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4: " + e.message;
            state.generatedHtml = savedHtml;
            updatePreview(state.generatedHtml, false);
          }
        } else {
          state.generatedHtml = savedHtml;
          updatePreview(state.generatedHtml, false);
          assistantDiv.innerHTML = "\uc0c8 \ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. \ubbf8\ub9ac\ubcf4\uae30\uc5d0\uc11c \uc694\uc18c\ub97c \uc120\ud0dd\ud558\uace0 \uc2e0\uaddc \ud398\uc774\uc9c0 \uc0dd\uc131\uc744 \uc774\uc6a9\ud558\uc138\uc694.";
          hideGenerating();
        }
      } else if (strategy === "modular") {
        showGenerating(false);
        const assistantDiv = addMessage("messages", "assistant", "\u23f3 \ud398\uc774\uc9c0 \uc7ac\uc0dd\uc131 \uc911...");
        const mp = state.multiPageMode || (state.multiPagePlanPages && state.multiPagePlanPages.length > 1);
        await sendMessageModular(message, assistantDiv, state.chatHistory.slice(-5), savedHtml || "", false, false, mp);
        if (!state.generatedHtml && savedHtml) { state.generatedHtml = savedHtml; updatePreview(state.generatedHtml, false); }
      } else if (strategy === "chat") {
        const assistantDiv = addMessage("messages", "assistant", "\ud83d\udcac \ub2f5\ubcc0 \uc911...");
        assistantDiv.innerHTML = "";
        try {
          await callChatStream({
            message,
            history: state.chatHistory.slice(-5),
            page_type: state.selectedType,
            template: state.selectedTemplate,
            design_content: state.selectedDesignContent,
    current_html: state.generatedHtml ? state.generatedHtml.substring(0, 20000) : "",
            element_context: "",
            is_new_page: false,
            chat_only: true,
          }, (token) => {
            assistantDiv.innerHTML += token;
            scrollToBottom("messages");
          }, null, () => {
            assistantDiv.innerHTML = assistantDiv.innerHTML.replace(/\n\n$/, "");
          });
        } catch (e) {
          assistantDiv.innerHTML = `<span style="color: var(--error);">\u26a0\ufe0f \uc624\ub958: ${e.message}</span>`;
        }
        state.generatedHtml = savedHtml;
      } else {
        // edit / direct
        showGenerating(true);
        const assistantDiv = addMessage("messages", "assistant", "\u23f3 \uc218\uc815 \uc911...");
        if (!state.currentProjectId) {
          await generateProjectId();
          if (!state.projectTitle) state.projectTitle = message.slice(0, 30) + (message.length > 30 ? "..." : "");
          await initProjectStructure(message);
        }
        state.reactRejected = false;

        let attempts = 0;
        while (attempts < 5) {
          let streamDone = false;
          try {
            const response = await fetch("/api/chat/stream", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message,
                history: state.chatHistory.slice(-5),
                page_type: state.selectedType,
                template: state.selectedTemplate,
                design_content: state.selectedDesignContent,
                current_html: savedHtml ? savedHtml.substring(0, 3000) : "",
                current_css: "",
                current_js: "",
                element_context: elementContext,
                is_new_page: false,
              }),
            });
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";
            let fullReasoning = "";
            let lastTokenTime = Date.now();
            let lastPreviewTs = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done || streamDone) break;
              const chunk = decoder.decode(value);
              for (const line of chunk.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const d = line.slice(6);
                if (d === "[DONE]") { streamDone = true; break; }
                try {
                  const p = JSON.parse(d);
                  if (p.error) { streamDone = true; break; }
                  if (p.content) {
                    if (p.type === "reasoning") fullReasoning += p.content;
                    else {
                      fullContent += p.content;
                      // Streaming preview
                      const now = Date.now();
                      if (now - lastPreviewTs > 400) {
                        lastPreviewTs = now;
                        const sp = extractHtmlStreaming(fullContent) || extractHtmlMarker(fullContent);
                        if (sp && sp.length > 100) {
                          state.generatedHtml = sp;
                          updatePreview(sp, true);
                        }
                      }
                    }
                    lastTokenTime = Date.now();
                  }
                } catch (e) {}
              }
              if (Date.now() - lastTokenTime > 10000 && fullContent.length > 0) break;
            }

            if (!fullContent || fullContent.trim() === "") {
              attempts++;
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }

            const hasHtml = fullContent.includes("===HTML_START===") || fullContent.includes("<!DOCTYPE");
            state.chatHistory.push({ role: "assistant", content: hasHtml ? "\ud648\ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud588\uc2b5\ub2c8\ub2e4. \ubbf8\ub9ac\ubcf4\uae30\ub97c \ud655\uc778\ud558\uc138\uc694." : stripThinkingBlock(fullContent) });

            state.generatedHtml = null;
            const extracted = extractHtmlMarker(fullContent) || extractHtml(fullContent);
            if (extracted) {
              state.generatedHtml = extracted;
            } else if (fullContent.includes("===HTML_START===")) {
              const si = fullContent.indexOf("===HTML_START===") + 16;
              const ei = fullContent.indexOf("===HTML_END===");
              const raw = (ei > si ? fullContent.slice(si, ei) : fullContent.slice(si)).trim();
              const force = stripCodeFences(raw);
              if (force && force.length > 50) {
                const san = sanitizeReactHtml(force);
                if (san.html) state.generatedHtml = san.html;
              }
            } else {
              const di = fullContent.indexOf("<!DOCTYPE html>");
              if (di !== -1) {
                let raw = fullContent.slice(di).trim();
                const eiTag = raw.indexOf("===HTML_END===");
                if (eiTag !== -1) raw = raw.slice(0, eiTag).trim();
                const san = sanitizeReactHtml(raw);
                if (san.html) state.generatedHtml = san.html;
              }
            }

            if (state.generatedHtml) {
              updatePreview(state.generatedHtml, false);
              if (state.currentProjectId) {
                await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ path: "index.html", content: state.generatedHtml }),
                });
                loadFileTree(state.currentProjectId);
              }
              hideGenerating();
              state.selectedElement = null;
              state.pendingElementAction = false;
              assistantDiv.innerHTML = "<div>\u2705 \ud648\ud398\uc774\uc9c0 \uc0dd\uc131 \uc644\ub8cc! \uc624\ub978\ucabd \ubbf8\ub9ac\ubcf4\uae30\ub97c \ud655\uc778\ud558\uc138\uc694.</div>";
              saveProject();
              enableReviewBtn();
              break;
            } else if (state.reactRejected) {
              state.chatHistory.pop();
              state.reactRejected = false;
              state.generatedHtml = null;
              attempts++;
              await new Promise(r => setTimeout(r, 500));
              continue;
            } else {
              const clean = stripThinkingBlock(fullContent);
              if (!state.generatedHtml && savedHtml) { state.generatedHtml = savedHtml; updatePreview(state.generatedHtml, false); }
              assistantDiv.innerHTML = formatContent(clean);
              hideGenerating();
              break;
            }
          } catch (e) {
            attempts++;
            await new Promise(r => setTimeout(r, 1000));
            if (attempts >= 5) {
              assistantDiv.innerHTML = `<span style="color: var(--error);">\u26a0\ufe0f \ub124\ud2b8\uc6cc\ud06c \uc624\ub958: ${e.message}</span>`;
              if (!state.generatedHtml && savedHtml) { state.generatedHtml = savedHtml; updatePreview(state.generatedHtml, false); }
              hideGenerating();
            }
          }
        }
      }
    }
  } catch (e) {
    const msgDiv = el.messages.querySelector(".message.assistant:last-child .message-content");
    if (msgDiv) msgDiv.innerHTML = `<span style="color: var(--error);">\u26a0\ufe0f \uc624\ub958: ${e.message}</span>`;
    hideGenerating();
  }

  if (!state.generatedHtml && savedHtml) { state.generatedHtml = savedHtml; updatePreview(state.generatedHtml, false); }

  state.pendingElementAction = false;
  state.isGenerating = false;
  el.sendBtn.disabled = false;
  el.typingIndicator.classList.add("hidden");
}

// ── Auto-send (element actions, new page) ──
async function sendMessageAuto(message) {
  state.reactRejected = false;
  if (!message || state.isGenerating) return;
  if (!state.modelReady) { showDownloadModal(); return; }
  pushHtmlSnapshot();
  if (!state.pendingPageName) state.generatedHtml = "";
  state.isGenerating = true;
  el.sendBtn.disabled = true;
  el.typingIndicator.classList.remove("hidden");
  scrollToBottom("messages");
  showGenerating();
  const autoStatusText = state.pendingPageName ? "\u23f3 \uc0c8 \ud398\uc774\uc9c0 \uc0dd\uc131 \uc911..." : "\u23f3 \uc218\uc815 \uc911...";
  const assistantDiv = addMessage("messages", "assistant", autoStatusText);

  await sendMessageModular(message, assistantDiv, state.chatHistory.slice(0, -1), state.generatedHtml, !!state.pendingPageName, true);

  state.chatHistory.push({ role: "assistant", content: "\uc0dd\uc131 \uc644\ub8cc" });

  if (state.pendingPageName && state.generatedHtml && state.pendingMainHtml) {
    try {
      const pagePath = `pages/${state.pendingPageName}`;
      await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pagePath, content: state.generatedHtml }),
      });
      state.multiPageHtmls[pagePath] = state.generatedHtml;
      const linkPath = pagePath;
      const escapedText = state.pendingLinkTextValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRegex = new RegExp(`(<a\\b[^>]*>\\s*)${escapedText}(\\s*</a>)`, "i");
      const replaced = state.pendingMainHtml.replace(linkRegex, (full, openTag, closeTag) => {
        return openTag.replace(/href=["'][^"']*["']/i, `href="${linkPath}"`) + state.pendingLinkTextValue + closeTag;
      });
      state.generatedHtml = replaced !== state.pendingMainHtml ? replaced : state.pendingMainHtml.replace(new RegExp(`href=["']${escapedText}["']`), `href="${linkPath}"`);
      updatePreview(state.generatedHtml, false);
      hideGenerating();
      assistantDiv.innerHTML = `\u2705 \ud398\uc774\uc9c0 "${state.pendingPageName}" \uc0dd\uc131 \uc644\ub8cc!`;
    } catch (e) {
      assistantDiv.innerHTML = "\u26a0\ufe0f \ud398\uc774\uc9c0 \uc0dd\uc131\uc740 \uc644\ub8cc\ub418\uc5c8\uc9c0\ub9cc \uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.";
    }
    state.pendingPageName = "";
    state.pendingMainHtml = "";
    state.pendingLinkHrefValue = "";
    state.pendingLinkTextValue = "";
    saveProject();
    enableReviewBtn();
    loadFileTree(state.currentProjectId);
  }
  state.pendingElementAction = false;
  state.isGenerating = false;
  el.sendBtn.disabled = false;
  el.typingIndicator.classList.add("hidden");
}

// ── Selected Element Bar ──
function showSelectedElementBar(d) {
  const bar = document.getElementById("selected-element-bar");
  const label = document.getElementById("selected-element-label");
  if (!bar || !label) return;
  const tag = `<${d.tag}${d.id ? ` id="${d.id}"` : ""}${d.classes ? ` class="${d.classes}"` : ""}>`;
  label.textContent = `\ud83c\udfaf ${tag} ${d.text ? `\u2014 "${d.text.slice(0, 30)}${d.text.length > 30 ? "..." : ""}"` : ""}`;
  bar.classList.remove("hidden");
}

function hideSelectedElementBar() {
  state.selectedElement = null;
  el.userInput.placeholder = "\ud68c\uc0ac \uc18c\uac1c, \uc11c\ube44\uc2a4, \uac15\uc870 \ud3ec\uc778\ud2b8\ub97c \uc785\ub825\ud558\uc138\uc694...";
  const bar = document.getElementById("selected-element-bar");
  if (bar) bar.classList.add("hidden");
}

window.deselectElement = function () {
  state.pendingLinkHref = "";
  state.pendingLinkElement = null;
  hideSelectedElementBar();
  const iframe = document.getElementById("preview-frame");
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: "deselect" }, "*");
  }
};

window.toggleDevMode = function () {
  state.devMode = !!(el.devModeToggle && el.devModeToggle.checked);
  if (!state.devMode) {
    deselectElement();
  }
  const iframe = el.previewFrame;
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: "set-dev-mode", enabled: state.devMode }, "*");
  }
};

// ── Element Actions ──
function elementActionNewPage() {
  if (!state.selectedElement) return;
  const linkText = state.selectedElement.text || "\ud398\uc774\uc9c0";
  const slug = linkText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "page";
  state.pendingPageName = slug + ".html";
  state.pendingMainHtml = state.generatedHtml;
  state.pendingLinkHrefValue = "#";
  state.pendingLinkTextValue = linkText;
  const msg = `"${linkText}" \ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud574\uc8fc\uc138\uc694. \ud604\uc7ac \ud504\ub85c\uc81d\ud2b8\uc640 \uc77c\uad00\ub41c \ub514\uc790\uc778\uc73c\ub85c \uc644\uc804\ud55c HTML \ud30c\uc77c\uc744 \uc0dd\uc131\ud558\uc138\uc694.`;
  addMessage("messages", "user", `\ud83d\udcc4 "${linkText}" \ud398\uc774\uc9c0 \uc0dd\uc131 \uc694\uccad`);
  hideElementActionModal();
  state.chatHistory.push({ role: "user", content: msg });
  sendMessageAuto(msg);
}

function elementActionLink() {
  if (!state.selectedElement) return;
  el.userInput.placeholder = "\uc5b4\ub514\ub85c \uc5f0\uacb0\ud560\uc9c0 \uc785\ub825\ud558\uc138\uc694...";
  el.userInput.focus();
  const tagLabel = `<${state.selectedElement.tag}${state.selectedElement.id ? ` id="${state.selectedElement.id}"` : ""}${state.selectedElement.classes ? ` class="${state.selectedElement.classes}"` : ""}>`;
  addMessage("messages", "assistant", `\ud83d\udd17 \ub9c1\ud06c\ub97c \ub9cc\ub4e4\uaca0\uc2b5\ub2c8\ub2e4.\n\n\uc120\ud0dd\ud55c \uc694\uc18c: **${tagLabel}**${state.selectedElement.text ? `\n\ud604\uc7ac \ud14d\uc2a4\ud2b8: "${state.selectedElement.text}"` : ""}\n\n\uc5b4\ub514\ub85c \uc5f0\uacb0\ud560\uc9c0 \uc785\ub825\ud574\uc8fc\uc138\uc694.`);
  scrollToBottom("messages");
  state.pendingElementAction = true;
  hideElementActionModal(true);
}

function elementActionEdit() {
  if (!state.selectedElement) return;
  el.userInput.placeholder = "\uc120\ud0dd\ud55c \uc694\uc18c\uc5d0 \ub300\ud574 \uc6d0\ud558\ub294 \uc791\uc5c5\uc744 \uc785\ub825\ud558\uc138\uc694...";
  el.userInput.focus();
  const tagLabel = `<${state.selectedElement.tag}${state.selectedElement.id ? ` id="${state.selectedElement.id}"` : ""}${state.selectedElement.classes ? ` class="${state.selectedElement.classes}"` : ""}>`;
  addMessage("messages", "assistant", `\u270f\ufe0f \uc694\uc18c\ub97c \uc218\uc815\ud558\uaca0\uc2b5\ub2c8\ub2e4.\n\n\uc120\ud0dd\ud55c \uc694\uc18c: **${tagLabel}**${state.selectedElement.text ? `\n\ud604\uc7ac \ub0b4\uc6a9: "${state.selectedElement.text}"` : ""}\n\n\uc5b4\ub5bb\uac8c \uc218\uc815\ud560\uc9c0 \uc785\ub825\ud574\uc8fc\uc138\uc694.`);
  scrollToBottom("messages");
  state.pendingElementAction = true;
  hideElementActionModal(true);
}

function showLinkActionModal(href, elementData) {
  const modal = $("link-action-modal");
  if (modal) modal.classList.remove("hidden");
}
function hideLinkActionModal() {
  const modal = $("link-action-modal");
  if (modal) modal.classList.add("hidden");
  state.pendingLinkHref = "";
  state.pendingLinkElement = null;
}
function linkActionNavigate() {
  if (!state.pendingLinkHref) return;
  const href = state.pendingLinkHref;
  hideLinkActionModal();
  if (href.startsWith("pages/")) loadSubPageInPreview(href);
  else if (href === "index.html" || href === "/" || href === "./") { state.currentViewPath = "index.html"; updatePreview(state.generatedHtml, false); loadFileTree(state.currentProjectId); }
  else if (href.startsWith("#")) { const f = el.previewFrame; if (f) f.contentWindow.postMessage({ type: "navigate", href }, "*"); }
}
function linkActionMove() {
  if (!state.pendingLinkHref) return;
  const linkText = (state.pendingLinkElement && state.pendingLinkElement.text) || state.pendingLinkHref;
  let slug = linkText.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "page";
  state.pendingPageName = slug + ".html";
  state.pendingMainHtml = state.generatedHtml;
  state.pendingLinkHrefValue = state.pendingLinkHref;
  state.pendingLinkTextValue = linkText;
  const msg = `"${linkText}" \ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud574\uc8fc\uc138\uc694. \ud604\uc7ac \ud504\ub85c\uc81d\ud2b8\uc640 \uc77c\uad00\ub41c \ub514\uc790\uc778\uc73c\ub85c \uc644\uc804\ud55c HTML \ud30c\uc77c\uc744 \uc0dd\uc131\ud558\uc138\uc694.`;
  addMessage("messages", "user", `\ud83d\udcc4 "${linkText}" \ud398\uc774\uc9c0 \uc0dd\uc131 \uc694\uccad`);
  hideSelectedElementBar();
  el.userInput.value = "";
  el.userInput.style.height = "auto";
  state.chatHistory.push({ role: "user", content: msg });
  hideLinkActionModal();
  state.selectedElement = null;
  sendMessageAuto(msg);
}
function linkActionEdit() {
  if (!state.pendingLinkHref) return;
  el.userInput.placeholder = "\ub9c1\ud06c\ub97c \uc5b4\ub5bb\uac8c \uc218\uc815\ud560\uc9c0 \uc785\ub825\ud558\uc138\uc694...";
  el.userInput.focus();
  let info = `\u270f\ufe0f \ub9c1\ud06c\ub97c \uc218\uc815\ud558\uaca0\uc2b5\ub2c8\ub2e4.\n\n\ud604\uc7ac \ub9c1\ud06c: **${state.pendingLinkHref}**`;
  if (state.pendingLinkElement && state.pendingLinkElement.text) info += `\n\ub9c1\ud06c \ud14d\uc2a4\ud2b8: "${state.pendingLinkElement.text}"`;
  info += `\n\n\uc5b4\ub5bb\uac8c \uc218\uc815\ud560\uc9c0 \uc785\ub825\ud574\uc8fc\uc138\uc694.`;
  addMessage("messages", "assistant", info);
  scrollToBottom("messages");
  hideLinkActionModal();
}

function hideElementActionModal(deselect) {
  const modal = $("element-action-modal");
  if (modal) modal.classList.add("hidden");
  if (deselect) { state.selectedElement = null; el.userInput.placeholder = "\ud68c\uc0ac \uc18c\uac1c, \uc11c\ube44\uc2a4, \uac15\uc870 \ud3ec\uc778\ud2b8\ub97c \uc785\ub825\ud558\uc138\uc694..."; }
}

// ── Sub-page Navigation ──
async function loadSubPageInPreview(path) {
  if (!state.currentProjectId) return;
  if (state.multiPageHtmls[path]) { state.currentViewPath = path; updatePreview(state.multiPageHtmls[path], false); loadFileTree(state.currentProjectId); return; }
  try {
    const res = await fetch(`/api/projects/${state.currentProjectId}/read_file?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      addMessage("messages", "assistant", `⚠️ **${path}** 파일을 찾을 수 없습니다.\n\n이 페이지가 아직 생성되지 않았습니다. "${path.replace("pages/","").replace(".html","")}"(을)를 새로 생성하시려면 채팅에 요청해주세요.`);
      return;
    }
    const data = await res.json();
    if (data.content) { state.currentViewPath = path; state.multiPageHtmls[path] = data.content; updatePreview(data.content, false); loadFileTree(state.currentProjectId); }
  } catch (e) { console.warn("Failed to load sub-page:", e); }
}

async function loadFileInPreview(path) {
  if (!state.currentProjectId) return;
  if (path === "index.html") { state.currentViewPath = "index.html"; updatePreview(state.generatedHtml, false); hideGenerating(false); loadFileTree(state.currentProjectId); return; }
  if (state.multiPageHtmls[path]) { state.currentViewPath = path; updatePreview(state.multiPageHtmls[path], false); loadFileTree(state.currentProjectId); return; }
  try {
    const res = await fetch(`/api/projects/${state.currentProjectId}/read_file?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      addMessage("messages", "assistant", `⚠️ **${path}** 파일을 찾을 수 없습니다.\n\n파일 트리에서 파일이 아직 생성되지 않은 것 같습니다. 먼저 AI로 페이지를 생성해주세요.`);
      return;
    }
    const data = await res.json();
    if (data.content) { state.currentViewPath = path; state.multiPageHtmls[path] = data.content; updatePreview(data.content, false); hideGenerating(false); loadFileTree(state.currentProjectId); }
  } catch (e) { console.warn("Failed to load file:", e); }
}
window.loadFileInPreview = loadFileInPreview;

// ── iFrame message handler ──
window.addEventListener("message", function (e) {
  if (!e.data || !e.data.type) return;
  const d = e.data;

  if (d.type === "preview-link-clicked") {
    const href = d.href;
    state.pendingLinkHref = href;
    state.pendingLinkElement = d;
    state.selectedElement = null;
    // Directly navigate for sub-page links (menu nav), show modal for other links
    if (href.startsWith("pages/")) { linkActionNavigate(); return; }
    if (href === "index.html" || href === "/" || href === "./") { linkActionNavigate(); return; }
    showSelectedElementBar(d);
    el.userInput.placeholder = "\u27a1\ufe0f '\uc774\ub3d9\ud574\uc8fc\uc138\uc694' → \ub9c1\ud06c \uc774\ub3d9, '\uc218\uc815' → \ub9c1\ud06c \ud3b8\uc9d1";
    el.userInput.focus();
    addMessage("messages", "assistant", `\ud83d\udd17 \ub9c1\ud06c\uac00 \uc120\ud0dd\ub418\uc5c8\uc2b5\ub2c8\ub2e4: **${href}**\n\n\ubb34\uc5c7\uc744 \ud560\uae4c\uc694?\n- \u27a1\ufe0f **\uc774\ub3d9\ud574\uc8fc\uc138\uc694**: \ub9c1\ud06c\ub85c \uc774\ub3d9\n- \u270f\ufe0f **\uc218\uc815**: \ub9c1\ud06c \uc8fc\uc18c \ub610\ub294 \ud14d\uc2a4\ud2b8 \ubcc0\uacbd\n- \ud83d\udcc4 **\uc0c8 \ud398\uc774\uc9c0 \uc0dd\uc131**: \uc774 \ub9c1\ud06c\uac00 \uac00\ub9ac\ud0ac \ud398\uc774\uc9c0 \uc0dd\uc131\n\n\uc704 \ub0b4\uc6a9\uc744 \ucc44\ud305\uc5d0 \uadf8\ub300\ub85c \uc785\ub825\ud574\uc8fc\uc138\uc694.`);
    scrollToBottom("messages");
    return;
  }

  if (d.type === "preview-load-page") loadSubPageInPreview(d.path);
  if (d.type === "preview-load-main") { state.currentViewPath = "index.html"; updatePreview(state.generatedHtml, false); loadFileTree(state.currentProjectId); }

  if (d.type === "element-selected") {
    state.selectedElement = d;
    showSelectedElementBar(d);
    el.userInput.placeholder = "\u270f\ufe0f \uc120\ud0dd\ud55c \uc694\uc18c\uc5d0 \ub300\ud574 \uc785\ub825\ud558\uc138\uc694...";
    el.userInput.focus();
    let info = `\ud83c\udfaf \uc694\uc18c\ub97c \uc120\ud0dd\ud588\uc2b5\ub2c8\ub2e4.\n\n${d.text ? `\ud604\uc7ac \ub0b4\uc6a9: "${d.text}"\n\n` : ""}\ubb34\uc5c7\uc744 \ud560\uae4c\uc694?\n- \ud83d\udcc4 **\uc2e0\uaddc \ud398\uc774\uc9c0 \uc0dd\uc131**: \uc774 \uc694\uc18c\ub97c \ub9c1\ud06c\ub85c \ub9cc\ub4e4\uc5b4 \uc0c8 \ud398\uc774\uc9c0 \uc5f0\uacb0\n- \ud83d\udd17 **\ub9c1\ud06c \ub9cc\ub4e4\uae30**: \uc774 \uc694\uc18c\ub97c \ud074\ub9ad \uac00\ub2a5\ud55c \ub9c1\ud06c\ub85c \ubcc0\uacbd\n- \u270f\ufe0f **\uc218\uc815**: \ub0b4\uc6a9\uc774\ub098 \uc2a4\ud0c0\uc77c \ubcc0\uacbd\n\uc704 \ub0b4\uc6a9\uc744 \ucc44\ud305\uc5d0 \uc785\ub825\ud574\uc8fc\uc138\uc694.`;
    addMessage("messages", "assistant", info);
    scrollToBottom("messages");
  }

  if (d.type === "element-deselected") { if (!state.pendingElementAction) { hideSelectedElementBar(); } }
});

// ── Export Project (Deployable HTML) ──
function exportProject() {
  const html = state.generatedHtml;
  if (!html) {
    addMessage("messages", "assistant", "⚠️ 내보낼 프로젝트가 없습니다. 먼저 홈페이지를 생성해주세요.");
    return;
  }
  // Strip interaction artifacts for deployable version
  let clean = html
    .replace(/\bwgen-(?:selected|hover|interaction|style|error-catcher)\b/g, '')
    .replace(/<script\b[^>]*\bid=["']wgen-(?:interaction|style|error-catcher)["'][\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*\bid=["']wgen-style["'][\s\S]*?<\/style>/gi, '')
    .replace(/\s+class\s*=\s*["']\s*["']/g, '')
    .replace(/===HTML_START===|===HTML_END===|===MODULE_START===|===MODULE_END===/g, '')
    .trim();
  // Trigger download
  const blob = new Blob([clean], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = (state.projectTitle || "index").replace(/[^a-zA-Z0-9\uAC00-\uD7A3_-]/g, "") + ".html";
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addMessage("messages", "assistant", `📦 **${name}**(으)로 내보냈습니다. 배포 가능한 HTML 파일입니다.`);
}

// ── Regenerate ──
function regenerate() {
  state.htmlHistory = [];
  state.currentProjectId = null;
  state.projectTitle = "";
  hideSelectedElementBar();
  state.selectedElement = null;
  state.chatHistory = [];
  state.generatedHtml = "";
  clearUploadedImages();
  el.messages.innerHTML = "";
  el.previewFrame.srcdoc = "";
  el.previewFrame.classList.add("hidden");
  hideGenerating();
  if (el.previewPlaceholder) el.previewPlaceholder.classList.remove("hidden");
  if (el.projectTitle) el.projectTitle.value = "";
  showWelcomeMessage();
  el.userInput.placeholder = "\uc6d0\ud558\ub294 \ud648\ud398\uc774\uc9c0\ub97c \uc124\uba85\ud574\uc8fc\uc138\uc694...";
}

function resetWizard() {
  state.htmlHistory = [];
  state.selectedType = null;
  state.selectedTemplate = null;
  state.selectedDesignContent = "";
  hideSelectedElementBar();
  state.selectedElement = null;
  state.chatHistory = [];
  state.generatedHtml = "";
  state.currentProjectId = null;
  state.projectTitle = "";
  state.currentStep = 1;
  document.querySelectorAll(".type-card").forEach(el => el.classList.remove("selected"));
  document.querySelectorAll(".template-card").forEach(el => el.classList.remove("selected"));
  $("to-step-3").disabled = true;
  el.messages.innerHTML = "";
  el.userInput.value = "";
  el.previewFrame.srcdoc = "";
  el.previewFrame.classList.add("hidden");
  hideGenerating();
  if (el.previewPlaceholder) el.previewPlaceholder.classList.remove("hidden");
  if (el.projectTitle) el.projectTitle.value = "";
  if (el.fileTreeSection) el.fileTreeSection.classList.add("hidden");
  goToStep(1);
}
function newWizard() { resetWizard(); }

// ── Project Management ──
async function saveProject() {
  if (!state.generatedHtml) return;
  if (!state.currentProjectId) await generateProjectId();
  try {
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.currentProjectId,
        title: state.projectTitle,
        page_type: state.selectedType,
        template: state.selectedTemplate,
        html: state.generatedHtml,
        history: state.chatHistory,
        design_content: state.selectedDesignContent,
        design_system: state.designSystem,
      }),
    });
    loadProjects();
    loadFileTree(state.currentProjectId);
    if (el.projectTitle) el.projectTitle.value = state.projectTitle;
  } catch (e) { console.warn("Project save failed:", e); }
}

async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    renderProjects(data.projects);
  } catch (e) { console.warn("Failed to load projects:", e); }
}

function renderProjects(projects) {
  const list = el.projectsList;
  if (!projects || projects.length === 0) { list.innerHTML = '<div class="projects-empty">\ud504\ub85c\uc81d\ud2b8\uac00 \uc5c6\uc2b5\ub2c8\ub2e4</div>'; return; }
  const icons = { company: "\ud83c\udfe2", landing: "\ud83c\udfaf", promotion: "\ud83d\udd25" };
  list.innerHTML = projects.map(p => {
    const active = p.id === state.currentProjectId ? "active" : "";
    const disabled = !active && state.currentProjectId ? " disabled" : "";
    const clickHandler = state.currentProjectId && p.id !== state.currentProjectId
      ? `onclick="event.stopPropagation(); addMessage('messages', 'assistant', '\\u26a0\\ufe0f \\ud604\\uc7ac \\uc791\\uc5c5\\uc911\\uc778 \\ud504\\ub85c\\uc81d\\ud2b8\\uac00 \\uc788\\uc2b5\\ub2c8\\ub2e4. \\uba3c\\uc800 \\uc644\\ub8cc\\ud558\\uac70\\ub098 \\uc0c8\\ub85c\\uc6b4 \\ud648\\ud398\\uc774\\uc9c0\\ub97c \\uc0dd\\uc131\\ud574\\uc8fc\\uc138\\uc694.');"`
      : `onclick="loadProject('${p.id}')"`;
    return `<div class="project-item ${active}${disabled}" ${clickHandler}><div class="project-item-header"><span class="project-item-title">${p.title || "\uc81c\ubaa9 \uc5c6\uc74c"}</span><button class="project-item-delete" onclick="event.stopPropagation(); deleteProject('${p.id}')" title="\uc0ad\uc81c">\u2715</button></div><div class="project-item-meta"><span class="project-item-type">${icons[p.page_type] || ""} ${p.page_type || "-"}</span><span>${p.updated_at || p.created_at || ""}</span></div></div>`;
  }).join("");
}

async function loadProject(id) {
  if (state.currentProjectId && state.currentProjectId !== id) return;
  state.htmlHistory = [];
  try {
    const res = await fetch(`/api/projects/${id}?_=${Date.now()}`);
    const project = await res.json();
    if (project.error) return;
    console.log("[loadProject] API response:", { 
      hasHtml: "html" in project, 
      htmlType: typeof project.html, 
      htmlLen: project.html ? project.html.length : 0,
      htmlStart: project.html ? project.html.substring(0, 100) : null 
    });
    state.currentProjectId = project.id;
    state.projectTitle = project.title;
    state.selectedType = project.page_type;
    state.selectedTemplate = project.template;
    state.selectedDesignContent = project.design_content || "";
    state.designSystem = project.design_system || null; // 단일 진실원 복원 (세션 드롭 방지)
    state.chatHistory = project.history || [];
    const rawHtml = project.html || "";
    state.generatedHtml = rawHtml;
    state.multiPageMenuItems = project.menu_items || [];
    state.multiPageMode = project.multi_page || false;

    el.messages.innerHTML = "";
    state.chatHistory.forEach(msg => {
      let dc = msg.content;
      if (msg.role === "assistant" && (dc.includes("<!DOCTYPE") || dc.includes("<html") || dc.includes("===HTML_START==="))) dc = "\ud648\ud398\uc774\uc9c0\ub97c \uc0dd\uc131\ud588\uc2b5\ub2c8\ub2e4. \ubbf8\ub9ac\ubcf4\uae30\ub97c \ud655\uc778\ud558\uc138\uc694.";
      addMessage("messages", msg.role, dc);
    });

    goToStep(3);
    if (state.generatedHtml && state.generatedHtml.length > 10) { updatePreview(state.generatedHtml, false); hideGenerating(); }

    state.multiPageHtmls = {};
    const pageFiles = project.pages && project.pages.length > 0 ? project.pages : [];
    for (const pageFile of pageFiles) {
      try {
        const r = await fetch(`/api/projects/${id}/read_file?path=${encodeURIComponent(pageFile)}`);
        const pd = await r.json();
        if (pd.content) state.multiPageHtmls[pageFile] = pd.content;
      } catch (e) { console.warn("Failed to load page:", pageFile, e); }
    }
    document.querySelectorAll(".type-card").forEach(el => el.classList.remove("selected"));
    if (state.selectedType) { const tc = document.querySelector(`.type-card[data-type="${state.selectedType}"]`); if (tc) tc.classList.add("selected"); }
    document.querySelectorAll(".template-card").forEach(el => el.classList.remove("selected"));
    if (state.selectedTemplate && state.selectedTemplate !== "custom") { const tc = document.querySelector(`.template-card[data-template="${state.selectedTemplate}"]`); if (tc) tc.classList.add("selected"); }
    if (el.projectTitle) el.projectTitle.value = state.projectTitle;
    loadProjects();
    loadFileTree(id);
    enableReviewBtn();
  } catch (e) { console.error("Failed to load project:", e); }
}

async function deleteProject(id) {
  try {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (state.currentProjectId === id) { state.currentProjectId = null; resetWizard(); }
    loadProjects();
  } catch (e) { console.warn("Delete failed:", e); }
}

// ── File Tree ──
async function loadFileTree(projectId) {
  if (!projectId) { if (el.fileTreeSection) el.fileTreeSection.classList.add("hidden"); return; }
  try {
    const res = await fetch(`/api/projects/${projectId}/tree`);
    const data = await res.json();
    renderFileTree(data.tree);
    if (el.fileTreeSection) el.fileTreeSection.classList.remove("hidden");
  } catch (e) { console.warn("File tree load failed:", e); }
}

function buildTreeHierarchy(flatTree) {
  const nodeMap = {};
  const root = { children: [], depth: -1 };
  for (const item of flatTree) {
    const node = { ...item, children: [], expanded: true };
    nodeMap[item.path] = node;
    const parts = item.path.split('/');
    if (parts.length <= 1) {
      root.children.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = nodeMap[parentPath];
      if (parent && parent.type === "folder") {
        parent.children.push(node);
      } else {
        root.children.push(node);
      }
    }
  }
  return root.children;
}

function renderTreeNode(node, depth) {
  if (node.type === "folder") {
    const collapsed = state.treeCollapsed[node.path] ? " collapsed" : "";
    const arrow = state.treeCollapsed[node.path] ? "\u25b6" : "\u25bc";
    const hasChildren = node.children && node.children.length > 0;
    const folderIcon = state.treeCollapsed[node.path] ? "\ud83d\udcc1" : "\ud83d\udcc2";
    let html = `<div class="tree-item folder${collapsed}" style="padding-left: ${depth * 16 + 8}px;" onclick="toggleTreeNode('${node.path}')">`;
    html += `<span class="tree-arrow">${hasChildren ? arrow : ""}</span>`;
    html += `<span class="tree-icon">${folderIcon}</span>`;
    html += `<span class="tree-name">${node.name}</span></div>`;
    if (!state.treeCollapsed[node.path]) {
      for (const child of node.children) {
        html += renderTreeNode(child, depth + 1);
      }
    }
    return html;
  } else {
    const active = node.path === state.currentViewPath ? " active" : "";
    const isPending = node.pending || state.generatingFiles[node.path];
    const pending = isPending ? " pending" : "";
    const icon = node.path.endsWith(".html") ? "\ud83c\udf10" : node.ext === ".css" ? "\ud83c\udfa8" : node.ext === ".js" ? "\ud83d\udce6" : "\ud83d\udcc4";
    const delBtn = node.pending || state.isGenerating ? "" : `<span class="tree-del" onclick="event.stopPropagation();deleteFile('${node.path}')" title="삭제">&times;</span>`;
    return `<div class="tree-item file${active}${pending}" style="padding-left: ${depth * 16 + 8}px;" onclick="loadFileInPreview('${node.path}')"><span class="tree-icon">${icon}</span><span class="tree-name">${node.name}</span>${isPending ? '<span class="tree-badge pending">\uc0dd\uc131 \uc911</span>' : ""}${delBtn}</div>`;
  }
}

function renderFileTree(tree) {
  if (!el.fileTree) return;
  if (!tree || tree.length === 0) { el.fileTree.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; padding: 8px;">\ud30c\uc77c\uc774 \uc5c6\uc2b5\ub2c8\ub2e4</div>'; return; }
  const hierarchy = buildTreeHierarchy(tree);
  el.fileTree.innerHTML = hierarchy.map(node => renderTreeNode(node, 0)).join("");
}

window.toggleTreeNode = function (path) {
  if (!state.treeCollapsed) state.treeCollapsed = {};
  state.treeCollapsed[path] = !state.treeCollapsed[path];
  loadFileTree(state.currentProjectId);
};

window.deleteFile = function (path) {
  if (!confirm(`"${path}" 파일을 삭제하시겠습니까?`)) return;
  fetch(`/api/projects/${state.currentProjectId}/delete_file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: path })
  }).then(r => r.json()).then(res => {
    if (res.error) { alert(res.error); return; }
    if (path === state.currentViewPath) {
      state.currentViewPath = null;
      el.filePreview.innerHTML = "";
    }
    loadFileTree(state.currentProjectId);
  }).catch(e => alert("삭제 실패: " + e.message));
};

function toggleFileTree() {
  const t = el.fileTree;
  const s = $("file-tree-toggle");
  if (!t || !s) return;
  const hidden = t.style.display === "none";
  t.style.display = hidden ? "block" : "none";
  s.textContent = hidden ? "\u25bc" : "\u25b2";
}

// ── Code Actions ──
window.copyCode = function () { navigator.clipboard.writeText(state.generatedHtml); };
window.downloadHtml = function () {
  const blob = new Blob([state.generatedHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "index.html";
  a.click();
  URL.revokeObjectURL(url);
};
window.exportProject = function () {
  if (!state.currentProjectId) { alert("\uc800\uc7a5\ub41c \ud504\ub85c\uc81d\ud2b8\uac00 \uc5c6\uc2b5\ub2c8\ub2e4."); return; }
  const link = document.createElement("a");
  link.href = `/api/projects/${state.currentProjectId}/export`;
  link.download = `${state.currentProjectId}.zip`;
  link.click();
};
window.updateProjectTitle = function (val) { state.projectTitle = val || "\uc81c\ubaa9 \uc5c6\uc74c"; if (state.currentProjectId) saveProject(); };

// ── Review System ──
function enableReviewBtn() { if (el.btnReview) el.btnReview.disabled = false; }

async function startReview() {
  if (!state.generatedHtml) return;
  const panel = el.reviewPanel;
  if (!panel) return;
  panel.classList.remove("hidden");

  const prompt = `\ub2e4\uc74c HTML \ud398\uc774\uc9c0\ub97c \ub9ac\ubdf0\ud558\uc138\uc694. \ub2e4\uc74c 6\uac00\uc9c0 \ud56d\ubaa9\uc744 \uac80\uc0ac\ud558\uace0 \uacb0\uacfc\ub97c JSON\uc73c\ub85c \ubc18\ud658\ud558\uc138\uc694.

\ud398\uc774\uc9c0 HTML:
\`\`\`html
${state.generatedHtml.slice(0, 5000)}
\`\`\`

\uac80\uc0ac \ud56d\ubaa9:
1. spacing - \uc5ec\ubc31\uc774 \uc801\uc808\ud55c\uac00 (padding/margin)
2. overlap - \uc694\uc18c\uac00 \uac80\uce58\ub294 \uacf3\uc774 \uc788\ub294\uac00
3. alignment - \uc815\ub82c\uc774 \uc798\ub418\uc5c8\ub294\uac00
4. typography - \ud0c0\uc774\ud3ec\uadf8\ub798\ud53c\uac00 \uc77c\uad00\ub418\ub294\uac00
5. responsive - \ubc18\uc751\ud615\uc774 \uc801\uc6a9\ub418\uc5c8\ub294\uac00
6. accessibility - \uc811\uadfc\uc131\uc774 \uc88b\uc740\uac00

\uc751\ub2f5 \ud615\uc2dd:
{
  "summary": { "total": 0, "critical": 0, "warning": 0, "info": 0, "pass": 0 },
  "categories": [
    {
      "name": "\uc139\uc158 \uba85",
      "icon": "\u2705 \ub610\ub294 \u26a0\ufe0f",
      "issues": [
        { "title": "\uc7a7\uc740 \uc124\uba85", "severity": "critical|warning|info|pass", "description": "\uc790\uc138\ud55c \uc124\uba85", "element": "\ud574\ub2f9 \uc694\uc18c" }
      ]
    }
  ]
}`;

  const summaryEl = $("review-summary");
  const categoriesEl = $("review-categories");
  const detailsEl = $("review-details");
  if (summaryEl) summaryEl.innerHTML = "\ub9ac\ubdf0 \uc911...";
  if (categoriesEl) categoriesEl.innerHTML = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        history: [],
        page_type: state.selectedType,
        template: state.selectedTemplate,
        current_html: "",
        element_context: "",
        is_new_page: false,
        strategy: "chat",
      }),
    });
    const data = await res.json();
    const content = data.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON \ud30c\uc2f1 \uc2e4\ud328");
    const review = JSON.parse(jsonMatch[0]);
    renderReview(review);
  } catch (e) {
    if (summaryEl) summaryEl.innerHTML = `\ub9ac\ubdf0 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4: ${e.message}`;
  }
}

function renderReview(review) {
  const summaryEl = $("review-summary");
  const categoriesEl = $("review-categories");
  if (!summaryEl || !categoriesEl) return;

  const s = review.summary || { total: 0, critical: 0, warning: 0, info: 0, pass: 0 };
  summaryEl.innerHTML = `
    <div class="review-summary-item critical"><span class="review-summary-count">${s.critical}</span><span class="review-summary-label">\uce58\uba85\uc801</span></div>
    <div class="review-summary-item warning"><span class="review-summary-count">${s.warning}</span><span class="review-summary-label">\uacbd\uace0</span></div>
    <div class="review-summary-item info"><span class="review-summary-count">${s.info}</span><span class="review-summary-label">\uc815\ubcf4</span></div>
    <div class="review-summary-item pass"><span class="review-summary-count">${s.pass}</span><span class="review-summary-label">\ud1b5\uacfc</span></div>
  `;

  categoriesEl.innerHTML = (review.categories || []).map(cat => {
    const issues = cat.issues || [];
    const hasIssues = issues.some(i => i.severity !== "pass");
    const countLabel = hasIssues ? `<span class="review-category-count has-issues">${issues.length}\uac74</span>` : `<span class="review-category-count all-clear">\ud321</span>`;
    return `<div class="review-category"><div class="review-category-header" onclick="this.nextElementSibling.classList.toggle('open')"><span class="review-category-icon">${cat.icon}</span><span class="review-category-name">${cat.name}</span>${countLabel}</div><div class="review-issues">${issues.map(i => `<div class="review-issue severity-${i.severity}"><div class="review-issue-header"><span class="review-issue-title">${i.title}</span><span class="review-issue-severity">${i.severity}</span></div><div class="review-issue-desc">${i.description}</div>${i.element ? `<span class="review-issue-element">${i.element}</span>` : ""}</div>`).join("")}</div></div>`;
  }).join("");
}

function closeReview() {
  const panel = el.reviewPanel;
  if (panel) panel.classList.add("hidden");
}

async function fixAllIssues() {
  if (!state.generatedHtml) return;
  const btn = $("btn-fix-all");
  if (btn) btn.disabled = true;
  const prompt = `\ub2e4\uc74c HTML\uc758 \ubb38\uc81c\uc810\uc744 \uc218\uc815\ud558\uc138\uc694. \ud648\ud398\uc774\uc9c0\uc758 \uc804\uccb4 \uad6c\uc870\ub97c \uc720\uc9c0\ud558\uba74\uc11c \ub2e4\uc74c \uc0ac\ud56d\ub9cc \uc218\uc815\ud558\uc138\uc694:
- \uc5ec\ubc31 \uc870\uc815 (padding/margin \ud1b5\uc77c)
- \uac80\uce68 \ubb38\uc81c \ud574\uacb0
- \uc815\ub82c \ub9de\ucd98
- \ud0c0\uc774\ud3ec\uadf8\ub798\ud53c \uc77c\uad00\uc131
- \ubc18\uc751\ud615 \ubcf4\uc644
- \uc811\uadfc\uc131 \uac1c\uc120

\ud604\uc7ac HTML:
\`\`\`html
${state.generatedHtml.slice(0, 20000)}
\`\`\`

\uac19\uc740 \ub514\uc790\uc778 \uc2a4\ud0c0\uc77c\uc744 \uc720\uc9c0\ud558\uba74\uc11c \uc704 \ubb38\uc81c\uc810\ub9cc \uc218\uc815\ud55c \uc644\uc804\ud55c HTML\uc744 ===HTML_START=== \uc640 ===HTML_END=== \uc0ac\uc774\uc5d0 \ucd9c\ub825\ud558\uc138\uc694.`;
  addMessage("messages", "user", "\ud1b5\ud569 \uc218\uc815 \uc694\uccad");
  const assistantDiv = addMessage("messages", "assistant", "\u23f3 \uc218\uc815 \uc911...");
  try {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        history: [],
        page_type: state.selectedType,
        template: state.selectedTemplate,
        design_content: state.selectedDesignContent,
        current_html: state.generatedHtml.slice(0, 20000),
        element_context: "",
        is_new_page: false,
      }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullContent += decoder.decode(value);
    }
    const extracted = extractHtmlMarker(fullContent) || extractHtml(fullContent);
    if (extracted) {
      state.generatedHtml = extracted;
      updatePreview(state.generatedHtml, false);
      saveProject();
      assistantDiv.innerHTML = "\u2705 \uc218\uc815 \uc644\ub8cc!";
    } else {
      assistantDiv.innerHTML = "\u26a0\ufe0f HTML\uc744 \ucd94\ucd9c\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.";
    }
  } catch (e) {
    assistantDiv.innerHTML = `\u26a0\ufe0f \uc624\ub958: ${e.message}`;
  }
  if (btn) btn.disabled = false;
}

// ── Init ──
function init() {
  document.querySelectorAll("textarea").forEach(el => {
    el.addEventListener("input", () => { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (el.id === "user-input") sendMessage(); } });
  });

  // direct-mode-toggle 체크박스가 있으면 그 값으로 state.directMode 초기화
  const dToggle = $("direct-mode-toggle");
  if (dToggle) state.directMode = dToggle.checked;

  checkConnection();
  setInterval(checkConnection, 10000);
  loadProjects();
}

// ── Global Exports (for HTML template onclick) ──
window.selectType = selectType;
window.selectTemplate = selectTemplate;
window.selectPageMode = selectPageMode;
window.generateDesignFromUrl = generateDesignFromUrl;
window.sendMessage = sendMessage;
window.regenerate = regenerate;
window.newWizard = newWizard;
window.loadProject = loadProject;
window.deleteProject = deleteProject;
window.goToStep = goToStep;
window.startDownload = startDownload;
window.hideDownloadModal = hideDownloadModal;
window.handleImageUpload = handleImageUpload;
window.toggleReasoning = toggleReasoning;
window.toggleReasoningBlock = toggleReasoningBlock;
window.toggleDirectMode = toggleDirectMode;
window.elementActionNewPage = elementActionNewPage;
window.elementActionLink = elementActionLink;
window.elementActionEdit = elementActionEdit;
window.showLinkActionModal = showLinkActionModal;
window.hideLinkActionModal = hideLinkActionModal;
window.linkActionNavigate = linkActionNavigate;
window.linkActionMove = linkActionMove;
window.linkActionEdit = linkActionEdit;
window.hideElementActionModal = hideElementActionModal;
window.startReview = startReview;
window.closeReview = closeReview;
window.fixAllIssues = fixAllIssues;
window.toggleFileTree = toggleFileTree;

init();
