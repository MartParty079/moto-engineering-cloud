# Safety Boundaries

## General rule

Moto Mission may observe, record, analyze, and present motorcycle data. It must not create an unreviewed path that can impair vehicle control, distract the rider, damage electronics, expose private data, or silently corrupt records.

## Human authorization required
- Merge to protected branches.
- Production deployment or migration.
- Access to production credentials or user data.
- Vehicle installation or road testing.
- Any command transmitted to a motorcycle interface.
- Changes affecting authentication, authorization, or destructive data operations.

## Hardware evidence
- Verify voltages, current draw, polarity, grounding, thermal behavior, and signal levels with appropriate instruments.
- Document part numbers and absolute maximum ratings.
- Include protection and failure behavior.
- Do not treat simulation, source code, or an agent statement as proof of physical safety.

## Rider interaction
- Riding screens must minimize interaction and cognitive load.
- Critical warnings must be clear but not obscure primary information.
- Features requiring sustained attention must be unavailable or deferred while moving when feasible.

## Data integrity
- Preserve raw measurements where practical.
- Record units, timestamps, source, protocol version, and quality state.
- Destructive actions require confirmation and a documented recovery path.

## Stop conditions
Work stops and returns to human review when requirements conflict, production access becomes necessary, a safety assumption lacks evidence, validation fails, or the requested scope expands materially.
