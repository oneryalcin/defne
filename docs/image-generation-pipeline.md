# Image Generation Pipeline

> Exploration log and engineering notes for generating illustrated assets for
> the Defne app. Two distinct asset classes with different rules — see §"Two
> classes of generated imagery" below. Written so the next engineer can pick
> up the storyboard work and the per-word mnemonic work without re-running
> the discovery tests.
>
> See [`laurel-journey.md`](laurel-journey.md) for the journey-arc product
> contract and [`vocabulary-learning-app-guidelines.md`](vocabulary-learning-app-guidelines.md)
> §Visual Hints And Memory Anchors for the per-word mnemonic contract.

## TL;DR

- **Model:** `gpt-image-2` (mainline OpenAI image model as of 2026-05).
- **Two asset classes, different rules** (see §Two classes below):
  - **Journey scenes** — character-locked to canonical Defne avatar via
    `images.edit`. Style is fixed across all 50 stages.
  - **Word mnemonics** — *not* character-locked. Each word picks its own
    scene; palette serves the meaning. Same medium and restraint, different
    rules.
- **Pinned canonical avatar:** `public/assets/journey/laurel/avatar-canonical-v1.png`.
  Variant C (graphite + heavily desaturated watercolour wash, ~30% saturation).
  **Never regenerate** — every journey scene anchors to v1; a v2 would force
  every scene to be re-rendered.
- **Character consistency strategy (journey only):** plain `images.generate`
  for the canonical avatar once, then `images.edit(image=canonical_avatar,
  prompt=...)` for every character-scene. Verbal anchoring across many calls
  drifts; reference-image anchoring holds.
- **Mnemonic strategy (per-word):** plain `images.generate` (no character)
  for environment / object words; `images.edit` against the canonical avatar
  for person-centric examples; **skip entirely** when neither word nor
  example is visualisable.
- **Cost:** ~$0.04 (1024×1024 medium) and ~$0.06 (1536×1024 medium) per
  image. Full 50-stage journey ~$3 + drafts. ~200–300 word mnemonics across
  500 seed words ~$8–12.
- **Time:** ~50 seconds per image, fully parallelisable.
- **Helper:** `scripts/gen_image.py`. Reads a structured-fields prompt from
  `scripts/prompts/<slug>.txt`, writes png + sidecar log to
  `tmp/image-tests/<slug>.png`. Single throwaway-but-reusable script by
  design.
- **Prompt template:** structured fields below. Adapted from a photo-biased
  external skill — never use the photo presets for our illustration work.

## Two classes of generated imagery

These are not the same problem. Conflating them produces bad outcomes in
both directions: locking word mnemonics to the canonical character would
hurt retrieval (the kid looks at the figure instead of the meaning); letting
journey scenes vary in style would break the 50-stage continuity.

### Class 1 — Journey scenes (the laurel arc)

- 50 fixed stages, narrative continuity matters.
- Character-consistent — anchored to canonical avatar via `images.edit`.
- Style is locked once and doesn't vary across the arc.
- The character IS the asset; the world is supporting.
- Lives in `public/assets/journey/laurel/` once promoted from `tmp/`.
- Product contract: [`laurel-journey.md`](laurel-journey.md).

### Class 2 — Word mnemonics (per-vocabulary-word)

- Per-word, no narrative continuity between mnemonics.
- *Not* character-locked. Each word picks its own scene.
- Style is a *family* (same medium and restraint) but the *palette* serves
  the meaning. Warm dust ochres for `parched`; cool blue-grey for `fragile`;
  muted icy blue for `cautious`.
- The meaning IS the asset; the world is everything.
- Stored in the `generated_images` table per `data-model.md`, with
  `draft → approved` parent review.
- Product contract: [`vocabulary-learning-app-guidelines.md`](vocabulary-learning-app-guidelines.md)
  §Visual Hints And Memory Anchors.

### Per-word decision tree (mnemonic class)

For each vocabulary word, ask: **does the meaning live in a person, an
environment, or an object — and is the example sentence visualisable?**

