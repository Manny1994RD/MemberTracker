# Church Status

## Live demo (`demo/`)
A working demo in the Clean design, published as a claude.ai page with a shared live database. What one person changes shows up on everyone's screen within a second or two.
- `demo/app.src.html` is the source; run `python3 demo/build.py` to build `demo/app.html` (the published page) and `demo/index.html` (a file you can open in a browser, which runs offline with example data).
- Roles: switch with **Viewing as** at the top. The Jefe de Templo sees the region, the monthly report and Santiago's teams. A team leader sees only their own team, plus the region as view only.
- **Reset demo data** (bottom of the page, owner only) puts the example data back.

# Design mockup (`mockup/`)

A design sample for a church tracker used **only by leaders**. Members don't log in.

**This is a mockup only.** It has no backend, login or saving, and all data is sample data.

Open `mockup/index.html` in a browser. It's clickable: click boxes in the team table, or use + and − on the phone, and the totals and plants update. A toolbar at the top switches between:
- **3 design options:** `1 · 8-Bit`, `2 · Soft 3D` (rounded and friendly, Pixar-like), `3 · Clean` (simple and professional)
- **Language:** English / Español

## Structure
**Region** (Santiago) → **Branches** (Santiago, La Vega, Moca, Puerto Plata, Jarabacoa) → **Teams** (optional) → **Members**

## Who logs in
Only two kinds of people have a login:
- **Jefe de Templo (overseer):** sets the General Assembly goals, enters every branch's monthly report, and creates the logins for Santiago's team leaders.
- **Santiago team leaders:** one login each. They keep their members' profiles and update each member's 7 monthly goals.

Branch leaders and members don't log in. The setup is built for the Santiago region only, but it leaves room to add other regions later.

## 1. Santiago Region dashboard
It shows each branch's results against its goals, with a **Monthly / Quarterly / Yearly** switch. Every goal counts **people**:
- **Simple Preaching:** people preached to
- **Meaningful Preaching:** people who came to study
- **Attendance:** people attending
- **Tithe:** people tithing (not an amount of money)
- **Fruit:** souls baptized

The Jefe de Templo enters the monthly numbers for La Vega, Moca, Puerto Plata and Jarabacoa. Santiago's numbers come from its teams.

## 2. Santiago Teams
The Jefe de Templo adds team leaders and splits Santiago's yearly fruit goal between the teams. The teams' fruit adds up to the branch total.

## 3. Team leader
The team leader fills in each member's month and sees the whole team.

Each member has 7 monthly goals:
1. Attendance (the leader picks a goal of 1–4 times)
2. Tithe
3. EduLMS
4. GA Signature (General Assembly)
5. Online Mission (3x)
6. Preached (3x)
7. Preparation Day

The team leader's page also has:
- The team's **fruit goal**, assigned by the branch.
- An optional **custom team name**, e.g. "Los Valientes". It is shown instead of "Team 3 · Leader name".
- **Team health shown as a plant.** It grows from a seed to full bloom as members complete their goals, and droops when they fall behind.

## Screenshots
`mockup/screenshots/<style>-<language>/` has one folder per style and language: `pixel`, `soft` or `clean`, in `en` or `es`. Each folder has these screenshots:

| File | Screen |
|---|---|
| `desktopRegion.png` | Overseer region dashboard (computer) |
| `desktopBranch.png` | Branch with its teams and fruit split (computer) |
| `desktopGroup.png` | Team leader dashboard (computer) |
| `phoneUpdate.png` | Team leader updates a member (phone) |
| `phoneGroup.png` | Team overview (phone) |
| `phoneRegion.png` | Region goals, view only (phone) |
