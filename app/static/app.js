(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const linkInput = $("linkInput");
  const submitBtn = $("submitBtn");
  const btnText = submitBtn.querySelector(".btn-text");
  const btnSpinner = submitBtn.querySelector(".btn-spinner");
  const sitesList = $("sitesList");

  const settingsBtn = $("settingsBtn");
  const settingsModal = $("settingsModal");
  const closeSettings = $("closeSettings");
  const cancelSettingsBtn = $("cancelSettingsBtn");
  const saveSettingsBtn = $("saveSettingsBtn");
  const testConnBtn = $("testConnBtn");

  const qbtHost = $("qbtHost");
  const qbtUsername = $("qbtUsername");
  const qbtPassword = $("qbtPassword");
  const savePath = $("savePath");
  const downloadLimit = $("downloadLimit");

  const torrentsList = $("torrentsList");
  const refreshTorrentsBtn = $("refreshTorrentsBtn");
  let torrentsTimer = null;
  const REFRESH_MS = 5000; // 5秒自动刷新

  const searchInput = $("searchInput");
  const clearSearchBtn = $("clearSearchBtn");

  /* ---------- Toast ---------- */
  function toast(message, type = "info") {
    const container = $("toastContainer");
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("leave");
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }

  /* ---------- 提交区 ---------- */
  function updateSubmitState() {
    const has = linkInput.value.trim().length > 0;
    submitBtn.disabled = !has;
  }
  linkInput.addEventListener("input", updateSubmitState);
  // 粘贴自动填充已由原生 textarea 支持
  linkInput.addEventListener("paste", () => setTimeout(updateSubmitState, 0));

  async function submitTorrent() {
    const link = linkInput.value.trim();
    if (!link) {
      toast("请输入磁力链接或种子 URL", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/torrent/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link })
      });
      const data = await res.json();
      if (data.ok) {
        toast(data.message || "推送成功", "success");
        linkInput.value = "";
        updateSubmitState();
        loadTorrents(); // 推送成功后立即刷新列表
      } else {
        toast(data.message || "推送失败", "error");
      }
    } catch (e) {
      toast("网络异常，请稍后重试", "error");
    } finally {
      setLoading(false);
    }
  }
  function setLoading(loading) {
    submitBtn.disabled = loading;
    btnText.textContent = loading ? "推送中..." : "推送到 QBT 下载";
    btnSpinner.hidden = !loading;
  }
  submitBtn.addEventListener("click", submitTorrent);

  /* ---------- 下载进度列表 ---------- */
  function fmtBytes(n) {
    if (!n || n < 0) return "0 B";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(i === 0 ? 0 : 1) + " " + u[i];
  }
  function fmtSpeed(n) {
    return fmtBytes(n) + "/s";
  }
  function fmtEta(sec) {
    if (!sec || sec < 0 || sec >= 8640000) return "∞";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (d > 0) return d + "天" + h + "时";
    if (h > 0) return h + "时" + m + "分";
    if (m > 0) return m + "分" + s + "秒";
    return s + "秒";
  }
  function stateClass(rawState, stateText) {
    const rs = (rawState || "").toLowerCase();
    if (rs.includes("error") || rs.includes("missing")) return "error";
    if (rs.includes("up") || stateText.includes("做种")) return "seeding";
    if (rs.includes("paused")) return "paused";
    if (rs.includes("download") || rs.includes("forceddl") || rs.includes("metadl")) return "downloading";
    if (rs.includes("stalled") || rs.includes("queued") || rs.includes("allocating") || rs.includes("checking") || rs.includes("moving")) return "waiting";
    return "other";
  }

  function torrentWarning(t) {
    const rs = (t.raw_state || "").toLowerCase();
    const seeds = t.num_seeds || 0;
    const peers = t.num_leechs || 0;
    if (rs === "metadl") {
      if (seeds === 0 && peers === 0) {
        return { type: "warn", msg: "无可用节点，无法获取种子信息；磁力链接可能已失效，可尝试在 QBT 中添加 Tracker" };
      }
      return { type: "info", msg: "正在获取种子元数据，请稍候…" };
    }
    if (rs === "stalleddl" && seeds === 0) {
      return { type: "warn", msg: "无可用做种者，下载已停滞，该资源可能已失效" };
    }
    if ((rs === "downloading" || rs === "forceddl") && seeds === 0 && peers === 0 && (t.dlspeed || 0) === 0) {
      return { type: "warn", msg: "未连接到任何节点，暂时无法下载" };
    }
    return null;
  }

  async function loadTorrents() {
    try {
      const res = await fetch("/api/torrents");
      const data = await res.json();
      if (data.ok) {
        renderTorrents(data.data || []);
        startAutoRefresh();
      } else {
        torrentsList.innerHTML = '<div class="torrents-empty">' + escapeHtml(data.message || "获取失败") + "</div>";
        stopAutoRefresh();
      }
    } catch (e) {
      torrentsList.innerHTML = '<div class="torrents-empty">网络异常，请稍后重试</div>';
      stopAutoRefresh();
    }
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderTorrents(items) {
    if (!items.length) {
      torrentsList.innerHTML = '<div class="torrents-empty">QBT 暂无下载任务</div>';
      return;
    }
    torrentsList.innerHTML = "";
    items.forEach((t) => {
      const pct = Math.round((t.progress || 0) * 100);
      const isDone = pct >= 100;
      const isError = (t.raw_state || "").includes("error") || (t.raw_state || "").includes("missing");
      const sClass = stateClass(t.raw_state, t.state);
      const isPaused = (t.raw_state || "").indexOf("paused") === 0;
      const toggleLabel = isPaused ? "继续" : "暂停";
      const warn = torrentWarning(t);
      const warnHtml = warn
        ? '<div class="torrent-warning ' + warn.type + '">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
            "<span></span>" +
          "</div>"
        : "";

      const item = document.createElement("div");
      item.className = "torrent-item";
      item.innerHTML =
        '<div class="torrent-top">' +
          '<span class="torrent-name" title="' + escapeHtml(t.name) + '"></span>' +
          '<span class="torrent-state ' + sClass + '"></span>' +
        "</div>" +
        warnHtml +
        '<div class="torrent-progress-bar">' +
          '<div class="torrent-progress-fill' + (isDone ? " done" : isError ? " error" : "") + '" style="width:' + pct + "%\"></div>" +
        "</div>" +
        '<div class="torrent-meta">' +
          "<span>" + pct + "%</span>" +
          "<span>" + fmtBytes(t.downloaded) + " / " + fmtBytes(t.size) + "</span>" +
          "<span>做种 " + (t.num_seeds || 0) + " · 节点 " + (t.num_leechs || 0) + "</span>" +
          '<span class="dl-speed">↓ ' + fmtSpeed(t.dlspeed) + "</span>" +
          '<span class="up-speed">↑ ' + fmtSpeed(t.upspeed) + "</span>" +
          "<span>剩余 " + fmtEta(t.eta) + "</span>" +
        "</div>" +
        '<div class="torrent-actions">' +
          '<button class="action-btn toggle-btn" data-action="' + (isPaused ? "resume" : "pause") + '" data-hash="' + t.hash + '">' + toggleLabel + "</button>" +
          '<button class="action-btn delete-btn" data-action="delete" data-hash="' + t.hash + '" data-name="' + escapeHtml(t.name) + '">删除</button>' +
        "</div>";
      item.querySelector(".torrent-name").textContent = t.name;
      item.querySelector(".torrent-state").textContent = t.state;
      if (warn) item.querySelector(".torrent-warning span").textContent = warn.msg;
      torrentsList.appendChild(item);
    });
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    torrentsTimer = setInterval(loadTorrents, REFRESH_MS);
  }
  function stopAutoRefresh() {
    if (torrentsTimer) { clearInterval(torrentsTimer); torrentsTimer = null; }
  }

  if (refreshTorrentsBtn) {
    refreshTorrentsBtn.addEventListener("click", loadTorrents);
  }

  /* ---------- 暂停 / 继续 / 删除 ---------- */
  const deleteModal = $("deleteModal");
  const deleteName = $("deleteName");
  let pendingHash = "";

  torrentsList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".action-btn");
    if (!btn) return;
    const action = btn.dataset.action;
    const hash = btn.dataset.hash;
    if (!hash) return;
    if (action === "delete") {
      openDeleteModal(hash, btn.dataset.name || "");
      return;
    }
    await sendTorrentAction(action, hash, btn);
  });

  async function sendTorrentAction(action, hash, btn) {
    const url = action === "pause" ? "/api/torrents/pause" : "/api/torrents/resume";
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "处理中...";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash })
      });
      const data = await res.json();
      toast(data.message, data.ok ? "success" : "error");
      if (data.ok) loadTorrents();
    } catch (err) {
      toast("网络异常，请稍后重试", "error");
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function openDeleteModal(hash, name) {
    pendingHash = hash;
    deleteName.textContent = name;
    deleteModal.classList.remove("hidden");
    deleteModal.setAttribute("aria-hidden", "false");
  }
  function closeDeleteModal() {
    deleteModal.classList.add("hidden");
    deleteModal.setAttribute("aria-hidden", "true");
    pendingHash = "";
  }
  $("closeDelete").addEventListener("click", closeDeleteModal);
  $("cancelDeleteBtn").addEventListener("click", closeDeleteModal);
  deleteModal.querySelectorAll("[data-delete-close]").forEach((el) =>
    el.addEventListener("click", closeDeleteModal)
  );

  async function confirmDelete(deleteFiles, btn) {
    if (!pendingHash) return;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "删除中...";
    try {
      const res = await fetch("/api/torrents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: pendingHash, delete_files: deleteFiles })
      });
      const data = await res.json();
      toast(data.message, data.ok ? "success" : "error");
      if (data.ok) {
        closeDeleteModal();
        loadTorrents();
      }
    } catch (err) {
      toast("网络异常，请稍后重试", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }
  $("deleteTaskOnlyBtn").addEventListener("click", function () { confirmDelete(false, this); });
  $("deleteWithFilesBtn").addEventListener("click", function () { confirmDelete(true, this); });

  /* ---------- 推荐站点 ---------- */
  let currentSites = [];

  async function loadSites() {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      currentSites = data.data || [];
      renderSites(currentSites);
    } catch (e) {
      sitesList.innerHTML = '<div class="site-desc">加载站点失败</div>';
    }
  }
  function renderSites(sites) {
    const q = searchInput.value.trim();
    const hasQ = q.length > 0;
    clearSearchBtn.hidden = !hasQ;

    if (!sites.length) {
      sitesList.innerHTML = '<div class="site-desc">暂无推荐站点</div>';
      return;
    }
    sitesList.innerHTML = "";
    sites.forEach((s) => {
      // 有搜索模板且输入了关键词 → 搜索结果页；否则打开站点首页
      const useSearch = hasQ && s.search;
      const href = useSearch ? s.search.replace("{q}", encodeURIComponent(q)) : s.url;
      const label = useSearch ? '搜索 "' + q + '"' : "打开站点";

      const item = document.createElement("div");
      item.className = "site-item";
      item.innerHTML = `
        <div class="site-name"></div>
        <div class="site-desc"></div>
        <div class="site-actions">
          <a class="copy-btn" target="_blank" rel="noopener noreferrer"></a>
        </div>`;
      item.querySelector(".site-name").textContent = s.name;
      item.querySelector(".site-desc").textContent = s.desc || "";
      const link = item.querySelector(".copy-btn");
      link.href = href;
      link.textContent = label;
      if (useSearch) link.classList.add("searching");
      sitesList.appendChild(item);
    });
  }
  /* ---------- 设置弹窗 ---------- */
  function openSettings() {
    settingsModal.classList.remove("hidden");
    settingsModal.setAttribute("aria-hidden", "false");
    loadSettings();
  }
  function closeSettingsModal() {
    settingsModal.classList.add("hidden");
    settingsModal.setAttribute("aria-hidden", "true");
  }
  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsModal);
  cancelSettingsBtn.addEventListener("click", closeSettingsModal);
  settingsModal.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", closeSettingsModal)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
      closeSettingsModal();
    }
  });

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.ok) {
        const d = data.data;
        qbtHost.value = d.qbt_host || "";
        qbtUsername.value = d.qbt_username || "";
        qbtPassword.value = d.qbt_password || "";
        savePath.value = d.save_path || "";
        downloadLimit.value = d.download_limit || 0;
      }
    } catch (e) {
      toast("加载配置失败", "error");
    }
  }

  function collectSettings() {
    return {
      qbt_host: qbtHost.value.trim(),
      qbt_username: qbtUsername.value.trim(),
      qbt_password: qbtPassword.value,
      save_path: savePath.value.trim(),
      download_limit: parseInt(downloadLimit.value, 10) || 0
    };
  }

  testConnBtn.addEventListener("click", async () => {
    const original = testConnBtn.textContent;
    testConnBtn.textContent = "测试中...";
    testConnBtn.disabled = true;
    try {
      const res = await fetch("/api/qbt/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectSettings())
      });
      const data = await res.json();
      toast(data.message, data.ok ? "success" : "error");
    } catch (e) {
      toast("网络异常，请稍后重试", "error");
    } finally {
      testConnBtn.textContent = original;
      testConnBtn.disabled = false;
    }
  });

  saveSettingsBtn.addEventListener("click", async () => {
    if (!qbtHost.value.trim()) {
      toast("QBT 服务地址不能为空", "error");
      return;
    }
    const original = saveSettingsBtn.textContent;
    saveSettingsBtn.textContent = "保存中...";
    saveSettingsBtn.disabled = true;
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectSettings())
      });
      const data = await res.json();
      if (data.ok) {
        toast("配置已保存", "success");
        closeSettingsModal();
      } else {
        toast(data.message || "保存失败", "error");
      }
    } catch (e) {
      toast("网络异常，请稍后重试", "error");
    } finally {
      saveSettingsBtn.textContent = original;
      saveSettingsBtn.disabled = false;
    }
  });

  /* ---------- 快捷搜索 ---------- */
  searchInput.addEventListener("input", () => renderSites(currentSites));
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    renderSites(currentSites);
    searchInput.focus();
  });

  /* ---------- 初始化 ---------- */
  loadSites();
  loadTorrents();
  updateSubmitState();
})();
