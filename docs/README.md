# Spektrum documentation

Start with the root [`README.md`](../README.md) for what Spektrum is, how to run
it, and the repository layout. These docs cover the parts a README cannot hold
without becoming a wall of text.

| Document | Read this when… |
|---|---|
| [AI providers and chat](ai-and-chat.md) | configuring a provider/key, using the chat panel, understanding tools and diff proposals |
| [Documents and PDFs](documents-and-pdf.md) | uploading files, opening a PDF, text extraction, why a scan cannot be read as text |
| [Compilation and PDF preview](compilation.md) | wondering when a compile runs, what the status pill means, or how the PDF stays up to date |
| [Troubleshooting](troubleshooting.md) | something looks stuck: rate limits, stale statuses, missing keys, PDF issues |

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
