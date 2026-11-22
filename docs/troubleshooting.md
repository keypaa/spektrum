# Troubleshooting

## AI / chat

**"Add your API key in Settings"** — no server key (`LLM_API_KEY`) and no BYOK
key. Open Settings → Integrations, pick a provider, and paste a key. The key is
write-only; only a masked suffix is stored in the UI.

**"Provider returned error … rate-limited upstream"** — the gateway’s upstream
provider quota is exhausted, common with `:free` models. Retry later, switch to
a paid model, or add your own provider key.

**The PDF is "image-based" / "no extractable text"** — the PDF is a scan with no
text layer. Spektrum does not run OCR. Use the visual preview or provide a
text-based version. See [Documents and PDFs](documents-and-pdf.md).

**A follow-up message disappeared** — fixed: user turns and assistant replies
are no longer merged when they are adjacent text parts. If you still see it,
include the thread id and reload the page.

**The same tool appears several times** — the model retried the same call (for
example `oldText occurs 0 times`). Identical consecutive tool rows are collapsed;
the underlying retry is still visible once.

## Compilation

**Stuck on "Failed" although the file is fixed** — the UI now judges SSE errors
against the current revision and re-reads `/render/latest`. Hard-refresh; the
server prefers a successful render of the current documents over a newer error
for an older revision.

**Refresh arrow does nothing** — it forces a recompile. If a rate limit or
request error occurs, the message appears in the header next to **Tools**.
Limits are 6/minute (burst 12) and 60/hour; wait for the `Retry-After` window.

**PDF does not update** — the viewer deliberately keeps the last good PDF when
a compile fails. Check the red banner and **View log**. On success the
`result` event swaps the URL.

**No compile at all** — confirm the TeX Live image exists (`./scripts/build-texlive.sh`),
the worker is running, and `TEXLIVE_IMAGE` matches the tag that was built.

## Development / CI

**Install fails on Node/pnpm version** — the toolchain is pinned to Node 26.13.0
and pnpm 12.18.0. Use the repo’s `.mise.toml` / `.node-version`.

**E2E icon test fails with a non-16×16 viewBox** — every non-Monaco SVG in the
editor DOM must use `viewBox="0 0 16 16"` with `currentColor`. Scale custom path
data inside that viewBox rather than changing the test.

**`@` picker first item clipped** — the panel must be at least its default
height (260 px). The dropdown is capped at `max-h-40`; resizing the chat smaller
can still clip it, so drag the handle up first.

**Local DB tests fail with ECONNREFUSED** — start the dev infrastructure:
`docker compose -f docker/compose.dev.yml up -d postgres redis seaweedfs`.

For deployment-specific issues (TLS, metrics, backups, rollback), see the
[launch runbook](../zenno/docs/phase-5-launch.md).
