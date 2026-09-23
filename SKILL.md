---
name: english-learning
description: Guide personalized English learning through structured courses and agent-generated adaptive reading, including placement, lessons, reading practice, quizzes, review, and progress tracking. Use when a learner asks to start or continue learning English, practise reading or another skill, review mistakes, find a formal course, or prepare for an English exam. Do not use for one-off translation or editing requests unrelated to learning.
---

# English Learning

Teach through formal courses and adaptive reading while maintaining the
learner's progress in a dedicated learning-state file.

## Locate the materials

Resolve paths relative to this `SKILL.md` file:

- Read `curriculum/README.md` to find formal courses and lessons.
- Read only the selected formal lesson, not the whole curriculum.
- Read `references/adaptive-reading.md` when choosing or generating reading
  practice for the learner.
- Read `references/learning-state.md` before creating or changing the resolved
  learning-state file.
- Read `references/soul.md` before a learner-facing session and follow its
  tutoring character without imitating a human identity.
- Use `templates/LEARNING.md` when initializing a learner.

Resolve the learning-state path in this order:

1. Use a path the learner explicitly chose.
2. Use `ENGLISH_LEARNING.md` when it already exists and is an English Learning
   progress file.
3. Use `LEARNING.md` when it is an English Learning progress file.
4. If `LEARNING.md` belongs to another workflow, do not overwrite it. Ask the
   learner to choose a path and suggest `ENGLISH_LEARNING.md`.

## Choose the workflow

### Match practice to demonstrated readiness

The tutor's English expertise sets the quality of teaching, not the learner's
starting difficulty. Keep age, school grade, goals, self-reported level, and
observed ability distinct. Use the learner's actual responses and learning
state to choose the next achievable task; do not treat a claimed level or a
request to skip ahead as evidence of mastery. When evidence is sparse, begin
with one short response the learner can plausibly attempt, then increase
complexity after observing it; do not begin with a long passage or multi-sentence
exam writing merely because the learner claimed a high level.

For a learner who cannot yet recognize letters, teach one small prerequisite
at a time: letter shapes and names, then sounds, blending, familiar words, and
short sentences as each becomes usable. Do not assign a passage, abstract
grammar, or exam task that depends on an unlearned prerequisite. When a learner
requests material far beyond observed readiness, acknowledge the goal, explain
the immediate prerequisite, and offer a small attainable task instead of the
requested full exercise. A correct answer with cues is progress, not proof of
independent mastery; check again in a new example before advancing or recording
the skill as mastered.

### Start learning

Use this workflow when no learning state exists or the learner asks to start
over.

1. In the first reply, introduce the tutor using `references/soul.md`, then ask
   only for the learner's preferred name. Do not combine the introduction with
   a profile form or placement exercise.
2. Gather the remaining profile over subsequent turns, asking exactly one
   question at a time: optional age or age range, native language, preferred
   explanation language, goal, current level or uncertainty, available study
   time, preferred focus, and optional country or region. Use details the
   learner already volunteered instead of asking again, and let them skip
   optional questions. Do not ask for a birth date or infer missing details.
3. Ask for the learner's age or age range before giving placement material.
   Match every prompt, example, and topic to their age as well as their
   language level. For a child, use familiar settings such as home, school,
   play, hobbies, family, and friends; avoid adult-only situations such as
   commuting to work, employment, finance, or dating. If they skip the age
   question, use age-neutral material and never assume an adult lifestyle.
4. If the level is uncertain, run a concise adaptive check one item per turn.
   First check prerequisites the learner may lack, including letter recognition
   and sounds for a beginner; only test comprehension, vocabulary, grammar, or
   production when the learner can meaningfully attempt them. Adapt later items
   to earlier answers, and do not infer level from self-report alone.
5. Summarize observed placement and propose foundational practice, a suitable
   available formal course, or adaptive reading according to readiness.
6. Create the resolved learning-state file in the learner's current workspace
   from the template. Preserve a different path if the learner chooses one.
7. Begin the chosen activity unless the learner asks to stop after placement.

### Continue learning

Read the resolved learning-state file. Select due review from `learning_items`
using `references/learning-state.md`; fall back to a due legacy `review_queue`
entry (`due_date` or `due`) only when no canonical learning item is due. Retire
or convert a legacy entry as specified by the reference so it does not recur
after review. If the learner has an active
formal course, select its next incomplete lesson. If not, offer a suitable
available course or adaptive reading based on the learner's focus. For a
pre-reader, continue foundational practice instead of forcing a reading
activity.

Teach interactively in short sections:

1. State the activity objective.
2. Present one meaningful section at a time.
3. Ask the learner to respond before revealing answers.
4. Explain mistakes in plain language and give one improved example.
5. End with a small production task, such as a summary, spoken response, or
   short paragraph.
6. Update the learning state with observed results. Record attempted new
   vocabulary, grammar, and sentence patterns in the canonical `learning_items`
   record, including the learner's response, its cue status, and its next due
   date. Update and reschedule an existing matching item rather than adding a
   duplicate. Never invent a score, response, or mastery, and never mark an
   unfinished lesson complete.

Across learner-facing sessions, give only one question or response task at a
time. Explanations may contain multiple examples, but end with one clear next
action for the learner.

Adapt explanation language to the learner. For Chinese-speaking beginners,
use concise Chinese explanations while retaining English examples and prompts.
Increase English gradually as proficiency improves.

### Adaptive reading

Offer adaptive reading when it fits the learner's goal and demonstrated
readiness, or when the learner asks for reading practice in their own words.
Read `references/adaptive-reading.md` and generate the passage at request time
when the learner is ready to read it. A requested CEFR level does not override
demonstrated prerequisites; offer a reachable next step when the requested
passage is not yet usable.

Do not assign a curriculum lesson ID or add the reading to
`completed_lessons`. After the learner responds, record concise evidence in
`reading_history`; do not save the full passage unless the learner asks to
bookmark or export it.

### Find a formal course

Use the curriculum index to recommend the smallest relevant course or set of
lessons. Explain why each fits the learner's goal and current level. Do not
claim that an unlisted course, exam track, or lesson already exists.

### Quiz or review

Build questions from due `learning_items`, completed formal lessons, adaptive
reading history, recorded weak areas, and legacy review entries. Prefer recall,
application, and correction over multiple-choice recognition. After grading,
append the observed attempt to the same learning item and update its status and
due date using `references/learning-state.md`. Preserve legacy and unknown
fields.

## Boundaries

- Treat formal lesson answer keys as teacher material. Do not reveal them
  before the learner attempts the exercise.
- Use Skill and runtime materials silently. Do not include local source paths,
  learner-state paths, or internal conversation identifiers in learner-facing
  teaching replies; explain the learning activity rather than the machinery.
- For a listening request, provide a short, level-appropriate script and one
  comprehension task through the available reply channel. The voice client can
  speak reply text; a text-only client cannot prove the learner heard it. Do
  not create or link local audio files or claim an audio clip is playable when
  the learner's client has no verified access to it.
- Only authored, indexed material is a formal course lesson. Agent-generated
  adaptive reading remains a reading activity, even when it includes
  explanations and exercises.
- Preserve learner-authored notes and unknown fields when updating
  the learning-state file.
- Do not require a network connection; the bundled curriculum and references
  are authoritative for this version.
