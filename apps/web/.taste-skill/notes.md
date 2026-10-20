# MJK storefront — design notes (taste-skill run)

Skill: /Users/arun/.claude/plugins/cache/taste-skill/taste-skill/2.1.3/skills/taste-skill (read SKILL.md directly;
not in this session's skill list). Direction sheet: .taste-skill/direction.json (`draw.mjs --show`).

## Brief (from the user, 2026-10-20)
- General online shop; what it sells is decided by admins in the catalog. Online only, no physical shop.
- New brand: admins upload their own logo (ShopSettings.logo); without one the shop name is the wordmark.
- Pictures: drawings + free-licence found pictures, credited. No product photography yet.
- Story: sample "inspirational" story, editable by admins (ShopSettings.story). Flag as sample in report.
- Angular app = storefront + admin console. Admin follows references/app-screens.md (`draw.mjs --app`),
  same palette and type.

## Inventory (only this shop)
1. Name MJK, three initials; shop name/tagline/story/logo come from the API.
2. Every order chosen and packed by hand (packing slip has a tick box per item).
3. Ships to any pincode in India by DHL or The Professional Couriers, tracking number per parcel.
4. Pay cash on delivery (fee, limit) or UPI QR, checked by a person against the bank app.
5. Delivery ₹99 flat, free above ₹999 (live from /shop/).
6. Its printed artefact: the shipping label — big pincode, "COD ₹X" or "PREPAID", weight, order number MJK000123.
7. Order numbers MJK + six digits; status steps confirmed → packed → shipped → delivered.
8. Indian postal zones: first pincode digit = region (1 Delhi/Haryana/Punjab/HP/J&K/Chandigarh, 2 UP/Uttarakhand,
   3 Rajasthan/Gujarat, 4 Maharashtra/MP/Chhattisgarh/Goa, 5 Andhra/Telangana/Karnataka, 6 Tamil Nadu/Kerala,
   7 West Bengal/Odisha/North East, 8 Bihar/Jharkhand, 9 Army postal service).

## Direction: page-is-the-object (seed 430081439)
Hero tabbed folder stack · Bricolage Grotesque · orange #ff7a1f / blue-black #050f16 / white field ·
sections list(giant word bars) → showcase(square plate) → how-it-works(drag row) → about(founder's letter sheet)
→ faq(reading text) → footer(block wordmark) · motion: index with preview.
Palette overrides the hero's "dark ground": ground is orange (settle order: palette above hero blueprint).

## Idea
On this page, **MJK's hand-filled shipping label** becomes **the object the page is built as**: the folders are the
store's sections, the front folder is the open parcel carrying the label.
Competitor test: another shop's label lacks the hand-tick packing list, the COD/PREPAID stamp and the person checking UPI.
Live thing: type your pincode (and name) → the label fills in: your postal zone, "Delivery ₹99 / free above ₹999",
COD available up to ₹limit. Plain fallback: the label shows the rules as text.

## Argument (home)
1. hero — MJK sends good things, packed by hand, to any pincode → the label with your pincode (live)
2. list "Shop" — what there is to buy → categories as bars, each opens to its products and prices (API)
3. showcase — one thing worth a look now → newest product, variants as tabs, add to cart
4. how-it-works "How it reaches you" — a person handles it start to finish → seven moments with archival pictures
5. about — why it exists → the story as a letter (API story), tear-off strip with support email
6. faq "Questions" — every rule answered → delivery, COD, UPI, cancel, tracking, couriers, returns (from /shop/)
7. footer — the name built large, links, contact, picture credits

## Sample content to confirm before launch
- Story text (ShopSettings.story default), tagline default.
- Demo catalog from `manage.py seed_demo` (categories, products, prices).
- "Dispatched within 2 working days", returns policy wording in FAQ.

## Progress
- [x] Backend logo/tagline/story fields
- [x] Angular 22 scaffold apps/web
- [x] Copy deck, seed data (`manage.py seed_demo`), home page build, gate, look, motion
  Round 2: 0 FAIL, 4 WARN (defended: size-count = 6 steps + giant word/block letters; side-scroll = drag row with
  buttons and bar; blank-gap = footer block mark as the one rest; empty-middle@768 = journey heading/buttons).
  Scores design 7.8 · usability 8 · creativity 8 · content 7.5 → 7.9.
  Pictures: 5 photos + 1 clip (credits in public/pictures/credits.json, footer). Maps of India deliberately not used
  (old political maps show disputed borders).
- [ ] Catalog/product pages, cart, checkout, login, orders
- [ ] Admin console (app run)
