# SymphoServe UI

The interface language of SymphoServe across the public website, restaurant admin portal, product owner dashboard (POD) and kitchen display (KDS). Use it for every SymphoServe screen, component, copy line and asset. Tokens are prefixed `serve-web-` (website), `serve-app-` (admin and POD), `serve-status-` (badges) and `serve-kds-` (kitchen display).

SymphoServe should feel calm, practical, restaurant-specific and dependable under time pressure. The product UI is built for people who are standing, moving, serving guests, checking tickets, closing bills and making quick operational decisions. The marketing site can be warmer and more editorial; product surfaces stay quiet, scannable and work-focused. No generic SaaS decoration, ornamental gradients, excessive shadows, oversized cards, or layouts that make operational tasks feel like a landing page.

## Surfaces

| Surface | Character | Ground | Type |
| --- | --- | --- | --- |
| Public website | Warm, hospitality-oriented, brand-led | `serve-web-cream`, `serve-web-cream-dark` bands, `serve-web-forest-900` heroes | Playfair Display headings, Google Sans UI |
| Admin portal | Dense operational workspace | `serve-app-background`, `serve-app-card` panels, `serve-app-sidebar` | Inter Variable |
| Product owner dashboard | Back-office and governance, data-first | Same as admin | Inter Variable |
| Kitchen display | Dark, high-contrast, action-first — a deliberate exception | `serve-kds-root`, `serve-kds-board` | Inter, bold labels |

- **Website:** cream backgrounds, forest hero sections, `serve-web-sun` accents and large editorial headings (`serve-web-hero`, `serve-web-section`). Logo prominent in the sticky header and footer. Full-width sections, strong typographic rhythm, clean grids. Direct CTAs: "Book a Demo", "Explore the platform", "Meet Symba AI".
- **Admin portal:** persistent forest sidebar on desktop, slide-in sidebar on mobile; compact sticky top bar; panels, tables, status badges, filters and action rows for repeated workflows. Every screen has one clear primary action. Use live indicators and refresh states where data changes often.
- **POD:** the admin system, more restrained — page headers, stat cards, tables, audit timelines, status badges and forms used consistently.
- **KDS:** landscape-first, a left workload sidebar and a large card grid; large touch targets, status-first cards, bold labels. Colour is reserved for status, urgency and action. Never borrow KDS dark styling for admin pages.

## Colour

- Use green as the brand and action foundation: `serve-app-primary` for the one primary action per screen section, `serve-app-ring` for focus, charts and grid accents.
- Text: `serve-app-foreground` for body and values; `serve-app-muted-foreground` for supporting text. Website: `serve-web-ink` and `serve-web-muted` on `serve-web-cream`.
- `serve-app-attention` (orange) is reserved for attention counts and bill/payment urgency — never decoration.
- `serve-app-destructive` for destructive actions and errors.
- Use Tailwind tokens and CSS variables, never raw repeated hex values. Hard-coded colours are allowed only in surface-specific exceptions (KDS dark mode, print/PDF).
- Legacy: navy #072D6C and cyan #12A9D6 are old anchors (still aliased as `--brand-navy`/`--brand-cyan` in the admin CSS, now pointing at forest and green). Don't use them in new work.
- **Contrast flags (kept exact from the code):** `serve-app-input` and `serve-app-border` are below the 3:1 control-boundary floor, so fields rely on fill and focus ring; white count text on `serve-app-attention` is 2.89:1.

## Status

Always pair colour with readable text; a small dot is fine next to the word.

| State | Badge tokens | Code class |
| --- | --- | --- |
| New / Ordering / Issued / Occupied | `serve-status-new-*` | `status-blue` |
| Accepted / Billed | `serve-status-accepted-*` | `status-indigo` |
| Preparing | `serve-status-preparing-*` | `status-amber` |
| Ready / Paid / Available / Printed | `serve-status-ready-*` | `status-green` |
| Served / Closed / Draft / Unavailable | `serve-status-neutral-*` | `status-neutral` |
| Open | `serve-status-open-*` | `status-cyan` |
| Bill requested / Payment pending | `serve-status-attention-*` | `status-orange` |
| Rejected / Cancelled / Void / Print failed | `serve-status-failed-*` | `status-red` |
| KDS new / preparing / partial / ready / late | `serve-kds-new`, `serve-kds-preparing`, `serve-kds-ready`, `serve-kds-late` | `KDS_STATUS_COLORS` |

The class names are historical (`status-blue` renders emerald); use the token names in new code.

## Typography

- **Product:** Inter Variable (`--font-serve-product`). Body `serve-body` 14px (up to 16px); page titles `serve-page-title` 24–28px semibold; section titles `serve-section-title` 16–20px semibold; labels and metadata `serve-label` 11–13px semibold. Use tabular figures for money, order numbers, time, counts and metrics. No negative letter-spacing in compact product UI.
- **Marketing:** `serve-web-hero` 44–76px and `serve-web-section` 36–58px in Playfair Display; body `serve-web-body` 16–20px in Google Sans (`--font-serve-web-sans`) with generous line height; `serve-web-eyebrow` uppercase 11px at 0.16em, used sparingly.

