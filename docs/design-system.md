# Design System: Defne — Vocabulary Mission

> **Current visual direction, not a hard contract.** This document captures the
> intended look-and-feel and the anti-slop guardrails for Stitch and the React
> build. The actual product contract lives in the learning docs:
> [`mvp-scope.md`](mvp-scope.md), [`mastery-scoring-and-session-selection.md`](mastery-scoring-and-session-selection.md),
> [`round-based-vocabulary-mode.md`](round-based-vocabulary-mode.md), and
> [`implementation-plan.md`](implementation-plan.md).
>
> The design may drift from these rules during prototype iteration (for example,
> the current CSS still uses Inter and Georgia in places). That drift is
> acceptable while the learning mechanics catch up. When pedagogy and design
> diverge, pedagogy wins.
>
> ### Concept-board caveat
>
> The concept boards in `docs/assets/visual-concepts/*.png` and
> `public/assets/visual-concepts/*.png` are **tone seeds, not asset references.**
> They predate the current Defne naming convention (one board uses an old
> placeholder child name) and contain motifs this document explicitly bans — streak cues,
> confetti-like decoration, and embedded text inside images. The production
> avatar library and screen assets must omit those motifs. Treat the boards as
> "vibe and atmosphere" only.

## Configuration Dials

| Dial | Level | Notes |
|------|-------|-------|
| Creativity | `7` | Editorial warmth, pencil illustration accents, but never decoration over pedagogy. |
| Density | `4` (child) / `6` (parent) | Child screens stay airy and one-task-per-screen. Parent dashboard is denser. |
| Variance | `7` | Asymmetric splits and bento; avoid symmetric 3-up grids. |
| Motion Intent | `5` | Calm spring transitions. Never theatrical. No celebratory full-screen explosions. |

## 1. Visual Theme & Atmosphere

A warm, paper-textured study room — graphite pencil illustrations and watercolour
washes against an off-white canvas. The mood is "well-lit children's library", not
"gamified app". Every element should feel hand-drawn but considered, calm enough
for focused practice yet alive enough that a Year 5 child wants to come back.

The recurring stylised girl avatar appears across the journey as a gentle guide,
not a mascot. She is graphite line work with light watercolour, never a real
likeness, never cartoonish.

## 2. Color Palette & Roles

Single restrained palette. No purple/violet anywhere, no neon, no pure black.

- **Paper Canvas** `#FAF7F1` — Primary background. Warm off-white, faintly cream.
- **Notebook Surface** `#FFFFFF` — Card and panel fill. Used with whisper shadow.
- **Graphite Ink** `#1F2937` — Primary text and pencil illustration line. Slate-900-ish, never pure black.
- **Steel Secondary** `#52525B` — Body copy, descriptions, metadata.
- **Muted Slate** `#94A3B8` — Tertiary text, timestamps, disabled states.
- **Whisper Border** `rgba(31,41,55,0.08)` — 1px structural lines, card edges.
- **Diffused Shadow** `rgba(31,41,55,0.06)` — Card elevation, 40px blur, -15px offset.

### Mastery Colours (semantic, always paired with a text label)

These are the project's signature accent system. They communicate learning state,
not decoration. Every appearance must include a text label — colour alone is banned.

- **Red — "New / Needs work"** `#D1495B` — Coral red, never harsh fire-engine.
- **Orange — "Building"** `#E08E45`
- **Yellow — "Nearly steady"** `#E2B83A`
- **Light Green — "Reliable"** `#7FB069`
- **Green — "Mastered"** `#3F7D5C` — Forest, the brand accent.

### Single Brand Accent

- **Forest Green** `#3F7D5C` — Primary CTAs, focus rings, "mastered" state, mission-start button. Same hex as the green mastery state — mastery and brand identity reinforce each other.

### Support Hues (sparingly)

- **Hint Sky** `#7BA7C9` — Hint panels and supportive callouts only.
- **Soft Coral Wash** `#F4D5D5` — Background tint for "needs another try" cards. Never alarming.

### Banned

- Purple/violet, neon gradients, pure `#000000`, oversaturated accents (>80%).
- Mixed warm/cool gray systems — stay warm.
- Red used as harsh failure alarm. Wrong-answer states use Soft Coral Wash backgrounds with Graphite Ink text, not full-bleed red.

## 3. Typography

### Fonts

- **Headlines:** `Outfit` (700–800) — Track-tight (`-0.02em`), generous weight, calm authority. Pairs with the pencil illustration line without competing.
- **Body:** `Geist` (400–500) — Relaxed leading (`1.6`), 65ch max-width, Steel Secondary colour for description text.
- **Editorial accent (sparing):** `Fraunces` italic for the avatar's spoken lines and the mission title only — never for UI controls or data.
- **Mono:** `Geist Mono` — Question counters ("Q 4 / 14"), timestamps, response-time stats on parent dashboard.

