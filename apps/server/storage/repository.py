"""Small SQLite index and atomic, compressed checkpoint files. No frame accumulation."""

from __future__ import annotations

import gzip
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from apps.server.experiments.config import ExperimentConfig


class Repository:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS experiments (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, config TEXT NOT NULL,
                status TEXT NOT NULL, generation INTEGER NOT NULL, created REAL NOT NULL,
                error TEXT, latest TEXT)""")

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.root / "uhai.sqlite", timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def create(self, config: ExperimentConfig) -> dict[str, Any]:
        identity = uuid4().hex
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO experiments VALUES (?, ?, ?, 'ready', -1, ?, NULL, NULL)",
                (identity, config.name, config.model_dump_json(), time.time()),
            )
        (self.root / identity).mkdir()
        return self.get(identity)

    def get(self, identity: str) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM experiments WHERE id=?", (identity,)).fetchone()
        if not row:
            raise KeyError(identity)
        result = dict(row)
        result["config"] = json.loads(result["config"])
        return result

    def list(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            ids = conn.execute("SELECT id FROM experiments ORDER BY created DESC").fetchall()
        return [self.get(row["id"]) for row in ids]

    def status(self, identity: str, status: str, error: str | None = None) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE experiments SET status=?, error=? WHERE id=?", (status, error, identity)
            )

    def save(self, identity: str, generation: int, checkpoint: dict[str, Any]) -> None:
        directory = self.root / identity
        path = directory / f"generation-{generation:05d}.json.gz"
        temp = path.with_suffix(".tmp")
        with gzip.open(temp, "wt", encoding="utf-8") as output:
            json.dump(checkpoint, output, separators=(",", ":"), allow_nan=False)
        os.replace(temp, path)
        with self.connect() as conn:
            conn.execute(
                "UPDATE experiments SET generation=?, latest=? WHERE id=?",
                (generation, path.name, identity),
            )
        self.prune(identity)

    def generations(self, identity: str) -> list[int]:
        self.get(identity)
        return sorted(
            int(p.name.split("-")[1].split(".")[0])
            for p in (self.root / identity).glob("generation-*.json.gz")
        )

    def load(self, identity: str, generation: int | None = None) -> dict[str, Any]:
        row = self.get(identity)
        filename = (
            f"generation-{generation:05d}.json.gz" if generation is not None else row["latest"]
        )
        if not filename:
            raise FileNotFoundError("No checkpoint yet")
        with gzip.open(self.root / identity / filename, "rt", encoding="utf-8") as source:
            return json.load(source)

    def prune(self, identity: str) -> None:
        generations = self.generations(identity)
        keep = set(generations[-32:]) | {0} | set([g for g in generations if g % 10 == 0][-24:])
        for g in generations:
            if g not in keep:
                (self.root / identity / f"generation-{g:05d}.json.gz").unlink(missing_ok=True)
