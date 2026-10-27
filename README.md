# Uhai

A local artificial life laboratory built with Vue, Canvas 2D rendering, FastAPI, Python neuroevolution,
and a deterministic Rust simulation core.

The Observatory uses the supplied Uhai artwork, locally bundled Michroma display and Chakra Petch interface typography,
and a full-height habitat. The existing fish artwork is pre-rendered into four animation frames
per species. Positions are interpolated, headings eased, and left-facing sprites mirrored
to keep their bellies down. Paths come from the neural engine.

## Run locally

Requirements: Rust stable, Python 3.12, uv, and Node 22.12 or newer.
On Apple Silicon, ensure Homebrew's current Node is ahead of an older `/usr/local/bin/node`
on your PATH (`export PATH="/opt/homebrew/bin:$PATH"`).

From the repository root:

```sh
uv sync --python 3.12
uv run uvicorn apps.server.api.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
cd apps/web
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The frontend proxies the local API and WebSocket connection.
The first experiment starts from random neural genomes. Playback and training have separate controls.

After changing Rust sources, rebuild the extension with `uv sync --reinstall-package uhai`.

## Controls

- Click an organism to inspect its recorded neural state.
- Drag to pan; scroll or use the camera controls to zoom.
- Fit habitat resets the view to fill the screen. Zoom and panning stay inside the habitat.
- Space pauses playback. The timeline seeks within an episode.
- Playback starts at 2×; visible 1×, 2×, 4×, and 8× controls change observation speed independently of training.
- Loop repeats the same recorded episode. It does not advance the evolutionary generation.
- Evolution → Watch founders / Watch latest opens a recorded episode in the Observatory.
  Marked generations on the captures and survival charts also open their corresponding replays.
- Selection scores and research comparisons are expandable details below those charts.
- Follow, perception, and trails are available for inspection.
- Start/pause training controls the background process independently of playback.

## Checks

```sh
cargo test
cargo clippy --all-targets -- -D warnings
uv run pytest -q
uv run ruff check apps scripts tests
cd apps/web
npm test
npm run build
```

## Status

The engine, batch Python boundary, evolutionary populations, checkpoints, local process
orchestration, recorded playback, and initial research views are implemented.
The UI is undergoing review before further simulation work.

Observatory Phase 1 results and reproduction steps: [docs/rendering-phase1.md](docs/rendering-phase1.md).
Phases 2 and 3 remain gated on review. Development is focused on desktop use.

This is an initial working slice. It does not establish sophisticated predator–prey behaviour
or cooperation. Fixed neural topology, single-process training, no sensory occlusion, no
behavioural classifiers, and no automatic episode curation are deliberate current limits.

Architecture and execution notes: [docs/architecture.md](docs/architecture.md).
Controlled learning experiments and raw results live under `scripts/` and `docs/`.
Local experiment data is stored in `experiments/data/` and excluded from Git.
