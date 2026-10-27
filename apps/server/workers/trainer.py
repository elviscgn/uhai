"""Spawn-safe training entry point. Queues carry bounded progress, not simulation frames."""

from __future__ import annotations

import multiprocessing as mp
from queue import Empty, Full
from typing import Any

from apps.server.storage.repository import Repository
from apps.server.training.evolution import Evolution


def publish(queue: Any, message: dict[str, Any]) -> None:
    try:
        queue.put_nowait(message)
    except Full:
        try:
            queue.get_nowait()
        except Empty:
            pass
        try:
            queue.put_nowait(message)
        except Full:
            pass


def train(root: str, identity: str, queue: Any, pause: Any, stop: Any) -> None:
    repo = Repository(root)
    try:
        evolution = Evolution.restore(repo.load(identity))
        limit = evolution.config.evolution.generations
        while evolution.generation < limit and not stop.is_set():
            if pause.is_set():
                repo.status(identity, "paused")
                publish(queue, {"id": identity, "type": "status", "status": "paused"})
                while pause.is_set() and not stop.wait(0.1):
                    pass
                if stop.is_set():
                    break
            repo.status(identity, "running")
            report, checkpoint = evolution.step()
            repo.save(identity, report["generation"], checkpoint)
            publish(queue, {"id": identity, "type": "generation", "report": report})
        status = "completed" if evolution.generation >= limit else "paused"
        repo.status(identity, status)
        publish(queue, {"id": identity, "type": "status", "status": status})
    except Exception as exc:
        repo.status(identity, "error", str(exc))
        publish(queue, {"id": identity, "type": "error", "message": str(exc)})


class Trainer:
    def __init__(self, root: str):
        self.root = root
        self.context = mp.get_context("spawn")
        self.queue = self.context.Queue(maxsize=8)
        self.pause = self.context.Event()
        self.stop = self.context.Event()
        self.process: mp.Process | None = None
        self.identity: str | None = None

    def start(self, identity: str) -> None:
        if self.process and self.process.is_alive():
            if self.stop.is_set():
                raise ValueError("Pause is finishing; resume when the generation has been saved")
            if self.identity != identity:
                raise ValueError("Pause the current experiment before starting another")
            self.pause.clear()
            return
        if self.process:
            self.process.join(timeout=0)
        self.pause.clear()
        self.stop.clear()
        self.identity = identity
        self.process = self.context.Process(
            target=train, args=(self.root, identity, self.queue, self.pause, self.stop), daemon=True
        )
        self.process.start()

    def request_pause(self) -> None:
        self.pause.set()
        # Exit at the boundary, preserving exact RNG state and freeing the worker slot.
        self.stop.set()

    def close(self) -> None:
        self.stop.set()
        if self.process:
            self.process.join(timeout=3)
            if self.process.is_alive():
                self.process.terminate()
                self.process.join(timeout=2)
                if self.identity:
                    Repository(self.root).status(self.identity, "interrupted")
        self.queue.close()
