# Conductor Workflow & Operational Rules

## Operational Standards
1. **Spec-Driven Development (SDD)**: Every track or major change must follow explicit planning, design verification, task decomposition, and TDD execution.
2. **Quality Gates**: Every change requires test suite validation (`npm test`), linting (`npm run lint`), and code review (`/code-review-and-quality`).
3. **Commit Conventions**: Conventional commits format (`type(scope): message`).
4. **Parallel Agent Protocol**: Group independent bug fixes or feature tracks by domain and dispatch isolated subagents in parallel (`/superpowers:dispatching-parallel-agents`).
5. **Code Review Protocol**: Dispatch code reviewer subagents before merging to main (`/superpowers:requesting-code-review`).
