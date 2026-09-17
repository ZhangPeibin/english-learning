# English Learning

An agent-guided English learning system with local, durable progress tracking.
It combines authored formal courses with agent-generated adaptive reading.

Formal courses and adaptive reading are deliberately separate: only authored,
sequenced material belongs in the curriculum.

## How it works

```text
formal curriculum/             /read request
        |                           |
        |                           v
        |                  agent generates a passage
        |                           |
        +-------------+-------------+
                      v
              english-learning Skill
                      |
                      v
                 LEARNING.md
```

`SKILL.md` contains the teaching workflow. `curriculum/` contains only authored,
versioned courses such as `American High School English - Lesson 1` or a
structured IELTS writing course. A learner's `LEARNING.md` remains in their own
workspace, separate from shared course content.

## Two learning modes

### Formal courses

Formal courses have stable IDs, a deliberate sequence, prerequisites, and a
clear completion state. See [the curriculum index](curriculum/README.md).

No formal course has been published in this initial version.

### Adaptive reading

`/read` asks the Agent to generate a fresh extracurricular reading passage at
the learner's current CEFR level. It can incorporate interests, weak areas, and
recent vocabulary, then provide comprehension and production practice.

Examples:

```text
/read
/read technology
/read B2 about American school life
/read 300 words, English only
```

`/read` is an intent understood by this Skill, not a registered Codex platform
command. If it is not routed automatically, invoke it as:

```text
Use $english-learning /read technology
```

Adaptive readings do not receive formal lesson IDs and are not added to
`completed_lessons`. The learning state records only useful session evidence;
the generated passage is not saved unless the learner asks.

## Install locally

Codex loads personal skills from `$HOME/.agents/skills`. During local
development, link this checkout into that directory:

```bash
mkdir -p "$HOME/.agents/skills"
ln -s /path/to/english-learning "$HOME/.agents/skills/english-learning"
```

After the repository is published, it can instead be cloned directly into
that location. Codex normally detects skill changes automatically; restart it
if the Skill does not appear.

## Use

Example requests:

```text
Use $english-learning to help me start learning English.
Use $english-learning to continue my next lesson.
Use $english-learning to quiz me on completed lessons.
Use $english-learning /read to give me reading practice at my current level.
我想用 $english-learning 准备雅思，请先判断我的水平。
```

The Skill creates `LEARNING.md` only when a learner starts studying. The file
records goals, level, formal-course progress, adaptive reading history, weak
areas, and scheduled review.

## Customize the tutor

Edit the tutor profile at the top of `references/soul.md` to change the name,
role wording, introduction style, or teaching style. The tutor introduces
itself to a new learner using that profile, then learns about the learner one
question at a time. Keep the role explicitly AI-based rather than giving it a
fictional human identity or personal history.

## Add a formal lesson

Add material to `curriculum/` only when it belongs to an authored course with a
defined sequence. Each lesson is a Markdown file with frontmatter containing a
stable `id`, title, CEFR level, course, skills, estimated time, and
prerequisites. Add it to `curriculum/README.md`, keep exercises answerable from
the taught material, and put teacher answers at the end so the Skill can
withhold them until the learner responds.

Do not add ordinary generated reading passages to the curriculum. Change
`references/adaptive-reading.md` when the generation policy needs improvement.

Planned courses such as IELTS should be added only when they contain real,
authored lessons. They can reuse the same progress file and teaching workflow.

## Sources

The project follows the progressive-disclosure structure described in the
[official OpenAI Skills documentation](https://developers.openai.com/codex/skills/):
the Skill loads only the formal lesson or adaptive-reading guidance needed for
the current session.
