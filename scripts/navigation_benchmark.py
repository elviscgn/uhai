"""Controlled learning assay: acquire one visible food target, with held-out placements."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import uhai_core

from apps.server.training.evolution import initialize, reproduce


def benchmark(generations: int = 80, population: int = 48) -> dict:
    steps = 360
    train_seeds = list(range(1001, 1017))
    held_seeds = list(range(50_001, 50_065))
    runs = []
    start = time.perf_counter()
    for seed in [7, 19, 43]:
        rng = np.random.default_rng(seed)
        pop = initialize(rng, population)
        curve = []
        founder = None
        for g in range(generations + 1):
            result = np.array(uhai_core.evaluate_navigation(pop.tolist(), train_seeds, steps))
            scores = result[:, :, 0].mean(axis=1)
            champion = pop[int(np.argmax(scores))].copy()
            if g == 0:
                founder = champion.copy()
            curve.append(
                {
                    "generation": g,
                    "mean_training_fitness": float(scores.mean()),
                    "best_training_fitness": float(scores.max()),
                    "champion_training_success": float(result[np.argmax(scores), :, 1].mean()),
                }
            )
            if g < generations:
                pop = reproduce(pop, scores, rng, rate=0.12, scale=0.16, elites=3)
        held = np.array(
            uhai_core.evaluate_navigation([founder.tolist(), champion.tolist()], held_seeds, steps)
        )
        before, after = held[:, :, 1]
        runs.append(
            {
                "seed": seed,
                "before": before.tolist(),
                "after": after.tolist(),
                "before_mean": float(before.mean()),
                "after_mean": float(after.mean()),
                "delta": float(after.mean() - before.mean()),
                "curve": curve,
            }
        )
        print(
            f"seed {seed}: held-out target acquisition {before.mean():.3f} → {after.mean():.3f}",
            flush=True,
        )
    deltas = [r["delta"] for r in runs]
    return {
        "schema": 1,
        "task": "single visible food acquisition",
        "engine": "uhai-core-0.1.0",
        "steps": steps,
        "population": population,
        "generations": generations,
        "training_seeds": train_seeds,
        "held_out_seeds": held_seeds,
        "runs": runs,
        "fitness": "5 × food acquired + (initial distance − final distance) / 350",
        "conditions": "240×240 world, 1 prey, 1 food, no predators/obstacles, 360° FOV, range 350",
        "mean_delta": float(np.mean(deltas)),
        "std_delta": float(np.std(deltas, ddof=1)),
        "seconds": time.perf_counter() - start,
        "limitations": [
            "Three evolution seeds; descriptive, not a significance claim.",
            "Distance shaping is evaluation-only; policy sees ordinary local sensors.",
            "Target acquisition is simpler than sustained foraging or coevolution.",
            "All held-out placements are excluded from selection.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--generations", type=int, default=80)
    parser.add_argument("--output", default="docs/learning-results.json")
    args = parser.parse_args()
    result = benchmark(args.generations)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
    print(f"mean held-out delta: {result['mean_delta']:.3f} ± {result['std_delta']:.3f}")
