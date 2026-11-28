// Build-time stub for the Siglum SDK's optional BLAKE3 accelerator.
//
// `blake3-wasm` ships a browser entry that imports a missing
// `blake3_js_bg.js`, which webpack cannot resolve and Turbopack stalls on.
// The SDK catches import failures and falls back to its pure-JS DJB2 hasher,
// which is sufficient for change detection. Throwing at import time keeps the
// fallback honest instead of pretending the accelerator is available.
throw new Error("BLAKE3 accelerator disabled in this serverless bundle");
