import time

from fastapi.testclient import TestClient

from apps.server.api.main import create_app
from apps.server.api.replay import replay
from apps.server.storage.repository import Repository
from apps.server.training.evolution import Evolution
from tests.test_evolution import small_config


def test_checkpoint_and_replay(tmp_path):
    repo = Repository(tmp_path)
    config = small_config()
    row = repo.create(config)
    evo = Evolution(config)
    report, checkpoint = evo.step()
    repo.save(row["id"], 0, checkpoint)
    restored = repo.load(row["id"])
    assert restored == checkpoint
    assert repo.generations(row["id"]) == [0]
    a = replay(restored, seed=17, organism=0)
    b = replay(restored, seed=17)
    assert a["frames"] == b["frames"]
    assert len(a["frames"]) == len(a["trace"])
    assert a["frames"][0]["step"] == 0
    assert a["frames"][-1]["step"] == config.evolution.steps
    assert len(a["weights"]) == 706
    assert report["generation"] == 0


def test_retention_policy(tmp_path):
    repo = Repository(tmp_path)
    row = repo.create(small_config())
    for g in range(85):
        repo.save(row["id"], g, {"generation": g})
    retained = repo.generations(row["id"])
    assert 0 in retained and 10 in retained and 84 in retained
    assert 1 not in retained
    assert len(retained) <= 57


def test_api_websocket_training_lifecycle_and_restart(tmp_path):
    app = create_app(str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/api/health").json()["engine"] == "rust"
        invalid = client.post("/api/experiments", json={"world": {"predators": -1}})
        assert invalid.status_code == 422
        response = client.post("/api/experiments", json=small_config().model_dump())
        assert response.status_code == 201
        identity = response.json()["id"]
        path = f"/api/experiments/{identity}"
        with client.websocket_connect("/api/stream") as socket:
            assert socket.receive_json()["type"] == "connected"
            assert client.post(path + "/start").status_code == 200
            message = socket.receive_json()
            assert message["type"] in {"generation", "status"}
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            row = client.get(path).json()
            if row["status"] == "completed":
                break
            time.sleep(0.05)
        assert row["status"] == "completed", row
        assert len(row["history"]) == 3
        assert row["generations"] == [0, 1, 2]
        assert client.post(path + "/start").status_code == 409
        replay_data = client.get(path + "/replay?generation=1&organism=0").json()
        assert replay_data["trace"] and replay_data["weights"]
        assert client.get(path + "/replay?generation=1&prey_generation=0").status_code == 200
        assert client.get(path + "/replay?generation=400").status_code == 404
        assert client.get(path + "/replay?organism=999").status_code == 404
        duplicate = client.post(path + "/duplicate")
        assert duplicate.status_code == 201
        assert duplicate.json()["id"] != identity
        fork = client.post(path + "/fork", json={"generation": 1})
        assert fork.status_code == 201
        fork_id = fork.json()["id"]
        assert client.get(f"/api/experiments/{fork_id}/checkpoint").json()["next_generation"] == 2
    with TestClient(create_app(str(tmp_path))) as client:
        assert client.get(path).json()["status"] == "completed"


def test_pause_resume_preserves_progress(tmp_path):
    config = small_config()
    config.evolution.generations = 100
    with TestClient(create_app(str(tmp_path))) as client:
        row = client.post("/api/experiments", json=config.model_dump()).json()
        path = f"/api/experiments/{row['id']}"
        client.post(path + "/start")
        client.post(path + "/pause")
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            row = client.get(path).json()
            if row["status"] == "paused":
                break
            time.sleep(0.05)
        assert row["status"] == "paused"
        next_generation = client.get(path + "/checkpoint").json()["next_generation"]
        assert client.post(path + "/start").status_code == 200
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if client.get(path + "/checkpoint").json()["next_generation"] > next_generation:
                break
            time.sleep(0.05)
        assert client.get(path + "/checkpoint").json()["next_generation"] > next_generation
        client.post(path + "/pause")
