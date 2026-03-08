# Git Flow Branching Strategy

## Branch Types

| Branch     | Purpose                 | Base Branch | Merges Into        |
| ---------- | ----------------------- | ----------- | ------------------ |
| main       | Production-ready code   | —           | —                  |
| develop    | Integration branch      | main        | main (via release) |
| feature/\* | New features            | develop     | develop            |
| release/\* | Release preparation     | develop     | main + develop     |
| hotfix/\*  | Urgent production fixes | main        | main + develop     |

## Rules

- Never commit directly to main or develop
- Feature branches: feature/short-description
- Release branches: release/vX.Y.Z
- Hotfix branches: hotfix/short-description
- Delete branches after merging
- All merges via Pull Request only

## Workflow Diagram

```
main     ─────────────────────────────────────► (production)
           ↑                            ↑
           │ release/v1.0.0             │ hotfix/fix-bug
           │                            │
develop  ──┴────────────────────────────┴──────► (integration)
           ↑              ↑
           │ feature/x    │ feature/y
```

## Branch Lifecycle

### Feature Branch

1. Branch off develop: git checkout -b feature/name develop
2. Commit your changes
3. Open PR to develop
4. Delete branch after merge

### Release Branch

1. Branch off develop: git checkout -b release/vX.Y.Z develop
2. Update CHANGELOG.md and version
3. Open PR to main, merge
4. Tag the release: git tag vX.Y.Z
5. Merge main back into develop

### Hotfix Branch

1. Branch off main: git checkout -b hotfix/description main
2. Fix the issue
3. Open PR to main, merge
4. Tag the patch: git tag vX.Y.Z
5. Merge main back into develop
