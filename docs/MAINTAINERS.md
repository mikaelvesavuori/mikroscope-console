# Maintainers

This guide is intentionally maintainer-focused. End-user documentation lives in the repository root `README.md`.

## Local Verification

| Task                            | Command                   | When                              |
|---------------------------------|---------------------------|-----------------------------------|
| Run tests                       | `npm test`                | Before merging and releasing      |
| Build UI bundle                 | `npm run build`           | Before packaging and releasing    |
| Build release artifacts locally | `npm run package:release` | Optional preflight before tagging |
| Run coverage                    | `npm run test:coverage`   | Optional quality check            |

## Reproducible Fixture Data

Tests use local HTTP fixture servers and real JSON fixture input committed in the repo.

| Task                              | Command                                                                                                                         | Output                             |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------|------------------------------------|
| Capture fixture from a live API   | `npm run fixtures:capture`                                                                                                      | `tests/fixtures/logs.fixture.json` |
| Capture with custom source/volume | `MIKROSCOPE_API_ORIGIN=http://127.0.0.1:4310 MIKROSCOPE_TARGET_ENTRIES=2000 MIKROSCOPE_PAGE_LIMIT=500 npm run fixtures:capture` | Updated fixture file               |

## Release Process

| Step | Action                                                            |
|------|-------------------------------------------------------------------|
| 1    | Ensure `npm test` and `npm run build` pass                        |
| 2    | Bump version in `package.json`                                    |
| 3    | Commit and push to `main`                                         |
| 4    | Tag and push release: `git tag vX.Y.Z && git push origin vX.Y.Z`  |
| 5    | Confirm GitHub release workflow completes and assets are attached |

## GitHub Release Workflow

`/.github/workflows/release.yml` performs:

| Stage    | Result                       |
|----------|------------------------------|
| Install  | `npm ci`                     |
| Validate | `npm test` + `npm run build` |
| Package  | `npm run package:release`    |
| Publish  | GitHub Release with assets   |

Published assets:

| Asset                              | Purpose                    |
|------------------------------------|----------------------------|
| `mikroscope-console-vX.Y.Z.tar.gz` | Primary release bundle     |
| `mikroscope-console-vX.Y.Z.zip`    | Alternative archive format |
| `SHA256SUMS.txt`                   | Integrity checks           |
| `install.sh`                       | One-line installer script  |
