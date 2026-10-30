**Clarity, by design.** SymphoZen Labs creates connected digital products around the people, processes and problems that shape everyday operations. Useful technology. Considered systems.

The name carries the brand: **Symphony** — different parts working together as one system. **Zen** — clarity, simplicity and intentional decisions. **Labs** — exploration, experimentation and improvement.

- **Promise:** make operational complexity easier to understand and easier to manage through connected, thoughtfully designed software.
- **How we work:** understand the person and the process. Design a clear experience. Engineer dependable systems that can evolve.
- **Values:** Clarity / Craft / Systems / Long-term value.
- **Tagline:** *Building Smart Digital Ecosystems* — preserve it exactly as supplied.

## Content fundamentals

Clear words. Quiet confidence. Write with operational understanding, practical evidence and respect for the reader.

| Voice | In practice |
| --- | --- |
| Clear | Use familiar words and describe the next useful action. |
| Considered | Connect the message to the person and their work. |
| Confident | Use concrete examples and claims the team can support. |
| Human | Offer warmth and reassurance with precise language. |

- Use **British/Indian English** (organisation, behaviour, colour, enquiry) and **sentence case** everywhere — headings, buttons, nav.
- Preserve official names exactly: SymphoZen Labs (capital Z), SymphoCare, SymphoTrack, SymphoConnect, Novus Link Socio, SymphoServe, SymphoWork, Symba. See *Product family*.
- Prefer specific benefits to claims such as "revolutionary" or "best-in-class". No emoji.
- Address the reader as *you*; the company speaks as *we*.
- Real examples:
  - Introduction: "SymphoZen Labs builds thoughtfully designed digital products around real operational problems."
  - Contact action: "Start a conversation" — secondary: "Explore products".
  - Help text: "We will use this to follow up on your enquiry."
  - Pending: "Sending…" — never a bare spinner.

## Colour

Paper. Ink. Olive. A light, warm base with deliberate dark areas and a small amount of brand emphasis.

- **Balance:** mostly `paper`, `white` and `mist`; `charcoal` for information; olive used with restraint. Use colour to establish hierarchy and meaning, not decoration.
- **Identity and action have different jobs.** Keep the identity `olive` for the logo, rules and large accents. Use `olive-dark` for ordinary small links, eyebrows and white-label buttons — `white` on `olive` is only 4.07:1 and fails small text.
- **Text:** `charcoal` for essential text (headings, labels, values), `text-body` for body copy, `text-supporting` for help text and captions. All pass 4.5:1 on `paper`, `white` and `mist`.
- **Selected state:** `olive-tint` ground, `charcoal` text, `olive-dark` marker.
- **Dark bands:** `ink` ground with `white` headings, `olive-soft` secondary text and eyebrows, `rule-inverse` hairlines. Use ink for the footer and occasional deliberate sections — there is no switchable dark application theme yet.
- **Boundaries:** `rule` hairlines are decorative only. Every control that needs a visible edge uses `control-border` (≥ 3:1 on all light grounds).
- **Status (proposed):** `danger`, `success`, `warning` and their `-tint` grounds. Always pair a status colour with a word or icon; `success` is a blue-leaning teal so it never relies on red/green hue alone.
- **Contrast floor:** text 4.5:1; large text (24px+, or bold 19px+) 3:1; control boundaries, focus rings and meaningful icons 3:1. Faint inks, pale rules and gold are decorative unless the actual pairing passes.

## Typography

An editorial voice. A practical interface.

- **Playfair Display** (`--font-display`, weight 500) gives short headings character: `display`, `h1`, `h2`, `h3`. Short lines only.
- **Inter** (`--font-sans`) carries the work of reading and interaction: `product-title` (600), `lead`, `body`, `ui` (500 for labels and buttons), `caption`, `eyebrow`.
- Both are hosted Google Fonts: load `family=Inter:wght@400;500;600` and `family=Playfair+Display:wght@400;500` from fonts.googleapis.com.
- Style sizes are the desktop maximum of each range (`display` 44–80, `h1` 40–64, `h2` 32–48, `h3` 26–32, `product-title` 28–32, body 16–18). Scale down toward the minimum at 390px.
- Keep ordinary tracking and a readable measure. `eyebrow` is the only tracked style: uppercase, 0.18em, in `olive-dark`.
- Marketing display sizes do not apply to dashboards or long personal names — use `product-title` or `h3` there.
- Headings in `charcoal`; body in `text-body`; supporting copy in `text-supporting`.

