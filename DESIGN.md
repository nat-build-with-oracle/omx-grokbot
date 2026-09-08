---
name: ARRA Oracle GrokBot Bridge
description: A private conversation desk with charcoal surfaces, pink actions, and explicit verification states.
colors:
  canvas: "#121213"
  sidebar: "#19191b"
  surface: "#222225"
  hover: "#2b2b2f"
  line: "#303034"
  ink: "#eeecee"
  muted: "#aaa7ad"
  faint: "#96939b"
  accent: "#eea0c6"
  accent-ink: "#301a25"
  accent-surface: "#35242d"
  accent-hover: "#f8b8d7"
  positive: "#b1c4a0"
  caution: "#dcc098"
  error: "#f0b3b3"
  avatar-rose-surface: "#553349"
  avatar-rose-ink: "#eebbd8"
  avatar-sage-surface: "#394636"
  avatar-sage-ink: "#c0d6b4"
  avatar-blue-surface: "#334251"
  avatar-blue-ink: "#b5cee4"
  avatar-sand-surface: "#4c4231"
  avatar-sand-ink: "#e2cfab"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: "-.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-message:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: ".9rem"
    fontWeight: 550
    lineHeight: 1.5
  label-button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: ".93rem"
    fontWeight: 550
    lineHeight: 1.4
  metadata:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: ".8rem"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: ".85rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  compact: "8px"
  control: "10px"
  avatar: "11px"
  panel: "16px"
  avatar-large: "18px"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
  "48": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label-button}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-button}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-new-bot:
    backgroundColor: "{colors.accent-surface}"
    textColor: "{colors.accent}"
    typography: "{typography.label-button}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    width: "36px"
    height: "36px"
  button-text:
    textColor: "{colors.muted}"
    padding: "3px 0"
  button-send:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    width: "36px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    width: "100%"
  navigation-link:
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    padding: "11px 13px"
  receipt-verified:
    textColor: "{colors.positive}"
    typography: "{typography.metadata}"
  receipt-unconfirmed:
    textColor: "{colors.caution}"
    typography: "{typography.metadata}"
  composer:
    rounded: "{rounded.panel}"
    padding: "16px 16px 10px"
---

# Design System: ARRA Oracle GrokBot Bridge

## Overview

**Creative North Star: "A private conversation desk"**

A quiet, dark workspace with the familiarity of native chat. Charcoal planes, off-white system typography, compact letter avatars, and restrained pink actions keep attention on conversations rather than infrastructure. The interface is direct and lightly rounded, with open canvas around focused work instead of decorative card grids.

Identity comes from the authored bridge mark, the exact name **ARRA Oracle GrokBot Bridge**, and consistent action and status treatments. The approved world is flat and code-led: no gradients, glow, decorative metrics, or generated mockup. The surface-specific composition and task sequence remain in `.impeccable/surfaces/src-app-tsx.md`; this file records how the completed implementation expresses that world.

**Key Characteristics:**
- Near-neutral charcoal layers and quiet hairline separators.
- Pink for actions and focus; olive and amber for textual state feedback.
- Compact system typography, sentence-case controls, and authored stroke icons.
- Sidebar-first navigation, focused content widths, and a bottom-anchored composer.
- Visible distinction between a submission, an uncertain operation, and a verified record.

**Source boundary.** Extracted on 2026-09-08 from `src/styles.css`, `src/App.tsx`, `src/NewBot.tsx`, `src/Icons.tsx`, and `index.html`, with `PRODUCT.md`, the surface contract, and the completed finish review. CSS custom-property names are preserved in `colors`; other frontmatter names are documentation aliases for recurring implemented values, not newly installed CSS variables. The frontend imports Tailwind, but these visual rules are authored in the stylesheet. The schema-v2 extension sidecar is `.impeccable/design.json`.

**Evidence boundary.** The supplied review packet contains 14 captures at desktop (1440 × 960), mobile (390 × 844), and short-window (855 × 476) sizes. `desktop.png` and `mobile.png` show an authenticated, remote-offline New bot draft, not a completed remote creation. The `fixture-*` captures explicitly show synthetic chat, recovery, or search data. `docs/evidence/bridge/ui-smoke.json` records local sign-in, session restoration, sign-out, offline creation blocking, and navigation checks at `2026-09-08T05:23:52.398Z`; draft switching, duplicate suppression, send/creation reconciliation, and returned search results are fixture checks. The finish verdict resolves the mobile dialog naming finding and records Escape dismissal and focus return. Screenshots alone do not prove those behaviors, screen-reader announcements, live agent creation, live remote reply delivery, or public HTTPS deployment. No new browser run or comparison against a generated comp was performed for this documentation. The inspected raster evidence is review material, not a shipping UI asset; the application mark and icons are inline SVG.

