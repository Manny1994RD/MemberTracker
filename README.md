# Faithful 7: Member Tracker (design mockup)

A design sample for a church tracker used **only by leaders**. Members don't log in.

**This is a mockup only.** It has no backend, login or saving, and all data is sample data.

Open `mockup/index.html` in a browser. A toolbar at the top switches between:
- **3 design options:** `1 · 8-Bit`, `2 · Soft 3D` (rounded and friendly, Pixar-like), `3 · Clean` (simple and professional)
- **Language:** English / Español

## Structure
**Region** (Santiago) → **Branches** (Santiago, La Vega, Moca, Puerto Plata, Jarabacoa) → **Teams** (optional) → **Members**

## 1. Overseer (Jefe de Templo): Santiago Region
The region tracks General Assembly goals for each branch. Every goal counts **people**:
- **Simple Preaching:** people preached to
- **Meaningful Preaching:** people who came to study
- **Attendance:** people attending
- **Tithe:** people tithing (not an amount of money)
- **Fruit:** souls baptized

Who can do what:
- **Overseer (Jefe de Templo):** edits any branch.
- **Branch leader:** edits their own branch and sets up its teams.
- **Team leaders:** edit their own members. They can view the region but not edit it.

## 2. Branch
A branch can join in one of two ways:
- **Branch only:** it enters its totals and sees results.
- **Teams:** it sets up member profiles, and each team leader updates their own members.

The branch splits its **fruit goal** across its teams, and the teams' fruit adds up to the branch total.

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
