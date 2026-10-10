---
target: /provider/services
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/anedlin/Repo/LocalMarketplace/app/provider/services/page.tsx"
target_fingerprint: "sha256:ed860b1fcbe284f1445653f735e0de28347c4fab7cf7324427d05f883d4b0a52"
target_path: /Users/anedlin/Repo/LocalMarketplace/app/provider/services/page.tsx
timestamp: 2026-10-10T06-35-56Z
slug: app-provider-services-page-tsx
---
Method: dual-agent (A: a502ff45dd3268df6 · B: a6160d8d481501538)

Critique of /provider/services (app/provider/services/page.tsx). Score 23/40 (Acceptable, 57%).

Heuristics: 1 Visibility 2; 2 Real world 3; 3 Control 2; 4 Consistency 2; 5 Error prevention 2; 6 Recognition 3; 7 Efficiency 2; 8 Minimalist 3; 9 Error recovery 2; 10 Help 2.

Verdict: category-interchangeable (generic three-card settings page; nothing authored for a NZ tradie).

Detector: CLI clean. Overlay: desktop 6 / mobile 5 (border with wide shadow, text occluded, line length, flat hierarchy on mobile, Inter). Inter hit is a false positive (brief pins Inter).

Priority issues:
- [P1] Mobile location panel covers its own field; Apply then Add is two steps (layout, harden)
- [P1] Three equal green primaries; no CTA in the empty state; form far down on mobile (clarify, distill)
- [P1, needs verification] Mobile nav duplicated/clipped (adapt)
- [P2] Visual language drift forest/serif vs pinned blue; off-token hex in the picker; no customer preview (document, colorize)
- [P2] Price active for Quote; no success feedback; Archive unguarded; errors far from the field (harden)

Personas: Alex (no duplicate/inline toggle), Sam (span label, no focus trap, repeated button names), Casey (form far down, picker pinned top, two-step add).
