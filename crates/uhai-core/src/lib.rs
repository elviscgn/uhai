pub mod grid;
pub mod neural;
pub mod world;

#[cfg(feature = "python")]
mod python {
    use super::*;
    use pyo3::{exceptions::PyValueError, prelude::*};
    fn err(e: impl ToString) -> PyErr {
        PyValueError::new_err(e.to_string())
    }

    #[pyclass]
    struct Simulation {
        world: world::World,
    }
    #[pymethods]
    impl Simulation {
        #[new]
        fn new(
            config: &str,
            seed: u64,
            predators: Vec<Vec<f32>>,
            prey: Vec<Vec<f32>>,
        ) -> PyResult<Self> {
            let cfg = serde_json::from_str(config).map_err(err)?;
            Ok(Self {
                world: world::World::new(cfg, seed, [predators, prey]).map_err(err)?,
            })
        }
        fn advance(&mut self, py: Python<'_>, steps: usize) -> PyResult<()> {
            if steps > 100_000 {
                return Err(err("Batch limit is 100000 steps"));
            }
            py.detach(|| self.world.advance(steps));
            Ok(())
        }
        fn snapshot(&self) -> PyResult<String> {
            serde_json::to_string(&self.world.snapshot()).map_err(err)
        }
        fn scores(&self) -> PyResult<String> {
            serde_json::to_string(&self.world.scores()).map_err(err)
        }
        fn environment(&self) -> PyResult<String> {
            serde_json::to_string(
                &serde_json::json!({"config":self.world.config,"food":self.world.food,
                "obstacles":self.world.obstacles,"dt":world::DT,"topology":[24,16,16,2]}),
            )
            .map_err(err)
        }
        fn inspect(&self, id: usize) -> PyResult<String> {
            let a = self
                .world
                .agents
                .get(id)
                .ok_or_else(|| err("Unknown organism"))?;
            let w = &self.world.genomes[a.species][a.genome];
            let brain = neural::inspect(w, &a.observation);
            serde_json::to_string(&serde_json::json!({"agent":a,"brain":brain,"weights":w,
                "step":self.world.step,"observation_step":self.world.step.saturating_sub(1)}))
            .map_err(err)
        }
    }
    /// Independent solo arenas for the controlled learning assay; one Python boundary per population.
    #[pyfunction]
    fn evaluate_solo(
        py: Python<'_>,
        config: &str,
        genomes: Vec<Vec<f32>>,
        seeds: Vec<u64>,
        steps: usize,
    ) -> PyResult<Vec<Vec<f32>>> {
        if steps > 10_000 || seeds.is_empty() || seeds.len() > 100 || genomes.len() > 256 {
            return Err(err("Invalid solo evaluation batch size"));
        }
        let mut cfg: world::Config = serde_json::from_str(config).map_err(err)?;
        cfg.predators = 0;
        cfg.prey = 1;
        cfg.prey_policy = "neural".into();
        py.detach(|| {
            genomes
                .into_iter()
                .map(|g| {
                    seeds
                        .iter()
                        .map(|&seed| {
                            let mut w =
                                world::World::new(cfg.clone(), seed, [vec![], vec![g.clone()]])?;
                            w.advance(steps);
                            Ok(w.agents[0].food as f32)
                        })
                        .collect::<Result<Vec<_>, String>>()
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .map_err(err)
    }
    #[pyfunction]
    fn evaluate_navigation(
        py: Python<'_>,
        genomes: Vec<Vec<f32>>,
        seeds: Vec<u64>,
        steps: usize,
    ) -> PyResult<Vec<Vec<[f32; 2]>>> {
        if steps > 10_000 || seeds.is_empty() || seeds.len() > 256 || genomes.len() > 256 {
            return Err(err("Invalid navigation evaluation batch size"));
        }
        py.detach(|| {
            genomes
                .into_iter()
                .map(|g| {
                    seeds
                        .iter()
                        .map(|&seed| {
                            // A controlled assay: one organism, one food, no opponents or obstacles.
                            // Fitness shaping is measured by the evaluator, never fed into the policy.
                            let cfg = world::Config {
                                width: 240.,
                                height: 240.,
                                predators: 0,
                                prey: 1,
                                food: 1,
                                obstacles: 0,
                                perception: 350.,
                                fov: std::f32::consts::TAU,
                                food_regrowth: 120.,
                                speed: 45.,
                                ..world::Config::default()
                            };
                            let mut w = world::World::new(cfg, seed, [vec![], vec![g.clone()]])?;
                            let distance = |w: &world::World| {
                                ((w.agents[0].x - w.food[0].x).powi(2)
                                    + (w.agents[0].y - w.food[0].y).powi(2))
                                .sqrt()
                            };
                            let initial = distance(&w);
                            w.advance(steps);
                            let success = (w.agents[0].food > 0) as u8 as f32;
                            let progress = (initial - distance(&w)) / 350.;
                            Ok([success * 5. + progress, success])
                        })
                        .collect::<Result<Vec<_>, String>>()
                })
                .collect::<Result<Vec<_>, String>>()
        })
        .map_err(err)
    }
    #[pyfunction]
    fn forward_batch(
        weights: Vec<Vec<f32>>,
        observations: Vec<Vec<f32>>,
    ) -> PyResult<Vec<Vec<f32>>> {
        if weights.len() != observations.len() {
            return Err(err("Batch lengths differ"));
        }
        weights
            .iter()
            .zip(&observations)
            .map(|(w, x)| {
                if w.len() != neural::WEIGHTS || w.iter().chain(x).any(|v| !v.is_finite()) {
                    return Err(err("Invalid network data"));
                }
                let input: [f32; 24] = x.as_slice().try_into().map_err(err)?;
                Ok(neural::forward(w, &input).2.to_vec())
            })
            .collect()
    }
    #[pymodule]
    fn uhai_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
        m.add_class::<Simulation>()?;
        m.add_function(wrap_pyfunction!(evaluate_solo, m)?)?;
        m.add_function(wrap_pyfunction!(evaluate_navigation, m)?)?;
        m.add_function(wrap_pyfunction!(forward_batch, m)?)?;
        m.add("WEIGHTS", neural::WEIGHTS)?;
        m.add("DT", world::DT)?;
        Ok(())
    }
}
