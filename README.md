# Church Status

Monthly goals dashboard for the **Santiago region** and its teams, in Spanish and English, with the Clean design.

- **Jefe de Templo:** sets the General Assembly goals, enters each branch's monthly report, and manages teams, PINs and backups.
- **Santiago team leaders:** each has their own PIN. They keep their members' profiles and update each member's 7 monthly goals.
- **Signing in uses a PIN only**, typed on a keypad. There are no usernames or passwords.
- Members and branch leaders don't log in.
- Changes show up live on everyone's screen.

It's a small Node.js server with a built-in SQLite database (one file). It needs no npm packages.

---

## Install on ZimaOS

You need the app's Docker image published on GitHub first. See [Publish the image from GitHub](#publish-the-image-from-github), which you only do once.

1. Open the ZimaOS dashboard, go to **App Store**, and click **+** (top right), then **Install a customized app**. The wording can differ slightly between ZimaOS versions.
2. Click **Import** (top right), paste the contents of [`docker-compose.yml`](docker-compose.yml), and click **Submit**, then **Install**.
3. When it's running, open `http://<your-zima-ip>:8383`.
4. Create the **Jefe de Templo** account with a 6-digit PIN. Tick **Start with example data** if you want to try it with sample branches, teams and members first. The example team leaders sign in with PINs 1111, 2222, 3333, 4444 and 5555.

The data is saved in `/DATA/AppData/church-status` on the ZimaOS drive, so it survives updates and restarts.

**To update to a new version:** download the newest image in the ZimaOS terminal, then restart the app from the ZimaOS dashboard. Your data stays.

```bash
docker pull ghcr.io/manny1994rd/membertracker:latest
```

### Alternative: build it on ZimaOS yourself
If you'd rather not use the published image, open the ZimaOS terminal (or SSH) and run:

```bash
git clone https://github.com/Manny1994RD/MemberTracker.git church-status
```

```bash
cd church-status && docker compose -f docker-compose.build.yml up -d --build
```

### Reaching it from outside your home network
Port 8383 only works on your local network. To reach it from anywhere, use a tunnel such as Tailscale or Cloudflare Tunnel, or a reverse proxy with HTTPS. When the app is served over HTTPS, set `SECURE_COOKIES: "true"` in the compose file.

---

## Publish the image from GitHub

The workflow in `.github/workflows/docker-publish.yml` tests the app, then builds the image for both Intel/AMD and ARM machines. It publishes the image as `ghcr.io/manny1994rd/membertracker`.

1. Merge this work into the **`main`** branch. Every push to `main` publishes `:latest`.
2. Check the run under the repository's **Actions** tab. The first one takes about 3–5 minutes.
3. Make the image public, so ZimaOS can download it without a password:
   1. On GitHub, open your profile, go to **Packages**, and open **membertracker**.
   2. Open **Package settings**, find **Change visibility**, and choose **Public**.

   If you keep it private, you'll need to sign in on ZimaOS first with a GitHub token that has the `read:packages` permission:

   ```bash
   docker login ghcr.io
   ```
4. Optional: to publish a numbered version, push a tag such as `v1.0.0`. That publishes `:v1.0.0`.

---

## Using the app

| Who | What they see |
|---|---|
| Jefe de Templo | **Región** (results by month, quarter or year), **Reporte mensual**, **Equipos**, **Ajustes** |
| Team leader | **Mi equipo** (their members' 7 goals and fruit) and **Región** (view only) |

- **Branches and goals:** Santiago, La Vega, Moca, Puerto Plata and Jarabacoa are created at setup. You can rename, add or remove branches in **Ajustes**.
  - The branch marked **Equipos** reports through its teams, and its fruit adds up from the teams. The other branches get a monthly report.
  - Attendance and tithe goals are *people per month*. On the quarterly and yearly views they show the monthly average.
  - Preaching and fruit goals are *per year*. Each month's goal is one twelfth.
- **The 7 monthly goals:** Attendance (the team picks 1–4 times), Tithe, EduLMS, GA Signature, Online Mission (3x), Preached (3x) and Preparation Day.
- **PINs:**
  - The Jefe de Templo's PIN has 6 digits. Team leaders' PINs have 4 to 8 digits. Every PIN must be different, because the PIN alone tells the app who is signing in.
  - Give a team leader a PIN in **Ajustes → Quién puede entrar**, or when you add a team.
  - Forgotten PIN: the Jefe de Templo sets a new one under **Editar o nuevo PIN**.
  - Everyone can change their own PIN with the **Cambiar PIN** button.
  - After 8 wrong PINs from one device, or 40 in total, signing in pauses for 15 minutes.
  - PINs are stored scrambled, so nobody can read them back, not even the Jefe de Templo.
- **Backups:** in **Ajustes → Copia de seguridad**, download a JSON file of all reports, teams and members, or restore one. PINs aren't included. You can also copy `/DATA/AppData/church-status` while the app is stopped.

---

## Run it on a computer (for development)

Node.js 22.13 or newer is required.

```bash
npm start
```

Then open http://localhost:8080. Data is stored in `./data/church-status.db`.

```bash
npm test
```

Settings (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port the server listens on |
| `DATA_DIR` | `./data` (`/data` in Docker) | Folder for the database file |
| `SECURE_COOKIES` | `false` | `true` when the app is served over HTTPS |
| `TZ` | system | Time zone, used for the current month |

## Project layout

| Path | What it is |
|---|---|
| `server/` | API, PIN sign-in, permissions, live updates, database |
| `public/` | The web app (HTML, CSS, JavaScript, icons) |
| `test/` | API tests (`npm test`) |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.build.yml` | Docker and ZimaOS setup |
| `.github/workflows/` | Builds and publishes the Docker image |
| `mockup/`, `demo/` | Earlier design mockup (3 styles) and the claude.ai live demo, kept for reference |
