# Licensing

Copyright (c) 2025 Ritesh Bucha

All third-party components incorporated into the QRDX Software are licensed under the original license provided by the owner of the applicable component.

QRdx is open core. The repository is under three licenses:

- **AGPLv3.** Everything not listed below is available under the "AGPLv3" license, whose full text is in [LICENSE](LICENSE). That includes the web app, two-step verification and passkeys.
- **MIT.** The folders that carry their own MIT LICENSE file: packages/qrdx, packages/cli, the plugins in plugins/, the Agent Skill in skills/generate-qr and the shadcn/ui registry components in apps/app/registry/qrdx.
- **QRdx Commercial License.** The `ee/` folders ([apps/app/ee](apps/app/ee/LICENSE.md) and [packages/auth/ee](packages/auth/ee/LICENSE.md)), each with its own LICENSE.md. They hold business features; today that's workspace single sign-on (OIDC and SAML) and the workspace audit log. The source is available to read, test and contribute to, but using it in production needs a written agreement with QRdx. A self-hosted instance turns these features on with a license key in `QRDX_EE_LICENSE`; without one they stay off and the rest of QRdx works as usual.
