# DeepSeek V4 Multimodal — Phase 1 + Phase 2 UI Visual Review and Polish

You are performing a **dedicated multimodal visual-review pass** on the existing Leaderboard Wordle application.

Repository:

`https://github.com/LorensTee/leaderboard-wordle`

Local repository:

`/home/greant/WebstormProjects/leaderboard-wordle`

Branch:

`main`

## Mission

Phase 1 and Phase 2 are already implemented and functionally verified.

Your job now is **not to redesign the product from scratch**.

Your job is to use your **vision/multimodal capability** plus the repository's existing `make-ui-not-ai` skill to:

1. inspect the existing UI as an actual user would see it;
2. identify visual problems that cannot be reliably detected from source code or automated DOM checks;
3. identify generic "AI-generated UI" patterns;
4. improve the visual design where the evidence supports a change;
5. verify the result by actually viewing rendered screenshots again.

This is a **visual-quality pass**, not a new product phase.

The existing Phase-2 handoff explicitly identifies this as the next intended step:

> dedicated multimodal visual-review pass (make-ui-not-ai) across the entire UI (Phase 1 + Phase 2)

The project already has functional tests and automated visual/DOM checks, but those do **not** replace human/vision inspection of the rendered images.

---

# 1. Read the authoritative project state first

Before changing any code, inspect the current repository.

Read:

1. `Architecture-v3.md`
2. `docs/contradictions-and-gaps.md`
3. `docs/phases/phase 2/phase-2-implementation-handoff-final.md`
4. relevant Phase 1 handoff/implementation documentation
5. the current frontend source tree under `src/routes` and `src/lib`
6. existing UI/theme/component code
7. existing screenshot tooling and `.cache/ui-shots/` if available

Treat the **actual current repository** as authoritative over historical handoff wording.

Do not assume the current UI matches any older screenshot or description.

The Phase-2 handoff says the current implementation includes:

- game UI from Phase 1
- authentication shell/header
- onboarding
- profile
- theme switching
- role-aware shell
- guarded leaderboard/admin placeholders
- shadcn-svelte Button/Input/Badge
- custom Wordle board, keyboard, and tiles
- light and dark themes
- responsive behavior for desktop and mobile

The Phase-2 handoff also states that automated screenshot audits passed, but the screenshots were **not inspected by a vision-capable reviewer**. Treat that as the exact reason you are doing this pass. 

---

# 2. Use the installed `make-ui-not-ai` skill

Use the repository's `make-ui-not-ai` skill from:

`https://github.com/nanfei892/ship-it-skills/tree/master/make-ui-not-ai`

Follow its philosophy and workflow.

In particular:

- establish the product truth before styling;
- infer the visual direction from the actual product, audience, repeated task, and existing identity;
- do not blindly apply fashionable design trends;
- distinguish functional correctness from visual quality;
- perform a cold visual read of rendered screenshots;
- identify generic AI-template patterns;
- fix the biggest visual weaknesses first;
- render again;
- inspect the new screenshots again;
- report functional and visual verification separately.

Do not skip the screenshot inspection simply because automated checks already exist.

The goal is specifically to produce a UI that feels like a **deliberately designed Wordle product for a real private group**, not a generic AI-generated SaaS template.

---

# 3. Critical constraint: preserve functionality and architecture

Do not treat this as permission to rewrite the application.

Do NOT:

- replace SvelteKit/Svelte;
- replace the existing component system;
- introduce React;
- introduce a new design framework;
- rewrite the application architecture;
- change API contracts without a genuine bug;
- modify database/schema logic merely for appearance;
- weaken authentication or authorization;
- expose the Wordle answer;
- change server-authoritative gameplay behavior;
- remove tests;
- change Phase 3/4 functionality that is intentionally deferred;
- invent new product features merely to make the UI look more impressive.

Use the existing stack and conventions.

Prefer modifying existing components, tokens, layouts, spacing, typography, states, and compositions.

Only introduce a new dependency when it is genuinely necessary and justified.

---

# 4. Treat the existing product identity as a constraint

This is a Wordle-style game for a private group of friends with:

- daily gameplay;
- limited guesses;
- a strong game board as the primary task;
- an on-screen keyboard;
- authenticated user identity;
- onboarding/profile customization;
- light/dark theme;
- eventually a leaderboard.

The gameplay itself should remain the visual center of gravity.

Do not turn the application into a generic dashboard.

Do not make the header, cards, badges, decorative statistics, or navigation visually compete with the game.

Do not force a "SaaS dashboard" aesthetic onto the game.

Do not add meaningless data strips, bento card grids, excessive glassmorphism, random gradients, giant marketing slogans, or ornamental UI that has no product purpose.

The `make-ui-not-ai` skill specifically warns against generic patterns such as interchangeable rounded cards, excessive pills, decorative data strips, generic centered shells, indiscriminate accent tinting, and other reusable AI-template structures. 

