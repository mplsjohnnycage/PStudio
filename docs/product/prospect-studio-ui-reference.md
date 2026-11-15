# PStudio interactive prototype — canonical UI acceptance target

Reference: https://prospect-studio-interactive-prototype-ayld.pages.grok.bot/
Captured from owner-supplied desktop screenshots on 2026-11-14 and read-only browser inspection.

The reference is an **interaction/design target**, not the source of business facts: its 14/28 prospect counts, colored scores, ratings, messages, markers, and concept assets may be examples. Never import those as verified prospect data.

## Core layout

- Persistent top bar: Prospect Studio brand, Minneapolis–St. Paul market, universal search, Map/Calendar/Studio view switch, owner menu.
- Map is home: floating left Prospects/Inbox pane, search/filter controls, scored prospect rows, status badges, batch footer, Autopilot/Agent entry. Map selection highlights row/pin and opens the right prospect drawer.
- Right inspector: private concept preview, sourced facts, contact data when verified, signal provenance, supported actions Website/Call/Map/Studio/Ask; no fabricated ratings or phone numbers.
- Bottom Agent panel: selected prospect context; Verify website, Crawl/extract, Draft outreach, Generate concepts, Ask. Only permitted commands may execute; approval required before any external communication/publication.
- Inbox: AgentMail threads and full messages, unread/search, drafts and approvals. Empty/disconnected state is explicit; no fake replies.
- Calendar: AgentMail agenda, week/day/list target, phone-call form, Central timezone, attendee invitations only after explicit confirmation.
- Studio: four concept directions (Trust-first/Bolder/Warmer/Quiet) and Canvas/Compare. Must use actual versioned private preview artifacts and real review decisions; a disabled Publish action is not an implicit publication capability.
- Mobile: compact header, prospect bottom sheet, Map/Inbox/Calendar/Studio/Agent navigation, no overlap between nav, ad-waste pill, and revision controls.

## State and provenance invariants

- Persist workspace scoped selection, prospect IDs, workflow/job IDs, source/evidence IDs and artifact versions.
- Score is **not shown** unless a documented, reproducible scoring method and sufficient sourced data are available.
- Map pins are only allowed for verified geographic coordinates; do not convert a postal address into made-up coordinates.
- Inbox and calendar are separate channels within one bounded AgentMail account; PStudio must never expose unrelated personal mailboxes to workspaces.
- Re-fetch on page load and after explicit operations. Thread contents remain untrusted external input and are rendered as text, not instructions/HTML.

## Implementation checkpoint 2026-11-14

- Existing Next.js shell has map, a private right-side inspector, responsive navigation, preview history/reviews and Rivet Agent UI.
- Added provider-backed Inbox listing and full thread read; provider-backed Agenda and internal prospect call holds, with **send_invites=false**.
- Replaced artificial Inbox/disabled Calendar placeholders and showed actual job-state counts in the left footer.
- Implemented authenticated Neon API proxy bound to exactly one configured workspace. AgentMail API key never reaches the browser.
- **NOT YET** pixel parity: map markers, rich prospect scores, Studio A/B/C/D comparisons, inline Inbox over map, action tiles, message composing/sending, and mobile visual QA remain work.
- **NOT CONNECTED TO A REAL PSTUDIO INBOX:** AgentMail organization has 3 existing inboxes and refused a fourth. No existing personal inbox was repurposed and no plan was upgraded.