## Colors

Warm-leaning neutral charcoal supports a soft pink action accent; low-chroma olive and amber communicate outcomes without turning the whole workspace into a status dashboard.

### Primary

- **Soft pink** (`accent`) supplies filled primary actions, the send control, focus outlines, the bridge mark, and check-reply links. **Pink hover** (`accent-hover`) is shared by primary and send hover states.
- **Dark plum ink** (`accent-ink`) keeps filled-action labels dark. **Muted plum surface** (`accent-surface`) provides the quieter New bot rail treatment and the large bridge-mark tile.

### Neutral

- **Near-black canvas** (`canvas`) is the work area; **charcoal rail** (`sidebar`) is the navigation plane.
- **Raised charcoal** (`surface`) is used for fields, secondary buttons, and neutral hover surfaces. **Hover charcoal** (`hover`) strengthens smaller interactive targets. **Quiet line** (`line`) separates structure without adding depth effects.
- **Off-white ink** (`ink`) carries primary text. **Muted grey** (`muted`) carries supporting text, default navigation, and most icons. **Faint grey** (`faint`) carries tertiary notes and placeholders, not the primary task label.

### Semantic and identity colors

- **Muted olive** (`positive`) marks reachable/local connection state and verified receipts. **Muted amber** (`caution`) marks unavailable connections and unconfirmed operations. **Soft error rose** (`error`) marks error text.
- Avatar pairs use **rose**, **sage**, **blue**, and **sand** surfaces with corresponding light inks. They identify bots, not success or failure. `Avatar` deterministically selects one of the four pairs from the name and displays its first letter; it does not load profile photography.
- Offline strips and notices add local amber-tinted surfaces or borders. Selected navigation, selected bots, message bubbles, and the composer have closely related local charcoal/plum shades; these stay component details rather than an expanded global palette.

**The State Has Words Rule.** A status dot or semantic color accompanies a readable state label; color alone never distinguishes submitted, unavailable, or verified.

## Typography

**Body and heading font:** the platform system stack recorded above. **Code font:** the native monospace stack. No web font or separate decorative display face is loaded. This is the approved native-chat Operate treatment, not a display-face recommendation for unrelated surfaces.

The root is compact (14px). The hierarchy is tuned to task labels and conversation reading rather than a mathematical modular scale. Medium weights differentiate controls and names; headings are restrained and slightly tight. Paragraphs have a maximum line length (72ch); message text preserves whitespace and wraps long content. Code identifiers wrap anywhere, and message timestamps use tabular numerals.

### Hierarchy

- **Headline:** the shared page-heading role uses the frontmatter `headline` token, balanced wrapping, and no decorative eyebrow. The sign-in product heading is a local larger treatment (2.55rem desktop, 2.25rem mobile), not a reusable display scale.
- **Title:** the shared small-heading role uses `title`. Toolbar titles use a compact local variant (.96rem, weight 550), reducing to .92rem on mobile and truncating a long bot name.
- **Body:** normal interface text uses `body`; message copy uses the more open `body-message` line height. Supporting explanatory paragraphs generally use line heights between 1.7 and 1.8.
- **Label:** form labels use the `label` role; controls use `label-button`. Other navigation and metadata labels use closely spaced local sizes, not uppercase tracking.
- **Metadata and code:** receipts, timestamps, and source details are subordinate to the message. The `metadata` and `code` roles describe the recurring sizes, not a minimum accessibility guarantee for every local note.
- At narrow phone widths (430px and below), sign-in, history-query, creation, and composer text fields use 16px text. This does not change the root size or all sidebar/search-filter text.

## Layout

The app is a full-height grid with a navigation rail and a flexible main column (`100vh` fallback, then `100dvh`; minimum height 400px). The work area is a flex column: toolbar, the current task, then the composer where a bot is selected. Scrolling belongs to the current content region, not a floating overlay that covers the composer.

- **Desktop:** the rail is 272px, with 24px top and 16px horizontal padding. The toolbar is at least 72px high with 32px horizontal padding. The delivered 72px desktop toolbar supersedes the contract's provisional 64px figure; the finish review accepted this density adaptation.
- **Intermediate widths (801–1050px):** the rail narrows to 238px, its horizontal padding to 12px, and toolbar padding to 24px. General page gutters become 30px. The redundant Local index micro-label is hidden, not the search filters.
- **Mobile (800px and below):** the rail is replaced by an Open navigation control and a left-edge modal drawer. The drawer uses `min(320px, 88vw)` width and `100dvh` height. The toolbar is at least 64px high, with 16px horizontal padding; the drawer retains New bot, all workspace links, the roster, and owner/connection controls.
- **Narrow phones (430px and below):** toolbar padding becomes 10px and page gutters 22px; status labels wrap within bounded widths. Search filters become a single column with right-aligned selects. Long hit headings, code, descriptions, and messages wrap rather than forcing horizontal layout growth.
- **Short windows (640px high and below):** the entire rail or drawer interior can scroll. Brand, New bot, workspace navigation, and footer do not flex-shrink. The roster section has a 165px minimum height and its list a 180px maximum height, preventing the footer from overlapping navigation. The recorded 855 × 476 check establishes non-overlap at that viewport, not every conceivable viewport.

