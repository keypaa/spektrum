# Spektrum documentation

Start with the root [`README.md`](../README.md) for what Spektrum is, how to run
it, and the repository layout. These docs cover the parts a README cannot hold
without becoming a wall of text.

| Document | Read this when… |
|---|---|
| [AI providers and chat](ai-and-chat.md) | configuring a provider/key, using the chat panel, understanding tools and diff proposals |
| [Image input in the AI chat](image-chat-input.md) | pasting images, capability detection, storage, history budget, rejection recovery |
| [Documents and PDFs](documents-and-pdf.md) | uploading files, opening a PDF, text extraction, why a scan cannot be read as text |
| [Compilation and PDF preview](compilation.md) | wondering when a compile runs, what the status pill means, or how the PDF stays up to date |
| [Troubleshooting](troubleshooting.md) | something looks stuck: rate limits, stale statuses, missing keys, PDF issues |
| [Serverless deployment](serverless-deployment.md) | deploying the free public Vercel instance: provisioning, env vars, smoke checklist, quotas, limits |
| [Serverless build notes](serverless-build-notes.md) | why the branch builds with webpack and stubs BLAKE3; the Siglum SDK bundle problem and rejected alternatives |

The authoritative product specification is
[`zenno/specs/2026-11-07-spektrum-design.md`](../zenno/specs/2026-11-07-spektrum-design.md).
Phase plans live in [`zenno/plans/`](../zenno/plans/) and deployment operations
in [`zenno/docs/phase-5-launch.md`](../zenno/docs/phase-5-launch.md). These files
are preserved as the build record; the docs above describe the running system.

## Conventions

- Paths in code blocks are relative to the repository root.
- Environment variables are documented in [`.env.example`](../.env.example);
  never commit real values.
- UI labels are written exactly as they appear, e.g. **New chat**, **Accept all**.
