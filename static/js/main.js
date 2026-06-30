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
  multiSelected: [], // Shift+클릭 멀티 선택 요소 [{wgen_id,tag,text}]
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
  generatingModal: $("generating-modal"),
  generatingProgressList: $("generating-progress-list"),
  generatingStatusText: $("generating-status-text"),
  generatingProgressBar: $("generating-progress-bar"),
  generatingProgressPercent: $("generating-progress-percent"),
  generatingSpeed: $("generating-speed"),
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
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  if (!state.currentProjectId) { addMessage("messages", "assistant", "\u26a0\ufe0f \uba3c\uc800 \ud504\ub85c\uc81d\ud2b8\ub97c \uc2dc\uc791\ud574\uc8fc\uc138\uc694."); event.target.value = ""; return; }
  files.forEach(uploadOneImage);
  event.target.value = "";
}

function uploadOneImage(file) {
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
          el.userInput.placeholder = `\uc774\ubbf8\uc9c0 ${state.uploadedImages.length}\uac1c \ucca8\ubd80\ub428. "\uac24\ub7ec\ub9ac \ucd94\uac00" \ub610\ub294 \uc694\uc18c \uc120\ud0dd \ud6c4 "\uc774 \uc774\ubbf8\uc9c0\ub85c \ubc14\uafd4"...`;
          el.userInput.focus();
        } else {
          const st = msgEl.querySelector(".image-attach-status");
          if (st) { st.textContent = "\u26a0\ufe0f \uc5c5\ub85c\ub4dc \uc2e4\ud328"; st.style.color = "var(--error, #e74c3c)"; }
        }
      }).catch(() => {
        const st = msgEl.querySelector(".image-attach-status");
        if (st) { st.textContent = "\u26a0\ufe0f \uc5c5\ub85c\ub4dc \uc2e4\ud328"; st.style.color = "var(--error, #e74c3c)"; }
      });
  };
  reader.readAsDataURL(file);
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
    style.textContent = "img{max-width:100%;height:auto} body.wgen-devmode { cursor: crosshair !important; } body.wgen-devmode .wgen-selected { outline: 3px solid #6c5ce7 !important; outline-offset: 2px; cursor: pointer !important; } body.wgen-devmode .wgen-hover { outline: 2px dashed #00cec9 !important; outline-offset: 1px; cursor: pointer !important; }";
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
var sty=document.getElementById("wgen-style")||function(){var s=document.createElement("style");s.id="wgen-style";s.textContent="img{max-width:100%;height:auto}body.wgen-devmode{cursor:crosshair!important}body.wgen-devmode .wgen-selected{outline:3px solid #6c5ce7!important;outline-offset:2px;cursor:pointer!important}body.wgen-devmode .wgen-hover{outline:2px dashed #00cec9!important;outline-offset:1px;cursor:pointer!important}";document.head.appendChild(s);return s}();
function applyDevMode(v){var b=document.body;if(b)b.classList.toggle("wgen-devmode",v)};
var _dm=devMode;applyDevMode(_dm);if(!document.body)document.addEventListener("DOMContentLoaded",function(){applyDevMode(_dm)});
window.addEventListener("message",function(e){if(e.data&&e.data.type==="set-dev-mode"){devMode=e.data.enabled;applyDevMode(devMode);if(!devMode){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});el=null}}else if(e.data&&e.data.type==="deselect"){document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});el=null}else if(e.data&&e.data.type==="wgen-apply-patch"){var _p=e.data.patch||{},_wid=e.data.wgenId,_n=_wid?document.querySelector('[data-wgen-id="'+_wid+'"]'):null;if(!_n)_n=el;var _ok=false;if(_n){try{if(_p.op==="delete"){_n.remove();_ok=true}else if(_p.op==="text"){if(_p.text!=null){_n.textContent=_p.text;_ok=true}}else if(_p.op==="href"){_n.setAttribute("href",_p.href||"#");_ok=true}else if(_p.op==="src"){var _im=_n.tagName==="IMG"?_n:_n.querySelector("img");if(_im){_im.setAttribute("src",_p.src||"");_ok=true}}else if(_p.op==="style"){var _st=_p.styles||{};for(var _k in _st){_n.style.setProperty(_k,_st[_k],"important")}_ok=true}else if(_p.op==="html"){if(_p.html){_n.outerHTML=_p.html;_ok=true}}else if(_p.op==="insert"){if(_p.html){_n.insertAdjacentHTML(_p.position==="before"?"beforebegin":"afterend",_p.html);_ok=true}}else if(_p.op==="align"){var _a=_p.value||"center";_n.style.setProperty("text-align",_a,"important");_n.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,button,li,blockquote,figcaption,label,.section-header,.section-title,.section-subtitle,.hero-content,.hero-title,.hero-subtitle,.card,.card-title,.card-text").forEach(function(c){c.style.setProperty("text-align",_a,"important")});var _ml=_a==="left"?"0":"auto",_mr=_a==="right"?"0":"auto";_n.querySelectorAll(".container,.card,.hero-content,.section-header,figure,img,.btn,blockquote,.pricing-card,.testimonial").forEach(function(c){var d="";try{d=getComputedStyle(c).display}catch(_x){}if(d!=="inline"&&d.indexOf("inline-")!==0){c.style.setProperty("margin-left",_ml,"important");c.style.setProperty("margin-right",_mr,"important")}});if(_a==="center"){_n.querySelectorAll(".grid,[class*=grid],.row,ul,ol,.hero-actions,.cta,.section-header").forEach(function(c){c.style.setProperty("justify-content","center","important");c.style.setProperty("justify-items","center","important")})}_ok=true}}catch(_er){_ok=false}}if(_ok&&_p.also){try{document.querySelectorAll(_p.also).forEach(function(x){if(x===_n)return;if(_p.op==="style"){var s=_p.styles||{};for(var k in s)x.style.setProperty(k,s[k],"important")}else if(_p.op==="delete"){x.remove()}else if(_p.op==="text"){if(_p.text!=null)x.textContent=_p.text}else if(_p.op==="href"){x.setAttribute("href",_p.href||"#")}else if(_p.op==="src"){var im=x.tagName==="IMG"?x:x.querySelector("img");if(im)im.setAttribute("src",_p.src||"")}else if(_p.op==="align"){x.style.setProperty("text-align",_p.value||"center","important")}})}catch(_ea){}}if(_p.op==="delete-multi"){try{(_p.ids||[]).forEach(function(id){var dn=document.querySelector('[data-wgen-id="'+id+'"]');if(dn)dn.remove()});_ok=true}catch(_e3){_ok=false}}var _html="";try{var _root=document.documentElement.cloneNode(true);_root.querySelectorAll("#wgen-interaction,#wgen-error-catcher,#wgen-style,#wgen-reveal,#wgen-base").forEach(function(x){x.remove()});_root.querySelectorAll("[data-wgen-id]").forEach(function(x){x.removeAttribute("data-wgen-id")});_root.querySelectorAll(".wgen-hover,.wgen-selected").forEach(function(x){x.classList.remove("wgen-hover");x.classList.remove("wgen-selected")});var _b=_root.querySelector("body");if(_b)_b.classList.remove("wgen-devmode");_html="<!DOCTYPE html>\\n"+_root.outerHTML}catch(_e2){_html=""}window.parent.postMessage({type:"wgen-patched",ok:_ok&&!!_html,html:_html},"*")}});
document.addEventListener("mouseover",function(e){if(!devMode||e.target.tagName==="BODY"||e.target.tagName==="HTML"||el===e.target)return;document.querySelectorAll(".wgen-hover").forEach(function(e){e.classList.remove("wgen-hover")});e.target.classList.add("wgen-hover")});
document.addEventListener("mouseout",function(e){if(!devMode)return;if(el!==e.target)e.target.classList.remove("wgen-hover")});
var _lpT=null,_lpX=0,_lpY=0,_lpFired=false,_multi=[];
function _lpSel(t){if(!t||t.tagName==="BODY"||t.tagName==="HTML")return;document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});el=t;t.classList.add("wgen-selected");if(!t.getAttribute("data-wgen-id")){t.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8))}var _cl=(t.className||"").toString().replace(/\\bwgen-(hover|selected|devmode)\\b/g,"").replace(/\\s+/g," ").trim();var _oh=t.outerHTML.replace(/\\sdata-wgen-id="[^"]*"/g,"").replace(/\\bwgen-(hover|selected|devmode)\\b/g,"").replace(/class="\\s*"/g,"").substring(0,800);window.parent.postMessage({type:"element-selected",insertMode:true,wgen_id:t.getAttribute("data-wgen-id"),tag:t.tagName.toLowerCase(),id:t.id||"",classes:_cl,text:(t.innerText||"").substring(0,100).trim(),html:_oh},"*")}
document.addEventListener("mousedown",function(e){if(!devMode||e.button!==0)return;_lpX=e.clientX;_lpY=e.clientY;_lpFired=false;var t=e.target;if(_lpT)clearTimeout(_lpT);_lpT=setTimeout(function(){_lpFired=true;_lpSel(t)},500)});
document.addEventListener("mousemove",function(e){if(_lpT&&(Math.abs(e.clientX-_lpX)>8||Math.abs(e.clientY-_lpY)>8)){clearTimeout(_lpT);_lpT=null}});
document.addEventListener("mouseup",function(){if(_lpT){clearTimeout(_lpT);_lpT=null}});
document.addEventListener("touchstart",function(e){if(!devMode||!e.touches[0])return;_lpX=e.touches[0].clientX;_lpY=e.touches[0].clientY;_lpFired=false;var t=e.target;if(_lpT)clearTimeout(_lpT);_lpT=setTimeout(function(){_lpFired=true;_lpSel(t)},500)},{passive:true});
document.addEventListener("touchmove",function(e){var t=e.touches[0];if(_lpT&&t&&(Math.abs(t.clientX-_lpX)>10||Math.abs(t.clientY-_lpY)>10)){clearTimeout(_lpT);_lpT=null}},{passive:true});
document.addEventListener("touchend",function(){if(_lpT){clearTimeout(_lpT);_lpT=null}});
document.addEventListener("keydown",function(e){if(!devMode)return;var t=e.target;if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.isContentEditable))return;if((e.key==="Delete"||e.key==="Backspace")&&(el||_multi.length)){e.preventDefault();window.parent.postMessage({type:"delete-key"},"*")}});
document.addEventListener("click",function(e){if(_lpFired){_lpFired=false;e.preventDefault();e.stopPropagation();return}if(e.button!==0)return;if(e.shiftKey&&devMode){if(e.target.tagName==="BODY"||e.target.tagName==="HTML")return;e.preventDefault();e.stopPropagation();var _t=e.target;if(!_t.getAttribute("data-wgen-id"))_t.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8));var _w2=_t.getAttribute("data-wgen-id"),_mi=_multi.indexOf(_w2);if(_mi===-1){_multi.push(_w2);_t.classList.add("wgen-selected")}else{_multi.splice(_mi,1);_t.classList.remove("wgen-selected")}var _items=_multi.map(function(id){var n=document.querySelector('[data-wgen-id="'+id+'"]');return n?{wgen_id:id,tag:n.tagName.toLowerCase(),text:(n.innerText||"").substring(0,40).trim()}:null}).filter(Boolean);window.parent.postMessage({type:"elements-multi-selected",items:_items},"*");return}if(_multi.length){_multi.forEach(function(id){var n=document.querySelector('[data-wgen-id="'+id+'"]');if(n)n.classList.remove("wgen-selected")});_multi=[]}var l=e.target.closest("a");if(l){var h=l.getAttribute("data-nav")||l.getAttribute("href");if(!devMode){if(!h||h===""||h.startsWith("javascript:")){e.preventDefault();return}e.preventDefault();window.parent.postMessage({type:"preview-link-clicked",href:h,text:(l.innerText||"").substring(0,100).trim(),tag:"a",classes:(l.className||"").toString().trim()},"*");return}e.preventDefault();e.stopPropagation();document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===l){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=l;l.classList.remove("wgen-hover");l.classList.add("wgen-selected");if(!l.getAttribute("data-wgen-id")){l.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8))}var _lcl=(l.className||"").toString().replace(/\\bwgen-(hover|selected|devmode)\\b/g,"").replace(/\\s+/g," ").trim();window.parent.postMessage({type:"element-selected",wgen_id:l.getAttribute("data-wgen-id"),tag:"a",id:l.id||"",classes:_lcl,text:(l.innerText||"").substring(0,100).trim(),html:l.outerHTML.replace(/\\sdata-wgen-id="[^"]*"/g,"").substring(0,500),linkHref:h},"*");return}if(!devMode)return;e.stopPropagation();if(e.target.tagName==="BODY"||e.target.tagName==="HTML")return;document.querySelectorAll(".wgen-selected").forEach(function(e){e.classList.remove("wgen-selected")});if(el===e.target){el=null;window.parent.postMessage({type:"element-deselected"},"*");return}el=e.target;e.target.classList.add("wgen-selected");if(!e.target.getAttribute("data-wgen-id")){e.target.setAttribute("data-wgen-id","w"+Math.random().toString(36).slice(2,8))}var _wid=e.target.getAttribute("data-wgen-id");var _cl=(e.target.className||"").toString().replace(/\\bwgen-(hover|selected|devmode)\\b/g,"").replace(/\\s+/g," ").trim();var _oh=e.target.outerHTML.replace(/\\sdata-wgen-id="[^"]*"/g,"").replace(/\\bwgen-(hover|selected|devmode)\\b/g,"").replace(/class="\\s*"/g,"").substring(0,800);window.parent.postMessage({type:"element-selected",wgen_id:_wid,tag:e.target.tagName.toLowerCase(),id:e.target.id||"",classes:_cl,text:(e.target.innerText||"").substring(0,100).trim(),html:_oh},"*")});
function _rv(){document.querySelectorAll("[data-animate]").forEach(function(e){e.classList.add("visible")})}
function _rt(){var y=document.getElementById("year");if(y)y.textContent=(new Date).getFullYear();var t=document.querySelector(".nav-toggle"),m=document.querySelector(".nav-menu");if(t&&m)t.addEventListener("click",function(){m.classList.toggle("open")});var n=document.querySelector(".nav");if(n)window.addEventListener("scroll",function(){window.scrollY>20?n.classList.add("scrolled"):n.classList.remove("scrolled")})}
function _init(){_rv();_rt()}
if(document.readyState!=="loading"){_init()}else{document.addEventListener("DOMContentLoaded",_init)}
setTimeout(_rv,800);
})();<\/script>`;
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
  // 브라우저 파서로 정규화 — 안 닫힌/어긋난 div 등 깨진 HTML을 유효 DOM으로 재구성
  // (스트리밍 중에는 부분 HTML이라 건너뜀)
  if (!isStreaming) {
    try {
      const doc = new DOMParser().parseFromString(processed, "text/html");
      if (doc && doc.body && (doc.body.children.length > 0 || doc.body.textContent.trim())) {
        processed = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
      }
    } catch (e) { /* 파싱 실패 시 원본 사용 */ }
  }
  // 미리보기 신뢰성: data-animate(opacity:0)가 JS 실패로 영구 숨김되어 흰 화면이
  // 되지 않도록 CSS로 강제 표시 (스크립트 주입과 별개로 항상 보이게)
  const revealStyle = '<style id="wgen-reveal">[data-animate]{opacity:1 !important;transform:none !important}</style>';
  // blob: URL 렌더 시 상대/절대경로 리소스(이미지 등)가 풀리도록 base 주입
  const baseTag = '<base id="wgen-base" href="' + location.origin + '/">';
  const headScripts = baseTag + revealStyle + '<script id="wgen-error-catcher">window.onerror=function(m,u,l,c){window.parent.postMessage({type:"preview-error",message:m,line:l,col:c},"*");return false;};window.addEventListener("unhandledrejection",function(e){window.parent.postMessage({type:"preview-error",message:"Unhandled promise: "+(e.reason&&e.reason.message||e.reason),"line":0,"col":0},"*");});<\/script>' + buildInteractionScript();
  const hi = processed.toLowerCase().indexOf("<head");
  if (hi !== -1) {
    const ho = processed.indexOf(">", hi);
    if (ho !== -1) processed = processed.slice(0, ho + 1) + headScripts + processed.slice(ho + 1);
  } else {
    // <head>가 없으면 맨 앞에라도 주입 (data-animate 숨김 방지)
    processed = baseTag + revealStyle + processed;
  }
  // blob URL 네비게이션을 기본으로 — WebView2/pywebview에서 srcdoc 재설정이
  // 이미 로드된 iframe을 안정적으로 다시 렌더하지 않는 문제(완료 후 흰색) 회피.
  try {
    const blob = new Blob([processed], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    if (frame._wgenUrl) { try { URL.revokeObjectURL(frame._wgenUrl); } catch (_) { } }
    frame._wgenUrl = url;
    frame.removeAttribute("srcdoc");
    frame.src = url;
  } catch (e) {
    try { frame.srcdoc = processed; }
    catch (e2) { console.error("[preview] render failed", e2); }
  }
  frame.style.display = "block";
  frame.classList.remove("hidden");
  if (el.previewPlaceholder) el.previewPlaceholder.classList.add("hidden");
}

// \ucd08\ub2f9 \ucc98\ub9ac \ud1a0\ud070 \ucd94\uc815 (\ud1a0\ud070 \u2248 \ub204\uc801 \ubb38\uc790\uc218 / 4)
function updateGenSpeed(startTs, chars) {
  if (!el.generatingSpeed) return;
  const sec = (Date.now() - startTs) / 1000;
  if (sec < 0.3) return;
  const tps = (chars / 4) / sec;
  el.generatingSpeed.textContent = `\u26a1 ${tps.toFixed(1)} tok/s`;
}

function showGenerating(isEditing) {
  state.abortController = new AbortController();
  // \uc9c4\ud589\uc0c1\ud669/todo\ub294 \ubaa8\ub2ec\ub85c \u2014 \ubbf8\ub9ac\ubcf4\uae30 \uc601\uc5ed\uc740 HTML(iframe)\ub9cc \uc720\uc9c0
  if (el.generatingModal) el.generatingModal.classList.remove("hidden");
  if (el.generatingSpeed) el.generatingSpeed.textContent = "";
  if (el.previewGenerating) {
    const title = el.previewGenerating.querySelector("h3");
    if (title) title.textContent = isEditing ? "\uc218\uc815 \uc911" : "\ud648\ud398\uc774\uc9c0 \uc0dd\uc131 \uc911";
  }
  const cancelBtn = document.getElementById("btn-cancel-generate");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  if (el.generatingProgressList) el.generatingProgressList.innerHTML = "";
  if (el.generatingStatusText) el.generatingStatusText.textContent = isEditing ? "\uc218\uc815 \uc694\uccad\uc744 \ucc98\ub9ac \uc911\uc785\ub2c8\ub2e4..." : "AI\uac00 \ud398\uc774\uc9c0\ub97c \ub9cc\ub4e4\uace0 \uc788\uc2b5\ub2c8\ub2e4...";
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
  if (el.generatingModal) el.generatingModal.classList.add("hidden");
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

function pushHtmlSnapshot() {
  if (state.generatedHtml) {
    state.htmlHistory.push(state.generatedHtml);
    if (state.htmlHistory.length > 20) state.htmlHistory.shift();
  }
}

// v2 생성 결과 HTML만 수집 (채팅/히스토리/저장 부수효과 없음).
async function collectGeneratedHtmlV2(body) {
  const response = await fetch("/api/chat/stream/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: state.abortController ? state.abortController.signal : undefined,
  });
  let finalHtml = "";
  let err = null;
  const multiPages = {};
  let _prog = 0;
  const _startTs = Date.now();
  let _chars = 0;
  const sse = createSSEReader(response);
  sse.on("status", (d) => {
    const p = d.payload;
    if (p && p.menu_items) {
      state.multiPageMenuItems = p.menu_items;
    } else if (typeof p === "string") {
      _prog = Math.min(92, _prog + 1.2);
      updateProgressBar(_prog);
      _chars += p.length;
      updateGenSpeed(_startTs, _chars);
      if (p.indexOf("<") === -1 && p.length < 60 && el.generatingStatusText) el.generatingStatusText.textContent = p;
    }
  });
  sse.on("html", (d) => {
    const p = d.payload;
    if (typeof p === "string") finalHtml = p;
    else if (p && p.file) { multiPages[p.file] = p.html; if (p.file === "index.html") finalHtml = p.html; }
  });
  sse.on("done", (d) => { const p = d && d.payload; if (p && p.html) finalHtml = p.html; });
  sse.on("error", (d) => { err = d.payload; });
  await sse.start();
  if (err) throw new Error(err);
  return { html: finalHtml, multiPages };
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
async function sendMessageV2(message, displayMessage, elementContextObj, forcedMode) {
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

  const isAsk = forcedMode === "ask";
  // ASK(대화/질문)는 생성 모달 없이 채팅에만 답변
  const assistantDiv = addMessage("messages", "assistant", isAsk ? "💬 답변 중..." : (isFirst ? "⏳ 홈페이지 생성 중..." : "⏳ 처리 중..."));
  if (!isAsk) showGenerating(!isFirst);

  let chatText = "";
  let finalHtml = "";
  let sawHtml = false;
  let sawError = false;
  const multiPages = {};

  try {
    const response = await fetch("/api/chat/stream/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mode: forcedMode || getSelectedMode(),
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

    let _prog = 0;
    const _startTs = Date.now();
    let _chars = 0;
    // 진행 모달 todo 리스트
    const todo = [];
    function _renderTodo() {
      if (!el.generatingProgressList) return;
      el.generatingProgressList.innerHTML = todo.map(function (t) {
        const icon = t.status === "done" ? "✓" : (t.status === "active" ? "⟳" : "·");
        return `<div class="generating-progress-item ${t.status}"><span class="generating-progress-icon">${icon}</span><span>${t.label}</span></div>`;
      }).join("");
      const a = el.generatingProgressList.querySelector(".active");
      if (a) a.scrollIntoView({ block: "nearest" });
    }
    function _advance(key) {
      let hit = false;
      for (const t of todo) {
        if (t.key === key) { t.status = "done"; hit = true; }
        else if (hit && t.status === "pending") { t.status = "active"; break; }
      }
      _renderTodo();
    }
    if (!isMulti) {
      // 단일 페이지: 2단계 체크리스트
      todo.push({ key: "gen", label: "AI 콘텐츠 생성", status: "active" });
      todo.push({ key: "build", label: "페이지 조립 · 검증", status: "pending" });
      _renderTodo();
    }

    const sse = createSSEReader(response);
    sse.on("status", (d) => {
      const p = d.payload;
      if (typeof p === "string") {
        _prog = Math.min(92, _prog + 1.2);
        updateProgressBar(_prog);
        _chars += p.length;
        updateGenSpeed(_startTs, _chars);
        // HTML 토큰 노이즈는 숨기고 짧은 상태 메시지만 표시
        if (p.indexOf("<") === -1 && p.length < 60 && el.generatingStatusText) {
          el.generatingStatusText.textContent = p;
        }
      } else if (p && (p.pages || p.menu_items)) {
        // 멀티페이지 계획 수신 → 페이지별 todo 구성
        state.multiPageMenuItems = p.menu_items || state.multiPageMenuItems;
        const files = p.pages || [];
        const titles = p.menu_items || [];
        todo.length = 0;
        files.forEach((f, i) => todo.push({
          key: f, label: titles[i] || f.replace("pages/", "").replace(".html", ""),
          status: i === 0 ? "active" : "pending",
        }));
        _renderTodo();
        _prog = Math.min(92, _prog + 4);
        updateProgressBar(_prog);
        if (el.generatingStatusText) el.generatingStatusText.textContent = `${files.length || titles.length}개 페이지 생성 중...`;
      }
    });
    sse.on("chat", (d) => {
      chatText += (d.payload || "");
      _chars += (d.payload || "").length;
      updateGenSpeed(_startTs, _chars);
      assistantDiv.innerHTML = formatContent(stripThinkingBlock(chatText));
      scrollToBottom("messages");
    });
    sse.on("html", (d) => {
      sawHtml = true;
      const p = d.payload;
      if (typeof p === "string") {
        // 빈/부분 HTML(흰 화면 유발)은 무시 — 완전한 문서만 렌더
        if (p && p.trim().length > 50) {
          finalHtml = p; state.generatedHtml = p; updatePreview(p, true);
        }
        _advance("gen");  // 단일: 콘텐츠 생성 완료 → 조립 단계
      } else if (p && p.file) {
        multiPages[p.file] = p.html;
        if (p.file === "index.html") { finalHtml = p.html; state.generatedHtml = p.html; updatePreview(p.html, true); }
        _advance(p.file);  // 해당 페이지 완료 → 다음 페이지 활성
        _prog = Math.min(92, _prog + 6);
        updateProgressBar(_prog);
      }
    });
    sse.on("done", (d) => {
      const p = d && d.payload;
      if (p && p.html) { finalHtml = p.html; state.generatedHtml = p.html; }
      todo.forEach((t) => { t.status = "done"; });
      _renderTodo();
    });
    sse.on("error", (d) => {
      sawError = true;
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
      if (!chatText && !sawError) assistantDiv.innerHTML = "<div>✅ 완료! 오른쪽 미리보기를 확인하세요.</div>";
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

// ── Fast-Edit (선택 요소만 즉시 패치, 전체 재생성 없음) ──
// 고신뢰 패턴만 휴리스틱으로; 나머지는 작은 AI 패치(/api/edit/patch)로.
const _DESIGN_WORDS = /(둥글|그림자|색|배경|크기|폰트|모던|스타일|정렬|여백|간격|패딩|마진|border|shadow|radius|gradient|굵게|크게|작게|넓게|좁게|테두리|레이아웃|배치|디자인)/i;

function tryLocalPatch(message, elInfo) {
  const m = (message || "").trim();
  // 링크(href) 설정: URL + (링크/연결 의도 또는 <a> 요소) — 이미지 의도는 제외
  const _urlm = m.match(/\bhttps?:\/\/[^\s"'<>]+/i);
  if (_urlm && !/이미지|사진|그림|image|img/i.test(m)) {
    if (/(링크|연결|href|url|주소|link|걸어|이동)/i.test(m) || (elInfo && (elInfo.tag || "").toLowerCase() === "a")) {
      return { op: "href", href: _urlm[0] };
    }
  }
  // 명백한 삭제만 즉시 처리
  if (/(삭제|제거|없애|지워|지우|delete|remove)/i.test(m) && !_DESIGN_WORDS.test(m)) return { op: "delete" };
  // 따옴표로 새 텍스트를 명시한 경우 즉시 처리
  const q = m.match(/["'“「]([^"'”」]{1,200})["'”」]/);
  if (q && /(바꿔|변경|수정|교체|텍스트|글자|문구|내용|제목|로|으로)/.test(m) && !_DESIGN_WORDS.test(m)) {
    return { op: "text", text: q[1] };
  }
  // "...을/를 X (으)로 (text)? 수정/변경/바꿔" 또는 "X로 수정" → X (디자인 단어 없을 때)
  if (!_DESIGN_WORDS.test(m)) {
    let mm = m.match(/(?:을|를)\s*(.+?)\s*으?로\s*(?:text|텍스트|글자|문구|내용|제목)?\s*(?:수정|변경|바꿔|바꿔줘|교체)/i);
    if (!mm) mm = m.match(/(?:^|\s)([^\s"']+(?:\s+[^\s"']+)?)\s*으?로\s*(?:text|텍스트|글자|문구|내용|제목)?\s*(?:수정|변경|바꿔|바꿔줘|교체)/i);
    if (mm && mm[1]) {
      const t = mm[1].trim().replace(/\s*으$/, "");
      if (t && t.length <= 60 && !/wgen-/.test(t)) return { op: "text", text: t };
    }
  }
  // HEX 색상
  const hex = m.match(/#([0-9a-fA-F]{3,8})\b/);
  if (hex && /(색|배경|color|background|글자색|폰트)/i.test(m)) {
    const prop = /(배경|background)/i.test(m) ? "background-color" : "color";
    const o = { op: "style", styles: {} }; o.styles[prop] = "#" + hex[1]; return o;
  }
  // URL/경로
  const url = m.match(/(https?:\/\/\S+|pages\/\S+\.html|\/[^\s"']+)/);
  if (url && /(이미지|사진|그림|img|src)/i.test(m)) return { op: "src", src: url[1] };
  if (url && /(링크|href|연결|이동|주소)/i.test(m)) return { op: "href", href: url[1] };
  return null;
}

// iframe(sandbox)에 패치를 보내고 정리된 HTML을 회신받아 저장.
function applyPatchToPreview(patch, wgenId) {
  return new Promise((resolve) => {
    const frame = el.previewFrame;
    if (!frame || !frame.contentWindow) { resolve(false); return; }
    let done = false;
    function onMsg(e) {
      if (!e.data || e.data.type !== "wgen-patched") return;
      done = true;
      window.removeEventListener("message", onMsg);
      console.log("[fast-edit] iframe responded ok =", e.data.ok, "htmlLen =", (e.data.html || "").length);
      if (!e.data.ok || !e.data.html) { resolve(false); return; }
      const html = e.data.html;
      const path = state.currentViewPath || "index.html";
      if (path === "index.html") state.generatedHtml = html;
      else state.multiPageHtmls[path] = html;
      updatePreview(html, false);
      if (state.currentProjectId) {
        fetch(`/api/projects/${state.currentProjectId}/save_file`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, content: html }),
        }).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
      }
      resolve(true);
    }
    window.addEventListener("message", onMsg);
    console.log("[fast-edit] → iframe wgen-apply-patch", JSON.stringify(patch).slice(0, 120));
    frame.contentWindow.postMessage({ type: "wgen-apply-patch", wgenId, patch }, "*");
    setTimeout(() => { if (!done) { console.warn("[fast-edit] iframe patch TIMEOUT (no response)"); window.removeEventListener("message", onMsg); resolve(false); } }, 3000);
  });
}

const _PATCH_LABEL = { delete: "요소 삭제", text: "텍스트 변경", style: "스타일 변경", href: "링크 변경", src: "이미지 변경", html: "요소 디자인 변경", insert: "요소 추가" };

// 선택 요소 인접에 삽입할 새 요소 HTML 생성 (이미지/버튼/텍스트)
function buildElementToInsert(message, imgUrl) {
  if (/이미지|사진|그림|image|img/i.test(message)) {
    if (imgUrl) return `<img src="${imgUrl}" alt="이미지" style="max-width:100%;height:auto;display:block;border-radius:8px" />`;
    return `<div style="${_IMG_PH};max-width:320px">이미지</div>`;
  }
  if (/버튼|버틀|button|링크/i.test(message)) return `<a href="javascript:void(0)" class="btn btn-primary">버튼</a>`;
  return `<p>${_extractInsertText(message)}</p>`;
}

// 추가 요청에서 새 텍스트만 추출 (방향/액션/타입 단어 제거)
function _extractInsertText(message) {
  const q = message.match(/["'“「]([^"'”」]{1,200})["'”」]/);
  if (q) return q[1].trim();
  let m = " " + message + " ";
  m = m.replace(/(맨\s*)?(위에|아래에|위쪽|아래쪽|왼쪽에|오른쪽에|왼쪽|오른쪽|좌측|우측|상단|하단|앞에|뒤에|여기에|이\s*위치에)/g, " ");
  m = m.replace(/(텍스트|글자|문구|문단|단락|text)/gi, " ");
  m = m.replace(/(추가해줘|추가해|추가|넣어줘|넣어|삽입해줘|삽입해|삽입|붙여넣어|붙여|만들어줘|만들어|작성해줘|작성|써줘|해줘|해)/g, " ");
  m = m.replace(/\s+/g, " ").trim();
  return m || "새 텍스트";
}
function _insertPosition(message) {
  return /(위|앞|왼쪽|좌측|상단|above|before|left)/i.test(message) ? "before" : "after";
}

async function tryFastEdit(message, elInfo, imageUrl) {
  let patch = tryLocalPatch(message, elInfo);
  if (!patch) {
    try {
      const r = await fetch("/api/edit/patch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, element: elInfo, design_system: state.designSystem || null, image_url: imageUrl || "" }),
      });
      patch = await r.json();
    } catch (e) { return false; }
  }
  // complex면 전체 재생성 대신 "요소만 재작성(op=html)" 강제 재시도
  if (patch && patch.op === "complex" && elInfo) {
    try {
      const r2 = await fetch("/api/edit/patch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, element: elInfo, design_system: state.designSystem || null, force_html: true, image_url: imageUrl || "" }),
      });
      patch = await r2.json();
    } catch (e) { /* keep complex */ }
  }
  console.log("[fast-edit] patch =", JSON.stringify(patch), "wgen_id =", elInfo.wgen_id);
  if (!patch || patch.op === "complex") { console.warn("[fast-edit] complex/no-patch → fallback"); return false; }
  return await execElementPatch(patch, elInfo);
}

// 패치 1개를 선택 요소에 적용 + 채팅 피드백. 항상 true 반환(전체 재생성 방지).
async function execElementPatch(patch, elInfo) {
  const ok = await applyPatchToPreview(patch, elInfo.wgen_id);
  console.log("[fast-edit] applyPatchToPreview ok =", ok, "op =", patch.op);
  if (!ok) {
    addMessage("messages", "assistant", "⚠️ 선택 요소에 패치를 적용하지 못했습니다(미리보기에서 요소를 다시 선택해 주세요).");
    return true;
  }
  const label = _PATCH_LABEL[patch.op] || "수정";
  addMessage("messages", "assistant", `⚡ 빠른 수정 완료 (${label}) — 선택 요소만 변경, 전체 디자인 유지.`);
  state.chatHistory.push({ role: "assistant", content: `${label} 완료` });
  saveProject();
  enableReviewBtn();
  return true;
}

// 색 이름/HEX 파싱 (한국어+영어)
const _COLOR_MAP = {
  "흰": "#ffffff", "하양": "#ffffff", "하얀": "#ffffff", "화이트": "#ffffff", "white": "#ffffff",
  "검정": "#111111", "검은": "#111111", "블랙": "#111111", "black": "#111111",
  "빨강": "#e74c3c", "빨간": "#e74c3c", "red": "#e74c3c",
  "주황": "#e67e22", "orange": "#e67e22",
  "노랑": "#f1c40f", "노란": "#f1c40f", "yellow": "#f1c40f",
  "초록": "#2ecc71", "녹색": "#2ecc71", "green": "#2ecc71",
  "파랑": "#3498db", "파란": "#3498db", "blue": "#3498db", "하늘": "#74b9ff",
  "남색": "#2c3e50", "네이비": "#2c3e50", "navy": "#2c3e50",
  "보라": "#9b59b6", "purple": "#9b59b6",
  "분홍": "#fd79a8", "핑크": "#fd79a8", "pink": "#fd79a8",
  "회색": "#95a5a6", "그레이": "#95a5a6", "gray": "#95a5a6", "grey": "#95a5a6",
  "베이지": "#f5f0e6", "beige": "#f5f0e6", "아이보리": "#fffff0",
};
function parseColor(m) {
  const hex = m.match(/#([0-9a-fA-F]{3,8})\b/);
  if (hex) return "#" + hex[1];
  for (const k in _COLOR_MAP) { if (m.includes(k)) return _COLOR_MAP[k]; }
  return null;
}

// HTML에 body 배경색 규칙을 결정적으로 주입/교체 (AI 미사용)
function setBodyBackground(html, color) {
  const rule = `<style id="wgen-userbg">html,body{background:${color} !important;}</style>`;
  if (/<style id="wgen-userbg">[\s\S]*?<\/style>/.test(html)) {
    return html.replace(/<style id="wgen-userbg">[\s\S]*?<\/style>/, rule);
  }
  const h = html.toLowerCase().lastIndexOf("</head>");
  if (h !== -1) return html.slice(0, h) + rule + "\n" + html.slice(h);
  return rule + html;
}

// "배경 <색>" 전체/페이지 요청을 결정적으로 처리 (현재 + 멀티페이지 전부)
function applyBackgroundColor(color) {
  let cur = state.generatedHtml;
  if (!cur) { addMessage("messages", "assistant", "⚠️ 먼저 페이지를 생성해 주세요."); return false; }
  cur = setBodyBackground(cur, color);
  state.generatedHtml = cur;
  updatePreview(cur, false);
  const saves = [];
  const curPath = state.currentViewPath || "index.html";
  if (curPath !== "index.html") state.multiPageHtmls[curPath] = cur;
  // 멀티페이지 전부 적용
  let pages = 1;
  if (state.multiPageHtmls && Object.keys(state.multiPageHtmls).length) {
    for (const p in state.multiPageHtmls) {
      const nh = setBodyBackground(state.multiPageHtmls[p], color);
      state.multiPageHtmls[p] = nh;
      if (state.currentProjectId) saves.push(fetch(`/api/projects/${state.currentProjectId}/save_file`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p, content: nh }) }).catch(() => {}));
      pages++;
    }
  }
  if (state.currentProjectId) saves.push(fetch(`/api/projects/${state.currentProjectId}/save_file`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: curPath, content: cur }) }).catch(() => {}));
  Promise.all(saves).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
  addMessage("messages", "assistant", `🎨 배경색을 ${color}(으)로 변경했습니다${pages > 1 ? ` (${pages}개 페이지)` : ""}.`);
  state.chatHistory.push({ role: "assistant", content: `배경색 ${color} 적용` });
  saveProject();
  enableReviewBtn();
  return true;
}

// 섹션 HTML을 푸터 앞(없으면 </body> 앞)에 결정적으로 삽입 + 저장
function _insertSection(sectionHtml, label) {
  let html = state.generatedHtml;
  if (!html) { addMessage("messages", "assistant", "⚠️ 먼저 페이지를 생성해 주세요."); return false; }
  let idx = html.search(/<footer[\s>]/i);
  if (idx === -1) { const b = html.toLowerCase().lastIndexOf("</body>"); idx = b !== -1 ? b : html.length; }
  html = html.slice(0, idx) + "\n" + sectionHtml + "\n" + html.slice(idx);
  state.generatedHtml = html;
  updatePreview(html, false);
  const path = state.currentViewPath || "index.html";
  if (path !== "index.html") state.multiPageHtmls[path] = html;
  if (state.currentProjectId) {
    fetch(`/api/projects/${state.currentProjectId}/save_file`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: html }),
    }).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
  }
  addMessage("messages", "assistant", `✅ ${label} 섹션을 추가했습니다. 요소를 선택해 내용을 다듬어 주세요.`);
  state.chatHistory.push({ role: "assistant", content: `${label} 추가` });
  saveProject();
  enableReviewBtn();
  return true;
}

const _IMG_PH = 'background:var(--surface,#ececec);aspect-ratio:4/3;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:.85rem';

// 업로드 이미지를 갤러리 섹션으로 결정적 삽입
function insertImageGallery(images) {
  if (!images.length) { addMessage("messages", "assistant", "⚠️ 삽입할 이미지가 없습니다."); return false; }
  const cols = Math.min(images.length, 3);
  const cards = images.map(im =>
    `<div class="card"><img src="${im.url}" alt="${(im.name || 'image').replace(/"/g, '')}" style="max-width:100%;height:auto;display:block;border-radius:8px" /></div>`
  ).join("\n      ");
  const section = `<section class="section section-tinted" data-animate>\n  <div class="container">\n    <div class="grid grid-${cols}">\n      ${cards}\n    </div>\n  </div>\n</section>`;
  return _insertSection(section, `이미지 갤러리(${images.length}개)`);
}

