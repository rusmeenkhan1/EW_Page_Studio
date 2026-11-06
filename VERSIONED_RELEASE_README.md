# How to Trigger a Release — `ise-boilerplate`

## Overview

Releases are **automated**. There is no manual publish step. When a pull request is merged into `main`, a GitHub Action runs `semantic-release`, which:

1. Analyzes commit messages since the last release
2. Determines the new version number
3. Updates `package.json` and `CHANGELOG.md`
4. Creates a GitHub Release and git tag

**The release version is determined entirely by how you write your commit messages.**

---

## Step 1 — Write a Conventional Commit

Every commit that should influence the release **must** follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <short description>
```

### Commit types and their version impact

| Type | Version bump | When to use |
|---|---|---|
| `fix:` | **Patch** — `1.0.1` | Bug fixes, typo corrections, small behavioral corrections |
| `feat:` | **Minor** — `1.1.0` | New blocks, new features, new config options |
| `feat!:` or `BREAKING CHANGE:` in footer | **Major** — `2.0.0` | Changes that break backward compatibility |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | **No release** | Maintenance work that doesn't affect consumers |

### Examples

```bash
# Patch — bug fix
git commit -m "fix: hero block not rendering on mobile Safari"

# Patch with scope
git commit -m "fix(carousel): prevent double-click from firing twice"

# Minor — new feature
git commit -m "feat: add accordion block with keyboard navigation"

# Major — breaking change (two ways to write it)
git commit -m "feat!: rename card block variant from 'dark' to 'inverted'"

# OR with a footer
git commit -m "feat: rename card block variant

BREAKING CHANGE: the 'dark' variant class is now 'inverted'"

# No release triggered
git commit -m "chore: update dev dependency versions"
git commit -m "docs: fix typo in README"
```

> **Important:** If your PR contains multiple commits, `semantic-release` reads **all of them**. The highest-impact commit type wins. One `feat:` among five `chore:` commits still produces a minor release.

---

## Step 2 — Open a Pull Request

Branch off of `main` and open a PR using the standard template. The PR description requires:

- **Issue reference:** `Fixes #IssueID`
- **Before URL:** `https://main--ise-boilerplate--aemdemos.aem.page/`
- **After URL:** `https://<your-branch>--ise-boilerplate--aemdemos.aem.page/`

PRs without test URLs will be rejected.

---

## Step 3 — Verify CI Passes

Two checks run automatically on every push:

| Check | What it does |
|---|---|
| **Build** (`main.yaml`) | Runs `npm run lint` on all branches |
| **Release** (`release.yml`) | Runs only on `main` after merge — performs the actual release |

Before requesting review, confirm the Build check is green. You can check with:

```bash
gh pr checks
```

---

## Step 4 — Merge to `main`

Once approved, merge the PR. The `release.yml` workflow fires automatically and:

- Bumps the version in `package.json`
- Appends an entry to `CHANGELOG.md`
- Commits both files back to `main` with the message `chore(release): <version> [skip ci]`
- Creates a GitHub Release with auto-generated release notes
- Creates a git tag (e.g., `v1.2.0`)

No action needed on your part after merging.

---

## Common Mistakes

**"I merged but no release was created."**
Your commit messages didn't include a release-triggering type (`fix:` or `feat:`). Check the GitHub Actions log for the `Release` step — it will say `no release published` if no releasable commits were found.

**"The release bumped to the wrong version."**
The version is determined by the highest-impact commit in the batch. If you intended a patch but a `feat:` commit slipped in, the result will be a minor bump.

**"I want to test without merging to main."**
Run a dry run locally:
```bash
GITHUB_TOKEN=<your-token> npx semantic-release --dry-run
```
This prints what version would be released and what the changelog entry would look like, without writing anything.

**"The release commit itself triggers another release."**
It won't — the automated release commit message includes `[skip ci]`, which tells GitHub Actions to skip the workflow.

---

## Quick Reference Card

```
fix: …           → patch release  (1.0.x)
feat: …          → minor release  (1.x.0)
feat!: …         → major release  (x.0.0)
chore/docs/…     → no release
```

Merge to `main` → release happens automatically.


