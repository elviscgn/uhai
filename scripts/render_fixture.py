"""Generate a short, real Rust episode for the reproducible desktop rendering workload."""

import json
from pathlib import Path

from apps.server.api.replay import replay
from apps.server.experiments.config import ExperimentConfig
from apps.server.training.evolution import Evolution

if __name__ == "__main__":
    config = ExperimentConfig.model_validate(
        {
            "name": "Rendering benchmark · neural founders",
            "seed": 2718,
            "world": {"predators": 20, "prey": 80},
            "evolution": {"steps": 120, "episodes": 1},
        }
    )
    data = replay(Evolution(config).checkpoint(), config.seed, organism=0)
    counts = [sum(int(a[8]) for a in frame["agents"]) for frame in data["frames"]]
    data["benchmark_meta"] = {
        "source": "Rust neural episode, unmodified snapshots",
        "seed": config.seed,
        "initial_agents": 100,
        "minimum_active_agents": min(counts),
        "mean_active_agents": sum(counts) / len(counts),
        "seconds": 4,
    }
    path = Path("apps/web/public/benchmarks/phase1-founders.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n")
    print(path, data["benchmark_meta"])