### Scale

- Display (mission title): `clamp(2rem, 4.5vw, 3.25rem)`, weight 800, leading 1.1.
- H2 (section): `clamp(1.5rem, 2.5vw, 2rem)`, weight 700.
- Question prompt: `1.5rem`, weight 600, leading 1.4.
- Body: `1rem` / leading 1.6.
- Mastery label: `0.8125rem`, weight 600, uppercase, letter-spacing `0.04em`.
- Mono metadata: `0.8125rem`.

### Banned

- `Inter`, `Times New Roman`, `Georgia`, `Garamond`, `Palatino`, default browser serif stacks.
- Serif anywhere on the parent dashboard or in dense data tables.
- Display sizes above 56px on mobile.

## 4. Component Stylings

- **Buttons** — Flat surface, no outer glow. Primary: Forest Green fill, Paper Canvas text, generous radius `1.25rem`, pill on small CTAs. Active state: `translateY(-1px)` on press, then settle. Secondary: ghost outline in Graphite Ink. Hover: subtle background shift, never glow.
- **Cards** — Notebook Surface fill, generously rounded (`1.5rem` for content cards, `2rem` for hero cards), Whisper Border, Diffused Shadow. Used only when elevation communicates hierarchy. Dense parent tables use border-top dividers instead.
- **Mastery Pill** — Pill-shaped chip showing colour swatch + text label (e.g. circle dot + "Building"). Required pattern wherever mastery state is shown.
- **Dimension Meters** — Three small horizontal meters labelled "Meaning · Usage · Spelling". Each fills left-to-right with the dimension's mastery colour. Used on word cards, end-of-session, parent dashboard rows.
- **Avatar Frame** — Soft watercolour-paper rounded rectangle (`1.25rem`) containing the pencil-drawn girl. Cached static poses in MVP-1A. Never animated, never overlays text.
- **Hint Panel** — Hint Sky-tinted card, progressive ladder. Locked future hints shown as muted, disabled rows. Each hint level has a small mono index ("Hint 1 of 5").
- **Spelling Diff** — Two-line stack: typed answer above, canonical below, with the differing letter chunks coloured (missing letters in Forest Green, wrong letters with strikethrough in Graphite Ink). No red highlight.
- **Inputs** — Label above, helper below, error in coral wash background card. Focus ring `2px` Forest Green at `2px` offset. No floating labels.
- **Loaders** — Skeletal shimmer matching layout. No circular spinners.
- **Empty States** — Composed pencil illustration of the avatar at a desk + one short, calm sentence and a single primary action.

## 5. Hero Section

This product has no marketing hero. The "first impression" surfaces are the
**Mode Switch (Home)**, the **Child Mission Start**, and the **Parent Dashboard**.

Replace the standard taste-doc Hero rules with these:

- **Mission Start** is the child's "hero". Asymmetric 60/40 split: left side carries the avatar in her watercolour frame and a small journey path; right side carries mission title, time estimate ("about 15 minutes"), question count, focus-word tiles with mastery pills, and the single Forest Green Start button.
- **Parent Dashboard** opens with a calm summary band (latest session line + suggested next focus) over a 12-column bento, not a hero image.
- No filler chrome. No "Scroll to explore", no chevrons, no "Tap to begin".
- Maximum **one** primary CTA per screen.
- Inline-image-typography is **off** for this product — text and images live in separate spatial zones so the child's eye lands on the prompt.

## 6. Layout Principles

- **Grid-first.** CSS Grid for all structural layouts. No flexbox percentage math.
- **No overlap.** Text never sits on top of images or other text. Avatar art and prompt text always have separate cells.
- **Asymmetric splits** for child screens (60/40 or 70/30). Symmetric 3-up card rows are banned.
- **Bento for parent dashboard.** Top row (3 columns: Latest Session · Red & Orange · Spelling Traps), middle row (2 columns 60/40: Forgotten-After-Delay · Suggested Focus), bottom row (full-width Recent Sessions table).
- **Containment:** `max-width: 1280px` for parent, `max-width: 960px` for child practice surfaces (the prompt should feel like a notebook page, not a stadium).
- **Padding:** `1rem` mobile, `2rem` tablet, `4rem` desktop horizontal.
- **Full height:** `min-height: 100dvh`. Never `100vh`.
- **One main task per child screen.** Never put parent controls or admin toggles inside child surfaces.