| Where the meaning lives | Example sentence is | Approach |
|---|---|---|
| Person feeling/acting (`reluctant`, `cautious`, `generous`) | Visualisable, no specific other person | `images.edit` with canonical avatar |
| Environment / state (`parched`, `fragile`, `peculiar`) | Visualisable | Plain `images.generate`, no character |
| Word abstract (`modest`, `consequence`) | But the example sentence is concrete and visualisable | Generate based on the **example**, not the word — character or scene per the example |
| Word abstract | Example also abstract or text-heavy | **Skip the image entirely.** The example sentence does the work better than any picture would. |

The skip row is a real decision: forcing visuals onto words where neither
the word nor the example is visual pollutes the page and trains the child
to look at pictures instead of language.

## What was tested

### Round 1: Style and consistency (4 images, ~$0.20)

Established the medium and proved character consistency.

| # | Slug | API | Size | Tests |
|---|---|---|---|---|
| 1 | `01-avatar` | `images.generate` | 1024×1024 | Style reachable; first character draft (full watercolour, variant D) |
| 2 | `stage-01-seed` | `images.generate` | 1536×1024 | Pure-scene tone (no character) |
| 3 | `stage-25-garden` | `images.edit` (ref = test 1) | 1536×1024 | Character consistency anchor at small scale |
| 4 | `stage-50-bench` | `images.edit` (ref = test 1) | 1536×1024 | Character consistency anchor at large scale + closure beat |

**Result:** identity transferred faithfully across tests 3 and 4 — same
dark curly hair with the green clip, same cream chunky-knit jumper, same
long forest-green skirt, same plain white canvas trainers. The
forest-green skirt is the strongest single visual anchor. The
`images.edit` reference-anchored approach is the load-bearing technical
decision.

### Round 2: Avatar style A/B/C ($0.12)

Tested colour level for the canonical avatar against the original concept-
board reference (which leaned heavily pencil-only). Variants at the same
pose and character traits:

| Slug | Description | Outcome |
|---|---|---|
| `01-avatar-A-pencil` | Pure graphite pencil sketch, no colour wash | Strongest primer-style mood; weakest character anchor (no colour signature) |
| `01-avatar-B-spot` | Graphite + spot forest-green only (clip + skirt) | Vintage children's-primer aesthetic; distinctive anchor; not chosen |
| `01-avatar-C-light` | Graphite + heavily desaturated watercolour (~30% saturation) | **Pinned as canonical v1.** Restrained but readable, scales to 50 stages, doesn't compete with UI mastery colours |

**Variant C is pinned at** `public/assets/journey/laurel/avatar-canonical-v1.png`.
Stages 25 and 50 in Round 1 were generated against the older variant D
(full watercolour); they should be regenerated against C before being
promoted.

### Round 3: First word mnemonic ($0.04)

Proved the second asset class works.

| Slug | API | Word | Outcome |
|---|---|---|---|
| `word-parched` | `images.generate` | `parched` (very dry from heat) | Cracked dry earth, warm umber + dust ochre desaturated palette, cream-paper sky. Two-second read; meaning unambiguous; doesn't compete with UI text. |

The mnemonic class works with plain `images.generate` (no character),
desaturated watercolour, single subject, scene-led palette.

## API specifics

Current OpenAI Image API (Python SDK):

```python
from openai import OpenAI
client = OpenAI()

# Plain generation — pure scenes, or the canonical avatar itself
result = client.images.generate(
    model="gpt-image-2",
    prompt=prompt,
    size="1024x1024",          # or "1536x1024" landscape, "1024x1536" portrait, "auto"
    quality="medium",          # "low" | "medium" | "high" | "auto"
    background="opaque",       # "opaque" | "auto" — see "transparent gotcha" below
    n=1,
)
image_b64 = result.data[0].b64_json

# Reference-anchored edit — character scenes, anchored to canonical avatar
with open("path/to/canonical-avatar.png", "rb") as f:
    result = client.images.edit(
        model="gpt-image-2",
        prompt=prompt,
        image=f,
        size="1536x1024",
        quality="medium",
        background="opaque",
        n=1,
    )
```

### Transparent background gotcha