// ── 기본 섹션 템플릿 라이브러리 (결정적 삽입, scaffold 클래스 + 한국어) ──
const SECTION_TEMPLATES = [
  {
    keys: /갤러리|gallery/i, label: "갤러리",
    html: `<section class="section section-tinted" data-animate><div class="container"><div class="section-header"><span class="section-label">GALLERY</span><h2 class="section-title">갤러리</h2></div><div class="grid grid-3">${[1, 2, 3, 4, 5, 6].map(() => `<div class="card"><div style="${_IMG_PH}">이미지</div></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /슬라이드|슬라이더|캐러셀|carousel|slider/i, label: "슬라이드",
    html: `<section class="section" data-animate><div class="container"><div class="section-header"><span class="section-label">SLIDE</span><h2 class="section-title">슬라이드</h2></div><div style="display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px">${[1, 2, 3, 4].map(i => `<div class="card" style="flex:0 0 80%;max-width:420px;scroll-snap-align:center"><div style="${_IMG_PH}">슬라이드 ${i}</div><h3 class="card-title">슬라이드 제목 ${i}</h3><p class="card-text">좌우로 스크롤하여 더 보세요.</p></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /상품\s*소개|제품\s*소개|상품|제품|product/i, label: "상품 소개",
    html: `<section class="section section-tinted" data-animate><div class="container"><div class="section-header"><span class="section-label">PRODUCTS</span><h2 class="section-title">상품 소개</h2><p class="section-subtitle">대표 상품을 소개합니다.</p></div><div class="grid grid-3">${[1, 2, 3].map(i => `<div class="card"><div style="${_IMG_PH}">상품 ${i}</div><h3 class="card-title">상품 ${i}</h3><p class="card-text">상품에 대한 간단한 설명을 입력하세요.</p><div style="font-weight:700;margin:8px 0">₩00,000</div><a href="javascript:void(0)" class="btn btn-primary btn-block">자세히 보기</a></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /가격|요금|플랜|pricing|price/i, label: "가격표",
    html: `<section class="section" data-animate><div class="container"><div class="section-header"><span class="section-label">PRICING</span><h2 class="section-title">요금제</h2></div><div class="grid grid-3">${[["베이직", "₩9,900", false], ["프로", "₩19,900", true], ["엔터프라이즈", "₩49,900", false]].map(([n, p, f]) => `<div class="pricing-card${f ? " featured" : ""}">${f ? '<span class="pricing-label">인기</span>' : ""}<h3 class="card-title">${n}</h3><div class="pricing-price">${p}<span class="pricing-period">/월</span></div><ul class="pricing-features"><li>핵심 기능 포함</li><li>이메일 지원</li><li>월간 리포트</li></ul><a href="javascript:void(0)" class="btn ${f ? "btn-primary" : "btn-secondary"} btn-block">선택하기</a></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /후기|리뷰|고객\s*평|추천사|testimonial|review/i, label: "고객 후기",
    html: `<section class="section section-tinted" data-animate><div class="container"><div class="section-header"><span class="section-label">REVIEWS</span><h2 class="section-title">고객 후기</h2></div><div class="grid grid-3">${[["김민준", "직장인"], ["이서연", "디자이너"], ["박지후", "사업가"]].map(([n, r]) => `<div class="testimonial"><div class="stars">★★★★★</div><p class="testimonial-text">"서비스가 정말 만족스러웠습니다. 다음에도 꼭 이용할게요."</p><div class="testimonial-author"><div class="testimonial-avatar"></div><div><div class="testimonial-name">${n}</div><div class="testimonial-role">${r}</div></div></div></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /faq|자주\s*묻|질문/i, label: "FAQ",
    html: `<section class="section" data-animate><div class="container narrow"><div class="section-header"><span class="section-label">FAQ</span><h2 class="section-title">자주 묻는 질문</h2></div>${[["배송은 얼마나 걸리나요?", "주문 후 평균 2~3일 소요됩니다."], ["환불이 가능한가요?", "수령 후 7일 이내 환불 가능합니다."], ["회원가입이 필요한가요?", "비회원으로도 이용 가능합니다."]].map(([q, a]) => `<details class="faq-item" style="padding:16px;border-bottom:1px solid var(--border,#eee)"><summary class="faq-question" style="cursor:pointer;font-weight:600">${q}</summary><p class="faq-answer" style="margin-top:8px;color:var(--text-secondary,#666)">${a}</p></details>`).join("")}</div></section>`,
  },
  {
    keys: /통계|숫자|성과|stat/i, label: "통계",
    html: `<section class="section" data-animate><div class="container"><div class="grid grid-4">${[["12,000+", "누적 고객"], ["99%", "만족도"], ["50+", "파트너사"], ["24/7", "지원"]].map(([n, l]) => `<div class="stat" style="text-align:center"><div class="stat-number" style="font-size:2rem;font-weight:800">${n}</div><div class="stat-label">${l}</div></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /팀|구성원|멤버|team/i, label: "팀 소개",
    html: `<section class="section section-tinted" data-animate><div class="container"><div class="section-header"><span class="section-label">TEAM</span><h2 class="section-title">팀 소개</h2></div><div class="grid grid-4">${[["김대표", "CEO"], ["이실장", "CTO"], ["박팀장", "디자인"], ["최매니저", "마케팅"]].map(([n, r]) => `<div class="card" style="text-align:center"><div style="width:96px;height:96px;border-radius:50%;margin:0 auto 12px;background:var(--surface,#ececec)"></div><h3 class="card-title">${n}</h3><p class="card-text">${r}</p></div>`).join("")}</div></div></section>`,
  },
  {
    keys: /문의|연락처|상담|컨택|contact|폼|form/i, label: "문의 폼",
    html: `<section class="section" data-animate><div class="container narrow"><div class="section-header"><span class="section-label">CONTACT</span><h2 class="section-title">문의하기</h2></div><form onsubmit="return false"><div class="form-group"><label class="form-label">이름</label><input class="form-input" type="text" placeholder="이름을 입력하세요" /></div><div class="form-group"><label class="form-label">이메일</label><input class="form-input" type="email" placeholder="email@example.com" /></div><div class="form-group"><label class="form-label">문의 내용</label><textarea class="form-textarea" rows="4" placeholder="내용을 입력하세요"></textarea></div><button class="btn btn-primary btn-block" type="submit">보내기</button></form></div></section>`,
  },
  {
    keys: /cta|행동\s*유도|배너/i, label: "CTA",
    html: `<section class="section cta" data-animate><div class="container" style="text-align:center"><h2 class="cta-title">지금 시작하세요</h2><p class="cta-subtitle">간편하게 가입하고 모든 기능을 사용해 보세요.</p><a href="javascript:void(0)" class="btn btn-cta btn-lg">무료로 시작하기</a></div></section>`,
  },
];

