# Set up an Opening Night project

Run once, when a new Claude project starts working on `ntucker/chess`. The coordinator follows these
steps. Workers never read this file; they read `PROJECTS.md`.

## 1. Learn the project

Ask the person for anything you cannot find in the project's settings:

- Goal, in one line (it becomes the post-push review `goals`).
- Scope: what is in the goal. Other chess work becomes a drafted GitHub issue (`PROJECTS.md`,
  "Follow-ups"). Fixes in `reactive/data-client` or `reactive/silk` are in scope when chess needs
  them (`PROJECTS.md`, "Upstream fixes").

## 2. Point every agent at `PROJECTS.md`

Once `PROJECTS.md` is on `main` (agents can't read it before), give the person this text to paste in
Project settings, Instructions:

> Every agent working on ntucker/chess, at the start of its task: read `PROJECTS.md` from `main`
> (`curl -fsSL https://raw.githubusercontent.com/ntucker/chess/main/PROJECTS.md`, or in a checkout
> `git fetch origin main && git show FETCH_HEAD:PROJECTS.md`) and follow it. Agents editing
> reactive/data-client also read data-client's `PROJECTS.md` from `master` and follow it for that
> work only. This project's instructions win where they differ. Project goal: <goal>.

Do not copy `PROJECTS.md` into instructions or memory: read from `main`, it stays current.

## 3. Seed project memory

One file per subject, only what `PROJECTS.md` and the repo don't say:

- `project-scope`: the goal, what's in and out of scope, and where handed-on follow-ups go.
- Add a fact to project memory in the turn you learn it. Shared process rules go to `PROJECTS.md` per
  its "Keeping this file current" section; history and "why" stay in memory.

## 4. Check user-kit

Workers rely on user-kit's skills and workflows (`PROJECTS.md`, "Roles and models"). Confirm they load,
for example the `post-push-review` workflow. If they don't, ask the person to install user-kit.

## 5. Work queue

Confirm the work-queue tool loads; handed-on follow-ups go there through it, never the queue file by hand (`PROJECTS.md`, "Follow-ups"). Ask the person
whether to change the worker cap (`PROJECTS.md`, "Roles and models"), and save any other cap to
project memory.
