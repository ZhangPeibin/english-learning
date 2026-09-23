# Broad Learner Scenario Evaluation

Run: 2026-09-23. Skill revision: `d9aea3e` (unchanged during the runs).
Node: `v22.23.1`; Codex CLI: `0.156.1`, using its locally configured model.
All learner profiles and progress files were fictional and isolated in private
temporary workspaces. This is one sample per scenario, not an effectiveness
estimate.

Nine focused scenarios completed 27/27 Codex invocations. Each scenario's
`run.mjs` command exited 0, and `check.mjs` exited 0 for every trace. The
checker covers narrow invariants; the judgments below also inspect the actual
replies and progress snapshots. Some scenario observations were corrected after
review because they demanded more than the learner's request or the text
supported. Their learner inputs and Skill content did not change, so the
original traces remain applicable.

| Scenario | Turns | Observed result |
| --- | ---: | --- |
| `p0` | 5 | Kept an eight-year-old non-reader on letter recognition and revisited A/B confusion. |
| `r0` | 1 | Declined a B1 passage for a learner who could not identify A/B. |
| `j3` | 5 | Used B1-level opinion, inference, and two-viewpoint reading tasks with evidence-based feedback. |
| `tense_b1` | 3 | Correctly distinguished finished-time simple past, unspecified experience, and a state continuing to now. |
| `fixed_inference` | 2 | Inferred possible future rain and treated rain at lunch as possible but unproved. |
| `ielts_unplaced` | 3 | Repaired observed foundation errors, kept the learner unplaced, and offered a reachable IELTS-style writing step without a band claim. |
| `toefl_text_b2` | 3 | Generated a text-only listening-style item, repeated its script, and withheld the answer while giving a clue. The clue was fairly revealing. |
| `ielts_both_views_b2` | 2 | Gave grounded paragraph feedback, identified the other view needed for the full response, and distinguished mentioning both views from developing them. |
| `toefl_fixed_transcript_b2` | 3 | Corrected C using the unchanged-time clue, then accepted B with the stated lab-repair reason. B followed feedback and is not independent mastery. |

The progress snapshots recorded specific mistakes without invented scores or
formal-lesson credit. Their shape is not yet a reliable inventory of learned
vocabulary, grammar, and sentence patterns: evidence is scattered across
`weak_areas`, `review_queue`, and freeform notes. In the TOEFL fixed-transcript
sample, a review item used `due` while other samples used `due_date`; this
inconsistency could affect due-review selection and needs a separate check.

These runs do not assess real listening or pronunciation, a full IELTS essay,
TOEFL scoring, official exam materials, or long-term learning outcomes. The
curriculum has no published formal course to evaluate.

Raw `trace.json` and `review.md` files are under
`/var/folders/tn/7klhkm695mg0hdmjjyv8_ks80000gn/T/` in these directories:

```text
english-skill-p0-z1q2p0
english-skill-r0-I9qmI3
english-skill-j3-H2rqBM
english-skill-tense_b1-G0Lvw1
english-skill-fixed_inference-qYuwdD
english-skill-ielts_unplaced-DIfiuS
english-skill-toefl_text_b2-EdY3IV
english-skill-ielts_both_views_b2-6DsEaN
english-skill-toefl_fixed_transcript_b2-EgRuqY
```