// 네비게이션 메뉴 항목 결정적 추가 (마지막 nav-link 뒤, 없으면 nav-menu 안)
function _extractMenuName(message) {
  const q = message.match(/["'“「]([^"'”」]{1,40})["'”」]/);
  if (q) return q[1].trim();
  let m = " " + message + " ";
  m = m.replace(/(메뉴에|메뉴를|메뉴|네비게이션|네비|nav)/gi, " ");
  m = m.replace(/(추가해줘|추가해|추가|넣어줘|넣어|만들어줘|만들어|삽입해|삽입|해줘|해|에)/g, " ");
  m = m.replace(/\s+/g, " ").trim();
  return m || "새 메뉴";
}
function addNavMenu(name) {
  let html = state.generatedHtml;
  if (!html) { addMessage("messages", "assistant", "⚠️ 먼저 페이지를 생성해 주세요."); return false; }
  const link = `<a href="javascript:void(0)" class="nav-link">${name}</a>`;
  const re = /<a\b[^>]*class="[^"]*\bnav-link\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  let last = null, m;
  while ((m = re.exec(html))) last = m;
  if (last) {
    const after = html.slice(last.index + last[0].length, last.index + last[0].length + 24);
    if (/^\s*<\/li>/i.test(after)) {
      // 메뉴가 <li>로 감싼 구조 → 같은 형식으로 </li> 뒤에 삽입 (한 줄 유지)
      const liEnd = html.indexOf("</li>", last.index + last[0].length - 1) + 5;
      html = html.slice(0, liEnd) + `\n          <li><a href="javascript:void(0)" class="nav-link">${name}</a></li>` + html.slice(liEnd);
    } else {
      const idx = last.index + last[0].length;
      html = html.slice(0, idx) + "\n          " + link + html.slice(idx);
    }
  } else {
    const nm = html.search(/class="[^"]*\bnav-menu\b[^"]*"/i);
    if (nm === -1) { addMessage("messages", "assistant", "⚠️ 네비게이션(메뉴)을 찾지 못했습니다. 멀티페이지로 생성하면 메뉴가 생깁니다."); return false; }
    const open = html.indexOf(">", nm);
    html = html.slice(0, open + 1) + "\n          " + link + html.slice(open + 1);
  }
  state.generatedHtml = html;
  updatePreview(html, false);
  const path = state.currentViewPath || "index.html";
  if (path !== "index.html") state.multiPageHtmls[path] = html;
  if (state.currentProjectId) {
    fetch(`/api/projects/${state.currentProjectId}/save_file`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: html }),
    }).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
  }
  addMessage("messages", "assistant", `🧭 메뉴 "${name}"을(를) 네비게이션에 추가했습니다. (메뉴를 선택해 링크를 연결하거나 이름을 바꿀 수 있어요)`);
  state.chatHistory.push({ role: "assistant", content: `메뉴 ${name} 추가` });
  saveProject();
  enableReviewBtn();
  return true;
}

