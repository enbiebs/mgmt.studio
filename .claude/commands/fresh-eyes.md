---
description: Get an independent second opinion on the current change before it ships
argument-hint: [optional: what the change is for]
---

Get a review of the current change from a reviewer who has not seen my reasoning. The point is a read that is not anchored on my own conclusions.

## 1. Work out what is being reviewed

- If this branch has commits that are not on `main`, the change is `git diff origin/main...HEAD`. Otherwise it is the uncommitted work: `git diff HEAD` plus any new untracked files (`git status --short`).
- If there is nothing to review, say so and stop.
- If the change is only notes or docs (no code, no SQL), say that a review is not needed and stop.
- Use `$ARGUMENTS` as the one-sentence purpose if it was given. Otherwise write one plain sentence about what the change is meant to do, taken from Eli's request. State the goal only. Do not give the reviewer my opinion of the result.

## 2. Hand it to a reviewer

Start one `agent-skills:code-reviewer` subagent. Brief it like a colleague. Tell it:

- the one-sentence purpose;
- to read `CLAUDE.md` first (the project's rules), then run the diff command above itself and read the changed files in full, not just the excerpts;
- to review for **correctness** (edge cases, empty or missing data, dates around month ends and year ends, wrong or mixed currencies, off-by-one), **data safety** (anything that writes or deletes live data, migrations, row-level security, who can see what), **security**, and **fit with the project's house rules** in `CLAUDE.md`;
- to be sceptical of the change's own tests: would they fail if the rule were broken?
- to report each finding as `Critical`, `Required` or `Optional`, with the file and line, and a concrete failure (this input leads to this wrong result), not a vague worry;
- to say clearly when it finds nothing, instead of inventing nits;
- **not to edit any files.**

## 3. Deal with what comes back

Do not take the findings on trust. For each one, check it against the code yourself.

- **Real and in scope:** fix it, re-run the four checks in `CLAUDE.md`, and mention it.
- **Real but outside this change:** do not fix it now. Add it to the report so it can go on the backlog.
- **Wrong or already handled:** say why in one line.

## 4. Report to Eli in plain words

Three or four short lines, no jargon: how many things the reviewer raised, what was fixed, what was left and why, and whether anything needs his decision. End with a single next step or a single question.
