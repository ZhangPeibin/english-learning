# Adaptive Reading

Adaptive reading is extracurricular practice generated at request time. It is
not a formal course and does not have a curriculum lesson ID.

## Interpret the request

Use this workflow when reading practice fits the learner's progress or the
learner asks for it.

1. Read the resolved learning-state file when it exists.
2. Use the recorded CEFR level and observed reading ability. A requested level
   is a goal, not evidence that the learner can read at that level. If it is
   far above demonstrated prerequisites, explain the gap and offer a short
   diagnostic or reachable practice instead of a full high-level passage.
3. Respect topic, length, genre, and translation preferences within the
   learner's demonstrated reading readiness.
4. If neither a level nor learning state exists, ask for the level or offer a
   short placement check before generating the passage. If the learner cannot
   recognize letters or decode words yet, teach those foundations instead of
   generating a passage.
5. Use recorded interests, weak areas, and due vocabulary when useful, without
   forcing all of them into one passage.

## Generate the session

Use these default passage lengths for readers unless a suitable learner
preference calls for a different length:

| CEFR | Words | Default language shape |
| --- | ---: | --- |
| A1 | 80-120 | Short concrete sentences and familiar daily topics |
| A2 | 120-180 | Connected everyday descriptions and simple narration |
| B1 | 180-300 | Clear paragraphs, varied tenses, and some inference |
| B2 | 300-450 | More abstract ideas, denser vocabulary, and argument |
| C1-C2 | 450-650 | Nuanced structure, idiom, tone, and implicit meaning |

Treat the ranges as defaults, not tests of quality. A requested long passage
never overrides a missing reading prerequisite.

Create one coherent passage rather than a vocabulary list disguised as prose.
Introduce three to six useful expressions appropriate to the learner's level.
Keep most surrounding language comfortably readable so the target expressions
can be inferred from context.

Vary subject, genre, setting, and voice across sessions. Avoid repeatedly
generating quiet-morning reflections unless the learner requests that style.

## Teach interactively

Present the passage before explanations. Then provide or ask, as appropriate:

1. two to four comprehension questions across the session, one at a time;
2. vocabulary or expressions in context;
3. one inference, grammar, or style observation;
4. one short production task such as a summary, opinion, or continuation.

Do not reveal answers before the learner attempts the questions. Do not include
a full Chinese translation by default. Use bilingual support when the learner
requests it or when their recorded preference and level make it useful.

## Record the result

After the learner responds, append a concise entry to `reading_history` using
the schema in `references/learning-state.md`. Record only observed evidence.
Update `weak_areas` or the canonical `learning_items` record when the response
justifies it. Do not add new entries to the legacy `review_queue`.

Do not add the activity to `completed_lessons`, assign it a formal lesson ID,
or save the generated passage unless the learner explicitly asks to bookmark
or export it.