`gpt-image-2` does **not** support `background="transparent"` (returns 400
"Transparent background is not supported for this model"). Earlier
`gpt-image-1` does, but we are not using it.

**Workaround we chose:** bake the warm cream paper background (`#FAF7F1`) into
every image. This matches the project's Paper Canvas colour exactly, so the
asset composes onto the app's screens with no colour mismatch. The avatar
also uses a uniform cream paper background for the same reason.

If a future stage needs a true alpha cut-out (e.g. for layering the avatar
over a different scene background), do the cut-out post-hoc in an image
editor or with a small Python script using `Pillow` and a colour-key
threshold. Don't rely on the API for transparency.

## The character-consistency strategy (the load-bearing decision)

Verbal anchoring alone — re-stating the character's appearance in every
prompt — drifts. Across many scenes the model produces "a girl" but not
*the same* girl. Hair colour shifts; outfit shifts; age drifts.

### What works: `images.edit` with a canonical reference

1. **Generate the canonical avatar exactly once.** The prompt is in
   [`scripts/prompts/01-avatar.txt`](../scripts/prompts/01-avatar.txt). The
   subject is intentionally a portrait pose with the character's signature
   garments fully visible (cream jumper, forest-green skirt, white
   trainers, hair clip).
2. **For every later character-scene call, pass that PNG as the `image`
   parameter to `client.images.edit`.** The reference image is the visual
   anchor; the prompt describes the new scene around her.
3. **For pure-scene stages with no character** (a seed in a pot, a close-up
   of leaves, the bench standing empty), use plain `client.images.generate`
   with a matching style block.

### Promotion path for the canonical avatar

The currently-tested avatar lives at `tmp/image-tests/01-avatar.png`. **`tmp/`
is gitignored** — that file is not durable.

When the team approves the avatar as canonical:

1. Copy it to a versioned, committed location, e.g.
   `public/assets/journey/laurel/avatar-canonical-v1.png`.
2. Reference it from every future `images.edit` call by that path.
3. **Never regenerate it.** Every scene built on top of v1 implicitly assumes
   v1's identity. If the team ever wants a v2 (different outfit, older
   character, different scenario), every scene built on v1 must be
   regenerated against v2. Treat the canonical reference like a fixed seed.

## The prompt template (structured fields, illustration-biased)

External "gpt-image-2 prompt skills" we evaluated were photo-biased
(presets like "iPhone photo vibe", "raw quality", "subtle film grain" push
the model toward photoreal). We discarded those presets and adapted the
shape — same structured-fields discipline, different content. Use this
template verbatim:

```
subject: <one sentence — what the image is about>
scene: <one or two sentences — where, when, what's happening>
character (only if present): <verbatim canonical description string —
    see Character Anchor below>
style: Editorial children's-book illustration. Graphite pencil line work
    with light watercolour wash on warm cream paper. Visible pencil strokes,
    soft watercolour bleed at the edges. Never photoreal. Never cartoonish.
    Never glowing.
mood: <one phrase — e.g. "patience and quiet beginning", "closure and rest">
composition: <framing, balance, negative space>
palette: Warm cream paper canvas, graphite ink lines, <scene-specific
    colour notes>. No purple. No violet. No neon.
aspect ratio: <1:1 for the avatar, 3:2 (landscape) for scenes>

Avoid: glow, sparkle, halo, particle effects, embedded text, logos,
    watermarks, real child likeness, photoreal rendering, cartoon mascot,
    exaggerated facial features, eye contact with the viewer, decorative
    borders, streak chrome, badge chrome, coin chrome, oversaturation,
    harsh outlines, harsh red, fairy-tale fantasy elements,
    <scene-specific bans>.
```

Why structured fields: across 50 stages, the same shape produces more
consistent style than free-form prose. The model latches onto the field
labels and treats each section consistently.

### Character Anchor (verbatim string for every character-scene prompt)

```
The same girl as the reference image — Defne, the recurring 9-to-10-year-old
character of this children's vocabulary app. Her canonical features are:
dark wavy curly hair partially tied up with a small green clip, soft
olive-warm skin, cream chunky-knit jumper, long forest-green skirt, plain
white canvas trainers with grey laces. She does not look at the viewer.
Small private expression, no broad smile.
```

