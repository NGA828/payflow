# Design Foundation — researched from Dribbble (Aug 2026)

Distilled from Dribbble's front page, category leaderboards (Web Design, Mobile,
Product Design, Branding), and visual study of top-performing shots. This is the
design language reference for everything we build in this repo.

---

## 1. What's winning on Dribbble right now

Top shots on the current front page, by engagement:

| Shot | Designer/Studio | Signal |
|---|---|---|
| Subscription analytics dashboard ("Cadence") | Korsa | Data-dense but calm, 7.3k views |
| AI mental-health app (mood check-in flow) | strangehelix | Soft gradients, wellness palette |
| ECG monitoring mobile app | Nixtio | Health-tech dark UI, 29.6k views |
| Mindfulness app landing page | Kris Anfalova | Nature tones, serif display type, 18.5k views |
| Luxury watch e-commerce ("YELM") | Musemind | Editorial layout, lots of whitespace, 17.1k views |
| Enterprise consulting landing ("Clarity") | SlabPixel | Trust-first B2B, restrained palette |
| Fitness tracker / chatbot apps | various | Rounded cards, big numbers, dark mode |
| Logo grids & monograms | Alex Tass, Lucas Fields, Heyo | Geometric marks on presentation grids |

**Pattern:** the highest-engagement work is fintech/SaaS dashboards, health &
wellness apps, AI-native products, luxury e-commerce, and geometric brand marks.

## 2. Layout principles observed

- **Bento grids.** Dashboards are composed of rounded rectangular cards
  (12–24px radius) on a neutral canvas, with one hero metric card and
  supporting cards sized by importance. Asymmetric but balanced.
- **Sidebar + content shell.** Collapsed/glassy left rail with grouped nav
  sections (Main / Performance / System / Account), tiny section labels in
  muted caps, icon + label items, active item gets a soft pill highlight.
- **Generous negative space.** Nothing touches. Card padding 24–32px,
  gutters 16–24px. Density is achieved with typography scale, not cramming.
- **12-col grid, 4pt/8pt spacing rhythm.** Everything snaps to multiples of 4.
- **Cards within cards.** Nested hierarchy: page → card → sub-module, each
  level separated by tonal shift (not borders).

## 3. Color systems

- **Dark mode is the default showcase style** for dashboards/analytics:
  - Base: near-black with a warm/cool tint (#0B0D10 → #14171C range)
  - Surface: +4–8% lightness per elevation level — never pure black cards on
    pure black; elevation is shown with lightness steps, not shadows
  - **Single accent hue** carries the whole product (lime/chartreuse, electric
    blue, or coral). Lime-green-on-charcoal is dominating 2026 fintech shots.
  - Semantic: green up / red down deltas, always paired with a tiny arrow,
    never color alone (accessibility).
- **Light mode (wellness, luxury, consulting):** warm off-whites (#FAF9F6),
  ink-soft blacks (not #000), one muted accent (sage, terracotta, champagne).
- **Gradients are back but disciplined:** soft radial glow behind a hero card,
  gradient mesh on landing heroes, gradient-area fills under line charts.
  Never rainbow, never more than 2 stops.

## 4. Typography

- **Big numeric hero.** KPI numbers at 28–48px semibold/bold, tight tracking
  (-0.02em), tabular figures. Label above in 12–13px muted.
- **Modern grotesks** dominate UI: Inter-style neutrals for product UI;
  **display serifs** (editorial luxury) for landing headlines in
  wellness/luxury.
- Headlines on landing pages: 48–72px, tight line-height (1.05–1.15),
  sentence case is beating ALL CAPS.
- Hierarchy is built with weight + color (ink → 60% gray), not size jumps.

## 5. Data visualization language

- Area/line charts with **gradient fill fading to transparent**, smooth
  curves, no gridline clutter — at most faint horizontal rules.
- Dashed comparison line for a previous period; tooltip is a dark floating
  card with two stacked values and dates.
- Donut/progress rings with thick rounded caps (stroke-linecap: round),
  big center number.
- Legend items: small dot + muted label + bold value, right-aligned trend %.

## 6. Components & micro-interactions

- **Icon style:** 1.5–2px stroke, rounded joins, consistent 20/24px grids,
  often sitting in tonal "chip" squares.
- Buttons: pill or 8–12px radius; primary = solid accent with dark text
  (when accent is bright); ghost buttons use tonal surface, no outline.
- Search appears as a full-width pill in topbars ("Search anything").
- Kebab (⋮) menus on every card; avatars clustered with +N overflow.
- Tags/badges: soft tonal backgrounds (accent at 10–15% opacity), small caps
  or medium 12px text, fully rounded.
- Micro-interactions: hover lifts 2–4px with shadow deepen, active states
  with soft glow, skeleton loaders — motion communicates state, never decor.

## 7. 2026 trend currents (validated against multiple sources)

1. **Calm interfaces** — fewer decisions per screen, obvious defaults,
   whitespace as a feature, not absence.
2. **AI-native UX with transparency** — show *why* a suggestion appeared
   ("Driven mainly by paid traffic +18%"), confidence, and undo paths.
   Note InsightX does this under every KPI: it's why it feels premium.
3. **Liquid glass / high-contrast glassmorphism** — frosted top bars and
   overlays with real blur + saturation, used sparingly.
4. **Purposeful motion** — scroll-linked reveals, chart draw-ins, kinetic
   type on landings; every animation answers "what changed?"
5. **Tactile maximalism, contained** — glow, depth, squishy 3D appear in
   heroes and empty states; working surfaces stay flat and fast.
6. **Bento 2.0 / organized chaos** on landing pages: feature grids with one
   oversized cell.
7. **Accessibility-first** — WCAG contrast as a hard constraint, focus
   rings as designed elements, 4.5:1 body text minimum.
8. **Neo-brutalism & expressive identity** — reserved for brands that want
   loud personality; strong borders, oversized type, visible grids.
   Fintech mostly avoids it; trust stays quiet.

## 8. What makes shots win (craft signals)

- **Presentation matters:** angled device mockups, floating shadows, staged
  context (the shot itself is composed like a product photo).
- One idea per shot; cropped tightly; 4:3 or 16:9 canvas.
- Realistic data (real currency formats, believable names/dates) — fake-latin
  placeholder content reads as junior work instantly.
- Consistent icon set + one type family + one accent = cohesion reads as
  "expensive."

## 9. Applied to Payflow (payments/fintech context)

If we build Payflow UI, the researched direction:
- Dark-first dashboard, charcoal base, **one signature accent** (lime or
  electric blue), warm-gray light theme as counterpart.
- KPI hero cards with gradient glow + explanatory AI-style subtext.
- Gradient-area revenue charts with dashed prior-period comparison.
- Rounded bento cards (16px), 8pt spacing, Inter-style grotesk with
  tabular numerals for money.
- Trust details: subtle security badges, muted success/error semantics,
  human-feeling empty states.
- Landing page: editorial serif or confident grotesk headline, soft gradient
  mesh, product mockup hero with depth, bento feature grid.
