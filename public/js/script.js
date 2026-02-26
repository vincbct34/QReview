/**
 * QReview — Frontend
 */

// ── State ──
let currentPage = 1;
let currentSort = "date_desc";
let currentCompany = "";
let debounceTimer = null;
let linkedinData = null; // Stores LinkedIn profile data after authentication

// ── Theme toggle ──

function initTheme() {
  const saved = localStorage.getItem("qreview_theme");
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  if (current === "light") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("qreview_theme", "dark");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("qreview_theme", "light");
  }
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  const isLight =
    document.documentElement.getAttribute("data-theme") === "light";
  btn.querySelector(".theme-icon").innerHTML = isLight ? "&#9728;" : "&#9790;";
}

// Apply theme immediately (before DOMContentLoaded to avoid flash)
initTheme();

// ── LinkedIn OAuth ──

function initLinkedIn() {
  // Check if returning from LinkedIn OAuth
  const urlParams = new URLSearchParams(window.location.search);
  const linkedinDataParam = urlParams.get("linkedin_data");
  const errorParam = urlParams.get("error");
  const errorDetails = urlParams.get("details");

  // Handle errors
  if (errorParam === "linkedin_auth_failed") {
    const errorMsg = errorDetails
      ? `Erreur LinkedIn: ${decodeURIComponent(errorDetails)}`
      : "Échec de l'authentification LinkedIn. Vérifiez votre configuration.";
    showToast(errorMsg, "error", 10000);
    console.error("LinkedIn auth error:", errorDetails);

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (linkedinDataParam) {
    try {
      linkedinData = JSON.parse(decodeURIComponent(linkedinDataParam));
      populateFormWithLinkedIn(linkedinData);
      showLinkedInStatus(linkedinData);

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      showToast(
        "Connecté avec LinkedIn ! Vos informations ont été pré-remplies.",
        "success",
        5000,
      );
    } catch (e) {
      console.error("Failed to parse LinkedIn data:", e);
    }
  }

  // LinkedIn connect button
  const linkedinBtn = document.getElementById("linkedin-connect-btn");
  if (linkedinBtn) {
    linkedinBtn.addEventListener("click", () => {
      window.location.href = "/auth/linkedin";
    });
  }
}

function populateFormWithLinkedIn(data) {
  // Pre-fill email
  const emailInput = document.getElementById("email");
  if (emailInput && data.email) {
    emailInput.value = data.email;
    emailInput.classList.add("valid");
    emailInput.readOnly = true; // Lock field
  }

  // Pre-fill author name
  const authorNameInput = document.getElementById("author_name");
  const authorNameHelp = document.getElementById("author-name-help");
  if (authorNameInput && data.firstName && data.lastName) {
    const fullName = `${data.firstName} ${data.lastName}`;
    authorNameInput.value = fullName;
    authorNameInput.classList.add("valid");
    authorNameInput.readOnly = true; // Lock field
    if (authorNameHelp) {
      authorNameHelp.textContent =
        "Verifie via LinkedIn - sera affiche publiquement";
      authorNameHelp.style.color = "var(--primary)";
    }
  }

  // Show LinkedIn verified indicator
  const form = document.getElementById("review-form");
  if (form) {
    form.dataset.linkedinVerified = "true";
  }
}

function showLinkedInStatus(data) {
  const statusDiv = document.getElementById("linkedin-status");
  const connectBtn = document.getElementById("linkedin-connect-btn");

  if (statusDiv && data) {
    statusDiv.innerHTML = `
      <div class="linkedin-status success">
        ✓ Connecté en tant que <span class="linkedin-name">${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</span>
        ${data.profileUrl ? `<a href="${escapeHtml(data.profileUrl)}" target="_blank" style="margin-left:8px;color:var(--primary);">Voir profil</a>` : ""}
      </div>
    `;
    statusDiv.style.display = "block";
  }

  if (connectBtn) {
    connectBtn.style.display = "none";
  }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  loadReviews();
  initSiretInput();
  initFormValidation();
  initSortAndSearch();
  initIntersectionObserver();
  initCommentCounter();
  initLinkedIn();
  initRatingInteraction();

  // Theme toggle button
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // Dynamic footer year
  const yearEl = document.getElementById("footer-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
});

// ── Toast notifications ──

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
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

// ── Statistics ──

async function loadStats() {
  try {
    const res = await fetch("/api/reviews/stats");
    const stats = await res.json();

    if (!stats || stats.total_reviews == 0) {
      document.getElementById("stats-section").style.display = "none";
      // Also hide controls when no reviews
      const controlsCard = document.querySelector(".controls-card");
      if (controlsCard) controlsCard.style.display = "none";
      return;
    }

    const section = document.getElementById("stats-section");
    section.style.display = "";
    const controlsCard = document.querySelector(".controls-card");
    if (controlsCard) controlsCard.style.display = "";

    document.getElementById("stats-avg").textContent =
      stats.average_rating || "-";

    const avgRating = parseFloat(stats.average_rating) || 0;
    const fullStars = Math.floor(avgRating);
    const emptyStars = 5 - fullStars;
    document.getElementById("stats-avg-stars").innerHTML =
      "\u2605".repeat(fullStars) + "\u2606".repeat(emptyStars);

    document.getElementById("stats-total").textContent =
      `${stats.total_reviews} avis` +
      (stats.verified_count > 0
        ? ` \u00B7 ${stats.verified_count} verifiés`
        : "");

    // Rating bars
    const total = parseInt(stats.total_reviews) || 1;
    const barsContainer = document.getElementById("stats-bars");
    barsContainer.innerHTML = "";
    for (let i = 5; i >= 1; i--) {
      const count = parseInt(stats[`stars_${i}`]) || 0;
      const pct = Math.round((count / total) * 100);
      barsContainer.innerHTML += `
        <div class="stats-bar-row">
          <span>${i}</span>
          <div class="stats-bar-track"><div class="stats-bar-fill" style="width: ${pct}%"></div></div>
          <span>${count}</span>
        </div>
      `;
    }
  } catch (_) {}
}

// ── Reviews with pagination, sort & filter ──

async function loadReviews(page = 1) {
  currentPage = page;
  const reviewsList = document.getElementById("reviews-list");

  // Show skeleton loading during page transitions
  reviewsList.innerHTML = `
    <div class="skeleton-card"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div><div class="skeleton-line w80"></div></div>
    <div class="skeleton-card"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div><div class="skeleton-line w80"></div></div>
    <div class="skeleton-card"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div><div class="skeleton-line w80"></div></div>
  `;

  try {
    const params = new URLSearchParams({
      page,
      limit: 20,
      sort: currentSort,
    });
    if (currentCompany) params.set("company", currentCompany);

    const response = await fetch(`/api/reviews?${params}`);
    const data = await response.json();
    const reviews = data.reviews || data;
    const totalPages = data.totalPages || 1;

    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML =
        '<p class="no-reviews">Aucun avis publie pour le moment. Soyez le premier a laisser votre avis !</p>';
      document.getElementById("reviews-pagination").innerHTML = "";
      return;
    }

    reviewsList.innerHTML = reviews
      .map(
        (review, index) => `
      <div class="review-card" style="animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.06}s both">
        <div class="review-header">
          <span class="company-name">
            <a href="/company/${encodeURIComponent(review.company_name)}" class="company-link">${escapeHtml(review.company_name)}</a>
            ${
              review.author_name
                ? `
              <span class="review-author">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                </svg>
                ${escapeHtml(review.author_name)}
              </span>
            `
                : ""
            }
            ${
              review.company_verified
                ? `
              <span class="verified-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                  <path d="M9 12l2 2 4-4"/>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Verifiée
              </span>
            `
                : ""
            }
            ${
              review.linkedin_verified
                ? `
              <span class="verified-badge" style="background: linear-gradient(135deg, #0077B5 0%, #005885 100%);" title="Identite LinkedIn verifiée">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                LinkedIn
              </span>
            `
                : ""
            }
          </span>
          <span class="review-stars">${"\u2605".repeat(review.rating)}${"\u2606".repeat(5 - review.rating)}</span>
        </div>
        <div class="review-meta">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
            </svg>
            ${escapeHtml(review.position)}
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            ${escapeHtml(review.duration)}
          </span>
        </div>
        ${review.comment ? `<p class="review-comment">${escapeHtml(review.comment)}</p>` : ""}
        ${
          review.admin_reply
            ? `
          <div class="review-reply">
            <strong>Reponse du proprietaire</strong>
            <p>${escapeHtml(review.admin_reply)}</p>
          </div>
        `
            : ""
        }
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="review-date"><a href="/review/${review.id}" class="permalink-link" title="Lien permanent">#${review.id}</a> &middot; ${timeAgo(review.created_at)}</span>
          <button class="flag-btn" data-flag-id="${review.id}" onclick="flagReview(${review.id})" aria-label="Signaler cet avis" title="Signaler">&#9873; Signaler</button>
        </div>
      </div>
    `,
      )
      .join("");

    // Pagination
    renderPagination(totalPages, currentPage);
  } catch (error) {
    console.error("Error loading reviews:", error);
    reviewsList.innerHTML =
      '<p class="loading">Erreur lors du chargement des avis.</p>';
  }
}

