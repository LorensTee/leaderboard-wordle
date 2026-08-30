We are performing a dedicated **visual/UI review of Phase 3 and Phase 4** of:

https://github.com/LorensTee/leaderboard-wordle

You previously reviewed the UI for Phase 0, Phase 1, and Phase 2.

This review is ONLY for **Phase 3 + Phase 4 UI quality, product fit, and visual consistency**.

==================================================
## REQUIRED SKILL: make-ui-not-ai
==================================================

You have the `make-ui-not-ai` skill available in your installed skills.

**You MUST use the `make-ui-not-ai` skill as the governing methodology for this review.**

Treat its instructions as an actual review process, not as optional inspiration.

In particular, follow its principles for:

- establishing product truth before visual judgment;
- distinguishing operational/product UI from expressive UI;
- reviewing composition before decoration;
- independent/cold visual critique;
- realistic viewport-based verification;
- responsive and accessibility-visible review;
- distinguishing functional verification from visual verification;
- identifying generic AI-template patterns;
- checking product specificity and visual credibility;
- performing the final "Seen" gate only when the rendered images were actually viewed.

For this task, do NOT use the skill to redesign the interface.
Use it to **critique and verify the existing Phase 3 + Phase 4 interface**.

The current product already has an established visual direction from Phase 0–2.
Do not replace that direction merely because you personally prefer another style.

==================================================
## 1. REVIEW BOUNDARY
==================================================

Do NOT modify source code.

Do NOT implement fixes.

Do NOT redesign the product.

Do NOT silently change product requirements.

Do NOT reinterpret the Phase 3/4 specifications as an invitation to add features.

Your role is:

**inspect → render → visually inspect → critique → report**

The repository, existing product direction, specifications, and phase handoffs are the source of truth for intended behavior.

==================================================
## 2. IMPORTANT SCREENSHOT / VISION CONSTRAINT
==================================================

There is a tooling limitation in this environment:

The agent can create screenshot PNG files in `.cache/ui-shots/`, but filesystem-created images may NOT automatically become visual inputs to the multimodal model.

Therefore, distinguish these two things:

### Functional/file verification
You may:
- create screenshots;
- inspect filenames;
- inspect filesystem state;
- use browser automation;
- inspect HTML/DOM/source;
- verify that screenshot generation succeeded.

### Visual verification
You may ONLY claim "visually verified" after the actual rendered screenshot images have been supplied as image inputs and you have visually inspected them.

**Creating an image does NOT mean you have seen the image.**

**Finding a PNG on disk does NOT mean you have visually reviewed the PNG.**

**Never claim visual completion from filesystem existence alone.**

When screenshots have been generated:

1. Save them under `.cache/ui-shots/`.
2. Produce a concise screenshot manifest.
3. Explicitly list the exact filenames that need to be attached.
4. STOP before making claims about the visual appearance of those screenshots.
5. Tell the user that the screenshots must be attached as actual image inputs before the multimodal visual-review pass can be completed.

Once the screenshots are attached, continue the review from the actual images.

==================================================
## 3. READ PRODUCT TRUTH FIRST
==================================================

Before rendering anything, inspect:

### Phase 3
- `docs/phases/phase 3/phase-3-final-state-handoff.md`
- `docs/phases/phase 3/phase-3-plan.md`
- current `/leaderboard` implementation
- current `/play` result implementation
- leaderboard components
- shared UI/components used by these surfaces

### Phase 4
- `docs/phases/phase 4/phase-4-plan.md`
- `docs/phases/phase 4/phase-4-implementation-handoff-final.md`
- current `/admin` implementation
- admin calendar
- admin scheduling/edit/replacement forms
- delete confirmation
- validation feedback
- gap warning
- loading/error/empty states

### Cross-phase
- `docs/contradictions-and-gaps.md`
- relevant Phase 0–2 final/handoff documents
- existing design tokens
- shared UI components
- header/navigation
- responsive conventions
- dark/light conventions

Understand the existing product before judging the visuals.

Do not judge a screen against generic dashboard conventions if the repository establishes a different product language.

==================================================
## 4. CLASSIFY EACH SURFACE
==================================================

Use the `make-ui-not-ai` classification approach.

### `/admin`
Treat primarily as an **operational interface**.

Evaluate:
- scan → compare → choose → edit → confirm → recover
- information density
- state clarity
- action discoverability
- calendar usability
- destructive-action handling
- responsive operational efficiency

### `/leaderboard`
Treat according to its actual repeated user task:
- scan standings
- understand position
- compare performance
- change time period
- identify oneself

