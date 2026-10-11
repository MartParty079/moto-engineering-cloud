# Frontend refresh

The current rider app keeps its existing workflows and configurable dashboard. Dark green/charcoal surfaces, restrained accents and clearer spacing unify the shell. Home presents Start Ride, Add Maintenance and Settings. The labeled sign-in form preserves production invitation-only access and security flows.

marty-brand.css owns the shared theme; rider-welcome-ui.js owns home/utilities; main.js owns the base shell; ui-polish.js owns mobile navigation; pwa.js places installation in the header/form. Ride OS keeps selectable themes and its existing dedicated recorder.

The integration preserves newer main rather than restoring removed AI or engineering views. Branding no longer injects a competing overview or observes every content mutation. Recovery controls live in the existing Ride dashboard.

Ride Center uses a compact mode band and a gauge-first telemetry grid inspired by Torque's customizable dashboard. The existing widget editor, themes, ride controls and source labels remain. The retired split-speed patch no longer replaces the canonical speed gauge. Map layout takes a map-first approach inspired by onX Offroad: floating recenter/layer shortcuts, a saved-route search, a quieter navigation dock, and clear route sheets. Search covers the rider's saved routes and waypoint names; it does not claim a nationwide trail catalog or offline tile packs. Maps & Routes owns its header and heading rotation.

The current-speed card keeps the speed reading centered in a circular gauge. Posted-limit and adaptive status appear in a separate, readable footer so they do not overlap the gauge at narrow widths. An unavailable limit remains marked with a dash.

Desktop, tablet and 390px layouts are checked with synthetic fixtures and isolated sessions. Legacy observer/global CSS interactions remain candidates for later consolidation; no workflows are silently removed to simplify them.
