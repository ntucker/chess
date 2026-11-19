# Approved plans

A plan in this folder is approved: Nathaniel approves a plan by merging it here. Each piece of work a
plan breaks down into has a heading such as `### Piece K: Lesson screen thin slice`. Piece ids are
letters, digits and dashes.

## Autoland

A pull request that builds an approved piece can land without a manual merge
(`.github/workflows/autoland.yml`):

1. Its description has the line `Plan piece: <plan>/<piece>`, such as `Plan piece: opening-lesson/K`,
   where `<plan>` is a file name here without `.md`. Any difference from the plan is explained in a
   `Plan deviations:` line.
2. Its author adds the `autoland` label once the PR is otherwise done (`PROJECTS.md`, "PR lifecycle").
3. The **Plan approval** check confirms the piece is in a plan on `main`, and that the PR changes no
   plan, workflow, agent setting or project process (`docs/plans/`, `.github/`, `.agents/projects/`,
   `PROJECTS.md`, `.claude/`, `.mcp.json`, `CLAUDE.md`). Those changes always wait for Nathaniel.
4. The **Interface review** check runs a reviewer that has never seen the work: Claude Sonnet at high
   effort, with the instructions in `.github/autoland/review.md`. It uses the feature in a browser,
   checks the code's interfaces against the piece, and checks that every Bugbot and Staff comment was
   fixed or rightly rejected. It posts its verdict as a PR comment and keeps its screenshots on the
   workflow run.
5. If the reviewer approves, **Land** waits for every other check on the same commit and for the
   Staff reviewer's verdict on it (`**Staff Reviewer:** LGTM at <sha>`). Lint, typecheck and test
   and the web build must pass, nothing may fail, and the verdict must not be `CHANGE_THIS_PR`. Then
   it squash-merges and starts the deploy.

A push restarts the review. Removing the label, marking the PR as a draft or requesting changes stops
the landing.

The workflow needs the `CLAUDE_CODE_OAUTH_TOKEN` Actions secret (from `claude setup-token`).
