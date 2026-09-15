# Frontend refresh

The current rider app keeps its existing workflows and configurable dashboard. Dark green/charcoal surfaces, restrained accents and clearer spacing unify the shell. Home presents Start Ride, Add Maintenance and Settings. The labeled sign-in form preserves production invitation-only access and security flows.

marty-brand.css owns the shared theme; rider-welcome-ui.js owns home/utilities; main.js owns the base shell; ui-polish.js owns mobile navigation; pwa.js places installation in the header/form. Ride OS keeps selectable themes and its existing dedicated recorder.

The integration preserves newer main rather than restoring removed AI or engineering views. Branding no longer injects a competing overview or observes every content mutation. Recovery controls live in the existing Ride dashboard.

Desktop, tablet and 390px layouts are checked with synthetic fixtures and isolated sessions. Legacy observer/global CSS interactions remain candidates for later consolidation; no workflows are silently removed to simplify them.
