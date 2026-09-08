# Moto Mission Repository Policy

**Effective:** 2026-09-03  
**Applies to:** human contributors, coding agents, automation, and repository maintenance

## Purpose

Keep Moto Mission reviewable, recoverable, and safe. Git history is the archive. Branches and patch files are not an archive system.

## Source of truth

- `main` is the only production source branch.
- GitHub is the source of truth for repository state.
- Vercel production must deploy from `main` only.
- Supabase migrations committed to `main` define the intended database change history.
- `docs/ENGINEERING_BASELINE.md` defines the current system boundary and technical risks.

## Branch rules

1. Never push implementation work directly to `main`.
2. One task gets one branch and one pull request unless an explicit engineering decision authorizes stacked work.
3. Start every task branch from current `main`.
4. Allowed branch prefixes are `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `hardware/`, and `firmware/`.
5. Do not create `backup/` branches. Git history, tags, or releases are the backup mechanism.
6. Do not create branch-name version chains such as `final`, `final2`, `v2`, `v3`, or repeated copies of the same feature. Update the existing task branch or open a new task with a new requirement.
7. Delete merged branches immediately after merge.
8. Close abandoned pull requests instead of leaving them open indefinitely.
9. A branch with no active issue or pull request is stale after 14 days.
10. Before deleting a stale branch, compare it with `main`:
   - zero unique commits: delete it;
   - unique commits already represented elsewhere: delete it;
   - valuable unique work: create or update an issue describing that work, then preserve only the minimum branch needed for recovery until the issue is resolved.
11. Keep the active branch count small. The normal target is no more than five active implementation branches at once, excluding `main` and short-lived maintenance branches.

## Pull request rules

- Pull requests must target `main` unless a deliberately stacked change is documented.
- Draft PRs are for active work, not indefinite storage.
- A PR must state requirement, implementation, validation, risk, rollback, and any deployment or migration steps.
- A PR that has been inactive for 14 days must be closed, refreshed onto current `main`, or explicitly marked as intentionally parked in an issue.
- Superseded PRs are closed, not left open beside their replacement.
- Merge only after the branch is current enough to review cleanly and required checks pass.
- Prefer squash merge for ordinary feature, fix, and cleanup PRs so temporary implementation commits do not become permanent clutter.

## Frontend architecture rules

1. Fix the owning module. Do not solve normal defects by adding another global patch file.
2. New `*-fix.*`, `*-hotfix.*`, `*-cleanup.*`, `*-compat.*`, or version-suffixed runtime modules are prohibited by default.
3. An emergency compatibility patch is allowed only when:
   - the owning module cannot be safely changed in the same release;
   - the patch has a linked issue;
   - the file header names the removal condition;
   - the PR includes a planned removal date or milestone.
4. Do not increase the number of independently loaded runtime scripts or styles in `index.html` for ordinary feature work. Import new code through the owning domain module.
5. When a replacement implementation becomes canonical, remove the superseded implementation in the same PR unless compatibility evidence requires a temporary overlap.
6. Avoid global `MutationObserver` patches. Use explicit lifecycle hooks and component/module ownership.
7. There must be one canonical owner for ride state, GPS state, authentication state, and each major UI domain.
8. Do not fabricate data or keep obsolete UI alive merely to avoid deleting old code.

## File hygiene rules

- No duplicate files with names such as `copy`, `old`, `backup`, `final`, `final2`, or arbitrary version suffixes.
- Generated artifacts, local environment files, build output, and editor state do not belong in source control unless explicitly required.
- Test fixtures and mocks must live in clearly named test/development locations and must not be loaded by production code.
- Before adding a file, search for an existing owner that should absorb the change.
- Before removing a runtime file, verify direct imports, dynamic imports, service-worker precache references, HTML references, and event/global dependencies.

## Change-size rule

A change should do one coherent thing. If a PR mixes unrelated UI, database, telemetry, security, and cleanup work, split it. Repository cleanup may be broader only when it is behavior-preserving and each deletion is reference-audited.

## Validation gates

Every implementation PR must run:

```bash
npm run audit
```

In addition:

- UI changes: validate desktop and narrow mobile behavior.
- PWA/service-worker changes: validate install/update/cache behavior and `/api/*` routing.
- API changes: validate malformed input, timeout behavior, and authentication boundaries.
- Supabase changes: review migration order, RLS, grants, RPC exposure, and rollback risk.
- Telemetry changes: validate schema version, units, timestamps, identifiers, invalid-state handling, and offline retry behavior.

No failed check may be silently ignored. If a required check cannot run, the PR must state exactly why and what remains unverified.

## Cleanup cadence

At least once per month, or before a major release:

1. list all branches and open PRs;
2. close stale PRs;
3. delete merged and zero-unique-commit branches;
4. inventory `src/` references from `index.html`, static imports, dynamic imports, and the service worker;
5. remove verified dead compatibility/patch files;
6. review open issues for superseded work;
7. update `docs/ENGINEERING_BASELINE.md` if architecture or risks changed.

## Safety boundary

Repository cleanup must never delete production data, rewrite published migration history, expose secrets, merge unreviewed high-risk changes, or change motorcycle-control behavior as a side effect. High-risk changes remain governed by `AGENTS.md` and `docs/ENGINEERING_BASELINE.md`.
