"""Bounded deterministic replay generation, decoupled from the training process."""

from __future__ import annotations

import json
from typing import Any

import uhai_core


def replay(
    checkpoint: dict[str, Any],
    seed: int,
    organism: int | None = None,
    opponent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = checkpoint["config"]
    predators, prey = checkpoint["evaluated"]
    if opponent is not None:
        prey = opponent["evaluated"][1]
    sim = uhai_core.Simulation(json.dumps(config["world"]), seed, predators, prey)
    environment = json.loads(sim.environment())
    steps = config["evolution"]["steps"]
    # At most 301 snapshots, ~10 samples/s for normal 30 second episodes.
    stride = max(3, (steps + 299) // 300)
    frames, traces = [], []
    current = 0
    while True:
        frames.append(json.loads(sim.snapshot()))
        if organism is not None:
            data = json.loads(sim.inspect(organism))
            data.pop("weights")
            traces.append(data)
        if current >= steps:
            break
        count = min(stride, steps - current)
        sim.advance(count)
        current += count
    result = {
        "schema": 1,
        "seed": seed,
        "environment": environment,
        "frames": frames,
        "stride": stride,
        "scores": json.loads(sim.scores()),
        "kind": "recorded",
        "trace": traces,
        "weights": None,
    }
    if organism is not None:
        result["weights"] = json.loads(sim.inspect(organism))["weights"]
    return result
