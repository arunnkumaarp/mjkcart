---
name: mjk-design
description: MJK Cart's own design system and UX rules for the Angular web app (apps/web) and the React Native mobile app. Use whenever building, restyling or reviewing any MJK screen, page or component, on web or mobile, so both apps look and behave as one brand. Use together with taste-skill (web art direction), react-native-skills (mobile engineering) and web-design-guidelines (audits).
---

# MJK design

The source of truth is `apps/web/src/styles.css` (tokens) and `apps/web/.taste-skill/notes.md` (direction,
brief, content inventory). Read both before designing. If a token changes, change it there first, then mirror
it in the mobile theme file.

## Idea
"The page is the object": MJK's hand-filled **shipping label** is the brand artefact. Big pincode, COD / PREPAID
stamp, order number `MJK000123`, tick-box packing list. Screens borrow its parts: folders with trapezoid tabs,
slips, stamps, perforations. Don't add generic e-commerce chrome (rounded cards, gradients, drop shadows, pill buttons).

## Tokens (same values on both platforms)
| Token | Value | Use |
|---|---|---|
| bg | `#ff7a1f` | orange ground |
| surface | `#ff8633` | one step off the ground |
| surface-soft | `#ffb27a` | back folder band |
| ink / accent | `#050f16` | type; the action block |
| accent-ink | `#ff7a1f` | text on the action block |
| muted | `#5a2306` | soft text on orange |
| paper / paper-ink / paper-muted | `#ffffff` / `#050f16` / `#4a4f55` | the white field |
| paper-step | `#f1f1ef` | one step off white |
| ink-step / ink-soft | `#13212b` / `#c9ced3` | ink field and its soft text |

- **Font:** Bricolage Grotesque, weights 400/500/600 only. Headings 600, letter-spacing -0.04em, line-height 0.92.
  Prices, pincodes and order numbers use tabular numbers.
- **Type steps:** small 13–14, body 17–19, lead 20–26, title 28–40, head 32–64, display 72–160 (px).
  Mobile uses the low end of each range: 13 / 17 / 20 / 28 / 32 / 56.
- **Space:** side margin 16–32 (mobile 16), gutter 16–28, section gap 72–160 (mobile 56–72).
- **Corners:** 0. **Shadows:** none. Depth comes from stacked colour fields, not elevation.
- **Motion:** ease `cubic-bezier(0.22, 1, 0.36, 1)`; hover/press 160ms; enter 640ms, rising 24px with a 75ms stagger.
  Only animate transform and opacity. Respect reduced motion (show the final state, no movement).

## Components
- **Button:** one shape. A solid ink block, orange text, square corners, height ≥ 52 (web) / 52 (mobile), padding 0 28,
  weight 600. Hover lifts by 2px; press sinks by 1px. Secondary action = underlined text link, never a second button style.
- **Folder + tab:** a flat band with a trapezoid tab (`clip-path` 14px slant on web; an SVG/Skia path on mobile).
  Use for section switching: home sections on web, top-level segments on mobile.
- **Label slip:** orange slip on white, dotted perforation between the address and the rules column, cut corners.
  Use for delivery info, order summary and order detail.
- **Stamp:** a small ink block, slightly rotated (-2°), for COD / PREPAID and order status.
- **Status steps:** confirmed → packed → shipped → delivered, shown as a row of ticks like the packing slip.
- **Focus:** 3px ink outline, 3px offset (orange outline on ink fields).

## UX rules (both apps)
- Money is shown as `₹1,299`, with Indian digit grouping (`en-IN`). Delivery is "₹99, free on orders over ₹999".
  Read the live values from `/api/v1/shop/`; never hard-code them.
- Pincode: 6 digits, numeric keyboard, validated on input; first digit names the postal region (see notes.md).
- Payment: cash on delivery (show the fee and limit) or UPI QR. Say plainly that a person checks UPI payments.
- Every screen has a loading, empty and error state written in MJK's voice: short, plain and human.
- Touch targets are ≥ 44×44 (iOS) / 48×48 (Android). Contrast is ≥ 4.5:1 for body text; ink on orange is 7.4:1,
  muted on orange 4.8:1 (just passes, so don't lighten it), paper-muted on white 8.3:1.
- Copy: sentence case, no exclamation marks, no "Oops". The voice is that of a person packing by hand.

## Mobile (React Native) mapping
- Put the tokens in one `theme.ts` (colors, fontSizes, space, motion) that mirrors `styles.css`. Components read
  only from the theme, never raw hex.
- Load Bricolage Grotesque with the expo-font config plugin (see react-native-skills `fonts-config-plugin`).
- Navigation: native tabs (Home, Shop, Cart, Orders, Account) and a native stack. The folder tab motif is used
  inside screens, not as the tab bar.
- Lists use FlashList, and images use expo-image. Animate with Reanimated, following react-native-skills.
- Respect safe areas. The orange ground runs under the status bar, which uses dark content.

## Workflow
1. Web page or screen → run taste-skill for art direction and its look-and-fix loop, inside these tokens.
2. Mobile screen → build to this skill + react-native-skills; screenshot on a device or simulator and compare
   against the matching web page.
3. Before calling UI done → run web-design-guidelines on the changed web files, and check the UX rules above.
