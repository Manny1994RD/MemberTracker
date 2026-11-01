# Faithful 7 — Member Tracker (design mockup)

A design sample for a church group tracker in an 8-bit style. It shows how each group tracks whether its members complete their 7 monthly goals.

**This is a mockup only.** No backend, login or saving. The data shown is sample data.

## The 7 monthly goals
1. Attendance (weekly, 4x a month)
2. Tithe
3. EduLMS
4. GA
5. Online Mission (3x)
6. Preached (3x)
7. Preparation Day

There is also a **group baptism goal**.

## Screens
| Screen | File |
|---|---|
| Phone: member's own month (check off goals, +1 counters) | `mockup/screenshots/phone-1-my-month.png` |
| Phone: group view (health plant, baptism goal, every member's status) | `mockup/screenshots/phone-2-my-group.png` |
| Phone: help a member (what they're missing, send encouragement) | `mockup/screenshots/phone-3-help-member.png` |
| Desktop: leader dashboard | `mockup/screenshots/desktop-dashboard.png` |
| Everything on one page | `mockup/screenshots/full-overview.png` |

To see the live version, open `mockup/index.html` in a browser.

## Health by plant
Each member and group has a pixel plant. It grows from a seed, to a sprout, to a young plant, to a leafy plant, to full bloom as more goals are completed. It droops (turns yellow) when a member has 3 or fewer goals done. On the desktop dashboard, the "Church Garden" shows every group's plant side by side.
