---
description: Check, review, commit and open the PR for the current work. Add "merge" to also merge it and confirm the live site updated.
argument-hint: [merge]
---

Ship the current work the way we always do. Typing `/ship` is Eli saying "commit it and open the PR". Typing `/ship merge` also says "auto fix, merge it". Without the word `merge`, stop after the PR is open.

Follow `CLAUDE.md`. Keep the report in plain words (Eli is not a developer) and ask at most one question.

## 0. Stop if this needs more than a code change

If the work depends on a database migration or a change to live data that Eli has not already said yes to, stop and explain that first. Do not run it, and do not ship code that needs it. A rolled-back trial and a separate yes come first.

## 1. Get on the right branch

- `git fetch origin main`, then look at `git status --short` and `git branch --show-current`.
- Nothing changed and nothing unpushed: say so and stop.
- On `main`, or on a branch whose PR is already merged: make a new branch from the up-to-date `origin/main` with a short name (`feat/...`, `fix/...` or `chore/...`) and carry the work across.
- If the branch is behind `origin/main`, merge `origin/main` into it and re-run the checks below.
- Stage only the files that belong to this change. If something unrelated is sitting in the working copy, leave it out and mention it.

## 2. The four checks (all must pass)

Run them and read the output; do not assume.

1. `npx tsc --noEmit -p .`
2. `npm test`
3. `npx eslint .` must be no worse than the baseline in `CLAUDE.md` (5 errors, 17 warnings). If it is worse, find the new ones with `npx eslint <changed files>` and fix them.
4. `npm run build`

If one fails, fix the cause and re-run. If the cause is not clear after a real attempt, stop and tell Eli what is stuck. Never skip a check, weaken a test, or lower the baseline to make it pass.

## 3. Independent review

Run the `/fresh-eyes` steps. Fix what is real and in scope, then re-run the four checks if anything changed.

## 4. Commit, push, open the PR

- One commit with a short imperative first line and a body that says what changed and why. End it with the commit attribution line from your current instructions.
- `git push -u origin <branch>`, then `gh pr create --repo enbiebs/mgmt.studio --base main`.
- The PR description, in plain words: what this does for a user, what changed, how it was checked (the four checks and the review, with the real results), what was **not** checked (for example, no signed-in look at the screens), and anything that was applied to the live database. End it with the PR footer from your current instructions.
- Bind the PR (`get_status`, then `bind_pr` if it is not reported) and turn on Auto-fix with `set_monitor` (pass the PR url, `auto_fix: true`). Do not poll CI; Auto-fix wakes the session on a failure.

If the argument was not `merge`, stop here. Report the PR link and what the checks and review found, and say: "Say 'merge it' when you want it live."

## 5. Merge (only for `/ship merge`)

- Wait for the checks without a polling loop: read `get_status` and re-read it only when something else has been done in between. Vercel can be slow. If the only thing pending is the Vercel preview and Vercel's own PR comment says Ready, that is enough to go on, because the four checks already passed locally.
- Never merge over a failing check, a merge conflict, or an unanswered review comment that asks for a change.
- `gh pr merge <number> --repo enbiebs/mgmt.studio --merge`. If GitHub returns a temporary error, check `gh pr view <number> --json state` and retry once.
- Confirm the live site updated: `gh api "repos/enbiebs/mgmt.studio/deployments?environment=Production&per_page=2"`, then the status of the newest one. If the merge commit is not there yet, say "merged, but the live deploy has not started yet" and do not wait in a loop. Only say it is live when the deployment for the merge commit shows `success`.

## 6. Report

Plain words, short: what shipped, the PR link, what the checks and review found, whether the live site has it yet, and what was not verified. If this was part of the build brief or another tracked initiative, update the matching memory note. End with one next step or one question.
