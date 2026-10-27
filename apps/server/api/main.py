from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path
from queue import Empty
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from apps.server.api.replay import replay
from apps.server.experiments.config import ExperimentConfig
from apps.server.storage.repository import Repository
from apps.server.training.evolution import Evolution
from apps.server.workers.trainer import Trainer


class ForkRequest(BaseModel):
    generation: int = Field(ge=0, le=500)


def create_app(data_dir: str | None = None) -> FastAPI:
    root = data_dir or os.environ.get("UHAI_DATA_DIR", "experiments/data")
    repo = Repository(root)
    trainer = Trainer(str(Path(root).resolve()))
    subscribers: set[asyncio.Queue] = set()
    replay_gate = asyncio.Semaphore(2)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        for experiment in repo.list():
            if experiment["status"] in {"running", "pausing"}:
                repo.status(experiment["id"], "interrupted")

        async def broadcast():
            while True:
                messages = []
                for _ in range(8):
                    try:
                        messages.append(trainer.queue.get_nowait())
                    except Empty:
                        break
                for message in messages:
                    for queue in list(subscribers):
                        if queue.full():
                            queue.get_nowait()
                        queue.put_nowait(message)
                if trainer.process and not trainer.process.is_alive():
                    trainer.process.join(timeout=0)
                    if trainer.identity:
                        row = repo.get(trainer.identity)
                        if row["status"] in {"running", "pausing"}:
                            repo.status(
                                trainer.identity, "error", "Training process exited unexpectedly"
                            )
                    trainer.process = None
                await asyncio.sleep(0.15)

        task = asyncio.create_task(broadcast())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await asyncio.to_thread(trainer.close)

    app = FastAPI(title="Uhai · artificial life laboratory", lifespan=lifespan)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.state.repo = repo
    app.state.trainer = trainer

    def get(identity: str) -> dict[str, Any]:
        try:
            return repo.get(identity)
        except KeyError as exc:
            raise HTTPException(404, "Experiment not found") from exc

    def load(identity: str, generation: int | None = None) -> dict[str, Any]:
        get(identity)
        try:
            return repo.load(identity, generation)
        except FileNotFoundError as exc:
            raise HTTPException(404, "Checkpoint is not retained") from exc

    @app.get("/api/health")
    def health():
        return {"status": "ok", "engine": "rust", "schema": 1, "topology": [24, 16, 16, 2]}

    @app.get("/api/experiments")
    def experiments():
        return repo.list()

    @app.post("/api/experiments", status_code=201)
    def create(config: ExperimentConfig):
        row = repo.create(config)
        evolution = Evolution(config)
        repo.save(row["id"], 0, evolution.checkpoint())
        return repo.get(row["id"])

    @app.get("/api/experiments/{identity}")
    def experiment(identity: str):
        row = get(identity)
        data = load(identity)
        row["history"] = data["history"]
        row["archive"] = [
            {k: v for k, v in entry.items() if k != "champions"} for entry in data["archive"]
        ]
        row["generations"] = repo.generations(identity)
        return row

    @app.post("/api/experiments/{identity}/start")
    def start(identity: str):
        row = get(identity)
        if row["status"] == "completed":
            raise HTTPException(409, "Experiment completed. Duplicate it to start a new run.")
        try:
            trainer.start(identity)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        repo.status(identity, "running")
        return repo.get(identity)

    @app.post("/api/experiments/{identity}/pause")
    def pause(identity: str):
        row = get(identity)
        if trainer.identity == identity and trainer.process and trainer.process.is_alive():
            trainer.request_pause()
            repo.status(identity, "pausing")
        elif row["status"] != "completed":
            repo.status(identity, "paused")
        return repo.get(identity)

    @app.post("/api/experiments/{identity}/duplicate", status_code=201)
    def duplicate(identity: str):
        config = ExperimentConfig.model_validate(get(identity)["config"])
        config.name = config.name[:70] + " · copy"
        return create(config)

    @app.post("/api/experiments/{identity}/fork", status_code=201)
    def fork(identity: str, body: ForkRequest):
        checkpoint = load(identity, body.generation)
        config = ExperimentConfig.model_validate(checkpoint["config"])
        config.name = config.name[:60] + f" · from {body.generation}"
        checkpoint["config"] = config.model_dump()
        row = repo.create(config)
        repo.save(row["id"], body.generation, checkpoint)
        return repo.get(row["id"])

    @app.get("/api/experiments/{identity}/replay")
    async def recording(
        identity: str,
        generation: int = Query(0, ge=0, le=500),
        seed: int = Query(42, ge=0, le=2**32 - 1),
        organism: int | None = Query(None, ge=0, le=2000),
        prey_generation: int | None = Query(None, ge=0, le=500),
    ):
        async with replay_gate:
            checkpoint = await asyncio.to_thread(load, identity, generation)
            opponent = (
                await asyncio.to_thread(load, identity, prey_generation)
                if prey_generation is not None
                else None
            )
            if organism is not None:
                world = checkpoint["config"]["world"]
                if organism >= world["predators"] + world["prey"]:
                    raise HTTPException(404, "Organism not found")
            return await asyncio.to_thread(partial(replay, checkpoint, seed, organism, opponent))

    @app.get("/api/experiments/{identity}/checkpoint")
    def checkpoint(identity: str, generation: int | None = Query(None, ge=0, le=500)):
        return load(identity, generation)

    @app.websocket("/api/stream")
    async def stream(websocket: WebSocket):
        # No cross-origin browser clients may control/observe this localhost service.
        origin = websocket.headers.get("origin", "")
        if origin and origin not in {
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        }:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        subscribers.add(queue)
        try:
            await websocket.send_json({"type": "connected", "experiments": repo.list()})
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=10)
                except TimeoutError:
                    message = {"type": "heartbeat"}
                await websocket.send_json(message)
        except (WebSocketDisconnect, RuntimeError, OSError):
            pass
        finally:
            subscribers.discard(queue)

    return app


app = create_app()
