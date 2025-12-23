const API_AUDIO_URL = "/api/audio/";
const API_VIDEO_URL = "/api/video/";
const API_IMAGE_URL = "/api/image/";
const API_RECORDS_URL = "/api/records/";
const API_CREATE_RECORD_URL = "/api/records/create/";
const API_DELETE_RECORD_URL = (id) => `/api/records/${id}/delete/`;
const API_DOWNLOAD_RECORD_URL = (id) => `/api/records/${id}/download/`;
const API_DOWNLOAD_BATCH_URL = "/api/records/download/";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getErrorMessage(resp) {
  try {
    const data = await resp.clone().json();
    if (data.error && data.detail) return `${data.error}：${data.detail}`;
    if (data.error) return data.error;
    if (data.detail) return data.detail;
  } catch (e) {
    /* fall back to text */
  }
  try {
    return await resp.text();
  } catch (e) {
    return "未知错误";
  }
}

function getCSRFToken() {
  const name = "csrftoken=";
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith(name)) return c.substring(name.length);
  }
  return "";
}

function hydrateRecordFromServer(rec) {
  if (!rec) return null;
  const createdAt = rec.created_at || new Date().toISOString();
  return {
    id: rec.id ?? Date.now(),
    type: rec.media_type || rec.type,
    path: rec.url || rec.path || "",
    model: rec.model || "",
    prompt: rec.prompt || "",
    style: rec.style || "",
    voice: rec.voice || "",
    createdAt,
    time: new Date(createdAt).toLocaleTimeString("zh-CN", { hour12: false }),
  };
}

let currentMode = "image"; // image | audio | video
let generating = false;
let mediaStore = [];
let currentFilter = "all";
let libraryPage = 1;
let libraryPageSize = 10;
let libraryTotal = 0;
let selectedIds = new Set();

function addRecord(record) {
  if (!record) return;
  mediaStore.unshift(record);
  renderLibrary();
}

