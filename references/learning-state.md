# Learning State

The resolved learning-state file is the durable record for one learner. It is
normally `LEARNING.md`. When that path belongs to another workflow, use a path
chosen by the learner, such as `ENGLISH_LEARNING.md`. Read this reference before
creating or updating the file.

## Rules

- Keep YAML valid and dates in `YYYY-MM-DD` format.
- Use exact lesson IDs from `curriculum/README.md`.
- Record only observed results. Do not invent scores, study time, or completion.
- Preserve learner notes and fields not defined here.
- Keep `weak_areas` specific enough to guide a future exercise.
- Add a review item only when the learner completed or attempted the material.
- Replace a review item's due date after review instead of creating duplicates.
- Keep adaptive readings out of `completed_lessons` and `current_lesson`.
- Store only useful adaptive-reading metadata by default, not generated passages.
- Record only profile details the learner provides. Do not infer age, location,
  nationality, or language from their writing.
- Use profile details for appropriate personalization, never for cultural or
  ability stereotypes.

## Fields

- `learner`: optional profile details used to personalize teaching.
  - `preferred_name`: how the learner wants to be addressed.
  - `age_or_age_range`: optional age information in the learner's own terms.
  - `country_or_region`: optional location context, not assumed nationality.
  - `native_language`: the learner's first or strongest language.
  - `explanation_language`: the language to use for teaching explanations.
- `goal`: the learner's stated outcome.
- `level`: current CEFR estimate, or `unplaced` before assessment.
- `focus`: ordered list of priorities.
- `study_minutes_per_session`: the learner's available time.
- `current_lesson`: lesson being studied, or `null`.
- `completed_lessons`: evidence-bearing completion records.
- `reading_preferences`: topics and presentation choices for `/read`.
- `reading_history`: concise records of completed adaptive reading sessions.
- `weak_areas`: recurring or important difficulties observed in responses.
- `review_queue`: lesson or topic, due date, and reason for review.

Scores are optional integers from 0 to 100. Omit a score when the activity did
not produce enough evidence for one.

Each `reading_history` entry may contain `date`, `level`, `topic`, `result`,
`new_vocabulary`, and `notes`. It must not use a formal curriculum lesson ID.
