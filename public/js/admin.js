/**
 * QReview Admin Dashboard
 */

let authToken = localStorage.getItem("qreview_admin_token") || null;
let currentFilter = "all";
let currentPage = 1;
let currentSearch = "";
let searchTimer = null;
let confirmCallback = null;
let selectedIds = new Set();

// ── Theme ──

function initTheme() {
  const theme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

// Apply theme immediately
initTheme();

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("admin-footer-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Theme toggle buttons
  const themeLoginBtn = document.getElementById("theme-toggle-login");
  const themeDashboardBtn = document.getElementById("theme-toggle-dashboard");
  if (themeLoginBtn) themeLoginBtn.addEventListener("click", toggleTheme);
  if (themeDashboardBtn)
    themeDashboardBtn.addEventListener("click", toggleTheme);

  // Social floating button
  const socialToggle = document.getElementById("social-toggle");
  const socialMenu = document.getElementById("social-menu");
  if (socialToggle && socialMenu) {
    socialToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      socialMenu.classList.toggle("show");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".social-float")) {
        socialMenu.classList.remove("show");
      }
    });
  }

  if (authToken) {
    // Validate session is still alive before showing dashboard
    verifySession();
  } else {
    showLogin();
  }
});

// ── Toast ──

function showAdminToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("admin-toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "\u2713", error: "\u2717", info: "\u2139" };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("closing");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Confirm modal ──

function showConfirm(title, message, callback) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  confirmCallback = callback;
  document.getElementById("confirm-modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

document.getElementById("confirm-cancel").addEventListener("click", () => {
  document.getElementById("confirm-modal").classList.remove("show");
  document.body.style.overflow = "";
  confirmCallback = null;
});

document.getElementById("confirm-ok").addEventListener("click", () => {
  document.getElementById("confirm-modal").classList.remove("show");
  document.body.style.overflow = "";
  if (confirmCallback) {
    confirmCallback();
    confirmCallback = null;
  }
});

// ── Auth ──

async function verifySession() {
  try {
    const res = await fetch("/admin/stats", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      showDashboard();
    } else {
      authToken = null;
      localStorage.removeItem("qreview_admin_token");
      showLogin();
    }
  } catch (_) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("admin-dashboard").style.display = "none";
}

function showDashboard() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-dashboard").style.display = "block";
  loadAdminStats();
  loadAdminReviews();
  initSearch();
  loadAdminQRCode();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("admin-password").value;
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");

  btn.disabled = true;
  btn.textContent = "Connexion...";

  try {
    const res = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      errorEl.textContent = "Mot de passe incorrect";
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Se connecter";
      return;
    }

    const data = await res.json();
    authToken = data.token;
    localStorage.setItem("qreview_admin_token", authToken);
    errorEl.style.display = "none";
    btn.disabled = false;
    btn.textContent = "Se connecter";
    showDashboard();
  } catch (err) {
    errorEl.textContent = "Erreur de connexion";
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Se connecter";
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await fetch("/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch (_) {}
  authToken = null;
  localStorage.removeItem("qreview_admin_token");
  showAdminToast("Deconnecte", "info");
  showLogin();
});

// ── Helpers ──

function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  }).then((res) => {
    if (res.status === 401) {
      authToken = null;
      localStorage.removeItem("qreview_admin_token");
      showAdminToast("Session expiree, reconnectez-vous", "error");
      showLogin();
      throw new Error("Session expired");
    }
    return res;
  });
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  const intervals = [
    { label: "an", seconds: 31536000 },
    { label: "mois", seconds: 2592000 },
    { label: "j", seconds: 86400 },
    { label: "h", seconds: 3600 },
    { label: "min", seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `il y a ${count} ${interval.label}${count > 1 && interval.label !== "mois" ? "s" : ""}`;
    }
  }
  return "a l'instant";
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Stats ──

