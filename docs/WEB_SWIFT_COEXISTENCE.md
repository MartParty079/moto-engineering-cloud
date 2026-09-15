# Keep the web app usable during the Swift port

The user intends to continue daily use of the web app while Swift development proceeds. This is a compatibility requirement for both developers, not a request to replace or shut down the current deployment.

- Maintain web functionality, accounts, record IDs, attachments and existing workflows during the port.
- Develop Swift against a separate authorized development environment. When approved for real use, both clients should work with the same compatible backend and owned records; do not create an independent production dataset that silently diverges.
- Prefer additive, versioned backend contracts. Do not rename/drop fields, change their meaning or remove existing APIs while the deployed web client still depends on them.
- Release independently verified web fixes without waiting for Swift completion. Keep migration-dependent work out of a daily-use release until its backend prerequisites and old-client compatibility pass development checks.
- Verify writes from each client can be read by the other. Test simultaneous ride completion and mileage updates, permission changes, attachments and account isolation. Review legacy mileage write paths before claiming multi-client accounting is safe.
- Preserve pending browser rides and recovery exports during updates. Do not clear local storage, reset accounts or migrate production records as a shortcut to native compatibility.
- Retire web features only after explicit user agreement and demonstrated Swift parity on physical devices.

## Current delivery status

The refreshed web app is reconciled with current main. See DEPLOYMENT_RELEASE.md for actual release receipts and evidence. Swift remains a future additional client.

The additive migration preserves bigint sample IDs and old-client inserts while adding client_sample_id, session markers and complete_ride_v1. The actual three-table schema has been inspected and tested in isolation. Supply an authorized development project for native integration. Older clients retain separate mileage writes; update them before relying on coordinated simultaneous completion.

Preserve pending journals during updates. No independent production fork or dataset is required for Swift. Physical iPhone/native acceptance remains required.