---

# 5. Perform a visual audit before editing

First run the application using the repository's normal development workflow.

Then inspect the UI visually.

Capture or use rendered screenshots at:

## Desktop

- approximately `1440 × 900`

## Mobile

- approximately `390 × 844`

For each viewport, inspect both:

- light theme
- dark theme

Inspect these surfaces/journeys where reachable:

1. entry / landing / sign-in surface
2. authenticated shell/header
3. onboarding
4. main Wordle game
5. profile
6. navigation between these surfaces
7. any meaningful loading/error/empty/success states already implemented

Do not restrict yourself to the first viewport if another screen contains the actual visual problem.

---

# 6. Use the multimodal capability properly

This is the most important part of the task.

**Actually look at the screenshots.**

Do not merely generate screenshots and infer that they are good from:

- DOM structure;
- computed styles;
- accessibility audits;
- screenshot dimensions;
- automated contrast checks;
- source code;
- component names;
- design tokens.

Those are useful evidence, but they do not prove visual quality.

Perform a genuine visual critique of the rendered images.

For each major screen, ask:

### Cold read

- What do I notice first?
- What do I notice second?
- What do I notice third?
- Is that ordering correct for the user's task?
- Does the UI immediately communicate what the user should do?
- Where does my eye hesitate?
- What feels accidental?
- What feels generic?
- What feels distinctly like this product?

### Composition

- Is the layout balanced?
- Is available desktop space being used appropriately?
- Is the primary task visually dominant?
- Is anything unnecessarily cramped?
- Is anything strangely empty?
- Does the shell take up too much space relative to the game?
- Is the page unnecessarily centered inside a narrow container?

### Typography

- Does the type hierarchy feel intentional?
- Are labels too faint?
- Is metadata unnecessarily tiny?
- Are headings over-sized?
- Is the text personality appropriate for the game?
- Are line heights and spacing comfortable at actual rendered size?

### Color

- Is the palette coherent?
- Is the accent overused?
- Are status colors meaningful?
- Does dark mode feel like a properly designed theme rather than a recolored light mode?
- Are surfaces visually differentiated without becoming noisy?
- Does the Wordle board remain the focal point?

### Geometry

- Are corners, borders, shadows, spacing, and component shapes consistent?
- Are there too many rounded rectangles?
- Is everything visually cardified?
- Are buttons, inputs, tiles, and containers using an intentional shape language?

### Product specificity

- Does this look like a real Wordle product?
- Could I remove the logo and put a random SaaS logo in its place without changing the design?
- Are there obvious "AI-generated dashboard" fingerprints?
- Does the visual system actually fit the repeated gameplay task?

### Responsive behavior

Compare desktop and mobile directly.

Do not merely check whether everything technically fits.

Check whether the **priority hierarchy survives** the smaller viewport.

Look for:

- squeezed game board;
- cramped keyboard;
- oversized header;
- excessive horizontal padding;
- awkward vertical spacing;
- controls that should collapse;
- unnecessary content that remains visible;
- text wrapping that changes hierarchy;
- touch targets that feel uncomfortable;
- excessive empty space caused by desktop composition rules.

---

# 7. Pay special attention to the Wordle gameplay screen

This is the most important surface.

The game should immediately answer:

1. What puzzle am I playing?
2. What is my current progress?
3. Where do I type?
4. How much time is left?
5. What does each tile state mean?
6. What should I do next?

Inspect:

- board proportions;
- tile size;
- tile spacing;
- visual hierarchy between filled and empty tiles;
- submitted-row animation;
- invalid-word feedback;
- keyboard hierarchy;
- disabled/used key states;
- timer visibility;
- hint-letter presentation;
- game start state;
- completed state;
- failed state;
- expired state;
- mobile keyboard usability;
- visual relationship between board and surrounding chrome.

The board should feel like the **hero interaction**, not simply another card inside a page.

---

# 8. Inspect onboarding and profile as product flows

Do not treat onboarding and profile as generic forms.

Check:

- visual hierarchy;
- clarity of instructions;
- display-name field;
- character counter;
- avatar selection;
- theme selector;
- validation feedback;
- loading state;
- error state;
- success state;
- button prominence;
- relationship between form controls and surrounding page;
- whether the flow feels like a coherent product rather than raw form fields.

Look for unnecessary cards, excessive borders, too many pills, weak hierarchy, and overly generic component-library styling.

---

# 9. Inspect the header/shell carefully

The header is shared chrome, so small visual problems compound across the application.

Check:

- logo/product identity;
- navigation hierarchy;
- profile/avatar presentation;
- theme toggle;
- admin visibility;
- spacing;
- mobile behavior;
- visual weight compared with the gameplay area;
- whether it feels like a game product or a generic SaaS dashboard.

The shell should support the product without becoming the product.

