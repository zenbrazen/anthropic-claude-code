# CLAUDE.md

This file provides guidance for AI assistants (Claude and others) working in this repository.

---

## Project Overview

**Repository:** `zenbrazen/anthropic-claude-code`

This repository is the development home for the `anthropic-claude-code` project. Update this section with a description of what the project does once source code has been added.

---

## Git Workflow

### Branch Naming Convention

Feature branches for AI-assisted development follow this pattern:

```
claude/<slug>-<session-id>
```

Example: `claude/claude-md-mm2a49m96vxaqb37-9RqUu`

- Branch names **must** start with `claude/` and end with the matching session ID
- Pushing to any other branch without explicit permission is not allowed
- Force-pushing to `main`/`master` is forbidden

### Commit Messages

Write clear, descriptive commit messages that explain *why* the change was made, not just *what* changed. Format:

```
<type>: <short imperative summary>

<optional body with details>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### Push Strategy

Always use the `-u` flag when pushing a new branch:

```bash
git push -u origin <branch-name>
```

If a push fails due to network errors, retry up to 4 times with exponential backoff:
- Wait 2s → retry
- Wait 4s → retry
- Wait 8s → retry
- Wait 16s → retry

### Fetch/Pull

Prefer fetching specific branches rather than a blanket `git fetch`:

```bash
git fetch origin <branch-name>
git pull origin <branch-name>
```

---

## Development Setup

> **Note:** This section should be updated once the project has been initialized with source code, a package manager, and build tooling.

Expected setup steps (update as applicable):

```bash
# Clone the repository
git clone <remote-url>
cd anthropic-claude-code

# Install dependencies (update with actual package manager)
npm install        # or: yarn install / pnpm install / pip install -r requirements.txt

# Run tests
npm test           # or the project-specific test command

# Start development server / build
npm run dev        # or: npm run build
```

---

## Repository Structure

> **Note:** Update this section as the project grows.

```
anthropic-claude-code/
├── CLAUDE.md          # This file — guidance for AI assistants
├── README.md          # Human-facing project documentation (add when ready)
├── src/               # Main source code (add when ready)
├── tests/             # Test files (add when ready)
└── ...
```

---

## Code Conventions

> Update this section with project-specific conventions once the codebase is established.

### General Principles

- **Avoid over-engineering.** Only make changes that are directly requested or clearly necessary.
- **Keep solutions simple and focused.** Don't add features, refactor code, or make "improvements" beyond what was asked.
- **Trust internal code.** Only validate at system boundaries (user input, external APIs).
- **No premature abstractions.** Three similar lines of code is better than a premature helper utility.
- **No backwards-compatibility hacks.** If something is unused, delete it completely.

### Security

- Never introduce command injection, XSS, SQL injection, or other OWASP Top 10 vulnerabilities.
- Never commit secrets, API keys, or credentials.
- Never skip git hooks (`--no-verify`) unless explicitly instructed.

### File and Code Style

- Follow the style and patterns already established in the codebase.
- Do not add docstrings, comments, or type annotations to code you did not change.
- Only add comments where the logic is not self-evident.

---

## Testing

> Update this section with the actual test framework and commands once established.

- Run all tests before committing significant changes.
- Do not mark a task complete if tests are failing.
- Write tests for new features and bug fixes where applicable.

---

## Risky / Irreversible Actions

Before performing any of the following, confirm with the user:

- Deleting files, branches, or data
- `git reset --hard`, `git push --force`
- Amending published commits
- Dropping database tables or running destructive migrations
- Modifying CI/CD pipelines or shared infrastructure
- Pushing to `main`/`master`
- Creating or closing GitHub issues/PRs
- Sending messages to external services

**Measure twice, cut once.** When in doubt, ask.

---

## AI Assistant Notes

- Read files before editing them. Never propose changes to code you haven't read.
- Break complex tasks into tracked steps using a todo list.
- Run multiple independent operations in parallel when possible.
- Do not retry the same failed action repeatedly — diagnose the root cause or ask the user.
- Do not push to remote unless explicitly asked.
- Do not create files unless absolutely necessary — prefer editing existing files.
