let currentMode = "image"; // image | audio | video
  let generating = false;
  let mediaStore = [];
  let currentFilter = "all";
  // 切换图像/音频/视频栏目
  function switchMode(mode, elem) {
    if (generating) return;
    currentMode = mode;

    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    elem.classList.add("active");

    document.getElementById("generationMain").classList.remove("hidden");
    document.getElementById("libraryMain").classList.add("hidden");

    const styleLabel   = document.getElementById("styleLabel");
    const styleOptions = document.getElementById("styleOptions");
    const voiceOptions = document.getElementById("voiceOptions");
    const modelSelect  = document.getElementById("modelSelect");
    const placeholder  = document.getElementById("previewPlaceholder");
    const loadingBox   = document.getElementById("loadingBox");
    const imageResult  = document.getElementById("imageResult");
    const audioPreview = document.getElementById("audioPreview");
    const videoPreview = document.getElementById("videoPreview");
    const modeTag      = document.getElementById("previewModeTag");

    placeholder.style.display  = "block";
    loadingBox.style.display   = "none";
    imageResult.style.display  = "none";
    audioPreview.style.display = "none";
    videoPreview.style.display = "none";

    if (mode === "image") {
      placeholder.querySelector(".preview-placeholder-title").textContent = "图片生成预览区域";
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
        "音频生成区域（完成后会播放 ./3.mp3）";
      styleLabel.textContent = "人生选择：";
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
        "视频生成预览区域（完成后会播放 ./2.mp4）";
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
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    elem.classList.add("active");

    document.getElementById("generationMain").classList.add("hidden");
    document.getElementById("libraryMain").classList.remove("hidden");
  }

  // 点击生成
  function handleGenerate() {
    if (generating) return;
    generating = true;

    const prompt = document.getElementById("promptInput").value.trim();
    const model  = document.getElementById("modelSelect").value;

    const placeholder  = document.getElementById("previewPlaceholder");
    const loadingBox   = document.getElementById("loadingBox");
    const loadingText  = document.getElementById("loadingText");
    const imageResult  = document.getElementById("imageResult");
    const audioPreview = document.getElementById("audioPreview");
    const videoPreview = document.getElementById("videoPreview");
    const audioPlayer  = document.getElementById("audioPlayer");
    const videoPlayer  = document.getElementById("videoPlayer");
    const generateBtn  = document.getElementById("generateBtn");

    placeholder.style.display  = "none";
    imageResult.style.display  = "none";
    audioPreview.style.display = "none";
    videoPreview.style.display = "none";
    loadingBox.style.display   = "block";

    let waitMs = 5000;
    let modeName = "图片";
    if (currentMode === "audio") {
      waitMs = 10000;
      modeName = "音频";
    } else if (currentMode === "video") {
      waitMs = 20000;
      modeName = "视频";
    }

    loadingText.textContent = `正在生成${modeName}，请稍候…（模型：${model}）`;
    generateBtn.disabled = true;
    generateBtn.textContent = "生成中…";

    setTimeout(() => {
      loadingBox.style.display = "none";

      let filePath = "";
      if (currentMode === "image") {
        filePath = "./1.jpeg";
        imageResult.src = filePath;
        imageResult.style.display = "block";
      } else if (currentMode === "audio") {
        filePath = "./3.mp3";
        audioPlayer.src = filePath;
        audioPreview.style.display = "block";
        audioPlayer.play();
      } else if (currentMode === "video") {
        filePath = "./2.mp4";
        videoPlayer.src = filePath;
        videoPreview.style.display = "block";
        videoPlayer.play();
      }

      addToMediaStore({
        type: currentMode,
        path: filePath,
        model,
        prompt
      });

      generateBtn.disabled = false;
      generateBtn.textContent = "生成";
      generating = false;
    }, waitMs);
  }

  // 存入生成内容库
  function addToMediaStore({type, path, model, prompt}) {
    const now = new Date();
    const id = now.getTime();
    const timeStr = now.toLocaleTimeString("zh-CN", {hour12: false});
    const createdAt = now.toISOString();

    let style = "";
    let voice = "";
    if (type === "image" || type === "video") {
      style = document.querySelector("input[name='style']:checked")?.value || "";
    } else if (type === "audio") {
      voice = document.querySelector("input[name='voice']:checked")?.value || "";
    }

    const record = {
      id,
      type,
      path,
      model,
      prompt,
      style,
      voice,
      createdAt,
      time: timeStr
    };

    mediaStore.unshift(record);
    renderLibrary();
  }

  function setLibraryFilter(filter, elem) {
    currentFilter = filter;
    document.querySelectorAll(".filter-pill").forEach(btn => btn.classList.remove("active"));
    elem.classList.add("active");
    renderLibrary();
  }

  function renderLibrary() {
    const listEl = document.getElementById("libraryList");
    const statsEl = document.getElementById("libraryStats");
    listEl.innerHTML = "";

    const filtered = mediaStore.filter(item => {
      if (currentFilter === "all") return true;
      return item.type === currentFilter;
    });

    if (statsEl) {
      statsEl.textContent =
        mediaStore.length === 0
          ? "暂无记录"
          : `共 ${mediaStore.length} 条生成记录，当前显示 ${filtered.length} 条`;
    }

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "library-empty";
      empty.textContent = "当前筛选条件下暂无生成记录。";
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement("div");
      row.className = "library-item";
      row.onclick = () => previewFromRecord(item);

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
        detail = `模型：${item.model || "-"} · 风格：${item.style || "-"} · 文件：${item.path}`;
      } else if (item.type === "audio") {
        detail = `模型：${item.model || "-"} · 人声：${item.voice || "-"} · 文件：${item.path}`;
      }
      metaRow.textContent = detail;

      infoMain.appendChild(topRow);
      infoMain.appendChild(metaRow);

      const timeSpan = document.createElement("div");
      timeSpan.className = "library-time";
      timeSpan.textContent = item.time;

      row.appendChild(infoMain);
      row.appendChild(timeSpan);

      listEl.appendChild(row);
    });
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

    const placeholder  = document.getElementById("previewPlaceholder");
    const loadingBox   = document.getElementById("loadingBox");
    const imageResult  = document.getElementById("imageResult");
    const audioPreview = document.getElementById("audioPreview");
    const videoPreview = document.getElementById("videoPreview");
    const audioPlayer  = document.getElementById("audioPlayer");
    const videoPlayer  = document.getElementById("videoPlayer");

    placeholder.style.display  = "none";
    loadingBox.style.display   = "none";
    imageResult.style.display  = "none";
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
