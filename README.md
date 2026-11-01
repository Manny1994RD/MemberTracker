# Faithful 7: Member Tracker (design mockup)

A design sample for a church tracker used **only by leaders**. Members don't log in.

**This is a mockup only.** It has no backend, login or saving, and all data is sample data.

Open `mockup/index.html` in a browser. A toolbar at the top switches between:
- **3 design options:** `1 · 8-Bit`, `2 · Soft 3D` (rounded and friendly, Pixar-like), `3 · Clean` (simple and professional)
- **Language:** English / Español

## 1. Group leader
The leader fills in each member's month and sees the whole group.

Each member has 7 monthly goals:
1. Attendance (the leader picks a goal of 1–4 times)
2. Tithe
3. EduLMS
4. GA Signature (General Assembly)
5. Online Mission (3x)
6. Preached (3x)
7. Preparation Day

The page also has:
- The group's **baptism goal**, set by the leader.
- An optional **custom team name**, e.g. "Los Valientes". It is shown instead of "Group 3 · Leader name".
- **Group health shown as a plant.** It grows from a seed to full bloom as members complete their goals, and droops when they fall behind.

## 2. Overseer: Santiago Region
The region tracks General Assembly goals for each branch:
- Simple Preaching
- Meaningful Preaching
- Attendance
- Tithe
- Fruit

Who can do what:
- **Overseer:** edits any branch.
- **Branch leader:** edits their own branch.
- **Group leaders in the region:** view only.

Other regions could use the same setup.

## Screenshots
`mockup/screenshots/<style>-<language>/` contains one folder per style and language: `pixel`, `soft` or `clean`, in `en` or `es`. Each folder has these screenshots:

| File | Screen |
|---|---|
| `desktopGroup.png` | Group leader dashboard (computer) |
| `desktopRegion.png` | Overseer region dashboard (computer) |
| `phoneUpdate.png` | Leader updates a member (phone) |
| `phoneGroup.png` | Group overview (phone) |
| `phoneRegion.png` | Region goals, view only (phone) |
