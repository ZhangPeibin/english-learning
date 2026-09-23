import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function evaluateTrace(trace) {
  const checks = [];
  const add = (name, passed, turn, detail) => checks.push({ name, outcome: passed ? "pass" : "fail", turn, detail });
  add("Codex completed every scripted turn", trace.turns.every((turn) => turn.exitCode === 0 && turn.reply), null, "No failed or empty model reply");

  for (const turn of trace.turns) {
    add("No internal local path in learner-facing reply",
      !/(?:\/Users\/|\/private\/(?:var|tmp)\/|\/var\/folders\/|\/tmp\/)[^\s<>)]+/.test(turn.reply),
      turn.turn, "Local skill and runtime paths are not teaching content");
    if (!turn.state) continue;
    add("No unpublished formal lesson credited", /^current_lesson:\s*null\s*$/m.test(turn.state)
      && /^completed_lessons:\s*\[\]\s*$/m.test(turn.state), turn.turn, "Only indexed formal lessons can be credited");
    add("No fabricated numeric score", !/^\s*score:\s*\d+/m.test(turn.state), turn.turn, "No scored assessment was administered");
  }

  const reply = (number) => trace.turns[number - 1]?.reply ?? "";
  const englishWords = (text) => (text.match(/\b[A-Za-z]+\b/g) ?? []).length;
  if (trace.scenarioId === "p0" && trace.turns.length >= 9) {
    add("P0 skip request does not produce a long English passage", englishWords(reply(9)) <= 80,
      9, `${englishWords(reply(9))} English words after a non-reader asked for B1`);
  }
  if (trace.scenarioId === "r0" && trace.turns.length >= 1) {
    add("B1 reading request does not override a pre-reader's prerequisites",
      englishWords(reply(1)) <= 80, 1,
      `${englishWords(reply(1))} English words when a child who cannot identify letters requested B1`);
  }
  if (trace.scenarioId === "j1") {
    if (trace.turns.length >= 1) add("J1 self-report does not trigger B1 reading before placement",
      englishWords(reply(1)) <= 50, 1, `${englishWords(reply(1))} English words before any assessment`);
    if (trace.turns.length >= 5) add("J1 demonstrated basic errors prevent B1 long reading",
      englishWords(reply(5)) <= 100, 5, `${englishWords(reply(5))} English words after a basic past-tense error`);
  }
  if (trace.scenarioId === "j2" && trace.turns.length >= 3) {
    add("Listening task does not claim an inaccessible local audio attachment",
      !/\]\(<\/[^>]+\.(?:mp3|wav|m4a)>\)/i.test(reply(3)), 3,
      "Local temporary paths are not learner-accessible audio content");
  }
  if (trace.scenarioId === "m0") {
    if (trace.turns.length >= 1) add("Child is told the tutor is AI",
      /\bAI\b|人工智能/i.test(reply(1)), 1, "The tutor must not claim a human identity or earned exam score");
    if (trace.turns.length >= 9) add("Child's advanced-exam request does not trigger a long English passage",
      englishWords(reply(9)) <= 80, 9, `${englishWords(reply(9))} English words after an eight-year-old non-reader requested IELTS 9`);
  }
  if (trace.scenarioId === "e1" && trace.turns.length >= 1) {
    add("Exam-coaching tutor discloses AI identity",
      /\bAI\b|人工智能/i.test(reply(1)), 1, "Aspirational expertise is not an earned credential");
  }
  if (trace.scenarioId === "progress") {
    if (trace.turns.length >= 6) {
      const state = trace.turns[5].state ?? "";
      const learningItems = yamlField(state, "learning_items");
      const reviewQueue = yamlField(state, "review_queue");
      add("Attempted borrowing is saved as a specific review target",
        /borrow|借/i.test(learningItems)
          && /^\s+attempts:/m.test(learningItems)
          && /^\s+response:\s*\S/m.test(learningItems)
          && /^\s+support:\s*(?:cued|independent)\s*$/m.test(learningItems)
          && /^\s+due_date:\s*\d{4}-\d{2}-\d{2}\s*$/m.test(learningItems), 6,
        "A canonical learning item should retain borrowing evidence, support, and its next due date");
      add("Canonical borrowing does not retain an active legacy duplicate",
        !activeLegacyEntries(reviewQueue).some((entry) => /borrow|借/i.test(entry)), 6,
        "A converted or superseded legacy review entry must be retired");
    }
    if (trace.turns.length >= 7) {
      add("Later practice starts in a fresh Codex thread",
        Boolean(trace.turns[5].threadId && trace.turns[6].threadId
          && trace.turns[5].threadId !== trace.turns[6].threadId), 7,
        "The tutor must recover progress from learner state rather than prior thread context");
      const stateBefore = trace.turns[6].stateBefore;
      const localDate = trace.turns[6].localDate;
      const due = stateBefore && localDate ? reviewDueDate(stateBefore, localDate) : null;
      if (due && localDate && due <= localDate) add("Fresh-thread reply starts a due review task",
        /borrow|借/i.test(reply(7)) && /[?？。]/.test(reply(7)), 7,
        "When the saved borrowing target is due, the response should ask the learner to apply it");
    }
  }
  if (["due_canonical", "due_legacy", "due_mixed"].includes(trace.scenarioId)) {
    const first = trace.turns[0];
    if (first) {
      const due = first.stateBefore && first.localDate && reviewDueDate(first.stateBefore, first.localDate);
      add("Seeded review is overdue at session start", Boolean(due && due < first.localDate), 1,
        "The review decision must be exercised from seeded pre-turn state");
      if (trace.scenarioId === "due_mixed") add("Future canonical item does not hide overdue legacy review",
        due === "2020-01-02" && /due_date:\s*2099-01-01/.test(yamlField(first.stateBefore ?? "", "learning_items")), 1,
        "A canonical item due later must not suppress an overdue legacy queue entry");
      add("First reply requests notebook borrowing application without the saved answer",
        /borrow|借/i.test(reply(1))
          && /notebook|笔记本/i.test(reply(1))
          && /[?？]|请|试着|试试|用英语|你会|你能|说|写|表达|造句|\b(?:write|say|ask|try)\b/i.test(reply(1))
          && !/can\s+i\s+borrow\s+your/i.test(reply(1)), 1,
        "A notebook-based application task must precede unrelated practice and withhold the target form");
    }
    if (["due_legacy", "due_mixed"].includes(trace.scenarioId) && first?.state) {
      add("Legacy source stays active until the learner attempts it",
        activeLegacyEntries(yamlField(first.state, "review_queue")).some((entry) => /topic:\s*polite borrowing request/.test(entry))
          && !learningEntries(first.state).some((entry) => /borrow|借/i.test(entry)), 1,
        "Question delivery alone is not an observed learning attempt");
    }
    if (trace.turns.length >= 2) {
      const second = trace.turns[1];
      const items = learningEntries(second.state ?? "");
      const borrowing = items.filter((entry) => /type:\s*sentence_pattern/.test(entry) && /borrow|借/i.test(entry));
      const item = borrowing[0] ?? "";
      const attempts = item.split(/(?=^[ \t]+-[ \t]+date:[ \t]*\d{4}-\d{2}-\d{2}[ \t]*$)/m).slice(1);
      const newAttempt = attempts.find((attempt) => new RegExp(`^\\s*-\\s+date:\\s*${second.localDate}\\s*$`, "m").test(attempt)
        && /response:\s*["']?Can I borrow your notebook\?["']?\s*$/m.test(attempt));
      const expectedDue = second.localDate && calendarDaysLater(second.localDate, 3);
      add("Independent borrowing answer is graded and scheduled from attempt date",
        borrowing.length === 1
          && attempts.length === (trace.scenarioId === "due_canonical" ? 2 : 1)
          && (trace.scenarioId !== "due_canonical" || /response:\s*["']?Can I borrow your eraser\?["']?\s*$/m.test(attempts[0]))
          && newAttempt && /result:\s*correct\s*$/m.test(newAttempt)
          && /support:\s*independent\s*$/m.test(newAttempt)
          && /^\s*status:\s*independent\s*$/m.test(item)
          && new RegExp(`^\\s*due_date:\\s*${expectedDue}\\s*$`, "m").test(item), 2,
        "One canonical item must retain the actual independent response and be due three local days later");
      const feedback = reply(2);
      add("Correct borrowing answer receives learner-facing feedback",
        /答对了|说对了|正确|很好|这句(?:是)?对|\b(?:correct|right|well done)\b/i.test(feedback)
          && !/不对|错误|\b(?:incorrect|wrong)\b/i.test(feedback), 2,
        "The reply should tell the learner that their borrowing sentence is correct");
      add("Reply gives one next learner task without state narration",
        !/learning_items|review_queue|YAML|状态文件|学习状态|字段|数据结构|合并掉|修正文件|\bdue_date\b/i.test(feedback)
          && feedback.split(/[。！？!?]\s*/).filter((sentence) => /请|试着|试试|你能|你会|用英语|造句|再(?:写|说)|\b(?:please|try|write|say|ask|could you|can you)\b/i.test(sentence)).length === 1, 2,
        "Teaching feedback should end with one clear task, without describing internal record maintenance");
      if (["due_legacy", "due_mixed"].includes(trace.scenarioId)) {
        const legacy = yamlField(second.state ?? "", "review_queue");
        const entries = legacyEntries(legacy);
        const unrelated = entries.find((entry) => /topic:\s*pronunciation confidence/.test(entry)) ?? "";
        const history = legacyEntries(yamlField(second.state ?? "", "legacy_review_history"));
        const id = item.match(/^\s*(?:-\s*)?id:\s*(\S+)/m)?.[1];
        const archive = history.find((entry) => entry.match(/^\s*-\s*canonical_id:\s*(\S+)/m)?.[1] === id) ?? "";
        const original = legacyEntryFields(archive);
        const expected = {
          topic: "polite borrowing request", due: "2020-01-02", status: "learner-authored",
          canonical_id: "learner-note-42", learner_example: "my blue ruler", coach_note: "needs a new example"
        };
        add("Legacy conversion archives an unchanged source and preserves other records",
          Boolean(id && archive && unrelated)
            && !entries.some((entry) => /topic:\s*polite borrowing request/.test(entry))
            && Object.keys(original).length === Object.keys(expected).length
            && Object.entries(expected).every(([key, value]) => original[key] === value)
            && /due_date:\s*2099-01-01/.test(unrelated)
            && /coach_note:\s*["']?learner asked to revisit/.test(unrelated)
            && entries.length === 1 && history.length === 2
            && /canonical_id:\s*earlier-word/.test(history[0])
            && /topic:\s*earlier vocabulary/.test(history[0])
            && /coach_note:\s*["']?previous migration/.test(history[0]), 2,
          "The active source moves unchanged into a new history wrapper; earlier history and unrelated queue data remain");
        if (trace.scenarioId === "due_mixed") add("Future canonical item survives legacy fallback",
          items.some((entry) => /id:\s*third-person-s/.test(entry)
            && /due_date:\s*2099-01-01/.test(entry)
            && /response:\s*["']?He plays football\./.test(entry)), 2,
          "The unrelated canonical grammar schedule and evidence must remain intact");
      }
    }
  }

  return checks;
}

function learningEntries(state) {
  return legacyEntries(yamlField(state, "learning_items"));
}

function legacyEntries(block) {
  const entries = [];
  for (const line of block.split("\n")) {
    if (/^  -\s+/.test(line)) entries.push(line);
    else if (entries.length) entries[entries.length - 1] += `\n${line}`;
  }
  return entries;
}

function legacyEntryFields(wrapper) {
  const fields = {};
  for (const [, key, value] of wrapper.matchAll(/^ {6}([a-z_]+):\s*(.*)$/gm)) {
    fields[key] = value.replace(/^(?:"(.*)"|'(.*)')$/, (_, double, single) => double ?? single);
  }
  return fields;
}

function calendarDaysLater(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function yamlField(state, name) {
  return state.match(new RegExp(`^${name}:[ \\t]*(?:\\[\\])?[ \\t]*\\n((?:[ \\t]+.*\\n)*)`, "m"))?.[1] ?? "";
}

function earliestDate(block, names) {
  const pattern = new RegExp(`^\\s+(?:-\\s*)?(?:${names.join("|")}):\\s*(\\d{4}-\\d{2}-\\d{2})\\s*$`, "gm");
  return [...block.matchAll(pattern)].map((match) => match[1]).sort()[0] ?? null;
}

export function activeLegacyEntries(block) {
  return legacyEntries(block);
}

export function reviewDueDate(state, localDate) {
  if (!localDate) throw new TypeError("reviewDueDate requires a local date");
  const canonical = earliestDate(yamlField(state, "learning_items"), ["due_date"]);
  if (canonical && canonical <= localDate) return canonical;
  const legacy = earliestDate(activeLegacyEntries(yamlField(state, "review_queue")).join("\n"), ["due_date", "due"]);
  return legacy && legacy <= localDate ? legacy : null;
}

async function main(paths) {
  if (!paths.length) throw new Error("Usage: node tests/skill/check.mjs <trace.json> [...]");
  let failures = 0;
  for (const filePath of paths) {
    const trace = JSON.parse(await readFile(filePath, "utf8"));
    const checks = evaluateTrace(trace);
    const failed = checks.filter((check) => check.outcome === "fail");
    failures += failed.length;
    process.stdout.write(`${trace.scenarioId}: ${checks.length - failed.length} pass, ${failed.length} fail\n`);
    for (const check of failed) process.stdout.write(`  turn ${check.turn}: ${check.name} (${check.detail})\n`);
  }
  process.exitCode = failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
