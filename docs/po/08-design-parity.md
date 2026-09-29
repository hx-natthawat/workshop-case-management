# 08 · Design parity with the approved prototype

Date: 2026-09-29 · Task: [#11](https://github.com/hx-natthawat/workshop-case-management/issues/11), [#12](https://github.com/hx-natthawat/workshop-case-management/issues/12)

Fero confirmed on 2026-09-29 that the designer's prototype is the approved design. From now on it is the UI source of truth (`prototype/screens/*.png` for layout, `prototype/source/*.dc.html` for copy, `prototype/tokens.css` for tokens). SPEC.md still decides scope.

Method: extract the visible copy from each `.dc.html` and diff it against the built screen; compare screenshots side by side at 1440×900 (web) and in the simulator phone frame (LINE); fix differences or record them below with a reason.

## Result per screen

| Prototype | Built | Result |
| --- | --- | --- |
| Main.png | Category carousel, question bubble | **Match.** Tinted hero with a line icon (PNG from `/api/flex-icon`), title, hint, "เลือก". Question bubble has the small "ข้อ n จาก N · <form>" header and Quick Reply chips |
| LineConfirm.png | Attachment prompt, summary card, success card | **Match.** "ตรวจสอบข้อมูลก่อนส่ง" with short labels in two columns (`question.short_label`, new), full-width "ยืนยันและส่งเรื่อง", "แก้ไขบางข้อ · ยกเลิก". "✓ รับเรื่องเรียบร้อย" card with the case number, priority tone, response time and team, and "ติดตามสถานะ" |
| LineTrack.png | Agent reply, resolved card, my cases, rich menu | **Match.** Agent reply uses LINE `sender` (agent name + avatar). One card combines 1–5 scores with "เรียบร้อยแล้ว / ยังไม่เรียบร้อย". "เคสของฉัน · เปิดอยู่ N เคส" is one card with a bordered row per case. 2×2 rich menu |
| Dashboard.png | `/dashboard` | **Match** (agent #12). Header "ภาพรวมวันนี้", team selector, 6 KPI tiles, 14-day chart, open by category, SLA-risk table |
| Inbox.png | `/inbox` | **Match.** Tabs with counts, filters, SLA toggle, sort, table, paging, "สร้างเคสแทนผู้แจ้ง" (disabled, Phase 2) |
| CaseDetail.png | `/cases/:id` | **Match.** Header buttons (รวมกับเคสอื่น disabled, มอบหมายต่อ, ทำเครื่องหมายว่าแก้ไขแล้ว), answers with "(ปรับ P3 → P2)", merged "สร้างเคสจาก LINE · มอบหมายอัตโนมัติให้ … (กฎ: … · round-robin)", first-response line, SLA bars with "ใช้ไป … · ครบกำหนด … หากไม่หยุดนับ", "เคสที่เกี่ยวข้อง" |
| FlowBuilder.png | `/flow` | **Match** (agent #12). Breadcrumb, draft/published chips, "Publish vN", category tree with counts, defaults panel, question cards + editor, LINE preview |
| Sidebar | All web screens | **Match.** Prototype order and icons. FAQ shown disabled (Phase 2). Notifications moved to a bell next to the user |

## Intentional differences

| Difference | Reason | Route |
| --- | --- | --- |
| FAQ card "ลองวิธีนี้ก่อน" before the first question is not shown; FAQ nav item disabled | SPEC §9 puts "FAQ ก่อนเปิดเคส" in Phase 2 | F-12 → stage 3 (pull into MVP?) |
| "สร้างเคสแทนผู้แจ้ง", "รวมกับเคสอื่น", "ประวัติ version" disabled | Phase 2 in SPEC §9 | F-13 |
| No "อ่านแล้ว" read receipts on agent messages | The Messaging API does not tell bots when a user has read a message | Rejected (platform limit) |
| LINE agent reply header shows the agent name only, not "· IT Service Desk · CS-…" | `sender.name` is limited to 20 characters | F-14 |
| Case title is generated from the answers ("เข้าระบบไม่ได้: Account is locked…") rather than a human summary | No free-text title question in the form | F-01 (SPEC `case.title`) |
| Role-based sidebar: supervisors do not see Bot Flow, Users or Settings | SPEC §5 permission table (the prototype shows a supervisor with every item) | Keep SPEC |
| Extra MVP controls not in the prototype: "รับเคสนี้", "เริ่มดำเนินการ", save/discard draft, Key and show-if fields in the question editor, test-only "LINE Simulator" link | Needed to operate the MVP | Keep |
| "ผ่าน SLA · 30 วัน" caption uses a 90 % target | Taken from the prototype; not in SPEC | F-15 → confirm with Fero |

## Checks

- `pnpm test`: 56 passed · `pnpm tsc --noEmit`: clean · `pnpm lint`: no issues
- Tokens only from `tokens.css`; case numbers and form keys in IBM Plex Mono; chips 22px with 8px padding; controls 36px; LINE buttons at least 44px
