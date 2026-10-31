# Security policy

## Reporting a vulnerability

Please don't report security vulnerabilities in public GitHub issues, discussions or pull requests.

Instead, email **[support@qrdx.dev](mailto:support@qrdx.dev)** with the subject line starting with `[security]`. Include:

- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- the affected component (qrdx.dev, a self-hosted instance, the `qrdx` npm package or `@qrdx/cli`) and version or commit
- whether you'd like to be credited, and under what name

We'll acknowledge your report as soon as we can, keep you updated while we investigate, and let you know when a fix ships. Please give us a reasonable amount of time to fix the issue before disclosing it publicly.

## Supported versions

Security fixes are made for:

- the hosted app at [qrdx.dev](https://qrdx.dev)
- the `main` branch, which self-hosted instances should track
- the latest published versions of [`qrdx`](https://www.npmjs.com/package/qrdx) and [`@qrdx/cli`](https://www.npmjs.com/package/@qrdx/cli)

## Scope

In scope: the web app and its API routes, authentication and sessions, the integrations (Dub, Google Drive), the npm packages, and the Docker setup in this repository.

Out of scope: vulnerabilities in third-party services QRdx connects to (report those to the vendor), denial of service through traffic volume, and self-hosted instances that don't follow the [self-hosting guide](https://qrdx.dev/docs/self-hosting), for example ones missing a required secret or exposed without a reverse proxy.