function findSectionTemplate(message) {
  // 삽입/생성 의도가 있을 때만
  if (!/추가|넣어|넣어줘|만들|삽입|생성|붙여|줘|해줘|템플릿/i.test(message)) return null;
  for (const t of SECTION_TEMPLATES) { if (t.keys.test(message)) return t; }
  return null;
}

// 현재 HTML에서 실제 이미지 src 추출 (플레이스홀더 제외)
function _extractImgSrcs(html) {
  const out = [];
  const re = /<img\b[^>]*\bsrc="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html || ""))) {
    const s = m[1];
    if (s && s !== "#" && !/placeholder|^data:image\/svg/i.test(s)) out.push(s);
  }
  return out;
}

// 재디자인 후 사라진 이미지를 새 HTML의 빈 <img> 슬롯에 순서대로 복원
function _restoreImgsAfterRedesign(kept) {
  if (!kept || !kept.length) return;
  let html = state.generatedHtml;
  if (!html) return;
  const present = new Set(_extractImgSrcs(html));
  const queue = kept.filter((s) => !present.has(s)); // 이미 유지된 건 제외
  if (!queue.length) return; // 모델이 전부 유지함
  let i = 0;
  html = html.replace(/<img\b[^>]*>/gi, function (tag) {
    if (i >= queue.length) return tag;
    const sm = tag.match(/\bsrc="([^"]*)"/i);
    const src = sm ? sm[1] : "";
    if (!src || src === "#" || /placeholder|^data:image\/svg/i.test(src)) {
      const ns = queue[i++];
      return sm ? tag.replace(/\bsrc="[^"]*"/i, `src="${ns}"`) : tag.replace(/<img/i, `<img src="${ns}"`);
    }
    return tag;
  });
  state.generatedHtml = html;
  updatePreview(html, false);
  if (state.currentProjectId) {
    fetch(`/api/projects/${state.currentProjectId}/save_file`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: state.currentViewPath || "index.html", content: html }),
    }).catch(() => {});
  }
  addMessage("messages", "assistant", `🖼 기존 이미지 ${i}개를 유지했습니다.`);
}