Keep this string verbatim in every scene prompt that includes the avatar.
Even though the reference image is the primary anchor, the verbal
re-statement reinforces it and tells the model *which* features to preserve
when re-composing.

### Style block (verbatim — copy into every prompt)

```
Editorial children's-book illustration. Graphite pencil line work with
light watercolour wash on warm cream paper. Visible pencil strokes, soft
watercolour bleed at the edges. Never photoreal. Never cartoonish. Never
glowing.
```

### Avoid list (verbatim — copy into every prompt, append scene-specific bans)

```
glow, sparkle, halo, particle effects, embedded text, logos, watermarks,
real child likeness, photoreal rendering, cartoon mascot, exaggerated
facial features, eye contact with the viewer, decorative borders, streak
chrome, badge chrome, coin chrome, oversaturation, harsh outlines, harsh
red, fairy-tale fantasy elements
```

For mature-tree stages, append: `oak-like trunk, multi-stemmed conifer,
non-laurel foliage`.

For early-stage scenes that should not yet show growth, append: `any
visible signs of growth (this is an early stage — only the seed/sprout
exists), any human or animal figure`.

For closure-beat stages, append: `celebratory full-screen confetti or
sparkles, "the end" text, ornamental flourishes`.

## What we learned (pitfalls and drift modes)

### Photo-bias in external prompt skills

Several public "prompt rewriter" skills for `gpt-image-2` are written for
realistic photography. Their preset categories ("iPhone photo vibe",
"cinematic lens", "subtle film grain") push the model toward photoreal,
which fights our watercolour direction. **Do not use them.** The
illustration-biased template above is the project default.

### Trunk drift on mature-tree stages

The first attempt at stage 50 produced a trunk that read slightly oak-like
(thick, multi-textured bark). Bay laurel trunks are smoother and more
multi-stemmed at the base. **Mitigation:** add `smooth multi-stemmed
bay-laurel trunk, never oak-like, never coniferous` to the Avoid list for
any stage where the tree is past sapling size.

### "Eye contact with the viewer" must be banned explicitly

Without an explicit ban, the model occasionally has the avatar look at
camera. This breaks the "she does not look at the viewer" rule from the
laurel journey contract — the child should be observing, not addressed.
**Mitigation:** keep `eye contact with the viewer` in the Avoid list on
every character-scene prompt.

### Streak / coin / badge chrome leaks in unbidden

Even without prompting it, the model occasionally adds small "achievement"
glyphs in scenes (a star above the tree, a sparkle on the soil). Banned
explicitly via the Avoid list. **Always include `streak chrome, badge
chrome, coin chrome` in the Avoid line** — non-negotiable per the
laurel-journey contract.

### Aspect ratios

`gpt-image-2` supports `1024x1024`, `1024x1536`, `1536x1024`, and `auto`.
Landscape `1536x1024` is the right shape for `/child/garden` hero scenes.
Square `1024x1024` is the right shape for the avatar (so it can be cropped
into round/square frames in the UI). Don't rely on `auto`; always specify.

### `b64_json` is the response shape

The SDK returns `result.data[0].b64_json` — a base64 string of the PNG
bytes. Decode with `base64.b64decode(...)` and write to disk. There is no
`.url` field on `gpt-image-2` responses (unlike older DALL·E shapes).

## Helper script

`scripts/gen_image.py` is the canonical entry point. Single throwaway-but-
reusable file per CLAUDE.md ("don't clutter with many different scripts").

Usage:

```bash
# Plain generate — for the canonical avatar, or pure scenes
uv run --with openai scripts/gen_image.py 01-avatar \
    --size 1024x1024 --quality medium --background opaque

# Reference-anchored edit — for character scenes
uv run --with openai scripts/gen_image.py stage-25-garden \
    --ref tmp/image-tests/01-avatar.png \
    --size 1536x1024 --quality medium --background opaque
```

The script:

