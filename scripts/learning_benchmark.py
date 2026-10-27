"""Run `uv run python -m scripts.learning_benchmark`. No selection on held-out seeds."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import uhai_core

from apps.server.training.evolution import initialize, reproduce


def benchmark(generations: int = 50, population: int = 36) -> dict:
    config = dict(
        width=400,
        height=300,
        predators=0,
        prey=1,
        food=45,
        obstacles=3,
        perception=120,
        speed=55,
        food_regrowth=10,
        energy_cost=0.008,
    )
    config_json = json.dumps(config)
    steps = 450
    train_seeds = [101, 211, 307, 401]
    held_seeds = list(range(40_001, 40_013))
    runs = []
    start = time.perf_counter()
    for seed in [7, 19, 43]:
        rng = np.random.default_rng(seed)
        pop = initialize(rng, population)
        curve = []
        initial = None
        for g in range(generations + 1):
            scores = np.mean(
                uhai_core.evaluate_solo(config_json, pop.tolist(), train_seeds, steps), axis=1
            )
            champion = pop[int(np.argmax(scores))].copy()
            if g == 0:
                initial = champion.copy()
            curve.append(
                {
                    "generation": g,
                    "mean_training_food": float(scores.mean()),
                    "best_training_food": float(scores.max()),
                }
            )
            if g < generations:
                pop = reproduce(pop, scores, rng, rate=0.12, scale=0.20, elites=3)
        before, after = uhai_core.evaluate_solo(
            config_json, [initial.tolist(), champion.tolist()], held_seeds, steps
        )
        runs.append(
            {
                "seed": seed,
                "before": before,
                "after": after,
                "before_mean": float(np.mean(before)),
                "after_mean": float(np.mean(after)),
                "delta": float(np.mean(after) - np.mean(before)),
                "curve": curve,
            }
        )
        print(
            f"seed {seed}: held-out food {np.mean(before):.3f} → {np.mean(after):.3f}", flush=True
        )
    deltas = [r["delta"] for r in runs]
    return {
        "schema": 1,
        "task": "solo food collection",
        "config": config,
        "steps": steps,
        "population": population,
        "generations": generations,
        "training_seeds": train_seeds,
        "held_out_seeds": held_seeds,
        "runs": runs,
        "mean_delta": float(np.mean(deltas)),
        "std_delta": float(np.std(deltas, ddof=1)),
        "seconds": time.perf_counter() - start,
        "limitations": [
            "Three evolution seeds; exploratory, not a significance claim.",
            "Fixed training worlds can overfit; held-out worlds change placement.",
            "Demonstrates foraging learning, not predator–prey cooperation.",
            "Founder and final champions selected using training scores only.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--generations", type=int, default=50)
    parser.add_argument("--output", default="docs/learning-results.json")
    args = parser.parse_args()
    result = benchmark(args.generations)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
    print(f"mean held-out delta: {result['mean_delta']:.3f} ± {result['std_delta']:.3f}")