// 선택 요소(메뉴/링크)를 새 서브 페이지로 생성 + 링크 연결 (AI 생성)
async function createSubPageFromElement(elInfo, message) {
  const linkText = (elInfo.text || "새 페이지").trim();
  let slug = linkText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  slug = (slug || "page") + "-" + Date.now().toString(36).slice(-3);
  state.pendingPageName = slug + ".html";
  state.pendingMainHtml = state.generatedHtml;
  state.pendingLinkTextValue = linkText;
  state.pendingLinkHrefValue = elInfo.linkHref || "#";
  await sendMessageAuto(message);
}

// 현재 페이지에 섹션 추가 + 선택 메뉴를 #앵커로 연결 (결정적)
function addMenuSection(elInfo) {
  const title = (elInfo.text || "섹션").trim();
  let base = title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
  const slug = (base || "sec") + "-" + Date.now().toString(36).slice(-3);
  let html = state.generatedHtml;
  // 메뉴 링크(텍스트 일치)를 #slug로 연결
  if (title) {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(<a\\b[^>]*?)(?:\\s+href="[^"]*")?([^>]*>)\\s*${esc}\\s*(</a>)`, "i");
    if (re.test(html)) html = html.replace(re, (m, pre, post, close) => `${pre} href="#${slug}"${post}${title}${close}`);
    state.generatedHtml = html;
  }
  const section = `<section id="${slug}" class="section" data-animate><div class="container"><div class="section-header"><span class="section-label">SECTION</span><h2 class="section-title">${title}</h2></div><p class="text-center text-secondary">${title} 섹션 내용을 입력하세요. (요소를 선택해 수정)</p></div></section>`;
  return _insertSection(section, `"${title}" 섹션`);
}

// 새 페이지 vs 섹션 추가 선택지 제시 (버튼)
function askPageOrSection(elInfo, message) {
  window._pendingPageReq = { elInfo, message };
  const div = addMessage("messages", "assistant", "");
  div.innerHTML = `🤔 "<b>${(elInfo.text || "이 항목").slice(0, 20)}</b>"(으)로 무엇을 만들까요?<br><br>` +
    `<button class="btn-choice" onclick="window._choosePage()">🆕 새 페이지 생성</button> ` +
    `<button class="btn-choice" onclick="window._chooseSection()">➕ 현재 페이지에 섹션 추가</button>` +
    `<br><span style="font-size:12px;color:var(--text-muted,#888)">※ "신규 페이지"라고 말하면 묻지 않고 바로 새 페이지를 만듭니다.</span>`;
  scrollToBottom("messages");
}
window._choosePage = async function () {
  const r = window._pendingPageReq; if (!r) return;
  window._pendingPageReq = null;
  await createSubPageFromElement(r.elInfo, r.message);
};
window._chooseSection = function () {
  const r = window._pendingPageReq; if (!r) return;
  window._pendingPageReq = null;
  addMenuSection(r.elInfo);
};

// 선택 요소 삭제 (단일/멀티) — Delete 키 또는 "삭제" 요청
async function deleteSelectedElement() {
  if (state.multiSelected && state.multiSelected.length) { await deleteMultiSelected(); return true; }
  if (state.selectedElement && state.selectedElement.wgen_id) {
    await execElementPatch({ op: "delete" }, state.selectedElement);
    state.selectedElement = null;
    if (typeof hideSelectedElementBar === "function") hideSelectedElementBar();
    return true;
  }
  return false;
}

// 멀티 선택 요소 일괄 삭제 (Shift+클릭으로 선택한 것들)
async function deleteMultiSelected() {
  const ids = (state.multiSelected || []).map(s => s.wgen_id).filter(Boolean);
  if (!ids.length) return false;
  const ok = await applyPatchToPreview({ op: "delete-multi", ids }, null);
  if (ok) {
    addMessage("messages", "assistant", `🗑 ${ids.length}개 요소를 삭제했습니다.`);
    state.chatHistory.push({ role: "assistant", content: `${ids.length}개 요소 삭제` });
    enableReviewBtn();
  } else {
    addMessage("messages", "assistant", "⚠️ 삭제하지 못했습니다. 다시 선택해 주세요.");
  }
  state.multiSelected = [];
  if (typeof hideSelectedElementBar === "function") hideSelectedElementBar();
  return true;
}

// 메시지에서 '지명된 다른 요소' 셀렉터 추출 — 선택 요소와 함께 변경할 대상
const _NAMED_TARGETS = [
  [/제목|타이틀|title/i, "h1,h2,h3,.hero-title,.section-title,.card-title"],
  [/부제목|서브\s*타이틀|subtitle/i, ".hero-subtitle,.section-subtitle"],
  [/버튼|button|btn/i, ".btn,button,a.btn"],
  [/이미지|사진|그림|image|img/i, "img"],
  [/카드|card/i, ".card"],
  [/메뉴|네비|nav/i, ".nav-link"],
  [/가격|요금|price/i, ".pricing-price,.pricing-card"],
  [/아이콘|icon/i, "i,.icon,svg"],
  [/문단|본문|단락|paragraph/i, "p"],
  [/링크|link/i, "a"],
];
function _alsoSelectors(message) {
  // "○○도", "○○랑", "○○과", "○○와", "○○ 같이/함께" 처럼 추가 대상을 지명할 때만
  if (!/(도|랑|이랑|과|와|같이|함께|모든|전부\s*의|모두)/.test(message)) return "";
  const sels = [];
  for (const [re, sel] of _NAMED_TARGETS) { if (re.test(message)) sels.push(sel); }
  return sels.join(",");
}

