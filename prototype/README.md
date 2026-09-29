# Prototype: LINE Case Bot & Tools Management

These are design reference files for Claude Code to use when building the real system. Everything here was exported from Claude Design on 29 Sep 2026.

- Canvas (source of truth for design, editable): https://claude.ai/artifact/Am5eiquq87PZQ83pjqX9ms
- Functional spec: [`../SPEC.md`](../SPEC.md)

> This prototype is **reference only**. Do not copy the `.dc.html` markup into production code. Rebuild the screens as React components, using the screenshots, tokens and mock data here.

## Folder layout

```
prototype/
├── README.md            this file: screens, components, and how to use them
├── tokens.css           design tokens (colors, type, radius, spacing) as CSS variables
├── screens/             PNG of every screen at 2x (source of truth for layout)
├── mock-data/
│   ├── enums.json       status / priority codes, Thai labels, SLA defaults, color tones
│   ├── cases.json       10 sample cases, full detail of CS-2609-00123, dashboard numbers
│   └── bot-flow.json    category tree, the "เข้าระบบไม่ได้" form (6 questions), rich menu
└── source/              original Claude Design files (.dc.html + canvas.json + runtime)
```

## Screens

| Screen | PNG | Source | Size | SPEC section | What it shows |
| --- | --- | --- | --- | --- | --- |
| LINE · Report a case | `screens/Main.png` | `source/Main.dc.html` | 390×844 | §3 Flow แจ้งเคส | Category Flex carousel → FAQ card → question 1 of 5 with Quick Reply |
| LINE · Summary & confirm | `screens/LineConfirm.png` | `source/LineConfirm.dc.html` | 390×844 | §3 steps 5–6 | Attachment, summary Flex (confirm / edit / cancel), success card with case number and SLA |
| LINE · Track & rate | `screens/LineTrack.png` | `source/LineTrack.dc.html` | 390×844 | §3 ติดตาม, §4 | Agent reply in chat, resolved + CSAT 1–5 card, "เคสของฉัน", expanded 2×2 Rich Menu |
| Web · Dashboard | `screens/Dashboard.png` | `source/Dashboard.dc.html` | 1440×900 | §5 Dashboard | 6 KPI tiles, 14-day new-case bars, open by category, cases at SLA risk |
| Web · Case Inbox | `screens/Inbox.png` | `source/Inbox.dc.html` | 1440×900 | §5 Case Inbox | Tabs with counts, filter buttons, case table with priority/status chips and SLA remaining |
| Web · Case Detail | `screens/CaseDetail.png` | `source/CaseDetail.dc.html` | 1440×900 | §5 Case Detail | Form answers / timeline + composer / side panel (status, priority, assignee, SLA bars, contact, related) |
| Web · Bot Flow Builder | `screens/FlowBuilder.png` | `source/FlowBuilder.dc.html` | 1440×900 | §5 Bot Flow Builder | Category tree, form defaults, question list with inline editor, live LINE preview |

The story is the same across all screens: case **CS-2609-00123 "เข้าระบบ ERP ไม่ได้หลังเปลี่ยนรหัสผ่าน"** is reported in the LINE screens, then handled in Case Detail. All names and numbers are fictional sample data (in `mock-data/`).

## Interactions in the prototype

- Sidebar links move between Dashboard, Inbox and Bot Flow. Clicking an Inbox or Dashboard row opens Case Detail.
- Inbox: the tabs (ของฉัน / ทีมของฉัน / ยังไม่มอบหมาย / ทั้งหมด) switch the selected state.
- Case Detail: the composer toggles between **ตอบผู้แจ้งทาง LINE** (green) and **บันทึกภายใน** (yellow, dashed). The placeholder, send label and bar color change with it.
- Bot Flow Builder: clicking a question card expands its editor, and the LINE preview on the right shows that question with its quick replies.

## Suggested component breakdown (Next.js + shadcn/ui)

| Component | Used in | Notes |
| --- | --- | --- |
| `AppShell` + `Sidebar` | all web screens | 232px sidebar, 10 nav items with icons, unread badge, user block at the bottom |
| `StatusChip` / `PriorityChip` | Inbox, Dashboard, Detail | Pill 22px high, tone from `enums.json` → `tokens.css` tint/text pairs |
| `SlaRemaining` | Inbox, Dashboard | States over / warn / ok / pause / none. "over" also tints the row `--color-critical-row` |
| `KpiCard` | Dashboard | Label, 30px value (optional tone color), caption |
| `CaseTable` | Inbox, Dashboard | TanStack Table. Title cell has 2 lines (title + category) and an unread dot. Whole row links to detail |
| `FilterButton`, `CountTabs` | Inbox | Dropdown buttons; the SLA filter is a warning-outlined toggle |
| `Timeline` items | Case Detail | `system` (dot + muted line), `inbound` (left, white), `outbound` (right, accent tint, read receipt), `internal` (right, note tint, dashed border) |
| `Composer` | Case Detail | Mode tabs, textarea, canned replies, attach, "after send" status select, primary send |
| `CaseSidePanel` | Case Detail | Selects for status/priority/assignee, two SLA progress bars, masked phone with "แสดง" (audit-logged reveal) |
| `QuestionCard` + `QuestionEditor` | Bot Flow | Number badge, label, type · `key` (mono) · required, condition chip. Selected state has an accent ring |
| `LinePreview` | Bot Flow | Mini chat bubble + quick-reply chips built from the selected question |
| LINE Flex templates | Bot | Category carousel, FAQ card, summary card, success card, CSAT card, my-cases card. See the LINE PNGs |

## Design rules to keep

- **Font:** IBM Plex Sans Thai for all UI. IBM Plex Mono for case numbers and form keys.
- **Accent:** one accent (`--color-accent` #0B6B5D). Status meaning comes from the semantic tones only.
- **Contrast:** text is at least 4.5:1. Muted text `#5A6066` is the lightest body-text color allowed on white.
- **Targets:** controls are 36px (32px when compact). LINE buttons and CSAT buttons are at least 44px.
- **Thai copy:** use formal written register in the web app. The bot speaks politely and ends sentences with "ครับ". Reuse the exact labels from `enums.json`.
- **Real controls:** use `<button>`, `<a>`, `<select>` and `<label>`, never clickable divs.

## Viewing the original prototype files locally

The `.dc.html` files need `support.js` (the Claude Design runtime) and must be served over HTTP:

```bash
cd prototype/source
python3 -m http.server 8080
# open http://localhost:8080/Dashboard.dc.html
```

To edit the design, change the canvas on claude.ai and export again. Do not hand-edit `source/`.