## Spacing, shape and depth

- 4px rhythm (`space-*`). Product page spacing `space-4`, `space-6` or `space-8`; panel padding 16–24px. Website sections `serve-web-section-space` (80–110px).
- Touch targets at least `serve-touch-min` (44px) on mobile, KDS and high-frequency operational actions.
- Radii from `--radius` 0.4rem: `serve-radius-md` for buttons, badges and stat cards; `serve-radius-lg` for nav items, operational buttons and search; `serve-radius-xl` for menus and popovers; `serve-kds-radius` for tickets. No pills everywhere.
- Prefer borders and spacing over shadows: `serve-shadow-xs`/`serve-shadow-sm` in product UI only when needed; `serve-shadow-xl` for overlays, menus and popovers; `serve-web-shadow` for marketing hero visuals.

## Layout

- **Product workspace:** `min-h-dvh`; `serve-app-sidebar` (`serve-sidebar-width` 272px) plus main content; sticky white top bar (`serve-topbar-height` 64px) with search, live status, notifications and profile; content up to `serve-app-content-max`; padding `p-4`/`p-6`/`p-8` by viewport.
- **Marketing page:** sticky header with logo, desktop nav, CTA and mobile menu; full-width brand-colour hero; `serve-web-shell` container; alternating full-width bands; footer with logo, navigation, contact routes and a final CTA band.
- **Kitchen board:** `serve-kds-root`, `serve-kds-header`, `serve-kds-sidebar`, `serve-kds-board`; grid `repeat(auto-fit, minmax(270px, 1fr))`, four columns at 1440px+; controls at least 44px; status tabs as rounded segmented controls; KOT cards lead with table/order label, elapsed time, status, item rows and actions.
- On narrow screens prefer cards or stacked rows over horizontal page scrolling.

## Components

Keep component APIs small and aligned with the existing shadcn-svelte variants; prefer existing Svelte components before adding patterns. Built here: **ServeButton**, **ServeStatusBadge**, **ServePageHeader**, **ServeStatCard**, **ServeSidebar**, **ServeDataTable**, **ServeKdsTicket**.

- **Inputs and forms:** white or `serve-app-muted` fills, `serve-app-ring` focus, compact visible (or `sr-only`) labels, 14px text, related fields grouped in bordered white panels, help text below the field, errors in `serve-app-destructive` that say what to do.
- **Panels and cards:** for operational grouping, not decoration — `serve-app-card`, 1px `serve-app-border`. Stable dimensions for repeated cards. No cards inside cards.
- **Dialogs, drawers, popovers:** dialogs for confirmations and focused forms; drawers for dense records; sticky headers; destructive actions away from save; dark translucent backdrop and full focus management.
- **Notifications and live state:** live badges for connection, new activity and unread counts; `aria-live` for async changes; skeletons or stable containers while loading; operational refreshes never move controls under someone's hand.

## Motion

Fast and purposeful: `serve-duration-fast` (150ms) to `serve-duration-slow` (220ms) for hover, press, menu entry, progress and state transitions. No decorative entrance animations in workflows. Honour `prefers-reduced-motion`.

## Accessibility

- Every interactive icon has an accessible name; Lucide icons for actions.
- Keep visible focus rings: product uses `serve-app-ring`; the website uses `serve-web-sun`.
- Semantic buttons for actions, links for navigation; `aria-current` for active nav, `aria-expanded` for expandables, `aria-live` for notifications.
- Never communicate status by colour alone; keep KDS and alert states high-contrast.

## Voice and copy

- **Product:** short, concrete, action-focused — "Test KOT", "Enable alerts", "Mark attended", "Open Tables", "Payment pending", "Everything is caught up". No marketing claims or long paragraphs in dashboards, no cute labels for serious states, no vague verbs like "Process" when the action can be named.
- **Marketing:** warmer and narrative but clear — restaurant-specific language, human service context, direct CTAs, short paragraphs. No generic transformation claims, template-like feature lists, or unbacked pricing and capability claims.

## Imagery

- Use the supplied SymphoServe logo (Assets → SymphoServe) without stretching, recolouring or changing proportions, with clear space around it. `symphoserve-logo.png` on light grounds, `symphoserve-logo-white.png` on forest.
- Use Symba artwork where it explains the Symba experience or adds a friendly cue — never as decoration everywhere. Product screens use illustration only for empty states or onboarding.
- The first viewport of any marketing page makes SymphoServe immediately recognisable.

## Do and don't

- Do build dense, scannable product pages; keep actions close to the data they affect; keep KDS bold, dark and action-first.
- Don't add gradient blobs, glass panels or generic bento blocks; don't hide central primary actions in menus; don't add layout-shifting hover states; don't make admin pages feel like marketing pages.
- When changing shared UI, verify admin, POD, marketing and mobile wherever the token or component is shared.