// AI 의도 분류 기반 라우팅 — 채팅 문장을 AI가 이해해 결정적으로 분기한다.
async function routeByIntent(message, displayMessage, elInfo) {
  // 멀티 선택 + 삭제 → 일괄 삭제
  if (state.multiSelected && state.multiSelected.length && /삭제|제거|지워|지우|없애|delete|remove/i.test(message)) {
    console.log("[intent] multi-delete", state.multiSelected.length);
    await deleteMultiSelected();
    return;
  }
  const _lastImg = state.uploadedImages.length ? state.uploadedImages[state.uploadedImages.length - 1] : null;
  const _imgUrl = _lastImg ? _lastImg.url : "";
  const _wantsWhole = /전체|전부|모두|싹\s*다|페이지\s*전체|사이트|whole|entire|(^|\s)all(\s|$)/i.test(message);
  const _redesign = /리팩토링|리팩터|재구성|갈아엎|새로\s*디자인|다시\s*디자인|디자인\s*(새로|다시|갈아|바꿔|변경|개선|리뉴얼)|처음부터|전체\s*디자인|새롭게|리뉴얼|refactor|redesign/i.test(message);

  // 페이지 만들기 의도 + 요소 선택 → 새 페이지 vs 섹션 추가 선택 (신규/html 명시면 바로 새 페이지)
  const _pageMake = /페이지\s*(를)?\s*(만들|생성|연결|추가)/i.test(message) || /페이지\s*(만들어|생성해|추가해)/i.test(message);
  const _explicitNew = /신규|새\s*(페이지|html|화면|장)|새로운\s*페이지|별도\s*페이지|new\s*page/i.test(message) || (/html/i.test(message) && /페이지/.test(message));
  if (_pageMake && elInfo && state.generatedHtml) {
    if (_explicitNew) { console.log("[intent] explicit new sub-page"); await createSubPageFromElement(elInfo, message); return; }
    console.log("[intent] ask: new page or section");
    askPageOrSection(elInfo, message);
    return;
  }

  // 메뉴(네비) 항목 추가 → 결정적 nav-link 삽입 (단, '페이지' 생성 요청은 위에서 처리)
  if (/메뉴|네비|nav/i.test(message) && /추가|넣어|삽입|만들/i.test(message) && !/페이지/i.test(message) && state.generatedHtml) {
    console.log("[intent] add nav menu");
    if (addNavMenu(_extractMenuName(message))) return;
  }

  // ── 요소 선택 시: '전체' 명시가 없으면 무조건 그 요소만 변경 (절대 전체 재생성/diff 안 함) ──
  if (elInfo && !_wantsWhole) {
    // 메시지가 다른 요소를 지명했으면("버튼도", "제목이랑") 그 요소들에도 같이 적용
    const _also = _alsoSelectors(message) || undefined;
    if (_also) console.log("[intent] also-targets:", _also);
    // -1) "추가/넣어/삽입" → 선택 위치(요소 인접)에 섹션 템플릿 또는 새 요소 삽입
    if (/추가|넣어|넣어줘|삽입|붙여/i.test(message)) {
      const pos = _insertPosition(message);
      const _tpl = findSectionTemplate(message); // 갤러리/슬라이드/상품/가격표/후기/FAQ...
      let insHtml;
      if (_tpl) {
        insHtml = _tpl.html;
      } else if (/이미지|사진|그림|image|img/i.test(message) && state.uploadedImages.length) {
        // 업로드한 이미지 전부 삽입 (여러 개면 그리드)
        const imgs = state.uploadedImages.map(im => `<img src="${im.url}" alt="이미지" style="max-width:100%;height:auto;display:block;border-radius:8px" />`).join("\n");
        insHtml = state.uploadedImages.length > 1
          ? `<div class="grid grid-${Math.min(state.uploadedImages.length, 3)}" style="gap:16px;margin:16px 0">${imgs}</div>`
          : imgs;
      } else {
        insHtml = buildElementToInsert(message, _imgUrl);
      }
      console.log("[intent] element insert", pos, _tpl ? _tpl.label : `(요소, ${state.uploadedImages.length}img)`);
      await execElementPatch({ op: "insert", position: pos, html: insHtml }, elInfo);
      if (state.uploadedImages.length) clearUploadedImages();
      return;
    }
    // -0.7) 마진/패딩 (여백) Npx → 결정적 스타일 (AI 미사용)
    if (/(마진|margin|패딩|padding|여백)/i.test(message)) {
      const prop = /(패딩|padding)/i.test(message) ? "padding" : "margin";
      const valM = message.match(/(\d+(?:\.\d+)?)\s*(px|rem|em|%)?/i);
      if (valM) {
        const val = valM[1] + (valM[2] || "px");
        let sides;
        if (/(상하|위아래|아래위|세로|수직)/i.test(message)) sides = ["top", "bottom"];
        else if (/(좌우|양옆|가로|수평)/i.test(message)) sides = ["left", "right"];
        else if (/(상단|위쪽|위\b|^위|top)/i.test(message)) sides = ["top"];
        else if (/(하단|아래쪽|아래|bottom)/i.test(message)) sides = ["bottom"];
        else if (/(왼쪽|좌측|left)/i.test(message)) sides = ["left"];
        else if (/(오른쪽|우측|right)/i.test(message)) sides = ["right"];
        else sides = ["top", "right", "bottom", "left"];
        const styles = {};
        sides.forEach(s => { styles[`${prop}-${s}`] = val; });
        console.log("[intent] spacing", prop, val, sides);
        await execElementPatch({ op: "style", styles, also: _also }, elInfo);
        return;
      }
    }
    // -0.5) 정렬 (페이지/가로 기준 요소 자체 정렬) → 결정적 스타일
    const _align = /(가운데|중앙|센터|center)/i.test(message) ? "center"
      : /(왼쪽|좌측|left)/i.test(message) ? "left"
        : /(오른쪽|우측|right)/i.test(message) ? "right" : null;
    if (_align && /(정렬|align|배치|맞춰|놓|중앙|가운데|센터|왼쪽|오른쪽)/i.test(message)) {
      const _bigTags = ["section", "div", "main", "article", "header", "footer", "nav", "aside", "ul", "ol", "form", "figure", "table"];
      const _isBig = _bigTags.includes((elInfo.tag || "").toLowerCase());
      if (_isBig) {
        // 큰 레이아웃 요소: 내부 콘텐츠 전체(자손 텍스트 요소)를 정렬
        console.log("[intent] section align (deep)", _align);
        await execElementPatch({ op: "align", value: _align, also: _also }, elInfo);
        return;
      }
      let styles;
      if (_align === "center") {
        styles = { "display": "block", "margin-left": "auto", "margin-right": "auto", "width": "fit-content", "max-width": "100%", "text-align": "center" };
      } else if (_align === "left") {
        styles = { "display": "block", "margin-left": "0", "margin-right": "auto", "width": "fit-content" };
      } else {
        styles = { "display": "block", "margin-left": "auto", "margin-right": "0", "width": "fit-content" };
      }
      console.log("[intent] element align", _align, "big=", _isBig);
      await execElementPatch({ op: "style", styles, also: _also }, elInfo);
      return;
    }
    // 0) 이미지로 변경/교체 → img 요소면 src 교체, 아니면 요소를 <img>로 치환 (결정적)
    if (/이미지|사진|그림|image|img/i.test(message) && /바꿔|바꿔줘|변경|교체|대체|로\s*해|만들/i.test(message)) {
      const isImgEl = (elInfo.tag === "img") || /<img/i.test(elInfo.html || "");
      if (isImgEl && _imgUrl) {
        console.log("[intent] image src fast-patch", _imgUrl);
        await execElementPatch({ op: "src", src: _imgUrl }, elInfo); clearUploadedImages(); return;
      }
      if (!isImgEl) {
        // 텍스트 등 다른 요소를 이미지로 교체
        const imgHtml = _imgUrl
          ? `<img src="${_imgUrl}" alt="이미지" style="max-width:100%;height:auto;display:block" />`
          : `<div style="${_IMG_PH};max-width:480px">이미지</div>`;
        console.log("[intent] replace element with image");
        await execElementPatch({ op: "html", html: imgHtml }, elInfo); clearUploadedImages(); return;
      }
    }
    // 1) 고신뢰 휴리스틱 (텍스트/색/삭제 등 — 이미지 변경/삽입은 위에서 처리됨)
    const lp = tryLocalPatch(message, elInfo);
    if (lp) { if (_also) lp.also = _also; console.log("[intent] local fast-patch", JSON.stringify(lp)); await execElementPatch(lp, elInfo); return; }
    // 2) AI 의도로 op/value만 얻고 scope는 element로 강제
    let intent;
    try {
      const r = await fetch("/api/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, has_element: true, has_html: true, element: elInfo, image_url: _imgUrl }),
      });
      intent = await r.json();
    } catch (e) { intent = { action: "edit", op: "none" }; }
    console.log("[intent:element]", JSON.stringify(intent));
    let patch = null;
    const _badVal = intent.value && (/wgen-/.test(intent.value) || (elInfo.classes && intent.value === elInfo.classes));
    if (intent.action === "delete") patch = { op: "delete" };
    else if (intent.op === "text" && intent.value && !_badVal) patch = { op: "text", text: intent.value };
    else if (intent.op === "style" && intent.styles && Object.keys(intent.styles).length) patch = { op: "style", styles: intent.styles };
    else if (intent.op === "href" && intent.value) patch = { op: "href", href: intent.value };
    else if (intent.op === "src") patch = { op: "src", src: intent.value || _imgUrl };
    if (patch) { await execElementPatch(patch, elInfo); if (_imgUrl) clearUploadedImages(); return; }
    // op=html/none 등 → 요소만 재작성(force_html). 실패해도 전체 재생성 안 함.
    await tryFastEdit(message, elInfo, _imgUrl); if (_imgUrl) clearUploadedImages(); return;
  }

  // ── 요소 미선택 ──
  // "배경 <색>" (페이지/전체) → 결정적 배경색 적용 (AI 미사용, 확실히 적용)
  if (/배경|background|바탕/i.test(message) && state.generatedHtml) {
    const _c = parseColor(message);
    if (_c) { console.log("[intent] deterministic background", _c); applyBackgroundColor(_c); return; }
  }
  // 업로드 이미지 + 이미지를 쓰려는 의도가 있을 때만 → 갤러리 섹션 결정적 삽입
  const _imgIntent = /이미지|사진|그림|갤러리|꾸며|넣어|넣어줘|추가|배치|사용|적용|업로드|첨부|image|photo|gallery/i.test(message);
  if (state.uploadedImages.length && state.generatedHtml && _imgIntent) {
    console.log("[intent] images(no element) → deterministic gallery insert", state.uploadedImages.length);
    insertImageGallery(state.uploadedImages.slice());
    clearUploadedImages();
    return;
  }
  // 기본 섹션 템플릿 (갤러리/슬라이드/상품소개/가격표/후기/FAQ/통계/팀/문의/CTA) → 결정적 삽입
  if (state.generatedHtml) {
    const _tpl = findSectionTemplate(message);
    if (_tpl) { console.log("[intent] section template →", _tpl.label); _insertSection(_tpl.html, _tpl.label); return; }
  }
  // 전체 재디자인/리팩토링 → 페이지 전체 편집 (기존 이미지 보존)
  if (_redesign || _wantsWhole) {
    console.log("[intent] redesign/whole → full edit");
    const _keptImgs = _extractImgSrcs(state.generatedHtml);
    let _m2 = message;
    if (_keptImgs.length) {
      _m2 += `\n\n[필수] 페이지의 기존 이미지는 절대 삭제하지 말고 같은 위치에 그대로 유지하세요. 유지할 이미지 URL: ${_keptImgs.join(", ")}`;
    }
    await sendMessageV2(_m2, displayMessage, null, "edit");
    _restoreImgsAfterRedesign(_keptImgs);
    return;
  }

  // AI 의도 분류
  let intent;
  try {
    const r = await fetch("/api/intent", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, has_element: false, has_html: !!state.generatedHtml, element: null, image_url: _imgUrl }),
    });
    intent = await r.json();
  } catch (e) { intent = { action: "edit", scope: "page", op: "none" }; }
  console.log("[intent]", JSON.stringify(intent));

  if (intent.action === "ask") { await sendMessageV2(message, displayMessage, null, "ask"); return; }
  if (intent.action === "generate" || intent.action === "new_page") { await sendMessageV2(message, displayMessage, null, "generate"); return; }
  if (intent.scope === "site") { await sendMessageV2(message, displayMessage, null, "edit"); return; }
  // 페이지 일부 편집/삭제 → diff 소스 편집, 실패 시 전체 편집 폴백
  const handled = await tryDiffEdit(message, _imgUrl);
  if (_imgUrl && handled) clearUploadedImages();
  if (!handled) await sendMessageV2(message, displayMessage, null);
}

// ── Diff 기반 소스 편집 (바이브코딩 방식: SEARCH/REPLACE 블록) ──
function applyDiffBlocks(html, blocks) {
  let out = html, applied = 0;
  for (const b of blocks) {
    if (b.search == null || b.search === "") continue;
    const idx = out.indexOf(b.search);
    if (idx === -1) return { ok: false, html, applied, failed: b.search.slice(0, 80) };
    out = out.slice(0, idx) + (b.replace || "") + out.slice(idx + b.search.length);
    applied++;
  }
  return { ok: applied > 0, html: out, applied };
}

async function tryDiffEdit(message, imageUrl) {
  const cur = state.generatedHtml;
  if (!cur) return false;
  showGenerating(true);
  if (el.generatingStatusText) el.generatingStatusText.textContent = "소스에서 변경 부분만 수정 중...";
  let blocks = [];
  try {
    const r = await fetch("/api/edit/diff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, html: cur, design_system: state.designSystem || null, image_url: imageUrl || "" }),
    });
    blocks = (await r.json()).blocks || [];
  } catch (e) { hideGenerating(); return false; }
  if (!blocks.length) { hideGenerating(); return false; }
  const res = applyDiffBlocks(cur, blocks);
  hideGenerating();
  if (!res.ok) return false; // SEARCH 미스 → 전체 재생성 폴백
  state.generatedHtml = res.html;
  updatePreview(res.html, false);
  const path = state.currentViewPath || "index.html";
  if (path !== "index.html") state.multiPageHtmls[path] = res.html;
  if (state.currentProjectId) {
    fetch(`/api/projects/${state.currentProjectId}/save_file`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: res.html }),
    }).then(() => loadFileTree(state.currentProjectId)).catch(() => {});
  }
  addMessage("messages", "assistant", `🛠 소스 수정 완료 (변경 ${res.applied}곳) — 변경 부분만 패치, 나머지 유지.`);
  state.chatHistory.push({ role: "assistant", content: `소스 ${res.applied}곳 수정` });
  saveProject();
  enableReviewBtn();
  return true;
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

  const rawMessage = message; // 요소 설명 프리픽스 없는 사용자 원본 (결정적 파싱용)
  message = displayMessage;
  addMessage("messages", "user", displayMessage);
  state.isGenerating = true;
  el.sendBtn.disabled = true;
  el.typingIndicator.classList.remove("hidden");
  scrollToBottom("messages");

  // user history (첫 생성은 여기서 보강; 요소/일반은 위에서 push됨)
  if (isFirstGeneration) state.chatHistory.push({ role: "user", content: displayMessage });

  const elInfo = state.selectedElement || null;
  try {
    if (isFirstGeneration) {
      // 최초 생성은 명확 — 바로 전체 생성
      await sendMessageV2(rawMessage, displayMessage, null, "generate");
    } else {
      // AI 의도 분류로 결정적 라우팅 — raw 메시지로 파싱(요소 설명 프리픽스 제외)
      await routeByIntent(rawMessage, displayMessage, elInfo);
    }
  } finally {
    state.selectedElement = null;
    state.pendingElementAction = false;
    if (typeof hideSelectedElementBar === "function") hideSelectedElementBar();
    state.isGenerating = false;
    el.sendBtn.disabled = false;
    el.typingIndicator.classList.add("hidden");
    scrollToBottom("messages");
  }
  return;
}

