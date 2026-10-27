# Uhai · architecture and execution plan

Uhai is a local scientific instrument. The Rust engine is authoritative. Python evolves
genomes and manages experiments; the browser only renders recorded engine snapshots.

## Boundaries

* **Rust**: fixed 1/30 s integration; finite walls, circle obstacles, spatial grids,
  energy, food regeneration, capture, local sensing, and a tanh 24–16–16–2 MLP.
  One batch call evaluates an entire episode; no per-creature Python inference calls.
  Deterministic ChaCha8 initialization; no random draws during physics.
* **Python research**: independent genome populations, repeated seeded arenas,
  tournament selection, elitism, Gaussian mutation, archived opponents and separate
  reference/held-out tests. A genome can control several organisms. An episode is one
  seeded arena; a generation evaluates the population before replacing it.
* **FastAPI**: one spawned training process at a time, cooperative pause at generation
  boundaries, bounded progress queue, SQLite metadata, atomic gzip JSON checkpoints.
  Replay creation uses a thread and Rust releases the GIL. WebSockets stream progress,
  never drive training. Localhost only.
* **Vue/Canvas 2D Observatory**: cached terrain and food layers, eight offscreen fish
  frames shared across all organisms, and `drawImage` per creature. This replaces the
  original PixiJS Observatory path per the explicit Phase 1 rendering request.
  Playback, eased display headings, bounded camera, and UI exclusion clips are independent
  of the engine. Observation can continue while the trainer advances.

## Phases and acceptance

1. Headless core: deterministic tests, bounded observations, collision/energy/capture
   tests, Python batch boundary and workload benchmark.
2. Evolution: mutation/selection/checkpoint tests and a multi-seed controlled foraging
   challenge with independently held-out seeds. Record actual outcomes, including failure.
3. Coevolution: contemporary, archived, reference, and held-out results kept distinct;
   generation snapshots can be matched across history.
4. Observatory: actual recorded episodes; playback, camera, creature and network inspection.
5. Research tools: saved experiment configuration, resume, timeline, archive, comparison.
6. Verification: integration tests, browser inspection, simulation/render measurements,
   clear documentation of scientific and engineering limits.

## Deliberate initial limits

Fixed network topology and individual (non-cooperative) fitness. No PyTorch, distributed
workers, speculative behaviour labels, or claim that contemporary fitness proves learning.
Recordings are generated on demand, bounded in duration and not saved frame-by-frame in
checkpoints. Checkpoints retain population, scores, RNG state and opponent archive.
Schema 1 is explicit; incompatible checkpoints are rejected.

## API references consulted

[PyO3 0.27 classes](https://pyo3.rs/v0.27.2/class.html),
[maturin configuration](https://www.maturin.rs/config.html),
[PixiJS 8 Application](https://pixijs.com/8.x/guides/components/application),
[PixiJS 8 Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics),
[PixiJS 8 events](https://pixijs.com/8.x/guides/components/events),
[FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/),
[Vite requirements](https://vite.dev/guide/). Lockfiles capture resolved dependencies.