### `/play` result state
Treat as part of the primary game completion journey:
- understand result
- understand score/position
- understand next action
- transition naturally to leaderboard when offered

==================================================
## 5. GENERATE A COMPACT REPRESENTATIVE SCREENSHOT SET
==================================================

Do NOT generate dozens of nearly identical screenshots.

Create a high-information representative set.

### Phase 3

Capture approximately:

1. `/leaderboard` desktop light
2. `/leaderboard` desktop dark
3. `/leaderboard` mobile light
4. `/leaderboard` mobile dark
5. `/play` completed-result desktop
6. `/play` completed-result mobile
7. `/play` failed/forfeited result state if practical

### Phase 4

Capture approximately:

8. `/admin` desktop light — populated calendar
9. `/admin` desktop dark — populated calendar
10. `/admin` mobile light
11. `/admin` mobile dark
12. `/admin` schedule/edit form + validation state
13. `/admin` same-day replacement / delete-confirmation / gap-warning state

Combine states into a single screenshot when that is more informative and practical.

Prioritize screenshots that expose:
- real hierarchy
- spacing
- density
- responsive behavior
- state communication
- form usability
- product identity
- dark/light behavior

==================================================
## 6. RENDER REALISTIC STATES
==================================================

Use realistic content rather than artificial placeholder content where possible.

For Phase 3 include:
- populated leaderboard
- current-user highlighting
- rank/position callout
- qualified and/or unqualified state where applicable
- multiple leaderboard periods
- realistic row density
- completed game result

For Phase 4 include:
- several scheduled puzzles
- empty future slots
- today-SCHEDULED replacement state if available
- ACTIVE/FINALIZED/locked state where available
- validation success
- already-used answer validation
- invalid answer validation
- edit
- delete confirmation
- gap warning
- loading/error state if practical

Do not fabricate product behavior that does not exist.

==================================================
## 7. BEFORE ATTACHMENT: SCREENSHOT MANIFEST ONLY
==================================================

After generating screenshots, report:

# Screenshot Manifest

For each:
- filename
- route/state
- viewport
- theme
- purpose

Then explicitly say:

> "The screenshots have been generated, but they have not yet been visually verified by the multimodal model because filesystem-created images are not automatically guaranteed to be available as image inputs."

At this point:

**STOP the visual-review portion.**

Do not write a final visual verdict yet.

==================================================
## 8. AFTER SCREENSHOTS ARE ATTACHED: USE make-ui-not-ai
==================================================

Once the screenshots are attached as actual image inputs, perform the visual review.

Follow the `make-ui-not-ai` cold-read process.

### FIRST PASS — COLD VISUAL READ

Before referring back to implementation rationale:

For each important screenshot, answer:

- What do I notice first?
- What do I notice second?
- What do I notice third?
- Is that hierarchy correct for the user's task?
- Where does my eye stall?
- What feels accidental?
- What feels overly generic?
- What feels product-specific?
- Is any region too dense, too empty, too faint, or too loud?
- Does the page feel intentionally composed?

Do not defend the implementation during this pass.

### SECOND PASS — TASK WALKTHROUGH

Then evaluate the actual user task.

For `/leaderboard`:
- Can I immediately understand what the page is?
- Can I identify ranking periods?
- Can I locate myself?
- Can I scan the rows easily?
- Is the current-position information obvious without overpowering the leaderboard?

For `/play` results:
- Is the completion state immediately clear?
- Is the next action obvious?
- Is the leaderboard connection naturally integrated?

For `/admin`:
- Can I immediately understand the schedule?
- Can I tell which dates have puzzles?
- Can I tell which puzzles are editable?
- Can I understand ACTIVE / FINALIZED / locked / replacement states?
- Is the primary admin action obvious?
- Does the interface support rapid repeated scheduling work?
- Are dangerous/destructive actions appropriately separated?

==================================================
## 9. REVIEW DIMENSIONS
==================================================

Review the actual screenshots against these dimensions.

### Composition
- focal point
- balance
- width usage
- height allocation
- negative space
- alignment
- rhythm
- repeated boxes/cards
- unnecessary symmetry
- unused desktop area

### Hierarchy
- title vs content
- primary vs secondary actions
- navigation prominence
- current-user emphasis
- state prominence
- warning/destructive emphasis

### Typography
- type hierarchy
- readability at actual rendered size
- line height
- weight
- metadata size
- truncation
- wrapping
- density

Do NOT praise or criticize a font merely because you like/dislike the family.