// ── Auto-send (element actions, new page) ──
async function sendMessageAuto(message) {
  state.reactRejected = false;
  if (!message || state.isGenerating) return;
  if (!state.modelReady) { showDownloadModal(); return; }
  pushHtmlSnapshot();
  state.isGenerating = true;
  el.sendBtn.disabled = true;
  el.typingIndicator.classList.remove("hidden");
  scrollToBottom("messages");
  showGenerating(false);
  const assistantDiv = addMessage("messages", "assistant", "⏳ 새 페이지 생성 중...");

  // 메인과 동일한 design_system으로 새 페이지 생성 (디자인 통일)
  const designSystem = Object.assign(
    { template: "", page_type: "", design_content: "", scaffold_css: "", brand: "WebGen AI", menu_items: [] },
    state.designSystem || {});
  designSystem.template = state.selectedTemplate || designSystem.template;
  designSystem.page_type = state.selectedType || designSystem.page_type;
  if (state.selectedDesignContent) designSystem.design_content = state.selectedDesignContent;
  if (state.projectTitle) designSystem.brand = state.projectTitle;

  try {
    const { html: newPageHtml } = await collectGeneratedHtmlV2({
      message, mode: "generate", design_system: designSystem,
      history: state.chatHistory.slice(-5), current_html: "", multi_page: false,
      page_type: state.selectedType, template: state.selectedTemplate,
    });
    state.chatHistory.push({ role: "assistant", content: "생성 완료" });

    if (state.pendingPageName && newPageHtml && state.pendingMainHtml) {
      const pagePath = `pages/${state.pendingPageName}`;
      await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pagePath, content: newPageHtml }),
      }).catch(() => {});
      state.multiPageHtmls[pagePath] = newPageHtml;
      const linkPath = pagePath;
      const escapedText = state.pendingLinkTextValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRegex = new RegExp(`(<a\\b[^>]*>\\s*)${escapedText}(\\s*</a>)`, "i");
      const replaced = state.pendingMainHtml.replace(linkRegex, (full, openTag, closeTag) =>
        openTag.replace(/href=["'][^"']*["']/i, `href="${linkPath}"`) + state.pendingLinkTextValue + closeTag);
      state.generatedHtml = replaced !== state.pendingMainHtml ? replaced
        : state.pendingMainHtml.replace(new RegExp(`href=["']${escapedText}["']`), `href="${linkPath}"`);
      updatePreview(state.generatedHtml, false);
      if (state.currentProjectId) {
        await fetch(`/api/projects/${state.currentProjectId}/save_file`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "index.html", content: state.generatedHtml }),
        }).catch(() => {});
      }
      assistantDiv.innerHTML = `✅ 페이지 "${state.pendingPageName}" 생성 완료!`;
      state.designSystem = designSystem;
      saveProject();
      enableReviewBtn();
      loadFileTree(state.currentProjectId);
    } else {
      assistantDiv.innerHTML = "⚠️ 새 페이지를 생성하지 못했습니다.";
    }
  } catch (e) {
    assistantDiv.innerHTML = `<span style="color: var(--error);">⚠️ 오류: ${e.message}</span>`;
  } finally {
    state.pendingPageName = "";
    state.pendingMainHtml = "";
    state.pendingLinkHrefValue = "";
    state.pendingLinkTextValue = "";
    state.pendingElementAction = false;
    state.isGenerating = false;
    el.sendBtn.disabled = false;
    el.typingIndicator.classList.add("hidden");
    hideGenerating();
  }
}

// ── Selected Element Bar ──
function showSelectedElementBar(d) {
  const bar = document.getElementById("selected-element-bar");
  const label = document.getElementById("selected-element-label");
  if (!bar || !label) return;
  const tag = `<${d.tag}${d.id ? ` id="${d.id}"` : ""}${d.classes ? ` class="${d.classes}"` : ""}>`;
  label.textContent = `\ud83c\udfaf ${tag} ${d.text ? `\u2014 "${d.text.slice(0, 30)}${d.text.length > 30 ? "..." : ""}"` : ""}`;
  const hint = document.getElementById("selected-element-hint");
  if (hint) hint.classList.remove("hidden");
  if (el.userInput) el.userInput.placeholder = "\uc218\uc815 \uc694\uccad \uc785\ub825 (\ub610\ub294 \u2328\ufe0f Delete \ud0a4\ub85c \uc0ad\uc81c)";
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
    // dev OFF(미리보기 모드): 선택 UI 띄우지 않음 — 외부 링크는 새 탭, 나머지는 무시
    if (!state.devMode) {
      if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener");
      return;
    }
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
    state.multiSelected = [];
    state.selectedElement = d;
    showSelectedElementBar(d);
    el.userInput.focus();
    let info;
    if (d.insertMode) {
      // \ub871\ud074\ub9ad \u2192 \uc774 \uc704\uce58\uc5d0 \uc0c8 \ub0b4\uc6a9 \ucd94\uac00
      el.userInput.placeholder = "\u2795 \uc774 \uc704\uce58\uc5d0 \ucd94\uac00\ud560 \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694 (\uc608: \ud14d\uc2a4\ud2b8 \ucd94\uac00, \uac24\ub7ec\ub9ac \ucd94\uac00)...";
      info = `\ud83d\udccd \uc774 \uc704\uce58(${d.tag})\ub97c \uc120\ud0dd\ud588\uc2b5\ub2c8\ub2e4.\n\n\uc5ec\uae30\uc5d0 **\ucd94\uac00**\ud560 \uc218 \uc788\uc5b4\uc694:\n- \u2795 **\ud14d\uc2a4\ud2b8 \ucd94\uac00**: "\uc544\ub798\uc5d0 \ud14d\uc2a4\ud2b8 \ucd94\uac00", "\uc704\uc5d0 \\"\ubb38\uad6c\\" \ucd94\uac00"\n- \ud83d\uddbc **\uc774\ubbf8\uc9c0 \ucd94\uac00**: \uc774\ubbf8\uc9c0 \ucca8\ubd80 \ud6c4 "\uc544\ub798\uc5d0 \uc774\ubbf8\uc9c0 \ucd94\uac00"\n- \ud83e\udde9 **\uc139\uc158 \ucd94\uac00**: "\uac24\ub7ec\ub9ac \ucd94\uac00", "\uc2ac\ub77c\uc774\ub4dc \ucd94\uac00", "\uc0c1\ud488\uc18c\uac1c \ucd94\uac00", "\uac00\uaca9\ud45c/\ud6c4\uae30/FAQ/\ud1b5\uacc4/\ud300/\ubb38\uc758/CTA \ucd94\uac00"\n- \ud83d\udd18 **\ubc84\ud2bc \ucd94\uac00**: "\uc544\ub798\uc5d0 \ubc84\ud2bc \ucd94\uac00"\n\n(\uae30\ubcf8\uc740 \uc120\ud0dd\ud55c \uc704\uce58 **\uc544\ub798**\uc5d0 \ucd94\uac00\ub429\ub2c8\ub2e4. "\uc704\uc5d0"\ub77c\uace0 \ud558\uba74 \uc704\uc5d0 \ucd94\uac00\ub429\ub2c8\ub2e4.)`;
    } else {
      el.userInput.placeholder = "\u270f\ufe0f \uc120\ud0dd\ud55c \uc694\uc18c\uc5d0 \ub300\ud574 \uc785\ub825\ud558\uc138\uc694...";
      info = `\ud83c\udfaf \uc694\uc18c\ub97c \uc120\ud0dd\ud588\uc2b5\ub2c8\ub2e4.${d.text ? ` (\ud604\uc7ac \ub0b4\uc6a9: "${d.text.slice(0, 30)}")` : ""}\n\n\ucc44\ud305\uc73c\ub85c \uc774\ub807\uac8c \uc694\uccad\ud560 \uc218 \uc788\uc5b4\uc694:\n- \u270f\ufe0f **\ud14d\uc2a4\ud2b8 \ubcc0\uacbd**: "\u25cb\u25cb\ub85c \uc218\uc815"\n- \ud83c\udfa8 **\uc0c9/\uc2a4\ud0c0\uc77c**: "\uae00\uc790 \ube68\uac1b\uac8c", "\ubc30\uacbd #f5f5f5", "\ub465\uae00\uac8c", "\uadf8\ub9bc\uc790 \ub123\uc5b4\uc918"\n- \ud83d\udcd0 **\uc815\ub82c**: "\ud398\uc774\uc9c0 \uac00\uc6b4\ub370 \uc815\ub82c", "\uc67c\ucabd/\uc624\ub978\ucabd \uc815\ub82c"\n- \u2795 **\uc694\uc18c/\uc139\uc158 \ucd94\uac00**: "\uc544\ub798\uc5d0 \uc774\ubbf8\uc9c0 \ucd94\uac00", "\uac24\ub7ec\ub9ac \ucd94\uac00", "\uc704\uc5d0 \ud14d\uc2a4\ud2b8 \ucd94\uac00"\n- \ud83d\uddbc **\uc774\ubbf8\uc9c0 \ubcc0\uacbd**: \uc774\ubbf8\uc9c0 \ucca8\ubd80 \ud6c4 "\uc774 \uc774\ubbf8\uc9c0\ub85c \ubc14\uafd4"\n- \ud83d\udd17 **\ub9c1\ud06c** / \ud83e\udde9 **\ub514\uc790\uc778 \ubcc0\uacbd**("\ub354 \ubaa8\ub358\ud558\uac8c") / \ud83d\uddd1 **\uc0ad\uc81c**("\uc774\uac70 \uc0ad\uc81c")\n\n\ud83d\udca1 \ud654\uba74\uc744 **\uae38\uac8c \ub204\ub974\uba74(\ub871\ud074\ub9ad)** \uadf8 \uc704\uce58\uc5d0 \ucd94\uac00 \ubaa8\ub4dc\ub85c \uc120\ud0dd\ub429\ub2c8\ub2e4.\n(\uc774 \uc694\uc18c\ub9cc \ubc14\ub00c\uace0 \ub098\uba38\uc9c0\ub294 \uc720\uc9c0. \uc804\uccb4\ub97c \ubc14\uafb8\ub824\uba74 "\uc804\uccb4"\ub77c\uace0 \uc801\uc5b4\uc8fc\uc138\uc694.)`;
    }
    if (d.tag === "a") {
      info += `\n\n🔗 **링크 전용 작업**: "html 페이지 추가" / "페이지 만들어줘" → 이 링크에 연결되는 **새 페이지**를 생성합니다. "https://주소 링크"로 외부 연결도 가능.`;
    }
    const _bigSel = ["section", "div", "main", "article", "header", "footer", "aside", "ul", "ol"].includes((d.tag || "").toLowerCase());
    if (_bigSel && !d.insertMode) {
      info += `\n\n🧱 **섹션/컨테이너 작업**: "내부 요소 가운데 정렬"(왼쪽/오른쪽도 가능) → 섹션 안 내용을 한 번에 정렬, "배경 #f5f5f5", "상하 여백 40px", "갤러리/슬라이드 추가".`;
    }
    info += `\n\n⌨️ **Delete 키**로도 선택한 요소를 바로 삭제할 수 있어요.`;
    addMessage("messages", "assistant", info);
    scrollToBottom("messages");
  }

  if (d.type === "elements-multi-selected") {
    state.multiSelected = d.items || [];
    state.selectedElement = null;
    const n = state.multiSelected.length;
    if (n === 0) { hideSelectedElementBar(); el.userInput.placeholder = "회사 소개, 서비스, 강조 포인트를 입력하세요..."; }
    else {
      const bar = document.getElementById("selected-element-bar");
      const label = document.getElementById("selected-element-label");
      if (bar && label) { label.textContent = `🗂 ${n}개 요소 선택됨`; bar.classList.remove("hidden"); }
      el.userInput.placeholder = `${n}개 선택됨 — "삭제"라고 입력하면 모두 삭제됩니다`;
    }
  }

  if (d.type === "delete-key") { deleteSelectedElement(); }

  if (d.type === "element-deselected") { if (!state.pendingElementAction) { hideSelectedElementBar(); } }
});

// 부모 화면에 포커스가 있을 때도 Delete로 선택 요소 삭제
document.addEventListener("keydown", function (e) {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.key === "Delete" && (state.selectedElement || (state.multiSelected && state.multiSelected.length))) {
    e.preventDefault();
    deleteSelectedElement();
  }
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
  link.download = `${state.currentProjectId}_deploy.zip`;
  link.click();
  addMessage("messages", "assistant", "\ud83d\udce6 \ubc30\ud3ec\uc6a9 ZIP\uc744 \ub0b4\ub824\ubc1b\uc558\uc2b5\ub2c8\ub2e4. \ud3b8\uc9d1\uae30 \ud754\uc801 \uc81c\uac70 \u00b7 \ub0b4\ubd80 \ub9c1\ud06c \uc815\ub9ac \u00b7 \uc2a4\ud06c\ub864 \uc560\ub2c8\uba54\uc774\uc158 \ud3ec\ud568\ub41c \uc815\uc801 HTML\uc785\ub2c8\ub2e4. \uc555\ucd95 \ud574\uc81c \ud6c4 \uadf8\ub300\ub85c \ud638\uc2a4\ud305\ud558\uc138\uc694.");
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
  if (!state.generatedHtml) { addMessage("messages", "assistant", "⚠️ 먼저 페이지를 생성해 주세요."); return; }
  const btn = $("btn-fix-all");
  if (btn) btn.disabled = true;
  addMessage("messages", "user", "🛠 통합 수정 요청 (여백·정렬·타이포·반응형·접근성)");
  const msg = "전체 페이지의 여백/패딩, 겹침, 정렬, 타이포그래피 일관성, 반응형, 접근성 문제를 수정해줘. 기존 디자인 스타일과 구조·콘텐츠는 그대로 유지하고 문제점만 고쳐줘.";
  try {
    state.isGenerating = true;
    await sendMessageV2(msg, msg, null, "edit");
  } catch (e) {
    addMessage("messages", "assistant", "⚠️ 오류: " + e.message);
  } finally {
    state.isGenerating = false;
    if (btn) btn.disabled = false;
    if (typeof closeReview === "function") closeReview();
  }
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

// ── AI 백엔드 설정 ──
function onBackendChange() {
  const b = document.getElementById("set-backend").value;
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? "" : "none"; };
  show("set-group-ollama", b === "ollama");
  show("set-group-gemini", b === "gemini");
  show("set-group-openai", b === "openai");
  show("set-group-local", b === "local");
}