General task content is centered within an 850px outer maximum, with desktop padding (58px 42px 64px); New bot narrows the outer maximum to 728px. Mobile pages use padding (36px 24px 48px) before the narrow-phone gutter adjustment. The sign-in content is capped at 420px. Conversation feed and composer outer widths are capped at 820px and 860px respectively; their desktop horizontal padding is 36px, reducing to 24px and 18px on mobile. User bubbles cap at the smaller of 85% or 640px on desktop and 90% on mobile.

The recurring spacing values in frontmatter are a compact extracted vocabulary. The build also uses optical gaps such as 9px between a button icon and label; it is not an enforced all-multiples-of-four grid.

## Elevation & Depth

The application has no box shadows. Depth comes from adjacent charcoal tones, one-pixel borders, muted ink, and open space. History results and connection settings are separated rows rather than raised cards. A translucent black native-dialog backdrop (`rgb(0 0 0 / 65%)`) dims the workspace while the mobile navigation occupies the top layer.

**The Flat Surface Rule.** Use tonal separation and quiet rules for existing workspace surfaces; do not add glow, gradients, or elevation shadows to reproduce this system.

The only authored transition is the mobile drawer reveal: transform over 180ms with `cubic-bezier(.16, 1, .3, 1)`, starting one drawer-width offscreen. There is no animated loading shimmer or button scale effect. Reduced-motion preference removes transitions and animations and restores automatic scrolling behavior. Motion and backdrop values live in the sidecar, not frontmatter primitives.

## Shapes

Controls are gently rounded (`control`); navigation links and standard icon buttons are slightly tighter (`compact`). The composer and large bridge-mark tile use the softer `panel` corner. Small letter avatars use `avatar` corners, with `avatar-large` corners for the larger preview/empty-state size. Small and large avatars are 34px and 58px square respectively; these are identity tiles, not pills.

The user-message bubble has a deliberately asymmetric outline (14px 14px 4px 14px); the bot reply has no surrounding bubble. Status dots and the owner-lock avatar are circular. The navigation drawer is flush and square-edged with a right divider. Native details disclosures, thin field borders, and lightly rounded rows remain visible; this is not a borderless or universally pill-shaped system.

## Components

### Buttons

Compact, legible, and stateful. Primary and secondary buttons share a minimum height (42px), icon gap (9px), and the padding and typography in frontmatter. The sign-in primary is a local taller variant (46px minimum).

- **Primary:** soft pink with dark plum text; a lighter pink on enabled hover.
- **Secondary:** neutral surface, ink text, and a one-pixel line; hover strengthens the surface and border. History suggestions reuse this variant with smaller, lighter text; there is no separate chip system.
- **New bot:** full-width rail action with muted-plum fill, pink label and plus icon, and a trailing chevron. Hover and selected state deepen the plum. It remains navigable while remote creation itself is disabled.
- **Icon:** square neutral control; enabled hover gains a surface and brighter icon. The standard is 36px square; the roster refresh is a local 28px exception. These observed sizes are not a claim that every control meets a 44px touch-target standard.
- **Text:** minimal background-free action; hover brightens and underlines the label. Check reply uses the action accent, while Reconnect in the offline strip follows caution coloring.
- **Send:** a 36px square upward-arrow action. Disabled state uses dedicated muted foreground/background colors at full opacity, rather than the generic button fade.
- **Disabled / busy:** ordinary disabled buttons use opacity .48 and a not-allowed cursor. Action labels change to stateful text such as Signing in…, Searching…, or Checking…. Enabled hover styles are guarded where implemented. There is no separate pressed-motion treatment.
- **Keyboard focus:** buttons, links, fields, selects, and disclosures receive a two-pixel accent outline with a three-pixel offset. The password group uses a focus-within outline; the composer also changes its border on focus within. Focus is not represented by a shadow.

### Inputs / Fields

Dark, clearly bounded fields use the shared input treatment, one-pixel line, accent caret, and faint placeholder. Disabled creation fields retain their surface but use muted text. Native textarea resizing is retained. Visible labels distinguish Required from Optional; the composer and history query have accessible visually hidden labels. Errors are text beside the relevant form, with alert semantics where implemented; the build does not add a separate red field-border validation state.