function renderPagination(totalPages, current) {
  const container = document.getElementById("reviews-pagination");
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = `<button class="page-btn" onclick="loadReviews(${current - 1})" ${current <= 1 ? "disabled" : ""}>\u2190</button>`;
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? "active" : ""}" onclick="loadReviews(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="loadReviews(${current + 1})" ${current >= totalPages ? "disabled" : ""}>\u2192</button>`;
  container.innerHTML = html;
}

// ── Sort & Search ──

function initSortAndSearch() {
  const sortSelect = document.getElementById("sort-select");
  const searchInput = document.getElementById("company-search");

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value;
      loadReviews(1);
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentCompany = searchInput.value.trim();
        loadReviews(1);
      }, 400);
    });
  }
}

// ── Flag review ──

async function flagReview(id) {
  try {
    // Disable the button immediately to prevent double-flag
    const btn = document.querySelector(`[data-flag-id="${id}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "\u2713 Signale";
      btn.classList.add("flagged");
    }
    const res = await fetch(`/api/reviews/${id}/flag`, { method: "POST" });
    if (res.ok) {
      showToast("Avis signale. Merci pour votre vigilance.", "info");
    } else {
      showToast("Erreur lors du signalement.", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u2691 Signaler";
        btn.classList.remove("flagged");
      }
    }
  } catch (_) {
    showToast("Erreur lors du signalement.", "error");
  }
}