## 7. Responsive Rules

The pilot will run on parent's laptop and a tablet/phone for the child. Both must work.

- **Breakpoints:** test at `375px`, `768px`, `1024px`, `1440px`.
- **Mobile (< 768px):** all multi-column layouts collapse to a single column. Mission Start avatar moves above the mission card. Bento tiles stack full-width with `1.5rem` gaps.
- **No horizontal scroll** anywhere. Parent tables either reflow into stacked rows or become horizontally scrollable inside their card with a clear shadow indicator.
- **Touch targets ≥ 44px.** Multiple-choice answer buttons are at minimum `56px` tall on mobile.
- **Body text ≥ 16px** always.
- **Typography:** display sizes use `clamp()` and never break the 65ch line on mobile.
- **Section gaps:** `clamp(2rem, 6vw, 4rem)` between sections; `clamp(1rem, 3vw, 1.5rem)` within cards.

## 8. Motion & Interaction (Code-Phase Intent)

> Stitch outputs static screens. This section tells the React build how the
> screens should breathe.

- **Spring physics default.** `stiffness: 110, damping: 22`. No linear easing.
- **Calm, never theatrical.** No confetti, no full-screen celebration after a correct answer. End-of-session reflection animates word tiles sliding one notch toward green over ~600ms each, staggered.
- **Stagger reveals.** Mission Start focus-word tiles cascade in at `index * 80ms`. Parent dashboard bento tiles cascade at `index * 60ms`.
- **Avatar idle.** A 0.5px vertical float on the avatar (~3s loop) is the only perpetual motion. Pulse, shimmer, and typewriter loops are off — this product values calm.
- **Hint reveal.** New hint level fades in (`opacity 0→1`, 240ms) and grows from `scale(0.98)` to `scale(1)`. Future locked hints stay still.
- **Spelling correction.** When the canonical word reveals, the missing-letter chunk fades in last with a 400ms delay so the eye lands on it.
- **Hardware rules:** animate `transform` and `opacity` only. Never `top`/`left`/`width`/`height`.
- **Reduced motion:** if `prefers-reduced-motion`, drop all entrance animations; keep only fade transitions.

## 9. Anti-Patterns (Banned)

- No emojis. Anywhere. Including parent dashboard chips.
- No `Inter`. No generic serifs (`Times New Roman`, `Georgia`, `Garamond`).
- No pure `#000000`.
- No purple/violet, no neon glows, no oversaturated accents.
- No 3-equal-card feature rows.
- No centered hero compositions on Mission Start (asymmetric only).
- No filler UI text: "Scroll to explore", "Tap to continue", "Swipe down", bouncing chevrons.
- No celebratory full-screen confetti or coin showers.
- No streak pressure, leaderboards, or social-style rewards.
- No generic placeholder names ("John Doe", "Sarah Chan"). Use the project's pilot character for child-facing examples: child = "Defne". Words from the seed list (`reluctant`, `cautious`, `fragile`, `sincere`, `peculiar`, `observe`, `hesitate`, `generous`, `consequence`, `confident`).
- No fake round numbers (`99%`, `100%`). Use organic data: `78%`, `4 of 14`, `+0.18 since yesterday`.
- No AI copywriting clichés ("Elevate", "Seamless", "Unleash", "Next-Gen").
- No mastery colour without a text label next to it.
- No red used as harsh failure. Wrong answers use calm "Let's look closer" copy with Soft Coral Wash background.
- No parent/admin controls visible inside the child mission flow.
- No generated image carrying critical text — the React UI always renders the actual word, definition, and spelling chunks.
- No realistic child likeness in any avatar art.
- No `h-screen` — always `min-h-[100dvh]`.
- No circular spinners — skeletal shimmer only.
- No broken Unsplash links — use `picsum.photos/seed/{slug}/{w}/{h}` or pencil-illustration SVG placeholders for cached avatar/background slots.

## 10. Domain-Specific Patterns

These are project-only. Stitch must respect them on every screen.

