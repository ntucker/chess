# Opening Night projects

Read this only when your instructions tell you to: you are an agent in a long-running, multi-agent
Claude project that works on this repo. Plain agent sessions in this repo follow `AGENTS.md` alone;
nothing here applies to them.

Root `AGENTS.md` and `.agents/skills` still apply. This file adds how project agents run work end to
end. Your project's own instructions win where they differ. Where this file and `AGENTS.md` differ, the
repo wins; tell the coordinator so one gets fixed. Re-read this file when the coordinator says it
changed. Coordinators setting up a new project follow `.agents/projects/setup.md`.

## Roles and models

- Coordinator: the project chat session. Worker: a thread. Tell the coordinator: `message_coordinator`.
- Default for advisors and subagents: the strongest model (latest Fable). Exceptions:
  - Haiku: post-push reviews.
  - Sonnet: simple merge conflicts.
- The coordinator runs at most 3 workers at once, unless the person set another cap in project memory.
- Workers rely on user-kit's skills (Skill tool) and workflows (Workflow tool), both named
  `user-kit:<name>`. If one you need is missing, use the fallback the step gives; with none, pause
  that step. Either way, tell the coordinator, who asks the person to install user-kit.

## PR lifecycle

1. Branch from `main`. Stack a PR on another only when it needs that PR's unmerged code; then rebase
   your own branches (`--force-with-lease`) and say "merge #N first". Rebasing applies only to your
   own stacked branches; update any other PR from its base with a merge commit, because force-pushing
   a shared branch drops others' commits.
2. Never push throwaway branches (workers cannot delete remote branches).
3. Open the PR and watch it right away (`subscribe_pr_activity`). Mark it ready for review once
   validated; Bugbot skips drafts.
4. Address every Bugbot comment and every comment from the "Staff" reviewer (posted on ntucker's
   account). Verify each claim against the code first; push back on the PR when it is wrong.
5. Keep the PR mergeable, but act only on a real conflict with its base. Simple conflicts (lockfiles,
   adjacent edits, generated files): hand to a Sonnet subagent with branch, base and how to validate.
   Logic conflicts: resolve yourself.
6. After every push, run workflow `user-kit:post-push-review` with the Workflow tool, passing
   `{ range: "<sha before push>..HEAD", goals: "<project goal>", repo: "<checkout path>" }`.
   The Skill tool lists it too and points to the workflow.
   Without the Workflow tool or that workflow, run Haiku subagents in parallel for goals, repo rules,
   engineering, adversarial, reuse and React data flow. Verify each finding; fix real ones, reject the
   rest with a reason. Do not launch them while the person is actively writing in your thread:
   subagents can pick up the message and reply in your name.
7. Once the change is verified correct, run skill "simplify", verify its findings, and push the
   cleanups (a push, so step 6 runs again) before calling the PR done. If the change has
   architecture implications, then run skill `user-kit:clean-code` the same way.
8. A PR that builds an approved plan piece autolands: once steps 3 to 7 are done and every Bugbot
   and Staff comment is answered, follow `docs/plans/README.md`. If its review is wrong, say why on
   the PR and tell the person, who merges it by hand. The person squash-merges every other PR. A
   worker's PR ends when it merges, not when it is handed over.

## PR descriptions

- A description states what landing the PR does. Its numbers (test counts, timings, match rates) come
  from one measurement of the PR's final head against its base. Never report or pool runs made while
  iterating. Say plainly when a case shows no difference.
- Visible UI changes include screenshots of the web export, built and served locally as described
  in the "Web deploys" section of README.md (PRs don't deploy a preview). Add light and
  dark versions only when the change looks different between the two (colors, theme tokens, images).

## Follow-ups

Never leave one dangling. Fold it into the PR if it improves it, reject it with a stated reason, or
hand it on:

- Project-scope work: tell the coordinator, with a self-contained brief. The coordinator adds it to
  the work queue (the work-queue tool, never the queue file by hand).
- Work outside the project's scope: draft a GitHub issue on `ntucker/chess` (self-contained) and hand
  it to the coordinator. File it yourself only when the person asked in their own words.
- The same holds for any other write outside the repo and your PR (GitHub comments elsewhere, Slack).

## Talking to the person

- Decision asks: context, options, and a recommendation, inline.
- Status: check live PR state; list only open PRs.
- A blocked action: name exactly what blocked it (session safety check, connector sign-in, tool
  setting, GitHub app access, network policy) and the one fix. Never just "permission denied".
- Explanations: about 50% ASD-STE100 (short sentences, one fact each, active voice); keep repo terms.

## Upstream fixes

When a chess bug or missing feature belongs in a dependency the person owns, fix it there rather than
working around it in chess:

- `reactive/data-client`: follow its `AGENTS.md` and its `PROJECTS.md`, which apply only to that work.
  To test in chess before release, pack its packages as its `PROJECTS.md` describes ("Testing against
  another app"), then point chess at the tarballs with `file:` dependencies and Yarn `resolutions`.
  Don't merge a chess PR that installs data-client from a tarball; wait for the release.
- `reactive/silk`: follow its `AGENTS.md`. Chess installs Silk from `vendor/*.tgz`; rebuild them with
  `yarn vendor:silk <silk checkout>` and commit them with the chess change.

Link the upstream PR from the chess PR, and say "merge <upstream PR> first" when chess depends on it.

## Person's machine

Work needing the person's PC (local tools) runs on GLADOS, a Windows PC: threads start a Remote
Control session (`start_remote_control`). Build Android from Windows, not WSL (no Android SDK or Java
there). PRs touching Android-only code (native modules or config, worklets like
`src/maia/runNetwork.ts`, `android` branches of `Platform.OS`) say "untested on Android".

## Keeping this file current

Every project improves this file; don't let a shared rule live in one project's memory.

- When the person sets or corrects a process rule (PRs, reviews, models, reporting, follow-ups), ask:
  would every chess project want it? Yes: save it to project memory now, and tell the coordinator to
  add it here. No (it serves one project's goal): project memory only.
- When a rule here is wrong or out of date, tell the coordinator the same way.
- The coordinator batches these into one small `docs:` PR to `PROJECTS.md` (or `.agents/projects/`)
  for the person to review, then deletes the memories it replaced.
- Rules with at most a one-clause reason; history stays in memory. Keep this file under about 2k
  tokens; move a section only some tasks need to `.agents/projects/<topic>.md`, with a one-line
  pointer here.
