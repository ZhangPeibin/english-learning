# Join In Course Integration - Requirements Discussion

**Status:** analyzing
**Release:** mvp
**Feature:** join-in-course-integration

## Problem

The skill currently has no published formal course. Its adaptive activities are generated independently, so learners cannot follow an established textbook sequence or keep progress against that sequence.

The requested feature is to make the FLTRP/Cambridge primary-school textbook *English (Join In), starting from Grade 3* the main course, synchronize each learner's progress through it, and provide supplemental activities based on the learner's current textbook material.

## Users and Outcomes

- Primary-school learners in China who use the Join In textbook can continue from their actual place in the textbook.
- The tutoring agent can distinguish textbook progress from optional supplemental practice.
- Learners receive additional practice that is relevant to the unit they are studying.

## Current Experience

- `curriculum/README.md` states that no formal course has been published.
- `SKILL.md` supports formal lessons and adaptive reading as separate learning modes.
- `templates/LEARNING.md` can record a current lesson and completed lessons, but it does not yet define textbook edition, volume, unit, or external synchronization metadata.
- The user supplied `https://www.zxxk.com/docpack/3353026.html` as the candidate source package. Automated access currently returns only the site's JavaScript browser-verification page, not the package catalogue or downloadable files.

## Scope

### In Scope

- Import the selected Join In textbook as an authored, indexed formal course.
- Treat the textbook sequence as the canonical main-course sequence.
- Record and synchronize learner progress against that sequence.
- Generate supplemental practice from the learner's current textbook material without confusing it with textbook completion.

### Out of Scope

- Not decided yet.

## Required Behaviour

- Textbook courses, units, and lessons have stable identifiers and a defined sequence.
- Learner progress identifies the exact textbook location rather than only a general CEFR level.
- Supplemental activities remain separate from formal textbook completion records.
- The system does not mark textbook content complete without observed learner evidence or an authorized progress update.

## Edge and Failure Cases

- Different editions or printings may have different unit structures.
- A learner may start in the middle of a volume or move backward for review.
- Imported content may be incomplete or unavailable.
- Local progress and an external progress source may disagree.
- A supplemental activity may cover several textbook lessons without completing them.

## Constraints and Dependencies

- The textbook content is copyrighted. The project needs an authorized content source and must not rely on pirated copies.
- Exact edition, grade volumes, source format, and permitted uses are not yet confirmed.
- Import from the supplied ZXXK page depends on files downloaded through an authorized interactive account session; the repository tooling cannot currently read the protected package contents from the URL alone.
- The meaning and source of "synchronize progress" are not yet defined.
- The existing repository is a Markdown-based Codex skill with no application runtime, database, or synchronization service.

## Decisions

- The target textbook is *English (Join In), starting from Grade 3*, published collaboratively by FLTRP and Cambridge University Press, as identified by the user.
- The release is `mvp`.
- The feature slug is `join-in-course-integration`.
- The product has three distinct layers: imported textbook content, textbook progress, and textbook-based supplemental activities.
- The imported textbook is the main course; supplemental activities do not replace or silently advance it.
- The candidate source is the ZXXK document package at `https://www.zxxk.com/docpack/3353026.html`.

## Open Questions

- How will the downloadable files from the supplied ZXXK package be made available for import?
- Which edition, printing, grades, and volumes are included in the MVP?
- What content granularity should be imported and represented?
- What system is the source of learner progress, and in which directions must it synchronize?
- How should learner identity and multiple learners be represented?
- What evidence marks a textbook lesson complete?
- Which supplemental activity types belong in the MVP?
- What behaviour is explicitly out of scope?

## Evidence

- `curriculum/README.md`: no formal course is currently published.
- `README.md`: formal authored courses and generated adaptive reading are intentionally separate.
- `SKILL.md`: formal course selection and progress updates already exist at a general level.
- `templates/LEARNING.md`: current learner state supports `current_lesson` and `completed_lessons` but has no textbook-specific synchronization fields.

## Session Log

### 2026-09-17

- Reframed the request from a generic children's course to integration of the specified Join In textbook.
- Confirmed that textbook content, learner progress, and supplemental activities are separate product responsibilities.
- Assigned the work to release `mvp` and recorded unresolved source, edition, progress, and scope decisions.
- Recorded the supplied ZXXK package URL. Direct retrieval returned only a browser-verification challenge, so the package files still need to be supplied from an authorized browser session.
