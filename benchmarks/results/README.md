# Benchmark artifact retention

`m11-frozen-2026.json` and `.md` are the single surviving legacy v1 artifact. The old runner overwrote that path: it recorded a prior run summary, but the prior run's complete raw timings were lost and are not reconstructed.

Every v2 run is stored as a unique JSON/Markdown pair under `runs/`. Files are created exclusively and the runner fails on a name collision; it never replaces a prior raw run. The Markdown in each pair is generated canonically from its JSON and checked byte-for-byte after writing.