- **Mastery state must always be a Mastery Pill** (colour dot + label).
- **The three dimensions** (Meaning · Usage · Spelling) are first-class. Every word card and parent row shows them as small horizontal meters.
- **The avatar** appears in: Mission Start, Active Practice (small corner pose), Hint Ladder (pointing to the sentence, never the answer), Session Summary (calm celebration), Parent Empty States. She never appears on a parent data table.
- **Defne is a Turkish name meaning "laurel tree"** (bay laurel — symbol of growth, learning, and quiet achievement). The visual system can lean into this gently: a small laurel-leaf motif as a page-corner flourish on the watercolour avatar frame, on the journey path's "mastered" milestones, or as a faint pencil sprig beside the mission title. Never as a logo, never as a reward badge, never as decoration on the prompt itself. One tasteful reference per screen, maximum.
- **Mistake recovery copy** uses calm phrasing: "Let's look closer", "This spelling is a trap — we'll revisit tomorrow", "You understood the idea; spelling needs another pass." Never "Wrong", "Incorrect", "Try again".
- **End-of-session summary** uses movement language: "2 words strengthened", "1 spelling trap found", "reluctant returns tomorrow". Never "Score: 78%".
- **Parent dashboard** answers four questions in this order: (1) what's still red/orange? (2) what spelling mistakes repeat? (3) what was forgotten after delay? (4) what should we practise next? Every section answers one of these — no decorative widgets.
- **Cached avatar/background** slots in MVP-1A use `public/assets/visual-concepts/*` as visual references; production poses will be replaced later. Stitch should depict the recurring graphite-and-watercolour girl rather than stock illustration.

## 11. Anti-LLM-Default Guardrails

Pre-flight checks that counter known biases in LLM-driven UI generation. Inspired
by gpt-taste, trimmed to what fits a calm pedagogical product (the cinematic
GSAP motion, AIDA marketing structure, and inline-image typography from that doc
are *not* adopted — see §9).

### 11.1 Two-line headline rule

LLMs default to narrow containers and wrap display headlines into 4–6 line text
walls. Forbidden.

- Display headlines (Mission Start, Session Summary, Parent Dashboard summary
  band) flow in 2–3 lines, never more.
- Pair display text with an ultra-wide container: `max-w-5xl` (64rem) or wider.
  If text still wraps to 4 lines, drop the size — `clamp(2rem, 4.5vw, 3.25rem)`
  for Mission Start, `clamp(1.75rem, 3.5vw, 2.5rem)` for parent-dashboard.
- Verify on the 1024px breakpoint, not just 1440px.

### 11.2 Gapless bento grid

LLMs leave dead empty cells in CSS Grid layouts. Forbidden.

- Every bento layout uses `grid-auto-flow: dense` (Tailwind `grid-flow-dense`).
- Verify col/row spans interlock: no missing corner, no empty void.
- Parent Dashboard 12-column bento: top row 4+4+4 (Latest Session · Red/Orange ·
  Spelling Traps), middle row 7+5 (Forgotten-After-Delay · Suggested Focus),
  bottom row 12 (Recent Sessions table). Spans declared explicitly.
- 3–5 intentional tiles beat 8 messy ones. If a tile would only exist to fill
  space, delete it.

### 11.3 Layout-variance picker

LLMs default to the same Left/Right split on every screen. Before generating a
new screen, deterministically pick from this set (use the screen name's
character count modulo the option count):

- `asym-60-40`: child Mission Start, Session Summary
- `asym-70-30`: Active Practice, Hint Ladder
- `bento-12col`: Parent Dashboard
- `split-with-offset-card`: Word Form, Batch Paste Import
- `single-column-960`: Spelling Correction, mobile fallbacks

Pick → write the choice in the screen's `<design_plan>` block → respect it.
Never silently default to 50/50.

### 11.4 Pre-flight `<design_plan>` block

Before writing screen markup or a Stitch prompt, output a small plan that proves
the screen respects the rules. Lives in PR descriptions for the React build, not
in shipped UI.

```
<design_plan>
  layout: asym-60-40 (picked from §11.3 by char-count)
  h1_max_w: max-w-5xl, clamp(2rem, 4.5vw, 3.25rem) → 2 lines @1024px
  bento_dense: n/a (not a bento screen)
  cta_count: 1 primary (Forest Green "Start mission")
  mastery_labels: 6 mastery pills, all with text labels
  banned_check: no Inter, no #000, no purple, no emojis, no centered hero
</design_plan>
```

### 11.5 Meta-label discipline

LLMs love cheap labels like "SECTION 01 / STEP 02 / ABOUT US" — banned. But this
product DOES use mono progress counters because they are *pedagogical
information*, not decoration:

- Allowed: `Question 4 of 14`, `Hint 2 of 5`, `Mon 28 Apr · 14 of 14 attempts`.
- Banned: `SECTION 01`, `STEP 02`, `CHAPTER ONE`, `AT A GLANCE`.

Test: does the label tell the child something they actually need to know right
now? If yes, keep it. If it's chrome, delete it.

### 11.6 Layout safety belt

- Wrap the app shell in `overflow-x-hidden w-full max-w-full` so an unintended
  off-screen element never produces a horizontal scrollbar.
- Verify at 375px before declaring any screen done.
