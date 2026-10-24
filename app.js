/* GitFinder — reads GitHub's public REST API directly (unauthenticated, 60 req/h per IP).
   No dependencies, no build step.

   One profile call + one repository call per search:
   the profile drives the card, the repository list drives the stars total, the
   language mix and the Recent / Starred tabs. */

const API = "https://api.github.com";
const RECENT_KEY = "gitfinder.recent";
const RECENT_MAX = 6;
const REPO_PAGE = 100;

// GitHub's own language colours, extended with a hash fallback for everything else.
const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572a5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Go: "#00add8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Shell: "#89e051",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  "Jupyter Notebook": "#da5b0b",
  Lua: "#000080",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  "Objective-C": "#438eff",
  R: "#198ce7",
  Perl: "#0298c3",
  TeX: "#3d6117",
  Zig: "#ec915c",
  Assembly: "#6e4c13"
};

const searchBtn = document.getElementById("search-btn");
const usernameInput = document.getElementById("username-input");
const loadingEl = document.getElementById("loading");
const errorBox = document.getElementById("error-box");
const errorMessage = document.getElementById("error-message");
const profileCard = document.getElementById("profile-card");
const reposBlock = document.getElementById("repos-block");
const reposList = document.getElementById("repos-list");
const reposFoot = document.getElementById("repos-foot");
const langMix = document.getElementById("lang-mix");
const langBar = document.getElementById("lang-bar");
const langLegend = document.getElementById("lang-legend");
const recentRow = document.getElementById("recent-row");
const recentChips = document.getElementById("recent-chips");

let errorTimer = null;
let busy = false;
let loadedRepos = [];
let repoSort = "updated";

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

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
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

/* A stable colour per language: GitHub's palette first, then a hashed hue. */
function languageColor(name) {
  if (LANGUAGE_COLORS[name]) return LANGUAGE_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return "hsl(" + hash + ", 58%, 52%)";
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

/* ── rendering: profile ── */
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
  setText("stat-stars", "—");

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

/* ── rendering: language mix ── */
function buildLanguageMix(repos) {
  const counts = new Map();
  let considered = 0;

  repos.forEach((repo) => {
    if (repo.fork || !repo.language) return;
    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
    considered += 1;
  });

  if (considered === 0) return [];

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, share: (count / considered) * 100 }));
}

function renderLanguageMix(repos) {
  const mix = buildLanguageMix(repos);
  langBar.replaceChildren();
  langLegend.replaceChildren();

  if (mix.length === 0) {
    langMix.setAttribute("hidden", "");
    return;
  }

  mix.forEach((entry) => {
    const slice = document.createElement("span");
    slice.className = "lang-slice";
    slice.style.width = entry.share.toFixed(1) + "%";
    slice.style.background = languageColor(entry.name);
    slice.title = `${entry.name} — ${entry.count} repo${entry.count === 1 ? "" : "s"}`;
    langBar.appendChild(slice);

    const item = document.createElement("span");
    item.className = "lang-legend-item";

    const dot = document.createElement("span");
    dot.className = "lang-dot";
    dot.style.background = languageColor(entry.name);

    const label = document.createElement("span");
    label.className = "lang-name";
    label.textContent = entry.name;

    const value = document.createElement("span");
    value.className = "lang-value";
    value.textContent = Math.round(entry.share) + "%";

    item.append(dot, label, value);
    langLegend.appendChild(item);
  });

  langMix.removeAttribute("hidden");
}

/* ── rendering: repository list ── */
function renderRepos() {
  if (loadedRepos.length === 0) {
    reposBlock.setAttribute("hidden", "");
    reposList.replaceChildren();
    reposFoot.textContent = "";
    return;
  }

  const sorted = loadedRepos.slice().sort((a, b) => {
    if (repoSort === "stars") {
      return (
        b.stargazers_count - a.stargazers_count ||
        new Date(b.updated_at) - new Date(a.updated_at)
      );
    }
    return new Date(b.updated_at) - new Date(a.updated_at);
  });

  const shown = sorted.slice(0, 5);
  reposList.replaceChildren();

  shown.forEach((repo) => {
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
      lang.className = "repo-lang";

      const dot = document.createElement("span");
      dot.className = "repo-lang-dot";
      dot.style.background = languageColor(repo.language);

      lang.append(dot, document.createTextNode(repo.language));
      meta.appendChild(lang);
    }

    const stars = document.createElement("span");
    stars.textContent = "★ " + formatCount(repo.stargazers_count);
    meta.appendChild(stars);

    if (repoSort === "updated") {
      const when = document.createElement("span");
      when.className = "repo-when";
      when.textContent = timeAgo(repo.updated_at);
      meta.appendChild(when);
    }

    item.append(name, meta);
    reposList.appendChild(item);
  });

  reposBlock.removeAttribute("hidden");

  const totalStars = loadedRepos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
  setText("stat-stars", formatCount(totalStars));

  reposFoot.textContent =
    `Top ${shown.length} of ${loadedRepos.length} loaded · ${formatCount(totalStars)} stars in total.` +
    (loadedRepos.length >= REPO_PAGE
      ? ` Based on the ${REPO_PAGE} most recently updated repositories.`
      : "");
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

function resetRepos() {
  loadedRepos = [];
  repoSort = "updated";
  reposBlock.setAttribute("hidden", "");
  reposList.replaceChildren();
  reposFoot.textContent = "";
  langMix.setAttribute("hidden", "");
  document.querySelectorAll(".repo-tab").forEach((tab) => {
    const active = tab.dataset.sort === "updated";
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
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
  resetRepos();
  usernameInput.value = username;

  try {
    const data = await fetchJson(`${API}/users/${encodeURIComponent(username)}`);
    renderProfile(data);
    saveRecent(data.login);

    // The repository call is the interesting extra — the profile stays useful if it fails.
    try {
      const repos = await fetchJson(
        `${API}/users/${encodeURIComponent(data.login)}/repos` +
          `?sort=updated&per_page=${REPO_PAGE}&type=owner`
      );
      loadedRepos = Array.isArray(repos) ? repos : [];
      renderLanguageMix(loadedRepos);
      renderRepos();
    } catch {
      resetRepos();
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

reposBlock.addEventListener("click", (event) => {
  const tab = event.target.closest(".repo-tab");
  if (!tab) return;

  repoSort = tab.dataset.sort === "stars" ? "stars" : "updated";
  document.querySelectorAll(".repo-tab").forEach((other) => {
    const active = other === tab;
    other.classList.toggle("is-active", active);
    other.setAttribute("aria-selected", String(active));
  });
  renderRepos();
});

/* ── boot ── */
renderRecent();
window.addEventListener("DOMContentLoaded", () => {
  const defaultUser = "hola-mundo999";
  if (!usernameInput.value) usernameInput.value = defaultUser;
  fetchGitHubUser(defaultUser);
});
