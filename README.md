# This Is Lagos — playable web prototype

A first playable browser prototype for the This Is Lagos project.

## Run locally
Because this project uses JavaScript modules, run it from a local web server rather than opening `index.html` directly.

### Easiest option
- Install Visual Studio Code.
- Install the **Live Server** extension.
- Open this folder in VS Code.
- Right-click `index.html` and choose **Open with Live Server**.

Or use Python:
```bash
python -m http.server 8000
```
Then visit http://localhost:8000

## Publish with GitHub Pages
1. Create a GitHub repository, for example `this-is-lagos`.
2. Upload `index.html`, `style.css`, and `game.js` to the repository root.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then Save.
6. Wait for GitHub to publish the site. Your URL will be `https://YOUR-USERNAME.github.io/this-is-lagos/`.

## Current prototype features
- 3D Lagos-inspired street environment and buildings
- Basic third-person player movement
- Selectable third-person, first-person and isometric camera
- Simulated in-game clock and day/night lighting
- Clear/rain weather toggle and animated rain
- Responsive interface and basic touch movement controls
- Profile name editing (local session only)

## Important
This is an early client-side prototype. It does **not** yet include online multiplayer, accounts, persistent profiles, real Lagos geospatial data, professions, chat, payment processing, real-money wallets, or production infrastructure. Those require separate backend services, security work, moderation, and legal/payment compliance. A five-million-concurrent-user target requires a major distributed infrastructure project; it is not provided by GitHub Pages.