async function loadAdminStats() {
  try {
    const res = await adminFetch("/admin/stats");
    const stats = await res.json();
    document.getElementById("stat-total").textContent =
      stats.total_reviews || 0;
    document.getElementById("stat-validated").textContent =
      stats.validated || 0;
    document.getElementById("stat-pending").textContent = stats.pending || 0;
    document.getElementById("stat-flagged").textContent = stats.flagged || 0;
    document.getElementById("stat-avg").textContent = stats.average_rating
      ? `${stats.average_rating}/5`
      : "-";
  } catch (_) {}
}

// ── Search ──

function initSearch() {
  const searchInput = document.getElementById("admin-search-input");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      loadAdminReviews(1);
    }, 400);
  });
}

// ── Reviews ──

async function loadAdminReviews(page = 1) {
  currentPage = page;
  const container = document.getElementById("admin-reviews-list");
  container.innerHTML = '<p class="loading">Chargement...</p>';

  try {
    const params = new URLSearchParams({
      page,
      filter: currentFilter,
    });
    if (currentSearch) params.set("search", currentSearch);

    const res = await adminFetch(`/admin/reviews?${params}`);
    const data = await res.json();

    const countEl = document.getElementById("reviews-count");
    if (countEl)
      countEl.textContent = `${data.total} resultat${data.total !== 1 ? "s" : ""}`;

    if (data.reviews.length === 0) {
      container.innerHTML =
        '<p class="no-reviews">Aucun avis dans cette categorie.</p>';
      document.getElementById("admin-pagination").innerHTML = "";
      return;
    }

    container.innerHTML = data.reviews.map((r) => renderAdminCard(r)).join("");

    // Restore select-all checkbox state
    updateBulkBar();

    renderPagination(data.totalPages, data.page);
  } catch (err) {
    container.innerHTML = '<p class="loading">Erreur de chargement.</p>';
  }
}

function renderPagination(totalPages, current) {
  const container = document.getElementById("admin-pagination");
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }
  let html = `<button class="page-btn" onclick="loadAdminReviews(${current - 1})" ${current <= 1 ? "disabled" : ""}>\u2190</button>`;
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? "active" : ""}" onclick="loadAdminReviews(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="loadAdminReviews(${current + 1})" ${current >= totalPages ? "disabled" : ""}>\u2192</button>`;
  container.innerHTML = html;
}

// ── Filters ──

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    loadAdminReviews(1);
  });
});

// ── Event delegation for admin review actions ──

document.addEventListener("click", (e) => {
  // Handle admin buttons
  const btn = e.target.closest(".admin-btn[data-action]");
  if (btn) {
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);

    switch (action) {
      case "validate":
        validateReview(id);
        break;
      case "reply":
        openReplyModal(id, btn.dataset.name, parseInt(btn.dataset.rating));
        break;
      case "flag":
        toggleFlag(id, btn.dataset.flagged === "true");
        break;
      case "delete":
        confirmDelete(id, btn.dataset.name);
        break;
    }
    return;
  }

  // Handle bulk action buttons
  const bulkBtn = e.target.closest(".admin-btn[data-bulk-action]");
  if (bulkBtn) {
    const action = bulkBtn.dataset.bulkAction;
    switch (action) {
      case "validate":
        bulkValidate();
        break;
      case "delete":
        bulkDeleteConfirm();
        break;
    }
    return;
  }

  // Handle review checkboxes
  if (e.target.matches(".review-checkbox")) {
    const checkbox = e.target;
    const id = parseInt(checkbox.dataset.id);
    toggleSelection(id, checkbox.checked);
    return;
  }

  // Handle select-all checkbox
  if (e.target.matches("#select-all-checkbox")) {
    const selectAllCheckbox = e.target;
    const checkboxes = document.querySelectorAll(".review-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = selectAllCheckbox.checked;
      const id = parseInt(cb.dataset.id);
      if (selectAllCheckbox.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
    });
    updateBulkBar();
  }
});

// ── Actions ──

function confirmDelete(id, name) {
  showConfirm(
    "Supprimer cet avis ?",
    `L'avis de "${name}" sera supprimé definitivement.`,
    () => deleteReview(id),
  );
}