- Reads `scripts/prompts/<slug>.txt`.
- Writes the PNG to `tmp/image-tests/<slug>.png`.
- Writes a sidecar `<slug>.log` with timestamp, mode, model, size, quality,
  elapsed time, cost estimate, and the full prompt — so any generation run
  is reproducible from the log alone.
- Exits non-zero on API error with the OpenAI error surfaced.

`OPENAI_API_KEY` must be in the environment.

## Prompts directory contract

`scripts/prompts/<slug>.txt` is the durable form. Treat the prompt files
like any other source code:

- Edit them in place when iterating; commit when good.
- Use the structured-fields template above. Don't write free-form prompts.
- Slug naming: `01-avatar`, `stage-01-seed`, `stage-25-garden`,
  `stage-50-bench`. Keep the leading number for sort order.
- The generated PNG output in `tmp/image-tests/` is **not** committed —
  `tmp/` is gitignored. The prompt is the source of truth; regenerate the
  image any time.
- When a prompt yields a final-quality image to be used in production,
  promote that *one* PNG to `public/assets/journey/laurel/<slug>.png` (or
  the equivalent committed asset path). Leave the prompt in place.

## Cost and time at scale

Pricing observed at the time of these tests (mid-quality, gpt-image-2):

| Size | Quality | Approx cost |
|---|---|---|
| 1024×1024 | medium | $0.04 |
| 1536×1024 | medium | $0.06 |
| 1024×1536 | medium | $0.06 |
| 1024×1024 | high | (not tested — expect ~3× medium) |

50-stage Laurel Journey at landscape medium: **~$3 baseline**, plus
iteration drafts. Budget realistically for $5–10 across the full storyboard
including refinement passes.

Wall-clock: ~50 seconds per image. The script is single-image, but
generation calls are independent, so dispatching N requests in parallel is
straightforward. Expect ~10 min for the full arc if parallelised.

## Mnemonic prompt template (Class 2)

Use this for word mnemonics. Same structured-fields shape as journey
scenes, but with mnemonic-specific rules baked in.

```
subject: A small visual mnemonic for the vocabulary word "<word>" — meaning
    "<definition>". This image is a memory aide that sits beside the word
    in the child's vocabulary card; it must communicate the meaning in two
    seconds and never compete with the UI text.

scene: <one or two sentences anchored to the canonical example sentence
    from the seed data>. <Single-subject framing.>

style: Editorial children's-book illustration. Graphite pencil line work
    with light, heavily desaturated watercolour wash on warm cream paper.
    Pencil dominates. Watercolour is whisper-faint, around 30-40%
    saturation, only enough to suggest material and meaning. Visible
    pencil strokes throughout. Never photoreal. Never cartoonish. Never
    glowing.

mood: <one phrase serving the word's emotional register>

composition: Single subject, clear silhouette, two-second read. Generous
    warm cream paper space. Centred or slightly asymmetric so the subject
    feels natural rather than designed.

palette: Warm cream paper canvas, graphite ink lines, <scene-specific
    desaturated colours that serve the word's meaning>. No purple. No
    violet. No neon.

aspect ratio: 1:1 (square — small UI thumbnail, ~200-256px render size in
    the app)

Avoid: glow, sparkle, halo, particle effects, embedded text, logos,
    watermarks, photoreal rendering, cartoon mascot, decorative borders,
    streak chrome, badge chrome, coin chrome, oversaturation, harsh
    outlines, harsh red, anything that pulls eye away from the single
    subject, anything that could read as the confusable word
    "<confusable>" (specific exclusions for that word's confusables),
    full saturation on any colour, modern picture-book brightness.
```

For `parched` specifically (see `scripts/prompts/word-parched.txt` for the
working example): no green vegetation (parched implies no growth), no
human figure, no water source, no birds (avoids confusion with "perched").