// ── SIRET auto-completion ──

function initSiretInput() {
  const siretInput = document.getElementById("siret");
  const companyInput = document.getElementById("company");
  const statusEl = document.getElementById("siret-status");

  if (!siretInput || !companyInput) return;

  let siretTimer = null;

  siretInput.addEventListener("input", (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 14);
    e.target.value = value;

    clearTimeout(siretTimer);
    statusEl.textContent = "";
    statusEl.className = "siret-status";

    if (value.length === 14) {
      statusEl.textContent = "Verification...";
      statusEl.className = "siret-status checking";

      siretTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/reviews/verify-siret/${value}`);
          const data = await res.json();
          if (data.valid) {
            statusEl.textContent = "\u2713 " + data.company_name;
            statusEl.className = "siret-status valid";
            // Auto-fill company name
            if (
              data.company_name &&
              data.company_name !== "Entreprise verifiée"
            ) {
              companyInput.value = data.company_name;
              companyInput.classList.add("valid");
            }
          } else {
            statusEl.textContent = "\u2717 SIRET non trouve";
            statusEl.className = "siret-status invalid";
          }
        } catch (_) {
          statusEl.textContent = "\u2717 Erreur de verification";
          statusEl.className = "siret-status invalid";
        }
      }, 300);
    }
  });
}

// ── Real-time form validation ──

function initFormValidation() {
  const fields = {
    company: { required: true, maxLength: 255 },
    position: { required: true, maxLength: 255 },
    duration: { required: true, maxLength: 100 },
    email: {
      required: true,
      maxLength: 255,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    author_name: { required: true, maxLength: 255 },
  };

  for (const [id, rules] of Object.entries(fields)) {
    const input = document.getElementById(id);
    const errorEl = document.getElementById(`${id}-error`);
    if (!input) continue;

    input.addEventListener("blur", () => validateField(input, rules, errorEl));
    input.addEventListener("input", () => {
      if (input.classList.contains("invalid")) {
        validateField(input, rules, errorEl);
      }
    });
  }
}

function validateField(input, rules, errorEl) {
  const value = input.value.trim();
  let error = "";

  if (rules.required && !value) {
    error = "Ce champ est requis";
  } else if (rules.maxLength && value.length > rules.maxLength) {
    error = `Maximum ${rules.maxLength} caracteres`;
  } else if (rules.pattern && value && !rules.pattern.test(value)) {
    error = "Format invalide";
  }

  if (error) {
    input.classList.remove("valid");
    input.classList.add("invalid");
    if (errorEl) errorEl.textContent = error;
    return false;
  } else {
    input.classList.remove("invalid");
    if (value) input.classList.add("valid");
    if (errorEl) errorEl.textContent = "";
    return true;
  }
}

// ── Comment character counter ──

function initCommentCounter() {
  const comment = document.getElementById("comment");
  const counter = document.getElementById("comment-count");
  if (!comment || !counter) return;

  comment.addEventListener("input", () => {
    counter.textContent = comment.value.length;
  });
}

// ── Form submission ──

const form = document.getElementById("review-form");
const submitBtn = form.querySelector(".btn-primary");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Honeypot check
  const honeypot = document.getElementById("honeypot");
  if (honeypot && honeypot.value) return;

  const formData = new FormData(e.target);

  // Get rating explicitly to avoid FormData issues with radio buttons
  const checkedRating = document.querySelector('input[name="rating"]:checked');
  const ratingValue = checkedRating ? checkedRating.value : null;

  const data = {
    company_name: formData.get("company"),
    position: formData.get("position"),
    duration: formData.get("duration"),
    email: formData.get("email"),
    author_name: formData.get("author_name"),
    rating: ratingValue,
    comment: formData.get("comment") || null,
    siret: formData.get("siret") || null,
  };

  // Include LinkedIn data if authenticated
  if (linkedinData) {
    data.linkedin_id = linkedinData.id;
    data.linkedin_verified = true;
    data.linkedin_profile_url = linkedinData.profileUrl;
  }

  if (!data.rating) {
    shakeElement(document.querySelector(".rating"));
    const ratingError = document.getElementById("rating-error");
    if (ratingError) ratingError.textContent = "Veuillez selectionner une note";
    return;
  }

  // Loading state
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Envoi...';
  submitBtn.style.transform = "scale(0.98)";

  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to submit review");
    }

    const result = await response.json();

    // Toast notification instead of modal
    let message = "Avis soumis ! ";

    if (result.linkedin_verified) {
      message += "Identite LinkedIn verifiée. ";
    }

    if (result.company_verified) {
      message += "Entreprise verifiée via SIRET. ";
    }

    message += "Il sera publie apres validation.";

    showToast(message, "success", 6000);

    form.reset();
    document
      .querySelectorAll(".form-group input, .form-group textarea")
      .forEach((el) => {
        el.classList.remove("valid", "invalid");
        el.readOnly = false;
      });
    // Reset LinkedIn help text
    const authorNameHelp = document.getElementById("author-name-help");
    if (authorNameHelp) {
      authorNameHelp.textContent = "Sera affiche publiquement sur l'avis";
      authorNameHelp.style.color = "";
    }
    document
      .querySelectorAll(".field-error")
      .forEach((el) => (el.textContent = ""));
    if (document.getElementById("comment-count")) {
      document.getElementById("comment-count").textContent = "0";
    }

    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    submitBtn.style.transform = "";
  } catch (error) {
    console.error("Error submitting review:", error);
    showToast(error.message || "Erreur lors de l'envoi. Reessayez.", "error");

    submitBtn.textContent = "Erreur - Reessayez";
    submitBtn.style.background =
      "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";

    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.style.background = "";
      submitBtn.disabled = false;
      submitBtn.style.transform = "";
    }, 2000);
  }
});

// ── Intersection Observer for scroll animations ──

function initIntersectionObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.animationPlayState = "running";
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );

  document.querySelectorAll(".card").forEach((card) => {
    observer.observe(card);
  });
}

// ── Utility functions ──

function shakeElement(element) {
  if (!element) return;
  element.style.animation = "none";
  element.offsetHeight; // reflow
  element.style.animation = "shakeSpring 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
  setTimeout(() => (element.style.animation = ""), 500);
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

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Rating interaction ──
function initRatingInteraction() {
  const ratingContainer = document.querySelector(".rating");
  if (!ratingContainer) return;

  // Clear error when rating changes
  ratingContainer.querySelectorAll('input[name="rating"]').forEach((input) => {
    input.addEventListener("change", () => {
      const ratingError = document.getElementById("rating-error");
      if (ratingError) ratingError.textContent = "";
      console.log("Rating changed to:", input.value);
    });
  });
}
