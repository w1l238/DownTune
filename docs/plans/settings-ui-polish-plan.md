# Settings UI Polish Implementation Plan

> **For Hermes:** Implement with Claude Code and the UI UX Pro Max skill. Preserve existing uncommitted changes. Do not commit. Do not read, print, or expose `server/.env` secrets.

**Goal:** Polish the DownTune Settings page using the five selected UX improvements: section cards/summaries, conditional Spotify API disclosure, unsaved-change handling, dynamic helper text, and secret-safe Spotify credential UX.

**Architecture:** Keep the existing React Settings page and frosted glass CSS. Avoid new UI dependencies. Build on the existing compact `ChoicePills` pattern and current `/config` behavior where a blank `clientSecret` preserves the stored secret.

**Tech Stack:** React/Vite client, existing CSS variables, `react-icons/fi`, existing `apiFetch` config client.

---

## Task 1: Add baseline snapshot and dirty-state tracking

**Objective:** Track the last saved/loaded settings so Save can be disabled until a setting changes and Reset can restore the last saved values.

**Files:**
- Modify: `client/src/pages/Settings.jsx`

**Implementation details:**
- Add a `savedSettings` state object or memoized baseline that captures config-backed values and localStorage-backed values after initial load and after successful save.
- Include at least: `limit`, `clientId`, `clientSecret` as blank baseline, `hasExistingSecret`, `downloadPath`, `searchProvider`, `autoScan`, `autoRefreshLibrary`, `background`, `bgImageUrl`, `bgDim`, `albumArtStyle`, `blurBase`, `accent`, `animSpeed`, `density`, `albumDownloadMode`, `audioFormat`, `audioQualityPreset`.
- Compute `hasUnsavedChanges` by comparing current serializable values against the baseline. A typed `clientSecret` should count as dirty.
- Disable Save when `!hasUnsavedChanges || saving`.
- Add a Reset/Cancel button that restores current state from the baseline and reapplies previewable appearance values as needed.
- Keep current live preview behavior for appearance controls.

**Verification:**
- Changing any setting enables Save.
- Saving disables Save after success.
- Reset restores settings to the last loaded/saved values.

## Task 2: Reorganize Settings into clear frosted section cards with summaries

**Objective:** Make the page more scannable without changing the overall visual language.

**Files:**
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/css/Settings.css`

**Implementation details:**
- Keep existing sections but improve card headers with a short summary line.
- Preferred summaries:
  - Appearance: current accent, density, speed.
  - Downloads: current format and download path/default location.
  - Library & Search/Search: selected provider and result limit.
  - Spotify API: configured/missing state, only when visible.
- Use small muted text, not large badges.
- Preserve icon-based section titles and glass style.

**Verification:**
- Page remains readable at desktop and mobile widths.
- Summaries update when settings change.

## Task 3: Hide Spotify API unless Spotify is selected

**Objective:** Remove credential noise when Deezer is selected.

**Files:**
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/css/Settings.css`

**Implementation details:**
- Replace the disabled always-visible Spotify API card with conditional rendering: render only when `searchProvider === 'spotify'`.
- Add a dynamic helper under Search Provider:
  - Spotify: `Uses Spotify search and requires Spotify API credentials below.`
  - Deezer: `Uses Deezer search. No Spotify API credentials required.`
- Do not clear existing Spotify fields just because the panel is hidden.

**Verification:**
- Selecting Deezer hides the Spotify API card.
- Selecting Spotify reveals it again with previously typed values still present.

## Task 4: Improve secret-safe Spotify credential treatment

**Objective:** Make the Spotify Client Secret field safer and clearer.

**Files:**
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/css/Settings.css`

**Implementation details:**
- Keep the secret input as password by default.
- Add a small icon-only show/hide button for newly typed text only.
- If no new secret is typed, the reveal button should be disabled or hidden.
- Placeholder when configured: `Configured — leave blank to keep existing secret`.
- Helper text:
  - Existing secret and blank field: `A secret is saved. Leave blank to keep it, or type a new value to replace it.`
  - New/edited secret: `New secret will replace the saved value when you save.`
  - Missing: `Required for Spotify search.`
- Never display the stored secret value.

**Verification:**
- Stored secret is never shown.
- Show/hide only affects newly typed characters.
- Blank secret still preserves existing backend behavior.

## Task 5: Add quiet unsaved-change save bar/status

**Objective:** Make Settings changes explicit and reversible.

**Files:**
- Modify: `client/src/pages/Settings.jsx`
- Modify: `client/src/pages/css/Settings.css`

**Implementation details:**
- Replace the lone bottom Save button with a glassy save row/bar containing:
  - quiet status text: `Unsaved changes` or `All changes saved`
  - Reset button visible/enabled only when dirty
  - Save button disabled until dirty
- Keep mobile layout stacked or full-width.
- Use existing icon style (`FiSave`, `FiX`/reset icon, `FiLoader`) and no emojis.
- Add visible focus states and pointer cursors.
- Respect reduced motion if adding any transitions.

**Verification:**
- `npm run lint --prefix client`
- `npm run build --prefix client`
- Inspect `git diff -- client/src/pages/Settings.jsx client/src/pages/css/Settings.css`.

## Acceptance criteria

- Spotify API credentials are hidden when Spotify is not selected.
- Search provider helper text changes based on provider.
- Spotify Client Secret UX never reveals stored secrets and only toggles newly typed input.
- Save is disabled until there are unsaved changes.
- Reset restores the last loaded/saved settings.
- Section summaries make the page scannable without noisy badges.
- Styling matches existing frosted glass and compact pill UI.
- Client lint and build pass.
- No commits are made.