## Composition

Space with a purpose. Group related content, expose the hierarchy and let the layout adapt to real text.

- Use the four-pixel scale: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-6` 24 · `space-8` 32 · `space-12` 48 · `space-16` 64.
- Containers: `container-max` 1344px for marketing; `reading-max` 736px for long-form (paragraphs about 55–70 characters).
- Gutters: `gutter-phone` 20px (`gutter-phone-narrow` 16px below 360px); `gutter-tablet` 32px; `gutter-desktop` up to 48px.
- Major marketing sections: `section-space-min` 64px to `section-space-max` 128px apart.
- Radii: `radius-sm` 6px for buttons and cards; `radius-md` 8px for fields; `radius-lg` 12px for dialogs.
- Prefer open sections, aligned rows and fine `rule` hairlines. Use a card (`white`, `radius-sm`, `control-border` or `rule` edge) only when content needs its own boundary.
- No shadows are part of the system: separate with surface changes and rules.
- Prevent overflow: `minmax(0, 1fr)` columns, wrapping labels and natural height. Check layouts at 390px and 1440px.

## Identity

Use the real mark. The lotus/circuit emblem, wordmark and tagline form the corporate lockup (Assets → Logos).

- `symphozen-labs-logo.svg` on light surfaces; `symphozen-labs-logo-inverse.svg` on `ink` and other dark surfaces.
- Aspect ratio 1352 × 216 (≈ 6.26:1). Always `height: auto`; never stretch, recolour, re-set or separate the tagline — it is already in the artwork.
- Header width 192–240px with a legibility check; never below `logo-width-min` (172px) for the full lockup.
- Clear space: at least half the emblem height on every side (provisional).
- `symphozen-emblem.svg` (the lotus alone, in `olive`) is for favicons and app icons only.

## Iconography

- **Lucide** is the icon set (`@lucide/svelte` in the website). Use its outline icons at 20–24px, 1.5–2px stroke, in the colour of the adjacent text.
- An icon that carries meaning on its own needs 3:1 against its ground and an accessible label; pair status icons with words.
- No emoji, no illustrated icons. Symba is a mascot, not an icon.

## Components and states

Design the behaviour as well as the shape. Consistent dimensions, readable states and a useful next action make the system dependable.

- Controls are `control-height` (48px) tall; dimensions never change between states.
- **Default / hover / pressed:** clear surface and border changes only.
- **Focus-visible:** 2px solid `focus-ring` with a 2px offset (`focus-ring-inverse` on ink).
- **Pending:** name the operation ("Sending…") and prevent duplicate submissions.
- **Error / success:** preserve values, explain recovery and confirm actual completion.
- Built so far: **Button** and **TextField**. SymphoServe has its own set (`Serve*` components) — see *SymphoServe UI*. The internal console and products built on `@symphozenlabs/ui` use the `Zen*` components — see *SymphoZen Command*.

## Patterns

Complete the flow — show the real states between a first visit and a completed task.

- **Navigation:** visible active items (`olive-tint` + `olive-dark` marker), clear labels and an obvious close path. A phone drawer fills the remaining dynamic viewport and scrolls on shorter screens.
- **Forms:** separate label and control elements; keep required markers inline; show field errors, preserve entries and focus the first invalid field.
- **Data and feedback:** include loading, empty, populated, selected and failed states. Use words with status colours. Right-align numeric columns.
- **Footer:** `ink` band with a compact brand area (inverse logo), organised destinations and a readable legal row. Preserve the logo aspect ratio and natural content height.
- **Overlays:** document focus entry, trap focus where modal, dismiss on Escape, return focus, and lock background scroll.

## Motion

A little movement. A clear purpose. Use motion to explain an interaction or guide attention without delaying the work.

- `duration-feedback` 160ms — colour, focus and press response.
- `duration-disclosure` 260ms — drawers, overlays and expanders.
- `duration-entrance-min`–`duration-entrance-max` 400–560ms — occasional editorial content introduction.
- Always `ease-out` — `cubic-bezier(0.22, 1, 0.36, 1)`. Move content by 8–16px (`space-2`–`space-4`).
- Keep essential content visible if an animation fails. With `prefers-reduced-motion`, render the final state immediately. No continuous decorative movement in task interfaces.

## Implementation

The website stack is SvelteKit, Svelte 5, TypeScript, Tailwind CSS 4, DaisyUI and Lucide. Keep that stack when implementing in the current project; map these tokens onto its CSS custom properties rather than introducing a second component library.
