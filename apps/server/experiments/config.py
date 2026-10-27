"""Versioned experiment contract; the fixed network topology is intentionally not configurable."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorldConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    width: float = Field(1200, ge=200, le=5000)
    height: float = Field(800, ge=200, le=5000)
    predators: int = Field(24, ge=1, le=256)
    prey: int = Field(96, ge=1, le=1000)
    food: int = Field(240, ge=0, le=3000)
    obstacles: int = Field(12, ge=0, le=80)
    perception: float = Field(150, ge=20, le=500)
    fov: float = Field(4.71238898, ge=0.1, le=6.2831853)
    speed: float = Field(62, ge=5, le=200)
    energy_cost: float = Field(0.008, ge=0, le=0.1)
    food_regrowth: float = Field(10, ge=1, le=120)


class FitnessConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    predator_capture: float = Field(4, ge=0, le=20)
    predator_survival: float = Field(0.3, ge=0, le=10)
    prey_survival: float = Field(2, ge=0, le=10)
    prey_food: float = Field(0.6, ge=0, le=10)
    remaining_energy: float = Field(0.1, ge=0, le=2)
    effort_cost: float = Field(0.05, ge=0, le=2)


class EvolutionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    population: int = Field(24, ge=4, le=128)
    episodes: int = Field(3, ge=1, le=12)
    steps: int = Field(900, ge=120, le=3600)
    generations: int = Field(100, ge=1, le=500)
    mutation_rate: float = Field(0.12, ge=0, le=1)
    mutation_scale: float = Field(0.16, ge=0, le=2)
    elites: int = Field(2, ge=1, le=8)
    tournament: int = Field(3, ge=2, le=8)
    assessment_interval: int = Field(5, ge=1, le=50)
    selection: Literal["tournament"] = "tournament"

    @model_validator(mode="after")
    def enough_candidates(self) -> "EvolutionConfig":
        if self.elites >= self.population:
            raise ValueError("Elitism must leave room for offspring")
        return self


class ExperimentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field("The first ecology", min_length=1, max_length=80)
    seed: int = Field(42, ge=0, le=2**32 - 1)
    world: WorldConfig = Field(default_factory=WorldConfig)
    evolution: EvolutionConfig = Field(default_factory=EvolutionConfig)
    fitness: FitnessConfig = Field(default_factory=FitnessConfig)