async function loadRecords(page = 1) {
  libraryPage = page;
  const params = new URLSearchParams({
    page: libraryPage,
    page_size: libraryPageSize,
  });
  if (currentFilter !== "all") params.append("media_type", currentFilter);
  try {
    const resp = await fetch(`${API_RECORDS_URL}?${params.toString()}`, {
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    mediaStore = (data.records || [])
      .map(hydrateRecordFromServer)
      .filter(Boolean);
    libraryTotal = data.total || mediaStore.length;
    renderLibrary();
  } catch (err) {
    console.warn("加载历史记录失败", err);
  }
}
// 切换图像/音频/视频栏目
function switchMode(mode, elem) {
  if (generating) return;
  currentMode = mode;

  document
    .querySelectorAll(".nav-item")
    .forEach((item) => item.classList.remove("active"));
  elem.classList.add("active");

  document.getElementById("generationMain").classList.remove("hidden");
  document.getElementById("libraryMain").classList.add("hidden");

  const styleLabel = document.getElementById("styleLabel");
  const styleOptions = document.getElementById("styleOptions");
  const voiceOptions = document.getElementById("voiceOptions");
  const modelSelect = document.getElementById("modelSelect");
  const placeholder = document.getElementById("previewPlaceholder");
  const loadingBox = document.getElementById("loadingBox");
  const imageResult = document.getElementById("imageResult");
  const audioPreview = document.getElementById("audioPreview");
  const videoPreview = document.getElementById("videoPreview");
  const modeTag = document.getElementById("previewModeTag");

  placeholder.style.display = "block";
  loadingBox.style.display = "none";
  imageResult.style.display = "none";
  audioPreview.style.display = "none";
  videoPreview.style.display = "none";

  if (mode === "image") {
    placeholder.querySelector(".preview-placeholder-title").textContent =
      "图片生成预览区域";
    styleLabel.textContent = "主题风格：";
    styleOptions.classList.remove("hidden");
    voiceOptions.classList.add("hidden");
    modeTag.textContent = "模式：图像";
    modeTag.style.borderColor = "rgba(96,165,250,0.8)";
    modeTag.style.color = "#bfdbfe";

    modelSelect.innerHTML = `
        <option value="广科院">广科院</option>
        <option value="海螺">海螺</option>
        <option value="即梦">即梦</option>
        <option value="可灵">可灵</option>
      `;
  } else if (mode === "audio") {
    placeholder.querySelector(".preview-placeholder-title").textContent =
      "音频生成区域（生成后将自动播放结果）";
    styleLabel.textContent = "人声选择：";
    styleOptions.classList.add("hidden");
    voiceOptions.classList.remove("hidden");
    modeTag.textContent = "模式：音频";
    modeTag.style.borderColor = "rgba(52,211,153,0.8)";
    modeTag.style.color = "#bbf7d0";

    modelSelect.innerHTML = `
        <option value="广科院">广科院</option>
        <option value="cosyvoice">cosyvoice</option>
      `;
  } else if (mode === "video") {
    placeholder.querySelector(".preview-placeholder-title").textContent =
      "视频生成预览区域（生成后将自动播放结果）";
    styleLabel.textContent = "主题风格：";
    styleOptions.classList.remove("hidden");
    voiceOptions.classList.add("hidden");
    modeTag.textContent = "模式：视频";
    modeTag.style.borderColor = "rgba(249,115,22,0.8)";
    modeTag.style.color = "#fed7aa";

    modelSelect.innerHTML = `
        <option value="广科院">广科院</option>
        <option value="海螺">海螺</option>
        <option value="即梦">即梦</option>
        <option value="可灵">可灵</option>
      `;
  }
}

// 切换到生成内容库页
function switchToLibrary(elem) {
  if (generating) return;
  document
    .querySelectorAll(".nav-item")
    .forEach((item) => item.classList.remove("active"));
  elem.classList.add("active");

  document.getElementById("generationMain").classList.add("hidden");
  document.getElementById("libraryMain").classList.remove("hidden");
}

// 点击生成
async function handleGenerate() {
  if (generating) return;
  generating = true;

  const prompt = document.getElementById("promptInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  const voice =
    document.querySelector("input[name='voice']:checked")?.value || "";
  const style =
    document.querySelector("input[name='style']:checked")?.value || "";

  if (!prompt) {
    alert("请输入用于生成的关键词或描述");
    generating = false;
    return;
  }

  const placeholder = document.getElementById("previewPlaceholder");
  const loadingBox = document.getElementById("loadingBox");
  const loadingText = document.getElementById("loadingText");
  const imageResult = document.getElementById("imageResult");
  const audioPreview = document.getElementById("audioPreview");
  const videoPreview = document.getElementById("videoPreview");
  const audioPlayer = document.getElementById("audioPlayer");
  const videoPlayer = document.getElementById("videoPlayer");
  const generateBtn = document.getElementById("generateBtn");

  placeholder.style.display = "none";
  imageResult.style.display = "none";
  audioPreview.style.display = "none";
  videoPreview.style.display = "none";
  loadingBox.style.display = "block";

  const modeName =
    currentMode === "audio"
      ? "音频"
      : currentMode === "video"
      ? "视频"
      : "图片";
  loadingText.textContent = `正在生成${modeName}，请稍候…（模型：${model}）`;
  generateBtn.disabled = true;
  generateBtn.textContent = "生成中…";

  if (currentMode === "audio") {
    try {
      const resp = await fetch(API_AUDIO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify({ prompt, model, voice }),
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const msg = await getErrorMessage(resp);
        throw new Error(msg || "生成失败");
      }

      const data = await resp.json();
      const record = hydrateRecordFromServer(data.record);

      loadingBox.style.display = "none";
      audioPlayer.src = record.path;
      audioPreview.style.display = "block";
      audioPlayer.play();
      addRecord(record);
    } catch (err) {
      loadingText.textContent = "生成失败";
      alert(`生成失败：${err.message}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "生成";
      generating = false;
    }
    return;
  }

  if (currentMode === "image") {
    try {
      const resp = await fetch(API_IMAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify({ prompt, model, style }),
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const msg = await getErrorMessage(resp);
        throw new Error(msg || "生成失败");
      }

      const data = await resp.json();
      const record = hydrateRecordFromServer(data.record);

      loadingBox.style.display = "none";
      imageResult.src = record.path;
      imageResult.style.display = "block";
      addRecord(record);
    } catch (err) {
      loadingText.textContent = "生成失败";
      alert(`生成失败：${err.message}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "生成";
      generating = false;
    }
    return;
  }

  if (currentMode === "video") {
    try {
      const resp = await fetch(API_VIDEO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRFToken(),
        },
        body: JSON.stringify({ prompt, model }),
        credentials: "same-origin",
      });

      if (!resp.ok) {
        const msg = await getErrorMessage(resp);
        throw new Error(msg || "生成失败");
      }

      const data = await resp.json();
      const record = hydrateRecordFromServer(data.record);

      loadingBox.style.display = "none";
      videoPlayer.src = record.path;
      videoPreview.style.display = "block";
      videoPlayer.play();
      addRecord(record);
    } catch (err) {
      loadingText.textContent = "生成失败";
      alert(`生成失败：${err.message}`);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "生成";
      generating = false;
    }
    return;
  }

  let waitMs = 5000;
  await delay(waitMs);
  loadingBox.style.display = "none";

  let filePath = "";
  if (currentMode === "image") {
    filePath = "./1.jpeg";
    imageResult.src = filePath;
    imageResult.style.display = "block";
  } else if (currentMode === "video") {
    filePath = "./2.mp4";
    videoPlayer.src = filePath;
    videoPreview.style.display = "block";
    videoPlayer.play();
  }

  const payload = {
    media_type: currentMode,
    model,
    prompt,
    style,
    voice,
    url: filePath,
  };
  const saved = await createRecordOnServer(payload);
  addRecord(
    saved ||
      hydrateRecordFromServer({
        ...payload,
        created_at: new Date().toISOString(),
      })
  );

  generateBtn.disabled = false;
  generateBtn.textContent = "生成";
  generating = false;
}

async function createRecordOnServer(payload) {
  try {
    const resp = await fetch(API_CREATE_RECORD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    return hydrateRecordFromServer(data.record);
  } catch (err) {
    console.warn("记录保存失败", err);
    return null;
  }
}

function setLibraryFilter(filter, elem) {
  currentFilter = filter;
  document
    .querySelectorAll(".filter-pill")
    .forEach((btn) => btn.classList.remove("active"));
  elem.classList.add("active");
  loadRecords(1);
}

function renderLibrary() {
  const listEl = document.getElementById("libraryList");
  const statsEl = document.getElementById("libraryStats");
  listEl.innerHTML = "";
  selectedIds = new Set();

  const filtered = mediaStore.filter((item) => {
    if (currentFilter === "all") return true;
    return item.type === currentFilter;
  });

  if (statsEl) {
    statsEl.textContent =
      mediaStore.length === 0
        ? "暂无记录"
        : `共 ${libraryTotal || mediaStore.length} 条生成记录，当前显示 ${
            filtered.length
          } 条`;
  }

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = "当前筛选条件下暂无生成记录。";
    listEl.appendChild(empty);
    return;
  }

  const selectionBar = document.createElement("div");
  selectionBar.className = "library-selection";
  selectionBar.innerHTML = `
    <span>已选 ${selectedIds.size} 项</span>
    <div class="library-actions">
      <button id="btnDownloadSelected" class="filter-pill">打包下载</button>
      <button id="btnDeleteSelected" class="filter-pill">删除</button>
    </div>
  `;
  selectionBar
    .querySelector("#btnDownloadSelected")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      downloadSelectedZip();
    });
  selectionBar
    .querySelector("#btnDeleteSelected")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelected();
    });
  listEl.appendChild(selectionBar);

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "library-item";
    row.onclick = (e) => {
      if (
        e.target.closest(".library-action-btn") ||
        e.target.type === "checkbox"
      )
        return;
      previewFromRecord(item);
    };

    const infoMain = document.createElement("div");
    infoMain.className = "library-info-main";

    const topRow = document.createElement("div");
    topRow.className = "library-row-top";

    const typeTag = document.createElement("span");
    typeTag.className = "library-type-tag";
    if (item.type === "image") {
      typeTag.classList.add("tag-image");
      typeTag.textContent = "图像";
    } else if (item.type === "audio") {
      typeTag.classList.add("tag-audio");
      typeTag.textContent = "音频";
    } else if (item.type === "video") {
      typeTag.classList.add("tag-video");
      typeTag.textContent = "视频";
    }

    const promptSpan = document.createElement("span");
    promptSpan.className = "library-prompt";
    promptSpan.textContent = item.prompt ? item.prompt : "（未填写关键词）";

    topRow.appendChild(typeTag);
    topRow.appendChild(promptSpan);

    const metaRow = document.createElement("div");
    metaRow.className = "library-meta";
    let detail = `模型：${item.model || "-"} · 文件：${item.path}`;
    if (item.type === "image" || item.type === "video") {
      detail = `模型：${item.model || "-"} · 风格：${
        item.style || "-"
      } · 文件：${item.path}`;
    } else if (item.type === "audio") {
      detail = `模型：${item.model || "-"} · 人声：${
        item.voice || "-"
      } · 文件：${item.path}`;
    }
    metaRow.textContent = detail;

    infoMain.appendChild(topRow);
    infoMain.appendChild(metaRow);

    const timeSpan = document.createElement("div");
    timeSpan.className = "library-time";
    timeSpan.textContent = item.time;

    const controls = document.createElement("div");
    controls.className = "library-controls";
    controls.innerHTML = `
      <input type="checkbox" class="library-check" data-id="${item.id}" />
      <button class="library-action-btn" data-action="download">下载</button>
      <button class="library-action-btn" data-action="delete">删除</button>
    `;
    controls.querySelector(".library-check").onchange = (e) =>
      toggleSelect(item.id, e.target.checked);
    controls.querySelector('[data-action="download"]').onclick = (e) => {
      e.stopPropagation();
      downloadRecord(item.id);
    };
    controls.querySelector('[data-action="delete"]').onclick = (e) => {
      e.stopPropagation();
      deleteRecord(item.id);
    };

    row.appendChild(infoMain);
    row.appendChild(timeSpan);
    row.appendChild(controls);

    listEl.appendChild(row);
  });

  renderPagination(listEl);
}

