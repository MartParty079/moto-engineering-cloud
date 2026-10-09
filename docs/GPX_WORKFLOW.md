# GPX originals and ride exports

This implements the next local-first GPX workflow from the Moto Mission PRD. Invitation-only verified accounts and existing MFA remain required; local storage is not a guest account mode. No backend migrations, provider purchases, production access or deployment are part of this change.

## Route ownership and storage

`route-library.js` owns the Routes / GPX page. `route-store.js` stores summaries, geometry and original file Blobs in separate IndexedDB stores in `moto-route-library-v1:<backend origin>`, with keys scoped to the signed-in owner. Imports commit all three records atomically using add-only writes. Originals have no edit, overwrite or automatic deletion operation. These browser namespaces isolate application access; they are not encryption against someone who controls the device or origin.

New GPX imports no longer automatically insert cloud route records. The page previews the file before explicit saving; the existing map-sheet import saves locally. Existing cloud routes remain visible and editable in the map tools. Local originals appear read-only on the map and can be downloaded byte-for-byte, including extensions not interpreted by the preview. Original synchronization and editable derivatives are deferred. Keep a downloaded copy: browser storage can be cleared or evicted, and another device will not have this library.

`gpx.js` validates XML, coordinates and timestamps, accepts GPX 1.0/1.1 tracks and routes, and preserves segment boundaries, waypoints, elevation and recorded times in interpreted geometry. Files are limited to 10 MiB and 100,000 combined track/route/waypoint points. Missing or invalid coordinates, malformed XML and document types/entities fail visibly. Segment distances omit capture gaps. SVG previews need no basemap; showing routes on the interactive map still requires its online resources. Imports and route setup are blocked while recording is active.

## Recorded tracks

Rides / Review offers GPX download for completed rides. `ride-gpx.js` fetches samples with explicit owner/session filters, stable timestamp/id ordering and exact total counts, adapting to smaller server page limits. Every returned record is checked for ownership and duplication. A changing total, missing count, incomplete page sequence, account change, malformed GPS or failure aborts the export. Requests share a 30-second deadline and a 200,000-sample cap; the UI reports an error instead of downloading a partial track. RLS remains required and unchanged.

Recovery also offers a local GPX download before upload. It requires stopped capture and a complete local journal with zero acknowledged samples. Once some samples have uploaded, the user must finish synchronization and use Review for a complete track. JSON recovery remains available for unacknowledged records. Motion-only samples do not become GPS fixes; recorded gaps over 30 seconds and explicit local interruptions produce separate track segments. Export never snaps or interpolates the original track.

## Verification and release checks

Run `npm run audit`, `npm run test:browser`, `npm run test:browser:rides` and `npm run test:browser:gpx`. Browser suites use intercepted local test requests and real Chromium IndexedDB, with other network access blocked. They cover exact original bytes, malformed inputs, reload persistence, owner isolation, waypoint search, narrow mobile layout, segmented geometry, local pending-ride export and full long-ride pagination. Map drawing uses a test renderer; it does not establish real provider success. Unit tests cover atomic immutable storage, owner/project isolation, gaps, invalid positions, pagination and incomplete-export rejection.

Before an authorized release, test real invited rider/admin accounts and MFA, disposable GPX imports and downloads at desktop/mobile widths, existing cloud route editing, completed ride exports under the actual server page cap, pending recovery and partial-upload rejection, and account switching. Confirm map errors remain bounded, denied features fail closed and storage failures remain visible. Verify hard refresh and installed-PWA updates preserve both local libraries and pending journals. Physical iPhone/background behavior and deployed access policies remain manual release gates.

Rollback restores the prior reviewed frontend only after authorization. No backend rollback is needed. Preserve both IndexedDB databases and pending queues; the previous frontend will not expose the new local route library. Download originals before a downgrade if access through the prior UI is needed. No merge or deployment has occurred as part of local implementation.