---

# 10. Identify the highest-impact visual problems

Do NOT generate a giant list of tiny cosmetic observations.

Rank findings roughly by:

### P0 — visually damaging / clearly wrong

Examples:

- broken hierarchy;
- content clipped or overlapping;
- mobile layout genuinely uncomfortable;
- important control visually hidden;
- theme rendering bug;
- obvious inconsistent component states.

### P1 — major quality problem

Examples:

- game board not visually dominant;
- generic AI-template composition;
- weak typography hierarchy;
- excessive empty space;
- overly card-based layout;
- poor mobile composition;
- weak dark-mode hierarchy.

### P2 — polish

Examples:

- spacing rhythm;
- subtle border/shadow issues;
- small typography adjustments;
- animation timing;
- minor alignment inconsistencies.

Fix P0/P1 problems before spending time on P2 polish.

---

# 11. Make design changes only when evidence supports them

For every major change, answer internally:

- What visual problem did I observe?
- Why is it a real usability/credibility/product-identity problem?
- What change directly addresses it?
- Could the change accidentally damage existing functionality or product requirements?

Do not make arbitrary changes simply because a different style looks fashionable.

Do not "beautify" working UI without being able to identify the problem being solved.

---

# 12. Preserve accessibility and interaction behavior

After visual changes, verify that you have not degraded:

- keyboard navigation;
- visible focus;
- touch target sizes;
- contrast;
- semantic labels;
- screen-reader names;
- reduced-motion behavior;
- form validation;
- loading/disabled states;
- responsive usability.

The existing repository already contains automated checks for many of these concerns. Keep those checks passing.

---

# 13. Preserve the existing theme architecture

The application already has a binary light/dark theme system with:

- localStorage persistence;
- system default;
- pre-paint theme application;
- Tailwind dark variant;
- dark-mode tokens.

Do not replace this system.

Improve the actual visual results of the themes instead.

Pay special attention to whether:

- text becomes too faint;
- borders disappear;
- cards/surfaces lose hierarchy;
- inputs look disabled;
- Wordle tile colors remain legible;
- the game board remains visually strong;
- the dark theme feels intentionally designed.

---

# 14. Verify after modifications

After the visual changes:

1. run the relevant type/check/lint/build commands;
2. run the relevant tests;
3. render screenshots again;
4. inspect the new screenshots with your multimodal capability;
5. compare them against the previous state;
6. confirm that the largest visual weaknesses actually improved.

Do not stop after taking the second screenshots.

**Look at them.**

This task is not complete until the final rendered output has been visually inspected.

---

# 15. Do not over-edit

The implementation is already functionally verified.

The goal is:

> **make the existing product look deliberately designed and production-credible, not make it radically different.**

A successful outcome may consist of:

- several substantial UI improvements;
- a handful of precise visual fixes;
- or, if the current UI is already strong, relatively few code changes.

Do not invent work merely to create a larger diff.

A smaller, evidence-based diff is better than unnecessary redesign.

---

# 16. Final completion gates

Before declaring completion, verify all of these separately.

### Functional

- existing tests still pass;
- build still passes;
- no API behavior was unnecessarily changed;
- authentication remains intact;
- gameplay behavior remains intact;
- answer secrecy remains intact;
- responsive interactions still work.

### Visual

- desktop screenshots inspected;
- mobile screenshots inspected;
- light theme inspected;
- dark theme inspected;
- primary gameplay screen inspected;
- onboarding inspected;
- profile inspected;
- shell/header inspected;
- important states inspected;
- screenshots were actually viewed by you;
- the last meaningful changes were followed by another visual inspection.

The repository's existing automated screenshot audits are evidence for technical UI properties, but they must remain separate from your visual-quality judgment. The project documentation explicitly distinguishes automated verification from actual multimodal visual review. 

---

# 17. Final report

At the end, provide:

## Visual direction

Briefly describe the visual direction you believe the product should have and the evidence behind it.

## Findings

List only the most important visual problems you discovered.

For each one, include:

- problem;
- affected surface;
- why it matters;
- what you changed.

## Verification

Clearly separate:

**Functionally verified**
- commands/tests run
- results

**Visually verified**
- exact surfaces inspected
- desktop/mobile
- light/dark

## Remaining limitations

Be honest about anything you could not visually verify or any issue that remains.

Do not claim "polished" merely because automated checks pass.

---

# Final instruction

Start by inspecting the current repository and existing UI.

Then render the application.

Then **look at the actual screenshots with your multimodal vision capability**.

Then perform an independent visual critique.

Then fix the highest-impact problems.

Then render again.

Then **look at the final screenshots again**.

Do not rebuild Phase 1 or Phase 2.

Do not start Phase 3.

Do not invent features.

The objective is a **focused, evidence-driven multimodal UI quality pass over the already-completed Phase 1 + Phase 2 product**.