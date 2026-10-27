import copy
import json

import numpy as np
import pytest
import uhai_core

from apps.server.experiments.config import ExperimentConfig
from apps.server.training.evolution import (
    Evolution,
    evaluate,
    fitness,
    initialize,
    reproduce,
    select_parent,
)


def small_config() -> ExperimentConfig:
    return ExperimentConfig.model_validate(
        {
            "seed": 17,
            "world": {"predators": 4, "prey": 8, "food": 30, "obstacles": 2},
            "evolution": {
                "population": 4,
                "steps": 120,
                "episodes": 2,
                "generations": 3,
                "assessment_interval": 1,
            },
        }
    )


def test_batched_forward_matches_numpy():
    rng = np.random.default_rng(7)
    weights = initialize(rng, 6)
    obs = rng.uniform(-1, 1, (6, 24))
    actual = uhai_core.forward_batch(weights.tolist(), obs.tolist())
    expected = []
    for w, x in zip(weights, obs):
        offset = 0
        for inputs, outputs in [(24, 16), (16, 16), (16, 2)]:
            layer = w[offset : offset + (inputs + 1) * outputs].reshape(outputs, inputs + 1)
            x = np.tanh(layer[:, :-1] @ x + layer[:, -1])
            offset += (inputs + 1) * outputs
        expected.append(x)
    np.testing.assert_allclose(actual, expected, atol=2e-6)
    assert np.max(np.abs(actual)) <= 1
    with pytest.raises(ValueError):
        uhai_core.forward_batch([[0]], [[0] * 24])


def test_selection_pressure_mutation_and_inheritance():
    rng = np.random.default_rng(71)
    scores = np.arange(12.0)
    chosen = np.bincount([select_parent(rng, scores, 3) for _ in range(8000)], minlength=12)
    assert chosen[-1] > 8 * chosen[0]
    parent = initialize(rng, 12)
    unchanged = reproduce(parent, scores, rng, 0, 1, 2)
    np.testing.assert_array_equal(unchanged[0], parent[-1])
    np.testing.assert_array_equal(unchanged[1], parent[-2])
    assert all(any(np.array_equal(child, p) for p in parent) for child in unchanged)
    mutated = reproduce(parent, scores, rng, 1, 0.2, 2)
    assert mutated.shape == parent.shape
    assert not any(np.array_equal(mutated[-1], p) for p in parent)
    np.testing.assert_array_equal(mutated[0], parent[-1])


def test_fitness_is_inspectable():
    c = small_config()
    row = dict(species=0, captures=2, survival=4, energy=0.5, effort=2)
    assert fitness(row, 4, c) == pytest.approx(8 + 0.3 + 0.05 - 0.025)
    row.update(species=1, food=3)
    assert fitness(row, 4, c) == pytest.approx(2 + 1.8 + 0.05 - 0.025)


def test_evaluation_scenarios_and_restore_are_reproducible():
    c = small_config()
    a = Evolution(c)
    b = Evolution.restore(json.loads(json.dumps(a.checkpoint())))
    score_a, ecology_a = evaluate(c, *a.populations, [101, 211])
    score_b, ecology_b = evaluate(c, *b.populations, [101, 211])
    for x, y in zip(score_a, score_b):
        np.testing.assert_array_equal(x, y)
    assert ecology_a == ecology_b
    first, saved = a.step()
    assert first["reference"] is not None
    assert first["historical"] is None
    b = Evolution.restore(saved)
    result_a, _ = a.step()
    result_b, _ = b.step()
    result_a.pop("seconds")
    result_b.pop("seconds")
    assert result_a == result_b
    assert result_a["historical"]["opponent_generation"] == 0
    for x, y in zip(a.populations, b.populations):
        np.testing.assert_array_equal(x, y)
    broken = copy.deepcopy(saved)
    broken["schema"] = 999
    with pytest.raises(ValueError):
        Evolution.restore(broken)


def test_python_rust_determinism_and_inspection():
    c = small_config()
    e = Evolution(c)
    args = (c.world.model_dump_json(), 45, *[p.tolist() for p in e.populations])
    a = uhai_core.Simulation(*args)
    b = uhai_core.Simulation(*args)
    a.advance(60)
    b.advance(60)
    assert a.snapshot() == b.snapshot()
    data = json.loads(a.inspect(0))
    assert [len(layer) for layer in data["brain"]["layers"]] == [24, 16, 16, 2]
    actual = uhai_core.forward_batch([data["weights"]], [data["agent"]["observation"]])[0]
    np.testing.assert_allclose(actual, data["brain"]["actions"], atol=1e-6)
    with pytest.raises(ValueError):
        a.inspect(999)
