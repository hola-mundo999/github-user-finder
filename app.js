/* GitFinder — reads GitHub's public REST API directly (unauthenticated, 60 req/h per IP).
   No dependencies, no build step. */

const API = "https://api.github.com";
const RECENT_KEY = "gitfinder.recent";
const RECENT_MAX = 6;

const searchBtn = document.getElementById("search-btn");
const usernameInput = document.getElementById("username-input");
const loadingEl = document.getElementById("loading");
const errorBox = document.getElementById("error-box");
const errorMessage = document.getElementById("error-message");
const profileCard = document.getElementById("profile-card");
const reposBlock = document.getElementById("repos-block");
const reposList = document.getElementById("repos-list");
const recentRow = document.getElementById("recent-row");
const recentChips = document.getElementById("recent-chips");

let errorTimer = null;
let busy = false;

/* ── small helpers ── */
function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function formatCount(n) {
  return typeof n === "number" ? n.toLocaleString("en-US") : "—";
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function normalizeUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : "https://" + url;
}

function normalizeUsername(raw) {
  return (raw || "").trim().replace(/^@+/, "").trim();
}

function isValidUsername(name) {
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(name);
}

/* ── UI state ── */
function showLoading() {
  loadingEl.removeAttribute("hidden");
  searchBtn.disabled = true;
  busy = true;
}

function hideLoading() {
  loadingEl.setAttribute("hidden", "");
  searchBtn.disabled = false;
  busy = false;
}

function showError(message) {
  errorMessage.textContent = message;
  errorBox.removeAttribute("hidden");
  clearTimeout(errorTimer);
  errorTimer = setTimeout(hideError, 6000);
}

function hideError() {
  errorBox.setAttribute("hidden", "");
  clearTimeout(errorTimer);
}

/* ── recent searches ── */
function getRecent() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveRecent(login) {
  let recent = getRecent().filter((name) => name.toLowerCase() !== login.toLowerCase());
  recent.unshift(login);
  if (recent.length > RECENT_MAX) recent = recent.slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch { /* storage may be blocked — recent searches are optional */ }
  renderRecent();
}

function renderRecent() {
  const recent = getRecent();
  if (recent.length === 0) {
    recentRow.setAttribute("hidden", "");
    recentChips.replaceChildren();
    return;
  }

  recentRow.removeAttribute("hidden");
  recentChips.replaceChildren();
  recent.forEach((login) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recent-chip";
    chip.textContent = "@" + login;
    chip.addEventListener("click", () => {
      usernameInput.value = login;
      fetchGitHubUser(login);
    });
    recentChips.appendChild(chip);
  });
}

/* ── rendering ── */
function renderProfile(data) {
  const avatar = document.getElementById("avatar");
  avatar.src = data.avatar_url;
  avatar.alt = `Avatar of ${data.name || data.login}`;

  setText("profile-name", data.name || data.login);
  const login = document.getElementById("profile-login");
  login.textContent = `@${data.login}`;
  login.href = data.html_url;

  const bio = document.getElementById("profile-bio");
  bio.textContent = data.bio || "No bio provided";

  setText("stat-repos", formatCount(data.public_repos));
  setText("stat-followers", formatCount(data.followers));
  setText("stat-following", formatCount(data.following));

  setText("location-text", data.location || "No location provided");
  setText("company-text", data.company || "Not available");
  setText("joined-text", "Joined " + formatDate(data.created_at));

  const blogWrap = document.getElementById("blog-text");
  blogWrap.replaceChildren();
  if (data.blog) {
    const link = document.createElement("a");
    link.href = normalizeUrl(data.blog);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = data.blog;
    blogWrap.appendChild(link);
  } else {
    blogWrap.textContent = "Not available";
  }

  document.getElementById("view-btn").href = data.html_url;
  profileCard.removeAttribute("hidden");
}

function renderRepos(repos) {
  if (!Array.isArray(repos) || repos.length === 0) {
    reposBlock.setAttribute("hidden", "");
    return;
  }

  reposList.replaceChildren();
  repos.forEach((repo) => {
    const item = document.createElement("a");
    item.className = "repo-item";
    item.href = repo.html_url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";

    const name = document.createElement("span");
    name.className = "repo-name";
    name.textContent = repo.name;

    const meta = document.createElement("span");
    meta.className = "repo-meta";
    if (repo.language) {
      const lang = document.createElement("span");
      lang.textContent = repo.language;
      meta.appendChild(lang);
    }
    const stars = document.createElement("span");
    stars.textContent = "★ " + formatCount(repo.stargazers_count);
    meta.appendChild(stars);

    item.append(name, meta);
    reposList.appendChild(item);
  });

  reposBlock.removeAttribute("hidden");
}

/* ── data ── */
async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });

  if (response.status === 404) {
    const error = new Error("not-found");
    error.name = "NotFoundError";
    throw error;
  }
  if (response.status === 403 || response.status === 429) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const minutes = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : null;
    const error = new Error("rate-limited");
    error.name = "RateLimitError";
    error.minutes = minutes;
    throw error;
  }
  if (!response.ok) {
    throw new Error("GitHub answered with status " + response.status + ".");
  }
  return response.json();
}

async function fetchGitHubUser(rawUsername) {
  const username = normalizeUsername(rawUsername);

  if (!username) {
    showError("Type a GitHub username first.");
    usernameInput.focus();
    return;
  }
  if (!isValidUsername(username)) {
    showError(`“${username}” is not a valid GitHub username.`);
    return;
  }
  if (busy) return;

  hideError();
  showLoading();
  reposBlock.setAttribute("hidden", "");
  usernameInput.value = username;

  try {
    const data = await fetchJson(`${API}/users/${encodeURIComponent(username)}`);
    renderProfile(data);
    saveRecent(data.login);

    // Latest repos are a bonus — the profile stays useful if this call fails.
    try {
      const repos = await fetchJson(
        `${API}/users/${encodeURIComponent(data.login)}/repos?sort=updated&per_page=3&type=owner`
      );
      renderRepos(repos);
    } catch {
      reposBlock.setAttribute("hidden", "");
    }
  } catch (error) {
    if (error.name === "NotFoundError") {
      showError(`No GitHub user named “${username}”.`);
    } else if (error.name === "RateLimitError") {
      showError(
        "GitHub's public API limit is reached for now" +
          (error.minutes ? ` — try again in about ${error.minutes} min.` : " — try again shortly.")
      );
    } else if (error instanceof TypeError) {
      showError("Couldn't reach GitHub. Check your connection and try again.");
    } else {
      showError(error.message || "Something went wrong. Try again.");
    }
  } finally {
    hideLoading();
  }
}

/* ── events ── */
searchBtn.addEventListener("click", () => fetchGitHubUser(usernameInput.value));

usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchGitHubUser(usernameInput.value);
});

usernameInput.addEventListener("input", hideError);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    usernameInput.value = chip.dataset.username;
    fetchGitHubUser(chip.dataset.username);
  });
});

/* ── boot ── */
renderRecent();
window.addEventListener("DOMContentLoaded", () => {
  const defaultUser = "hola-mundo999";
  if (!usernameInput.value) usernameInput.value = defaultUser;
  fetchGitHubUser(defaultUser);
});
