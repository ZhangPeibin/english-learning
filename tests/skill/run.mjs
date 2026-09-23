import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios } from "./scenarios.mjs";

const skillDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const scenarioId = process.argv[2];
const scenario = scenarios[scenarioId];
const maxTurns = Number(process.argv[3] ?? scenario?.turns.length);
const resumeWorkspace = process.argv[4];
if (!scenario || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > scenario.turns.length) {
  throw new Error(`Usage: node tests/skill/run.mjs <${Object.keys(scenarios).join("|")}> [turn-count] [existing-workspace]`);
}

const workspace = resumeWorkspace ?? await mkdtemp(path.join(tmpdir(), `english-skill-${scenarioId}-`));
if (resumeWorkspace) {
  const relative = path.relative(await realpath(tmpdir()), await realpath(workspace));
  if (!relative.startsWith(`english-skill-${scenarioId}-`) || relative.includes(path.sep)) {
    throw new Error("Existing workspace must be a direct temporary directory for this scenario");
  }
}
if (!resumeWorkspace) {
  const initialized = spawnSync("git", ["init", "-q"], { cwd: workspace, encoding: "utf8" });
  if (initialized.status !== 0) throw new Error(`Cannot initialize temporary learner workspace: ${initialized.stderr}`);
}
const statePath = path.join(workspace, "LEARNING.md");
const profile = scenario.profile;
if (!resumeWorkspace && profile) await writeFile(statePath, `---
learner:
  preferred_name: ${JSON.stringify(profile.preferredName)}
  age_or_age_range: ${JSON.stringify(profile.age)}
  country_or_region: ""
  native_language: "Chinese"
  explanation_language: "Chinese"
goal: ${JSON.stringify(profile.goal)}
level: ${profile.level}
focus:
${profile.focus.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}
study_minutes_per_session: 15
current_lesson: null
completed_lessons: []
reading_preferences:
  topics: []
  bilingual_support: on_request
  default_length: standard
reading_history: []
weak_areas: []
review_queue: []
last_studied: null
---

# English Learning Progress

## Learner notes

This is a fictional learner for a Skill evaluation.
`, { mode: 0o600 });

const trace = resumeWorkspace
  ? JSON.parse(await readFile(path.join(workspace, "trace.json"), "utf8"))
  : { scenarioId, scenario: scenario.name, workspace, turns: [] };
if (trace.scenarioId !== scenarioId || trace.workspace !== workspace || trace.turns.length >= maxTurns) {
  throw new Error("Existing trace does not match the requested scenario or has no remaining turns");
}
let threadId = resumeWorkspace ? trace.turns.at(-1)?.threadId ?? "--last" : undefined;
for (let index = trace.turns.length; index < maxTurns; index += 1) {
  if (scenario.freshSessionStartTurn === index + 1) threadId = undefined;
  const turn = scenario.turns[index];
  const stateBefore = await readFile(statePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const localDate = formatLocalDate(new Date());
  const initialPrompt = `Use the English Learning skill at ${path.join(skillDir, "SKILL.md")} to tutor me. My learner message: ${turn.learner}`;
  const args = threadId
    ? ["exec", "resume", "-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"', "--json", threadId, turn.learner]
    : ["exec", "--json", "--sandbox", "workspace-write", "-c", 'approval_policy="never"', "--skip-git-repo-check", "-C", workspace, initialPrompt];
  const execution = await runCodex(args, workspace);
  threadId = execution.threadId ?? threadId;
  trace.turns.push({
    session: index < 6 ? 1 : 2,
    turn: index + 1,
    learner: turn.learner,
    observe: turn.observe,
    reply: execution.reply,
    threadId: execution.threadId ?? threadId,
    localDate,
    stateBefore,
    state: await readFile(statePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    }),
    exitCode: execution.exitCode,
    error: execution.exitCode === 0 ? null : execution.error
  });
  await writeFile(path.join(workspace, "trace.json"), `${JSON.stringify(trace, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(workspace, "review.md"), renderReview(trace), { mode: 0o600 });
  process.stdout.write(`${scenarioId} ${index + 1}/${maxTurns}: exit=${execution.exitCode}, reply=${execution.reply.length} chars\n`);
  if (execution.exitCode !== 0 || !execution.reply || !threadId) {
    process.exitCode = 1;
    break;
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
process.stdout.write(`Trace: ${path.join(workspace, "trace.json")}\n`);
process.stdout.write(`Review: ${path.join(workspace, "review.md")}\n`);

function renderReview(result) {
  const lines = [`# ${result.scenario}`, "", `Scenario: ${result.scenarioId}`, "", "Every judgment starts unreviewed. Check the actual reply and learner state before marking a claim pass or fail.", ""];
  for (const turn of result.turns) {
    lines.push(`## Session ${turn.session}, turn ${turn.turn}`, "", `Learner: ${turn.learner}`, "", `Expected observation: ${turn.observe}`, "", "Judgment: unreviewed", "", "Tutor reply:", "", turn.reply || "(none)", "", "State after turn:", "", "```yaml", turn.state ?? "(not created)", "```", "");
    if (turn.error) lines.push(`Invocation failure: ${turn.error}`, "");
  }
  return `${lines.join("\n")}\n`;
}

function runCodex(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("codex", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKill;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, 180_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      resolve({ exitCode: null, threadId: null, reply: "", error: error.message });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      let threadId = null;
      let reply = "";
      for (const line of stdout.split("\n").filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started") threadId = event.thread_id;
          if (event.type === "item.completed" && event.item?.type === "agent_message") reply = event.item.text;
        } catch { /* Keep the original CLI failure visible below. */ }
      }
      resolve({ exitCode: code, threadId, reply, error: timedOut ? "Codex timed out" : stderr.slice(-2000) });
    });
  });
}