### Color and surface
- palette coherence
- semantic use
- contrast
- restraint
- state differentiation
- accent overuse
- dark/light consistency

### Component consistency
Compare with Phase 0–2:
- buttons
- badges
- inputs
- cards
- tabs
- dialogs
- borders
- icon treatment
- spacing
- state presentation

### Responsive behavior
Pay special attention to **390×844**.

Check:
- overflow
- clipping
- calendar usability
- form usability
- touch target sizes
- text wrapping
- cramped controls
- information hierarchy
- whether desktop content was merely shrunk instead of structurally adapted

### Accessibility-visible quality
This is not a complete automated accessibility audit.

Look for obvious visual problems:
- weak contrast
- tiny controls
- color-only states
- weak focus visibility
- ambiguous actions
- confusing destructive flows
- poor mobile targets

==================================================
## 10. MAKE-UI-NOT-AI CHECK
==================================================

Explicitly look for generic AI-generated UI patterns.

Look for unsupported use of:
- interchangeable rounded cards
- excessive pills
- centered narrow dashboard shells
- repeated tinted surfaces
- decorative gradients
- unnecessary glass effects
- generic dashboard layouts
- excessive tiny metadata
- symmetrical component grids where the task does not require them
- decorative metrics unrelated to the task
- visual novelty without product purpose

Important:

These patterns are NOT automatically bugs.

Only flag them when they make the interface:
- less usable,
- less credible,
- less specific to this product,
- visually repetitive,
- or clearly template-like.

Do NOT "de-AI" the interface by making it unconventional for its own sake.

==================================================
## 11. COMPARE AGAINST PHASE 0–2
==================================================

You already reviewed Phase 0, Phase 1, and Phase 2.

Use that prior visual understanding.

Determine whether Phase 3/4:
- feel like the same product;
- use the same visual vocabulary;
- maintain consistent spacing and typography;
- preserve header/shell behavior;
- preserve light/dark treatment;
- preserve responsive conventions;
- introduce any accidental visual regressions.

Do NOT recommend redesigning established Phase 0–2 patterns without evidence.

==================================================
## 12. FINDINGS CLASSIFICATION
==================================================

Classify findings:

### P0 — Critical
Core task is effectively unusable or there is a severe visible accessibility/usability problem.

### P1 — High
Clearly harms usability, comprehension, responsive behavior, credibility, or visual consistency.

### P2 — Medium
Noticeable issue that should reasonably be polished.

### P3 — Low
Minor polish issue or low-impact refinement.

Do NOT use severity labels for purely subjective taste.

For each real finding report:

- severity
- phase
- screenshot filename
- exact location
- observed problem
- why it matters
- recommended fix
- whether it is a regression from Phase 0–2
- whether it is a product-contract issue or purely visual issue

==================================================
## 13. DO NOT IMPLEMENT FIXES
==================================================

This is a review-only pass.

Do NOT:
- modify source
- change CSS
- change components
- change tests
- change dependencies
- change config
- commit changes

Only create screenshot artifacts and review notes if needed.

==================================================
## 14. FINAL REPORT
==================================================

After the screenshots have actually been attached and visually inspected, produce:

# Phase 3 + Phase 4 Visual Review

## 1. Executive verdict

Choose exactly one:

- READY
- READY WITH MINOR UI FIXES
- NOT READY

## 2. Phase 3 findings

Organized by severity.

## 3. Phase 4 findings

Organized by severity.

## 4. Cross-phase consistency

Explain whether Phase 3 and Phase 4 visually belong to the same product established in Phase 0–2.

## 5. Responsive review

Explicit judgment for:
- desktop
- 390×844 mobile

## 6. Dark/light review

Explicit judgment for:
- light
- dark

## 7. Product-specificity / make-ui-not-ai review

State:
- what feels specifically designed for this product;
- what, if anything, feels generic/template-like;
- whether any generic patterns materially hurt the interface.

## 8. Highest-value fixes

Give only the 3–5 most valuable changes.

## 9. Acceptable / intentional behavior

Explicitly identify unusual-looking things that are actually intentional according to the specifications or existing product conventions.

## 10. Visual verification status

Explicitly distinguish:

- Functionally verified
- Visually verified
- Not visually verified

Do NOT claim "visually verified" until the actual screenshots attached as image inputs were viewed after the final meaningful render.

## 11. Final recommendation

State whether:
- Phase 3/4 can remain as implemented;
- minor UI fixes should be made before moving on;
- or substantial UI work is needed before proceeding.

Do not implement any fixes in this chat.
