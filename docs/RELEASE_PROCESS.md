# Release Process

## Pull request gate
- Linked issue and acceptance criteria.
- Complete diff reviewed.
- `npm ci` and `npm run audit` pass.
- Required human or physical testing recorded.
- Security, data, hardware, deployment, and rollback sections completed.
- No unresolved review thread.

## Merge
- Human authorization is required.
- Prefer squash merge for bounded feature and maintenance work.
- Do not merge with failing required checks.
- Record any accepted warning or deferred risk in the pull request.

## Deployment
- Deployment is a separate authorized action.
- Identify target environment and expected version.
- Confirm secrets and configuration without exposing values.
- Run smoke checks for navigation, authentication, data access, and the changed feature.
- Monitor errors and retain a rollback path.

## Firmware and hardware releases
- Tag the firmware version and protocol version.
- Preserve the validated binary, source commit, pinout, BOM, and bench-test evidence.
- Revalidate after component, wiring, power, enclosure, or protocol changes.

## Rollback
- Software: revert the merge or redeploy the previous known-good build.
- Data: use a reviewed reverse migration or restore procedure.
- Firmware: retain and document the previous known-good image.
- Hardware: disconnect or bypass the prototype when safe behavior is uncertain.
