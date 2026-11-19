# Church Status

Monthly goals dashboard for the **Santiago region**, in Spanish and English, with the Clean design.

Every branch (Santiago, La Vega, Moca, Jarabacoa, Puerto Plata) is organized as **branch → group → team → members**. The teams and members can be imported from the church directory in Excel.

- **App code (1925 to start):** opens the region results, the monthly reports, the teams overview and settings.
- **Group codes:** each group has one code that opens all of its teams. Its group leader and team leaders use it to update their teams.
- A team's members and adjustments only open with its group's code.
- Codes are typed on a number keypad. There are no usernames or passwords.
- Members and branch leaders don't use the app.
- Changes show up live on everyone's screen.

It's a small Node.js server with a built-in SQLite database (one file). It needs no npm packages.

---

## Install on ZimaOS

You need the app's Docker image published on GitHub first. See [Publish the image from GitHub](#publish-the-image-from-github), which you only do once.

1. Open the ZimaOS dashboard, go to **App Store**, and click **+** (top right), then **Install a customized app**. The wording can differ slightly between ZimaOS versions.
2. Click **Import** (top right), paste the contents of [`docker-compose.yml`](docker-compose.yml), and click **Submit**, then **Install**.
3. When it's running, open `http://<your-zima-ip>:8383`.
4. Enter the app code **1925**. Then go to **Ajustes** and change it to your own.
5. Optional: in **Ajustes → Datos de ejemplo**, load example branches, teams and members to try the app. The example teams' codes are 1111, 2222, 3333, 4444 and 5555. **Empezar vacío** erases everything when you're ready to use it for real.

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
| App code | **Región** (results by month, quarter or year), **Reporte mensual**, **Equipos** (by branch and group; each team opens with its code), **Ajustes** |
| Group code | Every team in that group (members' 7 goals, fruit, adjustments) and **Región** (view only) |

- **Branches and goals:** Santiago, La Vega, Moca, Puerto Plata and Jarabacoa are created at setup. You can rename, add or remove branches in **Ajustes**.
  - A branch's fruit adds up from its teams. A branch without teams enters its fruit in the monthly report.
  - Attendance and tithe goals are *people per month*. On the quarterly and yearly views they show the monthly average.
  - Preaching and fruit goals are *per year*. Each month's goal is one twelfth.
- **The 7 monthly goals:** Attendance (the team picks 1–4 times), Tithe, EduLMS, GA Signature, Online Mission (3x), Preached (3x) and Preparation Day.
- **Importing from Excel** (**Ajustes → Importar equipos desde Excel**):
  - **File layout:** one sheet per branch, named like the branch. Inside it, a group title such as `ADULTAS · ROSA GUZMÁN`, then a row of `EQUIPO 1`, `EQUIPO 2`… headings with each team's members listed below. A count like `6 integrantes` ends a column.
  - **Santiago's planned groups:** columns under `PLANIFICACIÓN DE FUTUROS GRUPOS` / `FUTURO GRUPO · …` become future groups, marked "Futuro grupo".
  - **Notes beside names:** text in parentheses becomes a label, for example `(Ayudante)`. A `(Tl…)` label also marks that person as the team leader.
  - **Team leader listed twice:** if a team's first name appears twice in its list, that person is imported once, as the team leader.
  - **Column without a heading:** if a column has names but no `EQUIPO n` heading and no count of its own, those names join the team on its left. If it has its own count, it becomes the next team.
  - **Ignored:** sheets without `EQUIPO n` headings, like "Resumen General" and "Comités".
  - **Preview first:** you see a summary per branch and anything to check in the Excel (a name twice in one team, a column without a heading) before anything changes.
  - **Agregar y actualizar** adds what's new and keeps everything already in the app: goals, codes, and people added in the app. Import an updated Excel this way whenever the directory changes.
  - **Reemplazar** removes all groups, teams, members and their codes first.
- **Codes:**
  - **App code:** opens everything except team members. Change it in **Ajustes → Código de la app**. To start with a different code than 1925 on a new install, set `APP_CODE` in the compose file.
  - **Group codes:** opening a team from **Equipos** asks for its group's code, even with the app code. A leader can also type the group code on the first screen to go straight to the group's teams. They then see only those teams and the region results.
  - **Crear los códigos que faltan** (in **Ajustes → Códigos de grupo**) gives every group without a code a random 4-digit code, one per group, and shows the list once to copy or write down.
  - **Replacing a code:** use the same Ajustes section, **Grupo** on a group in **Equipos**, or **Ajustes del equipo** on a team's page. The change applies to the whole group.
  - Every code is 4 to 8 digits and must be different from all the others.
  - After 8 wrong codes from one device, or 40 in total, entering a code pauses for 15 minutes.
  - Codes are stored scrambled, so they can be replaced but never shown.
  - **Cerrar** (top right) locks the app again on that device.
- **Backups:** in **Ajustes → Copia de seguridad**, download a JSON file of all reports, groups, teams and members, or restore one. Codes aren't included. You can also copy `/DATA/AppData/church-status` while the app is stopped.

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
| `APP_CODE` | `1925` | The app code on a new install. After that, change it in Ajustes |
| `SECURE_COOKIES` | `false` | `true` when the app is served over HTTPS |
| `TZ` | system | Time zone, used for the current month |

## Project layout

| Path | What it is |
|---|---|
| `server/` | API, access codes, permissions, live updates, database |
| `public/` | The web app (HTML, CSS, JavaScript, icons) |
| `test/` | API tests (`npm test`) |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.build.yml` | Docker and ZimaOS setup |
| `.github/workflows/` | Builds and publishes the Docker image |
| `mockup/`, `demo/` | Earlier design mockup (3 styles) and the claude.ai live demo, kept for reference |