For person-centric example sentences (e.g. `modest` → "Although she won,
she remained modest about her success"), call `images.edit` with the
canonical avatar as the reference image and depict her in the example's
posture (modest = head slightly down, hands clasped, soft pencil
suggestion of others around her).

## What's NOT solved

These are deliberately deferred and left as known-unknowns for the
storyboard pass:

### Journey class (Class 1)

1. **Stages 25 and 50 must be regenerated against pinned variant C.** The
   current versions in `tmp/image-tests/` were generated against the older
   variant D (full watercolour) before C was pinned. They need to be
   re-run with `--ref public/assets/journey/laurel/avatar-canonical-v1.png`.
2. **Stage 12 and stage 38 reference frames.** The journey doc names five
   act-anchor stages (1, 12, 25, 38, 50). We tested 1, 25, 50 only.
   Generating 12 and 38 against the pinned avatar is the next obvious step
   before writing the intermediate stages.
3. **Seasonal continuity across stages.** Many stages within an act will
   share a base illustration with seasonal washes overlaid (per
   `laurel-journey.md`). We have not yet tested whether `images.edit` with
   *two* references (avatar + base scene) produces seasonal variants
   cleanly. May need a second-pass workflow.
4. **Care-action surfacing.** The five care actions (water, prune, frost-
   shield, feed, read aloud) are described in the contract but no
   accompanying illustration prompts have been drafted. These are
   parent-dashboard-side assets, not story-page assets, and may not need
   per-event illustrations at all.
5. **The cutscene pages between acts.** Two-line caption + single
   illustration per the contract. Style is the same as the stage
   illustrations; framing may need to differ (closer to a chapter-divider
   feel). Not yet tested.
6. **Future scenarios.** The architecture in `laurel-journey.md` treats
   scenarios as slot-in story packs. Only the laurel scenario has been
   prototyped.

### Mnemonic class (Class 2)

7. **Character-anchored mnemonic test.** Only `parched` has been generated,
   which is the no-character path. We have not yet tested the
   `images.edit`-with-canonical-avatar path for a person-centric word
   (e.g. `reluctant` — "Defne was reluctant to speak in front of the
   class"). Worth one test to confirm the canonical avatar carries cleanly
   into a small mnemonic thumbnail.
8. **Example-driven abstract word test.** Words like `modest` are
   conceptually abstract but have visualisable example sentences. We
   should generate one as proof of the example-driven approach before
   scaling.
9. **Per-word generation script.** `scripts/gen_image.py` works one-at-a-
   time. For 200–300 word mnemonics across 500 seed words, a batch driver
   that reads a list of word slugs and dispatches in parallel will be
   needed. The single-image script stays as the primitive; the batch
   driver wraps it.
10. **Skip-decision automation.** The decision tree above ("skip if neither
    word nor example is visualisable") is currently a human judgement
    call. For 500 words this needs to be applied consistently — likely as
    a small flag in the seed JSON (`should_have_mnemonic: true|false`) that
    the parent reviews during word entry.

### General

11. **Producing many assets with consistent illustrator-style "voice".** A
    single illustrator producing 50+ images by hand has a coherent voice
    that an AI reference-anchored pipeline approximates but does not
    guarantee. If the pilot demonstrates pedagogical value and budget
    allows, commissioning a human illustrator for the final assets may be
    worth considering — but the AI pipeline produces a credible draft for
    the pilot.

## References

- Product contract: [`laurel-journey.md`](laurel-journey.md)
- Visual direction: [`design-system.md`](design-system.md) §10 (laurel-leaf
  motif rules), §9 (banned visual patterns)
- Helper script: [`../scripts/gen_image.py`](../scripts/gen_image.py)
- Tested prompts: [`../scripts/prompts/`](../scripts/prompts/)
  - Journey class:
    - `01-avatar.txt` (variant D — superseded by C)
    - `01-avatar-A-pencil.txt` (variant A — not chosen)
    - `01-avatar-B-spot.txt` (variant B — not chosen)
    - `01-avatar-C-light.txt` (**variant C — pinned canonical**)
    - `stage-01-seed.txt`
    - `stage-25-garden.txt` (against D — needs regen against C)
    - `stage-50-bench.txt` (against D — needs regen against C)
  - Mnemonic class:
    - `word-parched.txt`
- Pinned canonical avatar: [`../public/assets/journey/laurel/avatar-canonical-v1.png`](../public/assets/journey/laurel/avatar-canonical-v1.png)
- OpenAI image generation guide:
  https://platform.openai.com/docs/guides/image-generation