// OpenAI 호환 모델 선택 시 제공처에 맞는 Base URL 자동 설정
const _OPENAI_PROVIDER_BASES = ["https://api.deepseek.com/v1", "https://api.openai.com/v1", "https://api.groq.com/openai/v1", ""];
function onOpenAIModelChange() {
  const model = (document.getElementById("set-openai-model") || {}).value || "";
  const baseEl = document.getElementById("set-openai-base");
  if (!baseEl) return;
  let base = "";
  if (/deepseek/i.test(model)) base = "https://api.deepseek.com/v1";
  else if (/llama|groq|mixtral|gemma/i.test(model)) base = "https://api.groq.com/openai/v1";
  else if (/^(gpt|o1|o3|chatgpt)/i.test(model)) base = "https://api.openai.com/v1";
  // 사용자가 직접 입력한 커스텀 base는 보존 (알려진 제공처 기본값일 때만 교체)
  if (base && _OPENAI_PROVIDER_BASES.includes(baseEl.value.trim())) baseEl.value = base;
  else if (base && !baseEl.value.trim()) baseEl.value = base;
}

async function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const res = document.getElementById("settings-test-result");
  if (res) res.classList.add("hidden");
  try {
    const r = await fetch("/api/settings");
    const s = await r.json();
    document.getElementById("set-backend").value = s.llm_backend || "local";
    document.getElementById("set-ollama-host").value = s.ollama_host || "";
    document.getElementById("set-ollama-model").value = s.ollama_model || "";
    // gemini 모델 select: 저장값이 옵션에 없으면 추가
    const gm = document.getElementById("set-gemini-model");
    if (gm && s.gemini_model) {
      if (![...gm.options].some(o => o.value === s.gemini_model)) {
        const opt = document.createElement("option");
        opt.value = s.gemini_model; opt.textContent = s.gemini_model + " (현재)";
        gm.insertBefore(opt, gm.firstChild);
      }
      gm.value = s.gemini_model;
    }
    document.getElementById("set-model-path").value = s.model_path || "";
    const keyField = document.getElementById("set-gemini-key");
    keyField.value = "";
    keyField.placeholder = s.gemini_api_key_set ? "(설정됨 — 변경 시에만 입력)" : "API 키 입력";
    // openai
    const ob = document.getElementById("set-openai-base"); if (ob) ob.value = s.openai_base_url || "";
    const om = document.getElementById("set-openai-model");
    if (om && s.openai_model) {
      if (![...om.options].some(o => o.value === s.openai_model)) {
        const opt = document.createElement("option");
        opt.value = s.openai_model; opt.textContent = s.openai_model + " (현재)";
        om.insertBefore(opt, om.firstChild);
      }
      om.value = s.openai_model;
    }
    const ok = document.getElementById("set-openai-key");
    if (ok) { ok.value = ""; ok.placeholder = s.openai_api_key_set ? "(설정됨 — 변경 시에만 입력)" : "API 키 입력"; }
  } catch (e) { /* ignore */ }
  onBackendChange();
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  if (modal) modal.classList.add("hidden");
}

// 다운로드 모달에서 "외부 백엔드 연동" → 설정 모달로 전환
function openSettingsFromDownload() {
  if (typeof hideDownloadModal === "function") hideDownloadModal();
  openSettingsModal();
}

function _collectSettings() {
  return {
    llm_backend: document.getElementById("set-backend").value,
    ollama_host: document.getElementById("set-ollama-host").value.trim(),
    ollama_model: document.getElementById("set-ollama-model").value.trim(),
    gemini_api_key: document.getElementById("set-gemini-key").value.trim(),
    gemini_model: document.getElementById("set-gemini-model").value.trim(),
    model_path: document.getElementById("set-model-path").value.trim(),
    openai_base_url: (document.getElementById("set-openai-base") || {}).value ? document.getElementById("set-openai-base").value.trim() : "",
    openai_model: (document.getElementById("set-openai-model") || {}).value ? document.getElementById("set-openai-model").value.trim() : "",
    openai_api_key: (document.getElementById("set-openai-key") || {}).value ? document.getElementById("set-openai-key").value.trim() : "",
  };
}

function _showSettingsResult(ok, msg) {
  const res = document.getElementById("settings-test-result");
  if (!res) return;
  res.classList.remove("hidden");
  res.style.color = ok ? "var(--success, #2ecc71)" : "var(--error, #e74c3c)";
  res.textContent = (ok ? "✅ " : "⚠️ ") + msg;
}

async function testSettings() {
  _showSettingsResult(true, "테스트 중...");
  try {
    const r = await fetch("/api/settings/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(_collectSettings()),
    });
    const d = await r.json();
    _showSettingsResult(!!d.ok, d.message || (d.ok ? "성공" : "실패"));
  } catch (e) { _showSettingsResult(false, "요청 실패: " + e.message); }
}

async function saveSettings() {
  try {
    const r = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(_collectSettings()),
    });
    const d = await r.json();
    if (d.status === "ok") {
      _showSettingsResult(true, "저장 완료 — 백엔드가 즉시 적용되었습니다.");
      // 외부 백엔드 적용 시 모델 준비 상태 갱신 → 다운로드 모달 해제
      if (typeof checkConnection === "function") checkConnection();
      setTimeout(closeSettingsModal, 900);
    } else {
      _showSettingsResult(false, "저장 실패");
    }
  } catch (e) { _showSettingsResult(false, "저장 실패: " + e.message); }
}

// ── 백엔드 연동 상세 가이드 모달 ──
const _BACKEND_GUIDES = {
  ollama: {
    title: "🦙 Ollama 연동 가이드",
    link: "https://ollama.com/download",
    body: `<p><b>Ollama</b>는 로컬/원격 PC에서 오픈소스 LLM을 HTTP로 제공합니다. GGUF 빌드 없이 가장 쉽게 쓸 수 있어요.</p>
      <ol class="setting-guide-steps">
        <li><b>설치</b>: <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> 에서 OS에 맞게 설치 후 실행(백그라운드 상주).</li>
        <li><b>모델 받기</b>(터미널): <code>ollama pull qwen2.5-coder:7b</code><br>다른 추천: <code>ollama pull llama3.1:8b</code>, <code>ollama pull gemma2:9b</code></li>
        <li><b>주소</b>: 같은 PC면 <code>http://localhost:11434</code> 그대로. 다른 PC면 그 IP로(예: <code>http://192.168.0.10:11434</code>) + 그쪽에서 <code>OLLAMA_HOST=0.0.0.0</code> 설정.</li>
        <li>설정에서 백엔드 <b>Ollama</b> 선택 → 주소·모델명 입력 → <b>🔌 연결 테스트</b>(설치된 모델 수 표시) → <b>💾 저장 및 적용</b>.</li>
        <li>저장 즉시 적용됩니다(재시작 불필요).</li>
      </ol>
      <p style="color:var(--text-muted,#888);font-size:12px">⚠️ "연결 실패"면 Ollama가 실행 중인지, 주소/포트가 맞는지, 모델을 pull 했는지 확인하세요.</p>`,
  },
  gemini: {
    title: "✨ Google Gemini 연동 가이드",
    link: "https://aistudio.google.com/apikey",
    body: `<p><b>Gemini</b>는 Google의 클라우드 LLM입니다. 설치 없이 API 키만으로 빠르고 품질 높게 생성할 수 있어요.</p>
      <ol class="setting-guide-steps">
        <li><b>API 키 발급</b>: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> 접속 → 구글 로그인 → <b>Create API key</b> → 키 복사. (무료 등급 제공)</li>
        <li>패키지 필요: <code>pip install google-genai</code> (앱 환경에 설치).</li>
        <li>설정에서 백엔드 <b>Gemini</b> 선택 → <b>API 키</b> 붙여넣기.</li>
        <li><b>모델</b>: <code>gemini-2.5-flash</code>(빠르고 저렴) 또는 <code>gemini-2.5-pro</code>(고품질).</li>
        <li><b>🔌 연결 테스트</b> → <b>💾 저장 및 적용</b>. 키는 서버 settings.json에 저장(빈칸 저장 시 기존 키 유지).</li>
      </ol>
      <p style="color:var(--text-muted,#888);font-size:12px">⚠️ API 키는 외부에 노출하지 마세요. 사용량에 따라 과금될 수 있습니다.</p>`,
  },
  openai: {
    title: "🔌 OpenAI 호환 연동 가이드",
    link: "https://platform.openai.com/api-keys",
    body: `<p><b>OpenAI 호환 API</b>는 <code>/chat/completions</code> 규격을 따르는 모든 제공처에 연결됩니다. Base URL만 바꾸면 됩니다.</p>
      <ol class="setting-guide-steps">
        <li><b>OpenAI</b>: 키 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>, Base URL <code>https://api.openai.com/v1</code>, 모델 <code>gpt-4o-mini</code>/<code>gpt-4o</code></li>
        <li><b>DeepSeek</b>: Base URL <code>https://api.deepseek.com/v1</code>, 모델 <code>deepseek-chat</code></li>
        <li><b>Groq</b>: <code>https://api.groq.com/openai/v1</code>, 모델 <code>llama-3.3-70b-versatile</code> 등</li>
        <li><b>OpenRouter</b>: <code>https://openrouter.ai/api/v1</code> (여러 모델 통합)</li>
        <li><b>로컬 vLLM/LM Studio</b>: <code>http://localhost:8000/v1</code> 등</li>
        <li>API 키·Base URL·모델 입력 → <b>🔌 연결 테스트</b> → <b>💾 저장 및 적용</b>.</li>
      </ol>
      <p style="color:var(--text-muted,#888);font-size:12px">⚠️ Base URL은 보통 <code>/v1</code>까지 포함합니다. 제공처 문서를 확인하세요.</p>`,
  },
  local: {
    title: "💻 로컬 모델 (llama-cpp) 가이드",
    link: "https://huggingface.co/models?library=gguf",
    body: `<p><b>로컬 모델</b>은 인터넷 없이 내 PC에서 GGUF 모델을 직접 구동합니다. (llama-cpp-python 필요)</p>
      <ol class="setting-guide-steps">
        <li><b>GGUF 모델 준비</b>: <a href="https://huggingface.co/models?library=gguf" target="_blank" rel="noopener">HuggingFace</a>에서 <code>.gguf</code> 파일 다운로드(Q4_K_M 권장).</li>
        <li><code>models/</code> 폴더에 넣으면 <b>자동 감지</b>, 또는 설정의 <b>모델 경로</b>에 직접 지정.</li>
        <li>GPU 가속은 설치 시 빌드 필요: NVIDIA <code>CMAKE_ARGS="-DGGML_CUDA=on"</code>, AMD <code>-DGGML_VULKAN=on</code>.</li>
        <li>Windows에서 빌드 실패가 잦으면 <b>Ollama나 Gemini를 권장</b>합니다.</li>
        <li><b>🔌 연결 테스트</b>로 모델 파일 인식 확인 → <b>💾 저장 및 적용</b>.</li>
      </ol>
      <p style="color:var(--text-muted,#888);font-size:12px">💡 첫 실행 시 모델이 없으면 다운로드 모달에서 기본 모델을 받을 수 있습니다.</p>`,
  },
};
function showBackendGuide(which) {
  const g = _BACKEND_GUIDES[which]; if (!g) return;
  const modal = document.getElementById("backend-guide-modal"); if (!modal) return;
  document.getElementById("guide-title").textContent = g.title;
  document.getElementById("guide-body").innerHTML = g.body;
  const lk = document.getElementById("guide-link"); if (lk) lk.href = g.link;
  modal.classList.remove("hidden");
}
function closeBackendGuide() {
  const modal = document.getElementById("backend-guide-modal");
  if (modal) modal.classList.add("hidden");
}
