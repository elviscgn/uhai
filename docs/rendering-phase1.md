# Observatory · Phase 1 rendering review

Desktop rendering only. Phases 2 and 3 have not been started.

The normal application remains at <http://127.0.0.1:5173/>. The separate benchmark
page is an internal test harness, not a replacement Observatory interface.

## Implemented

- Habitat uses cover scaling and clamps panning/zoom to its finite bounds.
- Original fish paths and colours are retained in `fishArtwork.ts`.
- Four offscreen tail-wag images per species are generated once per page and shared by
  all organisms. Per-frame fish rendering uses `drawImage`, rotation, and vertical mirroring.
- Left-facing fish keep their illustrated bellies screen-down.
- Predator visible sprite width is 44.8 world units; prey width is 32 (1.4×).
- Positions interpolate recorded Rust snapshots. Display headings use exponential angular
  easing along the shortest arc. Seeking resets the eased pose. No simulation state changes.
- Screen-space clipping excludes population labels, episode labels, camera controls,
  the performance label, habitat caption, and inspector. Overlapping UI exclusions are
  intersected independently so they cannot cancel each other.
- Static terrain and food rendering use cached viewport layers; camera changes invalidate them.
- Renderer teardown cancels animation frames and disconnects layout observers.

The explicit request for offscreen canvases and `drawImage` replaces the prior PixiJS
Observatory rendering path with Canvas 2D. The Rust engine, Python evolution, checkpoints,
and transport remain unchanged. Existing trails, sensory inspection, and follow controls
are preserved. No new LOD, chase labels, capture bursts, or behaviour interpretation is added.

## Measured workload

Apple M1, 16 GB RAM; foreground Chrome; 1280 × 571 CSS-pixel habitat; DPR 2.
The fixture is a real four-second Rust episode, seed 2718, with 20 predators, 80 prey,
240 food resources, and 12 obstacles. It loops for rendering measurement only. No synthetic
neural behaviour or training curve is used.

All existing render overlays are enabled: every agent's trail, one selected predator's
vision cone and sensory rays, recorded neural activations, inspector, and UI masks.

| Case | Mean FPS | Mean drawing CPU time | Active agents, mean | Drawn agents, mean | Worst 1-second p95 frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fixed camera | 59.94 | 0.49 ms | 98.5 | 72.8 | 17.6 ms |
| Following predator | 60.00 | 0.33 ms | 99.0 | 64.6 | 17.7 ms |

The world begins with 100 agents and has 95–100 survivors during the fixture. Cover
cropping, inspector occlusion, and culling mean some agents are outside the visible region.
Eight cached fish images remain constant throughout both measurements.

The initial capture collected 967 frames per case (about 16.13 seconds) because measurement
used whole one-second windows. The normalized results state actual durations and preserve
every raw window. The harness now excludes warmup-overlapping windows and reports actual
measurement duration directly. CPU drawing time excludes final compositor/GPU work;
reported FPS and frame intervals come from real animation-frame timestamps.

These are measured results, not a guarantee for every display, machine, or future overlay.
The new overlays from later phases must be profiled when implemented.

[Normalized results](rendering-phase1-results.json) ·
[Original capture](rendering-phase1-initial-results.json)

## Reproduce intentionally

With the server and frontend running:

```sh
uv run --no-sync python -m scripts.render_fixture
```

The internal test harness is at `/benchmarks/phase1.html`. It uses the production renderer
with real recorded data. Run it in a visible, focused desktop Chrome window. It is not
linked from the normal application navigation.

## Validation and related requested corrections

Frontend build and ten Vitest checks pass, including camera boundaries, interpolation,
short-arc easing, frame-rate-independent angular response, and belly orientation through
multiple full turns. The actual Observatory was visually checked after the benchmark.

The decorative connection badge and pulsing status dots were removed. Evolution graphs
now explicitly say they show selection scores, explain configured capture/food/survival
rewards, and distinguish these values from a fish's remaining energy.
