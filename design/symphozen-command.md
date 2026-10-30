# SymphoZen Command

SymphoZen Command is the internal back-office console for SymphoZen Labs: one place to manage products, subscriptions, revenue, customers, people, sales, support, development and reports across every SymphoZen product. It is built on the shared Svelte 5 package **SymphoZen UI** (`@symphozenlabs/ui`, also used by SymphoCon, SymphoKart, SymphoReach, SymphoTrack and SymphoWork). Its tokens are the `zui-*` colours and radii; Command's own layout sizes are `cmd-*`.

The reference screen is *Employee Management* (Assets → Command → `command-employee-management.png`). The components here recreate it with the package's real tokens; where the screenshot differs from the code, the code wins (see *Screenshot vs code*).

## Character

Dense, calm and data-first. A light, quiet workspace where green marks the one thing that matters on the screen: the primary action, the current place, the healthy state. No marketing type, no illustration, no decorative gradients.

## Anatomy of a Command page

1. **Sidebar** (`ZenSidebar`, `cmd-sidebar-width` 260px): product lockup "SymphoZen Command" (emblem + two-line name), then top-level sections with a Lucide icon and a chevron — Overview, Products, Subscriptions, Revenue & Finance, Customers, People, Sales & Marketing, Support, Development, Reports, Settings. The open section shows its children indented (Employees, Teams, Roles & Permissions). Active section and child: `zui-secondary` fill, `zui-primary` text and a 3px `zui-primary` bar on the left edge. The signed-in user sits at the bottom (avatar, name, role "Super Admin", menu chevron).
2. **Top bar** (`cmd-topbar-height` 64px, `zui-card`): global search across products, users, customers and invoices (placeholder lists those nouns); notifications bell with an unread dot; help; user avatar.
3. **Page header** (`ZenPageHeader`): a 56px `zui-secondary` icon tile, the title ("Employee Management", 24px semibold), a one-line description in `zui-muted-foreground` ("Manage your teams, roles, and people across all SymphoZen products"), and the single primary action on the right ("+ Add Employee").
4. **Metric row** (`ZenMetricCard` × 4, equal columns): label, large tabular value, a trend chip (↑ 12%, ↑ 8%, "No change") and a caption ("Across all teams"). The lead card may carry a faint `zui-secondary` wash.
5. **Data panel** (`ZenDataTable`): segmented tabs (Employees, Departments, Positions, Teams, Payroll), a local search, Filters, Export and an overflow menu; the table; then "Showing 1–10 of 42 employees" with numbered pagination.

## Data table rules

- Columns for the employee list: select checkbox · Employee (avatar, name, ID such as EMP001) · Department (colour dot + name) · Email · Employment (badge: Full-time `success`, Contract `info`) · Products (icon chips per assigned SymphoZen product, "+1" overflow) · Role · Location (pin icon + city) · Join date · Status (Active `success`, Inactive `error`) · row menu. A gear in the header row opens column settings.
- Header row in `zui-muted` at 14px medium; body text 14px in `zui-foreground`; secondary lines (IDs) 12px `zui-muted-foreground`. Rows are `cmd-row-height` with `zui-border` rules; hover in `zui-muted`.
- Dates read "Oct 24, 2018" in the mock; SymphoZen copy uses British/Indian English, so prefer "24 Oct 2018".
- Department dots and product chips are category colours, not statuses: always show the name or an accessible label beside them.
- Keep the header row and pagination stable while data refreshes; show skeleton rows at row height while loading and `EmptyState` when a filter returns nothing.

## Metric cards

Use the package's `MetricCard`: `title`, `value` (tabular), optional `icon`, `trend` (`up` → `zui-success-foreground`, `down` → `zui-destructive`, `neutral` → `zui-muted-foreground`) and `trendValue`, plus a `description`. Always include the screen-reader trend word the component renders ("up trend: 12%"). Four per row on desktop, two on tablet, one on phone.

## Copy

Short, literal nouns and verbs: "Add Employee", "Export", "Filters", "Search employees…", "Showing 1–10 of 42 employees". The mock title-cases buttons and stat labels ("Total Employees"); the parent brand uses sentence case ("Add employee", "Total employees") — use sentence case in new screens.

## Screenshot vs code

The screenshot is a design mock; the shared package is what ships. Build with the tokens, and treat these screenshot details as not adopted:

- Its primary green is brighter (≈ #44A356 buttons, ≈ #196223 active page) than the package's `zui-primary` (brand `olive` #5A8A45).
- Its neutrals are cool slate (≈ #F8FAFC page, #F6F8FA sidebar); the package's are warm olive-greys (`zui-background` ≈ #FBFCF9, `zui-muted` ≈ #F2F4EE).
- Its controls are 40px; the package default is `zui-control-height` 32px. Page actions and toolbar controls in Command may use the 40px size (`lg`); keep rows and badges as the package draws them.
- Its badges are full pills; the package `Badge` is `rounded-4xl` (also a pill) at 20px high — consistent.

## Accessibility gaps in the package

Kept exact from `@symphozenlabs/ui`, flagged in token notes: label on `zui-primary` 3.90:1, error badge text 4.09:1, `zui-border` as the only input edge 1.34:1. Fixing them means darkening the primary to the brand's `olive-dark` for filled buttons and giving inputs a `control-border` edge.