// 从生成内容库点击记录，回放到预览区
function previewFromRecord(record) {
  if (generating) return;

  const modeMap = { image: "image", audio: "audio", video: "video" };
  const targetMode = modeMap[record.type];
  if (targetMode) {
    const nav = document.querySelector(`.nav-item[data-mode="${targetMode}"]`);
    if (nav) switchMode(targetMode, nav);
  }

  const placeholder = document.getElementById("previewPlaceholder");
  const loadingBox = document.getElementById("loadingBox");
  const imageResult = document.getElementById("imageResult");
  const audioPreview = document.getElementById("audioPreview");
  const videoPreview = document.getElementById("videoPreview");
  const audioPlayer = document.getElementById("audioPlayer");
  const videoPlayer = document.getElementById("videoPlayer");

  placeholder.style.display = "none";
  loadingBox.style.display = "none";
  imageResult.style.display = "none";
  audioPreview.style.display = "none";
  videoPreview.style.display = "none";

  if (record.type === "image") {
    imageResult.src = record.path;
    imageResult.style.display = "block";
  } else if (record.type === "audio") {
    audioPlayer.src = record.path;
    audioPreview.style.display = "block";
    audioPlayer.play();
  } else if (record.type === "video") {
    videoPlayer.src = record.path;
    videoPreview.style.display = "block";
    videoPlayer.play();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadRecords);
} else {
  loadRecords();
}