async function deleteReview(id) {
  try {
    const res = await adminFetch(`/admin/reviews/${id}`, { method: "DELETE" });
    if (res.ok) {
      showAdminToast("Avis supprimé", "success");
      // Animate out
      const card = document.getElementById(`review-${id}`);
      if (card) {
        card.style.transition = "all 0.3s ease";
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(() => loadAdminReviews(currentPage), 300);
      } else {
        loadAdminReviews(currentPage);
      }
      loadAdminStats();
    } else {
      showAdminToast("Erreur lors de la suppression", "error");
    }
  } catch (_) {
    showAdminToast("Erreur lors de la suppression", "error");
  }
}

async function validateReview(id) {
  try {
    const res = await adminFetch(`/admin/reviews/${id}/validate`, {
      method: "POST",
    });
    if (res.ok) {
      showAdminToast("Avis validé avec succes", "success");
      loadAdminReviews(currentPage);
      loadAdminStats();
    } else {
      const data = await res.json();
      showAdminToast(data.error || "Erreur lors de la validation", "error");
    }
  } catch (_) {
    showAdminToast("Erreur lors de la validation", "error");
  }
}

async function toggleFlag(id, flagged) {
  try {
    const res = await adminFetch(`/admin/reviews/${id}/flag`, {
      method: "POST",
      body: JSON.stringify({ flagged }),
    });
    if (res.ok) {
      showAdminToast(flagged ? "Avis signale" : "Signalement retire", "info");
      loadAdminReviews(currentPage);
      loadAdminStats();
    } else {
      showAdminToast("Erreur", "error");
    }
  } catch (_) {
    showAdminToast("Erreur", "error");
  }
}

// ── Reply modal ──

function openReplyModal(id, companyName, rating) {
  document.getElementById("reply-review-id").value = id;
  document.getElementById("reply-text").value = "";
  document.getElementById("reply-char-count").textContent = "0";

  // Show context about the review being replied to
  const contextEl = document.getElementById("reply-context");
  if (contextEl) {
    contextEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid var(--border);">
        <span style="font-weight: 600;">${escapeHtml(companyName)}</span>
        <span class="review-stars">${"\u2605".repeat(rating)}${"\u2606".repeat(5 - rating)}</span>
      </div>
    `;
  }

  document.getElementById("reply-modal").classList.add("show");
  document.body.style.overflow = "hidden";
  document.getElementById("reply-text").focus();
}

document.getElementById("reply-close").addEventListener("click", () => {
  document.getElementById("reply-modal").classList.remove("show");
  document.body.style.overflow = "";
});

// Close modals on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.show").forEach((m) => {
      m.classList.remove("show");
      document.body.style.overflow = "";
    });
    confirmCallback = null;
  }
});

// Close modals on backdrop click
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
      document.body.style.overflow = "";
      confirmCallback = null;
    }
  });
});

// Reply char counter
document.getElementById("reply-text").addEventListener("input", (e) => {
  document.getElementById("reply-char-count").textContent =
    e.target.value.length;
});

document.getElementById("reply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("reply-review-id").value;
  const reply = document.getElementById("reply-text").value.trim();
  const btn = document.getElementById("reply-submit-btn");

  if (!reply) return;

  btn.disabled = true;
  btn.textContent = "Envoi...";

  try {
    const res = await adminFetch(`/admin/reviews/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    });

    if (res.ok) {
      document.getElementById("reply-modal").classList.remove("show");
      document.body.style.overflow = "";
      showAdminToast("Reponse envoyee", "success");
      loadAdminReviews(currentPage);
    } else {
      const data = await res.json();
      showAdminToast(data.error || "Erreur", "error");
    }
  } catch (_) {
    showAdminToast("Erreur lors de l'envoi", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Envoyer la reponse";
  }
});

