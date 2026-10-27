"""Individual neuroevolution. The engine, rather than Python, decides every movement."""

from __future__ import annotations

import copy
import json
import time
from typing import Any

import numpy as np
import uhai_core

from apps.server.experiments.config import ExperimentConfig

TOPOLOGY = [24, 16, 16, 2]
SCHEMA = 1


def initialize(rng: np.random.Generator, count: int) -> np.ndarray:
    layers = [
        rng.normal(0, np.sqrt(1 / inputs), (count, outputs, inputs + 1))
        for inputs, outputs in zip(TOPOLOGY, TOPOLOGY[1:])
    ]
    return np.concatenate([layer.reshape(count, -1) for layer in layers], axis=1)


def select_parent(rng: np.random.Generator, scores: np.ndarray, tournament: int) -> int:
    candidates = rng.integers(len(scores), size=tournament)
    return int(candidates[np.argmax(scores[candidates])])


def reproduce(
    population: np.ndarray,
    scores: np.ndarray,
    rng: np.random.Generator,
    rate: float,
    scale: float,
    elites: int,
    tournament: int = 3,
) -> np.ndarray:
    elites = min(elites, len(population) - 1)
    order = np.argsort(-scores, kind="stable")
    children = [p.copy() for p in population[order[:elites]]]
    while len(children) < len(population):
        parent = population[select_parent(rng, scores, tournament)]
        mask = rng.random(parent.shape) < rate
        child = parent + mask * rng.normal(0, scale, parent.shape)
        children.append(np.clip(child, -8, 8))
    return np.array(children)


def fitness(row: dict[str, Any], duration: float, config: ExperimentConfig) -> float:
    f = config.fitness
    common = f.remaining_energy * row["energy"] - f.effort_cost * row["effort"] / duration
    if row["species"] == 0:
        return float(
            f.predator_capture * row["captures"]
            + f.predator_survival * min(1, row["survival"] / duration)
            + common
        )
    return float(
        f.prey_survival * min(1, row["survival"] / duration) + f.prey_food * row["food"] + common
    )


def evaluate(
    config: ExperimentConfig,
    predators: np.ndarray,
    prey: np.ndarray,
    seeds: list[int],
    world_override: dict[str, Any] | None = None,
) -> tuple[list[np.ndarray], dict[str, float]]:
    cfg = config.world.model_dump() | (world_override or {})
    cfg_json = json.dumps(cfg)
    totals = [np.zeros(len(predators)), np.zeros(len(prey))]
    counts = [np.zeros(len(predators)), np.zeros(len(prey))]
    captures, food, survival = [], [], []
    weights = (predators.tolist(), prey.tolist())
    for seed in seeds:
        sim = uhai_core.Simulation(cfg_json, int(seed), *weights)
        sim.advance(config.evolution.steps)
        rows = json.loads(sim.scores())
        for row in rows:
            s, g = row["species"], row["genome"]
            if row["organisms"]:
                totals[s][g] += fitness(row, config.evolution.steps / 30, config)
                counts[s][g] += 1
                if s == 0:
                    captures.append(row["captures"])
                else:
                    food.append(row["food"])
                    survival.append(row["survival"])
    scores = [np.divide(t, np.maximum(c, 1)) for t, c in zip(totals, counts)]
    return scores, {
        "captures_per_predator": float(np.mean(captures)) if captures else 0,
        "food_per_prey": float(np.mean(food)) if food else 0,
        "prey_survival_seconds": float(np.mean(survival)) if survival else 0,
    }


