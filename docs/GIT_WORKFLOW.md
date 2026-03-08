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
