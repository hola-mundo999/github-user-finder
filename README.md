# GitHub Profile Finder

Search any GitHub username and see the person behind it: avatar, bio, repositories, followers,
location, company, blog and join date — straight from GitHub's public API, no key or build step.

## Features

- Search any GitHub user by username (`@` prefix accepted, malformed names rejected up front)
- Profile card: avatar, name, bio, repos / followers / following counts
- Info grid: location, website (a real, clickable link), join date, company
- **Latest repositories** — the three most recently updated public repos with language and stars
- **Recent searches** saved in `localStorage` and one click to revisit
- Loading indicator, disabled button while a request is in flight
- Honest error messages: empty input, invalid username, unknown user, API rate limit (with the
  minutes left), and offline/network failures
- Fully responsive, keyboard friendly (Enter submits)

## Built With

- HTML5
- CSS3 (3D card depth, grid backdrop, animations, responsive design)
- Vanilla JavaScript (Fetch API, async/await)
- [GitHub REST API](https://docs.github.com/rest/users/users) — public, unauthenticated

## Notes

GitHub allows **60 unauthenticated requests per hour per IP**, and each search uses two (profile +
latest repos). When the limit is hit the app says so and when it resets, instead of pretending the
user does not exist.

## What I Learned

- `fetch` + `async/await` with status-aware error handling (404 vs 403 vs network failure)
- Reading response headers (`x-ratelimit-reset`) for user-facing messages
- DOM rendering of nested, dynamic content without any framework
- Persisting small state (`localStorage`) and keeping the UI and storage in sync