// ── Admin card renderer ──

function renderAdminCard(r) {
  const safeName = escapeHtml(r.company_name).replace(/'/g, "&apos;");
  const stars = "\u2605".repeat(r.rating) + "\u2606".repeat(5 - r.rating);
  const checked = selectedIds.has(r.id) ? "checked" : "";

  let badges = "";
  badges += r.is_validated
    ? '<span class="badge validated">Valide</span>'
    : '<span class="badge pending">En attente</span>';
  if (r.flagged) badges += '<span class="badge flagged-badge">Signale</span>';
  if (r.company_verified)
    badges += '<span class="badge verified">SIRET verifie</span>';
  if (r.linkedin_verified)
    badges +=
      '<span class="badge" style="background: linear-gradient(135deg, #0077B5 0%, #005885 100%); color: white;">LinkedIn verifie</span>';
  if (r.siret)
    badges +=
      '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text-muted);">' +
      escapeHtml(r.siret) +
      "</span>";

  let actions = "";
  if (!r.is_validated)
    actions +=
      '<button class="admin-btn validate-btn" data-action="validate" data-id="' +
      r.id +
      '">Valider</button>';
  actions +=
    '<button class="admin-btn" data-action="reply" data-id="' +
    r.id +
    '" data-name="' +
    safeName +
    '" data-rating="' +
    r.rating +
    '">' +
    (r.admin_reply ? "Modifier reponse" : "Repondre") +
    "</button>";
  actions +=
    '<button class="admin-btn" data-action="flag" data-id="' +
    r.id +
    '" data-flagged="' +
    !r.flagged +
    '">' +
    (r.flagged ? "Deflaguer" : "Flaguer") +
    "</button>";
  actions +=
    '<button class="admin-btn danger" data-action="delete" data-id="' +
    r.id +
    '" data-name="' +
    safeName +
    '">Supprimer</button>';

  const comment = r.comment
    ? '<p class="admin-review-comment">' + escapeHtml(r.comment) + "</p>"
    : '<p class="admin-review-comment" style="opacity:0.4;font-style:italic;">Aucun commentaire</p>';

  const reply = r.admin_reply
    ? '<div class="admin-review-reply"><strong>Votre reponse</strong><p>' +
      escapeHtml(r.admin_reply) +
      "</p></div>"
    : "";

  return (
    '<div class="admin-review-card ' +
    (r.flagged ? "flagged" : "") +
    " " +
    (!r.is_validated ? "pending" : "") +
    '" id="review-' +
    r.id +
    '">' +
    '<div class="admin-review-header">' +
    '<div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0;">' +
    '<input type="checkbox" class="review-checkbox" data-id="' +
    r.id +
    '" ' +
    checked +
    ">" +
    '<div class="admin-review-info">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
    '<span class="company-name">' +
    escapeHtml(r.company_name) +
    "</span>" +
    '<span class="review-stars">' +
    stars +
    "</span>" +
    "</div>" +
    '<div class="review-meta"><span>' +
    escapeHtml(r.position) +
    "</span><span>" +
    escapeHtml(r.duration) +
    '</span><span title="' +
    escapeHtml(r.email) +
    '">' +
    escapeHtml(r.email) +
    '</span><span title="' +
    formatDate(r.created_at) +
    '">' +
    timeAgo(r.created_at) +
    "</span></div>" +
    '<div class="admin-review-badges">' +
    badges +
    "</div>" +
    "</div></div>" +
    '<div class="admin-review-actions">' +
    actions +
    "</div>" +
    "</div>" +
    comment +
    reply +
    "</div>"
  );
}

// ── Bulk selection ──

function toggleSelection(id, checked) {
  if (checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById("bulk-bar");
  const countEl = document.getElementById("bulk-count");
  const selectAll = document.getElementById("select-all-checkbox");

  if (selectedIds.size > 0) {
    bar.style.display = "flex";
    countEl.textContent = selectedIds.size + " selectionne(s)";
  } else {
    bar.style.display = "none";
  }

  // Sync select-all checkbox
  const checkboxes = document.querySelectorAll(".review-checkbox");
  if (checkboxes.length > 0 && selectAll) {
    const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
    selectAll.checked = allChecked && checkboxes.length > 0;
    selectAll.indeterminate = selectedIds.size > 0 && !allChecked;
  }
}

async function bulkValidate() {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  try {
    const res = await adminFetch("/admin/reviews/bulk/validate", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (res.ok) {
      showAdminToast(data.message || "Avis validés", "success");
      selectedIds.clear();
      loadAdminReviews(currentPage);
      loadAdminStats();
    } else {
      showAdminToast(data.error || "Erreur", "error");
    }
  } catch (_) {
    showAdminToast("Erreur lors de la validation", "error");
  }
}

function bulkDeleteConfirm() {
  if (selectedIds.size === 0) return;
  showConfirm(
    "Suppression en masse",
    "Supprimer " + selectedIds.size + " avis definitivement ?",
    bulkDeleteExecute,
  );
}

async function bulkDeleteExecute() {
  const ids = Array.from(selectedIds);
  try {
    const res = await adminFetch("/admin/reviews/bulk/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (res.ok) {
      showAdminToast(data.message || "Avis supprimés", "success");
      selectedIds.clear();
      loadAdminReviews(currentPage);
      loadAdminStats();
    } else {
      showAdminToast(data.error || "Erreur", "error");
    }
  } catch (_) {
    showAdminToast("Erreur lors de la suppression", "error");
  }
}

// ── Expose functions to window for onclick handlers ──
window.validateReview = validateReview;
window.toggleFlag = toggleFlag;
window.confirmDelete = confirmDelete;
window.openReplyModal = openReplyModal;
window.toggleSelection = toggleSelection;
window.bulkValidate = bulkValidate;
window.bulkDeleteConfirm = bulkDeleteConfirm;

// ── Export ──

const exportBtn = document.getElementById("export-btn");
if (exportBtn) {
  exportBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const res = await adminFetch("/admin/export/csv");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qreview-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showAdminToast("Export CSV telecharge", "success");
    } catch (_) {
      showAdminToast("Erreur lors de l'export", "error");
    }
  });
}

