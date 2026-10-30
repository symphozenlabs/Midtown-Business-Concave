# Decision record

What is established. What comes next. A strong design system makes its assumptions visible.

## Established identity

The supplied lotus/circuit logo, company and product names, official tagline, the olive/paper/charcoal family, Playfair Display and Inter, Lucide icons, the SymphoServe palette and the Symba artwork. Treat these as fixed.

## Recommended shared standard

Accessible dark-olive action roles (`olive-dark`); warm readable inks (`text-body`, `text-supporting`); 48px controls (`control-height`); consistent radii and spacing; visible control boundaries (`control-border`); complete states; scoped themes and a compact component inventory. These are proposed standards: apply them to new work.

## Proposed in this system

Not defined by the brand book, added so components can be complete. Each token's usage note says PROPOSED:

- Status colours `danger`, `success`, `warning` and their `-tint` grounds.
- `olive-deep`, the primary button's hover and pressed fill.
- Focus rings `focus-ring` (`olive-dark`) and `focus-ring-inverse` (`olive-soft`), 2px solid, 2px offset.

## Scoped or unresolved

- Gold framing belongs to the SymphoZen Signature profile guide.
- Product naming relationships and any new product palette need a business decision.
- A full switchable dark application theme requires a separate review — this system ships one light theme with deliberate `ink` bands.
- **SymphoServe palette mismatch.** The brand book defines forest-and-mint (`serve-forest` #10251F, `serve-green`, `serve-mint`, `serve-cream`, `serve-gold`); the shipped UI uses forest green with sun and orange accents (`serve-web-*`, `serve-app-*`). Both are recorded; choose one as canonical.
- **Two Symba designs.** The brand book shows Symba in a mint sweater (`symba.png`); the SymphoServe website uses Symba in a black apron (`symba-*.webp` poses). Choose which one is current.
- **SymphoZen Command mock vs `@symphozenlabs/ui`.** The sample dashboard uses a brighter green (≈ #44A356), cool slate neutrals and 40px controls; the shared package ships brand `olive`, warm olive-greys and 32px controls. The system follows the package; adopt the mock's look only by changing the package.
- **SymphoZen UI accessibility gaps:** label on `zui-primary` 3.90:1, error badge text 4.09:1, input edge `zui-border` 1.34:1.
- **SymphoZen UI dark theme.** The package defines a `.dark` palette; this system records only its light values until the dark-theme review.
- **SymphoServe accessibility gaps** in the shipped code: input and panel borders below 3:1, and white count text on orange at 2.89:1.

## Review with real content

Check 390px and 1440px layouts, long labels, form errors, mobile navigation, reduced motion, keyboard use and readable contrast before shipping.
