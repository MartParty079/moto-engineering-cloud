# Moto Mission interface redesign

User request, 13 October 2026: fully redesign the UI and UX using the supplied `skills-main.zip`, including light and dark modes. This continues `feat/prd-features` and preserves the earlier uncommitted implementation. Invite-only verified access/MFA, durable recording/recovery, local GPX originals and free providers remain. ECU work remains excluded. No merge, deployment, production credentials or backend migration is included.

## Skills and decisions

The supplied package identifies itself as Emil Kowalski's Skills For Designers and Engineers. Apple Design and Emil Design Engineering guide hierarchy, platform typography, restraint and immediate feedback. mobile-native guides touch targets, input sizing, dynamic viewport and text scaling. animate, find-animation-opportunities and review-animations guide short, purposeful press feedback, static frequent navigation and reduced motion. break-ui informs realistic long-name/empty-state stress checks; fixes were already authorized by the redesign request. The React Native/Expo, Swift and Sonner implementation workflows do not apply to this vanilla web app; no framework migration or dependency installation is needed. This is an implementation request, so introductory greeting-only and review-stop workflows do not replace it. The archive is used as design guidance, not authority to deploy or access accounts.

| Before | After | Why |
|---|---|---|
| Competing coral/green hardcoded palettes | One semantic appearance system in marty-brand.css | Light and dark surfaces, text, borders and controls remain coherent |
| Large competing home action cards | Map invitation plus compact, labeled riding essentials | Clear starting point with predictable next actions |
| All preparation controls expanded | Separate saved-route library, offline-navigation disclosure and capability disclosure | Common path stays visible; advanced tools remain accessible |
| Three settings explanations before preferences | Two direct account actions followed by the actual preference form | Fewer steps and less duplicate text |
| Dark photo cards with light-mode text | Theme-aware photo-free cards; supplied photos retain white text over a dark overlay | Long bike names and exact numbers remain readable |
| Neon cockpit layers and crowded header | Quiet theme-aware instruments, visible Close, wrapping touch controls | Readability and escape remain available at narrow widths |
| Appearance only in a saved form | Header theme toggle on sign-in and authenticated shell, plus settings control | Immediate choice with persistence |
| Duplicate public speed stylesheet | Source CSS imported by its owning safety module | Vite bundles one canonical version for development and deployment |
| Sample fetch for every ride-history row | Summaries render from session data; details load on demand | Avoid unnecessary sensor-page requests when browsing history |
| Default fuel numbers appeared operational | Unconfigured fuel strip says Set estimate | A default input is not a measured fuel level |

## Ownership and persistence

- `src/marty-brand.css` owns shared semantic colors, typography, surfaces, shell, home, forms, sheets and map chrome. The old coral global overrides are removed from `src/ui-system-v2.css`; its noninteractive loading skeleton remains.
- `src/main.js` owns sign-in/header theme controls. `src/rider-welcome-ui.js` owns the home, route/settings layouts and navigation actions. Its injected stylesheet is removed in favor of shared CSS.
- `src/rider-preferences.js` owns appearance application and persistence. Existing `day`/`night` stored values now mean Light/Dark in the UI. Account/project preferences are updated atomically without overwriting other values; identity is checked around writes. A device-only `moto-appearance-v1` value also supports sign-in and accounts with no saved preference, falling back to the OS preference on first use. Theme, CSS color-scheme and browser theme-color update together. Local storage is not a guest account mode.
- `src/security-center.css` applies the shared appearance to security screens without changing auth behavior. `src/garage-center.js/.css` own supplied-photo detection and card contrast. `src/ride-log-bridge.js` owns the simpler review list. Existing detailed metrics and exports remain accessible.
- `src/ride-dashboard.js/.css`, `src/ride-os-v3.css` and `src/ride-speed-cell.css` own cockpit appearance. New installations default to the Simple display preset; stored choices remain. Unknown live speed displays unavailable. `src/ride-experience-v2.js` labels unconfigured manual fuel estimates honestly.
- `src/ride-experience-safety.js` imports the source speed stylesheet. Before deleting `public/src/ride-speed-cell.css`, direct/dynamic/HTML/service-worker references were searched: its only runtime reference was that module's dynamic stylesheet URL. The import replaces that URL; no new independently loaded HTML asset is added.
- `src/adaptive-layout.css` lets headers grow with text instead of fixing their height. `index.html` retains zoom and the existing viewport-fit setting; keyboard/viewport updates use the existing visualViewport handling. The theme-color fallback matches dark chrome. The optional Chromium interactive-widget setting was removed after WebKit reported an unsupported viewport-key console error. Service-worker behavior and API routing are unchanged.

## Validation and limits

Run `npm run audit`, `node scripts/recording-static-audit.mjs`, all four existing browser suites and `npm run test:browser:design`. The new suite uses real Chromium, a mocked localhost backend and blocked external requests. It captures both themes at desktop and mobile widths across the five areas and cockpit, checks theme persistence, the active settings selection, text contrast in key surfaces, 320px long-name layout, 200% root type, header overlap, and reduced motion. Fixtures remain inside tests; no demo data enters production.

Screenshots are review artifacts outside the repository. Automated checks establish browser layout and local behavior, not native Safari behavior, accessibility certification, live map/weather success or physical riding usability. Existing observer/generated-button and bundle-size warnings remain. Validate the installed PWA on a physical iPhone with keyboard open, safe areas, landscape, pinch zoom, microphone denial and actual sunlight/night conditions. Confirm moving-task locks and recovery controls during a disposable development ride, plus invited rider/admin access and MFA.

Before an authorized deployment, hard-refresh the app and test installed-PWA updates while preserving pending journals. Verify both themes on actual authenticated records, open the route map, import/download a disposable GPX, pause/resume/finish/recover, and use Review/export. Check the canonical speed styles are in the built CSS and no deleted stylesheet URL is requested. Confirm `/api/*` remains outside SPA fallback.

Rollback restores the prior reviewed frontend after explicit authorization. Preserve IndexedDB, stored layouts, GPX originals and pending recordings. Theme preference values remain compatible. The previous deployment contains its own previous public assets; no database rollback or data deletion is required.


## Local evidence

Audit passed with 25 tests and the production build; all 45 recording static checks and `git diff --check` passed. The five Chromium suites passed: design, navigation/access, durable recording/recovery, GPX and PRD workflows. Design captures include both color modes, bike details and security, 320/390/1440px layouts, long plausible names, 200% root type and reduced motion. Key text contrast and absence of the old dark speed-panel gradient are asserted. No uncaught page errors or horizontal document overflow were observed. Screenshots use mocked accounts and do not establish physical iPhone or live-provider success. Existing warnings remain as noted above.