// ── QR Code ──

async function loadAdminQRCode() {
  const container = document.getElementById("admin-qrcode-container");
  const urlDisplay = document.getElementById("admin-current-url");

  if (!container) return;

  try {
    const response = await adminFetch("/admin/api/qrcode");
    const data = await response.json();
    container.innerHTML = `<img src="${data.qrCode}" alt="QR Code pour QReview" style="animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both; max-width: 200px;">`;
    urlDisplay.textContent = data.url;
  } catch (error) {
    console.error("Error loading QR code:", error);
    container.innerHTML =
      '<p style="color: var(--text-muted);">Erreur lors de la generation du QR code.</p>';
  }
}

// ── QR Code Download ──

async function downloadQRCodePNG() {
  try {
    const response = await adminFetch("/admin/api/qrcode/download");
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qreview-qrcode-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showAdminToast("QR Code PNG téléchargé", "success");
  } catch (error) {
    showAdminToast("Erreur lors du téléchargement PNG", "error");
  }
}

async function downloadQRCodeSVG() {
  try {
    const response = await adminFetch("/admin/api/qrcode/svg");
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qreview-qrcode-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    showAdminToast("QR Code SVG téléchargé", "success");
  } catch (error) {
    showAdminToast("Erreur lors du téléchargement SVG", "error");
  }
}

// Attach event listeners to download buttons
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("download-png-btn")
    ?.addEventListener("click", downloadQRCodePNG);
  document
    .getElementById("download-svg-btn")
    ?.addEventListener("click", downloadQRCodeSVG);
});