The owner secret uses a password input inside an icon-bearing outline. The history query joins a search icon, text input, and primary Search button in a rounded container, with native selects below. The composer is a tinted, bordered panel with a resizable textarea (66px minimum, 220px maximum height), helper state, and the send action. Cmd/Ctrl+Enter submits; ordinary Enter remains available for multiline text, and composing input is not intercepted.

### Navigation and dialog

The rail exposes the exact product name, prominent New bot action, Workspace links, Your bots, connection state, and owner access. Current route links carry `aria-current="page"`; selected bot controls carry `aria-pressed`. Long bot labels truncate in the rail. The filter, refresh, open, close, sign-out, copy, and send controls have accessible names; decorative SVGs and avatars are hidden from assistive technology.

Mobile navigation is an actual `<dialog>` opened with `showModal()`, named **Workspace navigation**, with an explicit Close navigation button. Selecting a route closes it and focuses the new toolbar heading; resizing beyond mobile closes it. The browser supplies native modal behavior. The recorded targeted check found the named dialog, dismissed it with Escape, and confirmed focus returned to Open navigation. Those assertions are narrower than a complete assistive-technology or focus-trap audit. A Skip to content link appears on focus and targets the main region.

### Conversation, receipts, and offline state

The user's message is a right-aligned tinted bubble with a timestamp; the bot's text sits directly on the canvas beneath an avatar and name. A receipt below the entry exposes the current phase: Prepared, Submitting…, Submitted · reply not verified, Delivery not confirmed, Waiting for a recorded reply, Reply verified, or Not sent. Recorded receipts use olive plus a check icon; uncertainty uses amber plus an alert icon. Error-phase receipts also use caution coloring. Details reveal the stable message identifier and explain that checks read rather than resend.

The composer remains editable offline and while a previous operation is pending; its helper copy explains why Send is disabled. Sending requires owner access, a reachable remote, a live selected bot, a non-empty draft, and no pending operation for that bot. Per-bot drafts survive switching and uncertainty in the exercised fixture flows. Check reply is a reconciliation action, not a second submission. The optimistic existence of a user bubble is not evidence of a verified reply.

**The Receipt Is Evidence Rule.** Reserve verified language for a checked record; neither a submitted request nor a connected browser establishes a remote reply.

Unavailable remote state is not shown as a failed sign-in or an empty roster. The rail explains unavailable bots, saved conversations remain identifiable, the chat strip offers Reconnect, and New bot allows drafting while disabling Create bot. Connections separates the remote gateway, local history index, and MCP endpoint instead of presenting one misleading global success state.

### Creation recovery

The bot preview is a flat avatar-and-name row with a bottom divider, followed by labeled fields and an action row. Once a creation operation exists, fields lock and the result area takes the action's place. Unconfirmed and created-but-unverified states use caution wording and offer Check creation status; a verified profile uses positive wording and Open conversation. Details retain operation and agent identifiers. The result uses a polite live region and errors use alerts. A profile check does not establish a selected native app window, and the fixture's verified appearance is not live creation proof.

### History and connection rows

History results are flat, separated excerpts with project heading, line range, preserved text, and a View source disclosure. Source paths and matching mode remain available without resembling executable instructions. Search has loading, empty, error, and returned-result states; returned fixture excerpts are not live remote transcript browsing. Connection rows keep technical addresses subordinate in wrapping monospace, use explicit independent status labels, and keep endpoint copying separate from public-deployment verification.

## Do's and Don'ts

### Do:
- **Do** retain the exact product name, charcoal world, native-chat typography, and authored SVG icon language.
- **Do** keep action, unavailable, and verified treatments visually distinct and pair states with readable text.
- **Do** preserve per-bot drafts and stable operation details through uncertainty; keep reconciliation actions separate from submission.
- **Do** keep every navigation action reachable in the mobile dialog and short-window scrolling rail.
- **Do** retain source and line provenance for history and visibly identify synthetic proof as synthetic.
- **Do** use the shipped CSS and component state logic as the source when refreshing these extracted tokens and snippets.

### Don't:
- **Don't** add glow, gradients, decorative metrics, or raised card grids to this workspace world.
- **Don't** treat an unavailable remote as failed owner authentication, an empty bot roster, or lost local history.
- **Don't** label gateway acceptance as a verified reply or a profile check as native-window selection proof.
- **Don't** disable draft editing merely because sending or creation is unavailable.
- **Don't** promote fixture screenshots, panel preview snippets, or generated tonal-ramp previews into evidence of live remote success or public deployment.
- **Don't** generalize local heading treatments, isolated optical values, or small icon-button dimensions into new universal design requirements.