class Evolution:
    def __init__(self, config: ExperimentConfig):
        self.config = config
        self.rng = np.random.default_rng(config.seed)
        self.populations = [
            initialize(self.rng, min(config.evolution.population, count))
            for count in [config.world.predators, config.world.prey]
        ]
        self.generation = 0
        self.history: list[dict[str, Any]] = []
        self.archive: list[dict[str, Any]] = []

    def checkpoint(self, evaluated: list[np.ndarray] | None = None) -> dict[str, Any]:
        return {
            "schema": SCHEMA,
            "engine": "uhai-core-0.1.0",
            "topology": TOPOLOGY,
            "config": self.config.model_dump(),
            "next_generation": self.generation,
            "populations": [p.tolist() for p in self.populations],
            "evaluated": [p.tolist() for p in (evaluated or self.populations)],
            "history": copy.deepcopy(self.history),
            "archive": copy.deepcopy(self.archive),
            "rng": copy.deepcopy(self.rng.bit_generator.state),
        }

    @classmethod
    def restore(cls, data: dict[str, Any]) -> "Evolution":
        if (
            data.get("schema") != SCHEMA
            or data.get("topology") != TOPOLOGY
            or data.get("engine") != "uhai-core-0.1.0"
        ):
            raise ValueError("Unsupported checkpoint schema, engine, or topology")
        obj = cls(ExperimentConfig.model_validate(data["config"]))
        obj.generation = data["next_generation"]
        obj.populations = [np.array(p, dtype=float) for p in data["populations"]]
        for p, expected in zip(
            obj.populations,
            [
                min(obj.config.evolution.population, obj.config.world.predators),
                min(obj.config.evolution.population, obj.config.world.prey),
            ],
        ):
            if p.shape != (expected, uhai_core.WEIGHTS) or not np.isfinite(p).all():
                raise ValueError("Invalid checkpoint population")
        obj.history, obj.archive = copy.deepcopy(data["history"]), copy.deepcopy(data["archive"])
        obj.rng.bit_generator.state = data["rng"]
        return obj

    def step(self) -> tuple[dict[str, Any], dict[str, Any]]:
        started = time.perf_counter()
        c, g = self.config, self.generation
        # Shared scenarios for each generation; new training seeds each generation.
        seeds = [int(s) for s in self.rng.integers(0, 2**32, size=c.evolution.episodes)]
        scores, ecology = evaluate(c, *self.populations, seeds)
        champions = [p[int(np.argmax(s))].copy() for p, s in zip(self.populations, scores)]
        report: dict[str, Any] = {
            "generation": g,
            "seeds": seeds,
            "ecology": ecology,
            "contemporary": [
                {"mean": float(s.mean()), "best": float(s.max()), "std": float(s.std())}
                for s in scores
            ],
            "champion_indices": [int(np.argmax(s)) for s in scores],
            "historical": None,
            "reference": None,
            "held_out": None,
        }
        if g % c.evolution.assessment_interval == 0:
            # Fixed seeds across generations; these are evaluation-only and never used in selection.
            reference_seeds = [int((c.seed + 1_000_003 + i * 7919) % 2**32) for i in range(3)]
            zero = np.zeros((1, uhai_core.WEIGHTS))
            pred_ref, _ = evaluate(
                c, champions[0][None, :], zero, reference_seeds, {"prey_policy": "wander"}
            )
            prey_ref, _ = evaluate(
                c, zero, champions[1][None, :], reference_seeds, {"predator_policy": "pursuit"}
            )
            report["reference"] = [float(pred_ref[0][0]), float(prey_ref[1][0])]
            unseen = [int((c.seed + 2_000_033 + i * 3571) % 2**32) for i in range(3)]
            held, _ = evaluate(
                c,
                *[v[None, :] for v in champions],
                unseen,
                {"obstacles": min(80, c.world.obstacles + 4)},
            )
            report["held_out"] = [float(s[0]) for s in held]
            if self.archive:
                old = self.archive[len(self.archive) // 2]
                p_old = np.array(old["champions"][0])[None, :]
                q_old = np.array(old["champions"][1])[None, :]
                a, _ = evaluate(c, champions[0][None, :], q_old, reference_seeds)
                b, _ = evaluate(c, p_old, champions[1][None, :], reference_seeds)
                report["historical"] = {
                    "opponent_generation": old["generation"],
                    "scores": [float(a[0][0]), float(b[1][0])],
                }
            self.archive.append(
                {
                    "generation": g,
                    "champions": [v.tolist() for v in champions],
                    "contemporary": [float(s.max()) for s in scores],
                }
            )
            # Preserve founders plus a rolling eleven historical champion pairs.
            if len(self.archive) > 12:
                self.archive.pop(1)
        report["seconds"] = time.perf_counter() - started
        self.history.append(report)
        evaluated = self.populations
        e = c.evolution
        self.populations = [
            reproduce(p, s, self.rng, e.mutation_rate, e.mutation_scale, e.elites, e.tournament)
            for p, s in zip(evaluated, scores)
        ]
        self.generation += 1
        return report, self.checkpoint(evaluated)
