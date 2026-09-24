# Multi-Date Mastery Evaluation

Run: 2026-09-24. Five fictional A1 learner scenarios used dated prior attempts
and a new live Codex conversation in separate private temporary workspaces.
The learner answered a new school-item borrowing example in each scenario.

| Scenario | Observed state after answer | Next review |
| --- | --- | --- |
| `mastery_first` | `independent` after an earlier error and cued correction | 3 days |
| `mastery_second` | `independent` after a second correct independent answer on a later date | 7 days |
| `mastery_third` | `mastered` after three correct independent answers on different dates and examples | 14 days |
| `mastery_regression` | `needs_work` after a partial answer to an item marked mastered | 1 day |
| `mastery_recovery` | `independent` after one correct answer following a regression | 3 days |

All five `node tests/skill/run.mjs <scenario>` commands exited 0 with 2/2
successful turns. `node tests/skill/check.mjs <five trace paths>` exited 0:
each scenario had 8 passes and 0 failures. I inspected the tutor replies and
the before/after learning state in every trace. The same `borrow-request` item
was updated with the learner's actual response and no duplicate of that item.

The first `mastery_recovery` run exposed a defect: the Skill counted three
correct answers from before a later error and immediately restored `mastered`
after one recovery answer. The checker failed that original trace (7 pass,
1 fail). `references/learning-state.md` now requires counting independent
successes only since the latest incorrect, partial, or cued attempt. A fresh
run of the affected scenario passed and scheduled review in three days.

These scenarios seed dated historical responses; they do not make the clock
advance during a live conversation or establish real long-term retention.
They verify the Skill's handling of the supplied evidence in these samples,
not a deterministic guarantee across model runs. The first scenario also
recorded `notebook` as a separate cued vocabulary item after the tutor supplied
its meaning; the sentence-pattern item remained unique.

Raw traces are private temporary files under
`/var/folders/tn/7klhkm695mg0hdmjjyv8_ks80000gn/T/`:

```text
english-skill-mastery_first-ViLfAw/trace.json
english-skill-mastery_second-GjB2Wm/trace.json
english-skill-mastery_third-HAh8qH/trace.json
english-skill-mastery_regression-wCG8rD/trace.json
english-skill-mastery_recovery-nP9rYB/trace.json  # original failure
english-skill-mastery_recovery-XI8dXJ/trace.json  # after rule fix
```