function renderPagination(container) {
  const totalPages = Math.ceil((libraryTotal || 0) / libraryPageSize) || 1;
  if (totalPages <= 1) return;
  const nav = document.createElement("div");
  nav.className = "library-pagination";
  nav.innerHTML = `
    <button class="filter-pill" id="pagePrev"${
      libraryPage === 1 ? " disabled" : ""
    }>上一页</button>
    <span>第 ${libraryPage} / ${totalPages} 页</span>
    <button class="filter-pill" id="pageNext"${
      libraryPage >= totalPages ? " disabled" : ""
    }>下一页</button>
  `;
  nav.querySelector("#pagePrev").onclick = () => {
    if (libraryPage > 1) loadRecords(libraryPage - 1);
  };
  nav.querySelector("#pageNext").onclick = () => {
    if (libraryPage < totalPages) loadRecords(libraryPage + 1);
  };
  container.appendChild(nav);
}

function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
}

async function deleteRecord(id) {
  if (!confirm("确定删除该记录？")) return;
  try {
    const resp = await fetch(API_DELETE_RECORD_URL(id), {
      method: "POST",
      headers: { "X-CSRFToken": getCSRFToken() },
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    mediaStore = mediaStore.filter((r) => r.id !== id);
    libraryTotal = Math.max(0, libraryTotal - 1);
    renderLibrary();
  } catch (err) {
    alert(`删除失败：${err.message}`);
  }
}

async function deleteSelected() {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 条记录？`)) return;
  await Promise.all(ids.map((id) => deleteRecord(id)));
  selectedIds.clear();
  loadRecords(libraryPage);
}

function downloadRecord(id) {
  window.open(API_DOWNLOAD_RECORD_URL(id), "_blank");
}

async function downloadSelectedZip() {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;
  try {
    const resp = await fetch(API_DOWNLOAD_BATCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify({ ids }),
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "media_batch.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert(`下载失败：${err.message}`);
  }
}
