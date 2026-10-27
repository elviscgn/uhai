use crate::{grid::Grid, neural};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};
use std::f32::consts::{PI, TAU};

pub const DT: f32 = 1. / 30.;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub width: f32,
    pub height: f32,
    pub predators: usize,
    pub prey: usize,
    pub food: usize,
    pub obstacles: usize,
    pub perception: f32,
    pub fov: f32,
    pub speed: f32,
    pub energy_cost: f32,
    pub food_regrowth: f32,
    pub predator_policy: String,
    pub prey_policy: String,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            width: 1200.,
            height: 800.,
            predators: 24,
            prey: 96,
            food: 240,
            obstacles: 12,
            perception: 150.,
            fov: PI * 1.5,
            speed: 62.,
            energy_cost: 0.008,
            food_regrowth: 10.,
            predator_policy: "neural".into(),
            prey_policy: "neural".into(),
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        let ranges = [
            (self.width, 200., 5000.),
            (self.height, 200., 5000.),
            (self.perception, 20., 500.),
            (self.fov, 0.1, TAU),
            (self.speed, 5., 200.),
            (self.energy_cost, 0., 0.1),
            (self.food_regrowth, 1., 120.),
        ];
        if ranges
            .iter()
            .any(|(v, lo, hi)| !v.is_finite() || v < lo || v > hi)
        {
            return Err("Invalid world dimensions or physical parameters".into());
        }
        if self.predators + self.prey == 0
            || self.predators + self.prey > 2000
            || self.food > 3000
            || self.obstacles > 80
        {
            return Err("World requires 1–2000 agents, at most 3000 food and 80 obstacles".into());
        }
        for p in [&self.predator_policy, &self.prey_policy] {
            if !["neural", "stationary", "wander", "pursuit", "forage"].contains(&p.as_str()) {
                return Err(format!("Unknown reference policy: {p}"));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Serialize)]
pub struct Agent {
    pub id: usize,
    pub species: usize,
    pub genome: usize,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32,
    pub energy: f32,
    pub alive: bool,
    pub age: f32,
    pub food: usize,
    pub captures: usize,
    pub effort: f32,
    pub actions: [f32; 2],
    pub observation: [f32; neural::INPUTS],
}
#[derive(Clone, Serialize)]
pub struct Food {
    pub x: f32,
    pub y: f32,
    pub ready_at: u64,
}
#[derive(Clone, Serialize)]
pub struct Obstacle {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub step: u64,
    pub time: f32,
    /// id,species,x,y,vx,vy,angle,energy,alive,genome,age,food,captures,steer,thrust
    pub agents: Vec<[f32; 15]>,
    pub food: Vec<bool>,
}
#[derive(Serialize, Default, Clone)]
pub struct Score {
    pub genome: usize,
    pub species: usize,
    pub organisms: usize,
    pub survival: f32,
    pub food: f32,
    pub captures: f32,
    pub energy: f32,
    pub effort: f32,
}

pub struct World {
    pub config: Config,
    pub agents: Vec<Agent>,
    pub food: Vec<Food>,
    pub obstacles: Vec<Obstacle>,
    pub genomes: [Vec<Vec<f32>>; 2],
    pub step: u64,
    agent_grid: Grid,
    food_grid: Grid,
    obstacle_grid: Grid,
    next_actions: Vec<[f32; 2]>,
    next_observations: Vec<[f32; neural::INPUTS]>,
}

fn dist2(x: f32, y: f32) -> f32 {
    x * x + y * y
}
fn wrap(a: f32) -> f32 {
    (a + PI).rem_euclid(TAU) - PI
}

impl World {
    pub fn new(config: Config, seed: u64, genomes: [Vec<Vec<f32>>; 2]) -> Result<Self, String> {
        config.validate()?;
        for (s, population) in genomes.iter().enumerate() {
            if (if s == 0 {
                config.predators
            } else {
                config.prey
            }) > 0
                && population.is_empty()
            {
                return Err("Each present species needs at least one genome".into());
            }
            if population
                .iter()
                .any(|w| w.len() != neural::WEIGHTS || w.iter().any(|v| !v.is_finite()))
            {
                return Err(format!(
                    "Genomes must have {} finite weights",
                    neural::WEIGHTS
                ));
            }
        }
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let mut obstacles = Vec::<Obstacle>::new();
        for _ in 0..config.obstacles {
            let radius = rng.random_range(15.0..30.0);
            for _ in 0..100 {
                let x = rng.random_range(45.0..config.width - 45.);
                let y = rng.random_range(45.0..config.height - 45.);
                if obstacles
                    .iter()
                    .all(|o| dist2(x - o.x, y - o.y) > (radius + o.radius + 14.).powi(2))
                {
                    obstacles.push(Obstacle { x, y, radius });
                    break;
                }
            }
        }
        let mut point = |padding: f32| -> Result<(f32, f32), String> {
            for _ in 0..1000 {
                let x = rng.random_range(padding..config.width - padding);
                let y = rng.random_range(padding..config.height - padding);
                if obstacles
                    .iter()
                    .all(|o| dist2(x - o.x, y - o.y) > (o.radius + padding).powi(2))
                {
                    return Ok((x, y));
                }
            }
            Err("Environment too crowded to place organisms".into())
        };
        let mut food = Vec::with_capacity(config.food);
        for _ in 0..config.food {
            let (x, y) = point(8.)?;
            food.push(Food { x, y, ready_at: 0 });
        }
        let mut agents = Vec::<Agent>::new();
        for (s, population) in genomes.iter().enumerate() {
            for i in 0..(if s == 0 {
                config.predators
            } else {
                config.prey
            }) {
                let mut p = point(12.)?;
                // Avoid immediate capture caused solely by an overlapping initial spawn.
                for _ in 0..100 {
                    if agents
                        .iter()
                        .all(|a| a.species == s || dist2(a.x - p.0, a.y - p.1) > 30_f32.powi(2))
                    {
                        break;
                    }
                    p = point(12.)?;
                }
                agents.push(Agent {
                    id: agents.len(),
                    species: s,
                    genome: i % population.len(),
                    x: p.0,
                    y: p.1,
                    vx: 0.,
                    vy: 0.,
                    angle: 0.,
                    energy: 1.,
                    alive: true,
                    age: 0.,
                    food: 0,
                    captures: 0,
                    effort: 0.,
                    actions: [0.; 2],
                    observation: [0.; neural::INPUTS],
                });
            }
        }
        // Rotation of genome assignment prevents a permanent index/spawn advantage.
        for (s, population) in genomes.iter().enumerate() {
            if !population.is_empty() {
                let offset = rng.random_range(0..population.len());
                for a in agents.iter_mut().filter(|a| a.species == s) {
                    a.genome = (a.genome + offset) % population.len();
                    a.angle = rng.random_range(-PI..PI);
                }
            }
        }
        let mut food_grid = Grid::new(config.width, config.height, 64.);
        for (i, f) in food.iter().enumerate() {
            food_grid.insert(i, f.x, f.y);
        }
        let mut obstacle_grid = Grid::new(config.width, config.height, 64.);
        for (i, o) in obstacles.iter().enumerate() {
            obstacle_grid.insert(i, o.x, o.y);
        }
        let n = agents.len();
        let mut w = Self {
            agent_grid: Grid::new(config.width, config.height, 64.),
            config,
            agents,
            food,
            obstacles,
            genomes,
            step: 0,
            food_grid,
            obstacle_grid,
            next_actions: vec![[0.; 2]; n],
            next_observations: vec![[0.; neural::INPUTS]; n],
        };
        w.reindex();
        Ok(w)
    }
    fn reindex(&mut self) {
        self.agent_grid.clear();
        for a in &self.agents {
            if a.alive {
                self.agent_grid.insert(a.id, a.x, a.y);
            }
        }
    }
    fn local(a: &Agent, x: f32, y: f32, scale: f32) -> (f32, f32) {
        let (s, c) = a.angle.sin_cos();
        (
            ((x * c + y * s) / scale).clamp(-1., 1.),
            ((-x * s + y * c) / scale).clamp(-1., 1.),
        )
    }
    fn visible(&self, a: &Agent, dx: f32, dy: f32) -> bool {
        dist2(dx, dy) <= self.config.perception.powi(2)
            && wrap(dy.atan2(dx) - a.angle).abs() <= self.config.fov / 2.
    }
    pub fn observe(&self, id: usize) -> [f32; neural::INPUTS] {
        let a = &self.agents[id];
        let r = self.config.perception;
        let mut x = [0.; neural::INPUTS];
        (x[0], x[1]) = Self::local(a, a.vx, a.vy, self.config.speed * 1.1);
        x[2] = a.energy.clamp(0., 1.);
        x[3] = a.actions[0];
        let mut nearest = [r * r; 2];
        self.agent_grid.visit(a.x, a.y, r, |j| {
            let b = &self.agents[j];
            if !b.alive || j == id {
                return;
            }
            let (dx, dy) = (b.x - a.x, b.y - a.y);
            let k = usize::from(b.species == a.species);
            let d = dist2(dx, dy);
            if d < nearest[k] && self.visible(a, dx, dy) {
                nearest[k] = d;
                let base = if k == 0 { 4 } else { 9 };
                (x[base], x[base + 1]) = Self::local(a, dx, dy, r);
                (x[base + 2], x[base + 3]) =
                    Self::local(a, b.vx - a.vx, b.vy - a.vy, self.config.speed * 2.2);
                x[base + 4] = 1.;
            }
        });
        let mut nf = r * r;
        self.food_grid.visit(a.x, a.y, r, |j| {
            let f = &self.food[j];
            let (dx, dy) = (f.x - a.x, f.y - a.y);
            let d = dist2(dx, dy);
            if f.ready_at <= self.step && d < nf && self.visible(a, dx, dy) {
                nf = d;
                (x[14], x[15]) = Self::local(a, dx, dy, r);
                x[16] = 1.;
            }
        });
        let mut no = r * r;
        self.obstacle_grid.visit(a.x, a.y, r + 30., |j| {
            let o = &self.obstacles[j];
            let (dx, dy) = (o.x - a.x, o.y - a.y);
            let d = dist2(dx, dy);
            if d < no && self.visible(a, dx, dy) {
                no = d;
                (x[17], x[18]) = Self::local(a, dx, dy, r);
                x[19] = o.radius / r;
                x[20] = 1.;
            }
        });
        for (k, angle) in [a.angle, a.angle - PI / 2., a.angle + PI / 2.]
            .iter()
            .enumerate()
        {
            let (s, c) = angle.sin_cos();
            let tx = if c.abs() < 1e-6 {
                f32::INFINITY
            } else if c > 0. {
                (self.config.width - a.x) / c
            } else {
                -a.x / c
            };
            let ty = if s.abs() < 1e-6 {
                f32::INFINITY
            } else if s > 0. {
                (self.config.height - a.y) / s
            } else {
                -a.y / s
            };
            x[21 + k] = (tx.min(ty) / r).clamp(0., 1.);
        }
        x
    }
    pub fn tick(&mut self) {
        // All policies see the same pre-integration state; no agent-order sensing advantage.
        for i in 0..self.agents.len() {
            let a = &self.agents[i];
            if !a.alive {
                continue;
            }
            let x = self.observe(i);
            let policy = if a.species == 0 {
                &self.config.predator_policy
            } else {
                &self.config.prey_policy
            };
            let actions = match policy.as_str() {
                "stationary" => [0., -1.],
                "wander" => [
                    ((self.step as f32 * 0.031 + a.id as f32 * 1.71).sin()) * 0.65,
                    0.7,
                ],
                "pursuit" | "forage" => {
                    let base = if policy == "pursuit" { 4 } else { 14 };
                    let present = x[if base == 4 { 8 } else { 16 }];
                    [
                        if present > 0. {
                            x[base + 1].atan2(x[base]).clamp(-1., 1.)
                        } else {
                            0.25
                        },
                        0.8,
                    ]
                }
                _ => neural::forward(&self.genomes[a.species][a.genome], &x).2,
            };
            self.next_actions[i] = actions;
            self.next_observations[i] = x;
        }
        let cfg = &self.config;
        for (i, a) in self.agents.iter_mut().enumerate() {
            if !a.alive {
                continue;
            }
            a.actions = self.next_actions[i];
            a.observation = self.next_observations[i];
            let thrust = (a.actions[1] + 1.) * 0.5;
            a.angle = wrap(a.angle + a.actions[0] * 3.2 * DT);
            let (s, c) = a.angle.sin_cos();
            a.vx = (a.vx + c * thrust * cfg.speed * 2.8 * DT) * (-1.8 * DT).exp();
            a.vy = (a.vy + s * thrust * cfg.speed * 2.8 * DT) * (-1.8 * DT).exp();
            let max_speed = cfg.speed * if a.species == 0 { 1.08 } else { 1. };
            let speed = dist2(a.vx, a.vy).sqrt();
            if speed > max_speed {
                a.vx *= max_speed / speed;
                a.vy *= max_speed / speed;
            }
            a.x += a.vx * DT;
            a.y += a.vy * DT;
            let rad = if a.species == 0 { 6. } else { 4.5 };
            if a.x < rad || a.x > cfg.width - rad {
                a.x = a.x.clamp(rad, cfg.width - rad);
                a.vx *= -0.3;
            }
            if a.y < rad || a.y > cfg.height - rad {
                a.y = a.y.clamp(rad, cfg.height - rad);
                a.vy *= -0.3;
            }
            self.obstacle_grid.visit(a.x, a.y, 40., |j| {
                let o = &self.obstacles[j];
                let dx = a.x - o.x;
                let dy = a.y - o.y;
                let d = dist2(dx, dy).sqrt();
                let min = o.radius + rad;
                if d < min {
                    let (nx, ny) = if d > 1e-6 { (dx / d, dy / d) } else { (1., 0.) };
                    a.x = o.x + nx * min;
                    a.y = o.y + ny * min;
                    let dot = a.vx * nx + a.vy * ny;
                    if dot < 0. {
                        a.vx -= 1.3 * dot * nx;
                        a.vy -= 1.3 * dot * ny;
                    }
                }
            });
            a.age += DT;
            a.effort += thrust * DT;
            a.energy -= cfg.energy_cost * (0.5 + thrust * thrust) * DT;
            if a.energy <= 0. {
                a.energy = 0.;
                a.alive = false;
            }
        }
        let regrowth_steps = (cfg.food_regrowth / DT).round() as u64;
        self.step += 1;
        self.reindex();
        // Resolve food and captures once, with a stable order. Depleted food cannot be eaten twice.
        for i in 0..self.agents.len() {
            if !self.agents[i].alive {
                continue;
            }
            let a = &self.agents[i];
            let (x, y, s) = (a.x, a.y, a.species);
            if s == 1 {
                let mut eaten = 0;
                self.food_grid.visit(x, y, 9., |j| {
                    let f = &mut self.food[j];
                    if f.ready_at <= self.step && dist2(x - f.x, y - f.y) < 9_f32.powi(2) {
                        f.ready_at = self.step + regrowth_steps;
                        eaten += 1;
                    }
                });
                self.agents[i].food += eaten;
                self.agents[i].energy = (self.agents[i].energy + 0.25 * eaten as f32).min(1.);
            } else {
                let mut captures = 0;
                self.agent_grid.visit(x, y, 10.5, |j| {
                    let b = &mut self.agents[j];
                    if b.species == 1 && b.alive && dist2(x - b.x, y - b.y) < 10.5_f32.powi(2) {
                        b.alive = false;
                        b.energy = 0.;
                        captures += 1;
                    }
                });
                self.agents[i].captures += captures;
                self.agents[i].energy = (self.agents[i].energy + 0.55 * captures as f32).min(1.);
            }
        }
    }
    pub fn advance(&mut self, n: usize) {
        for _ in 0..n {
            self.tick();
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            step: self.step,
            time: self.step as f32 * DT,
            agents: self
                .agents
                .iter()
                .map(|a| {
                    [
                        a.id as f32,
                        a.species as f32,
                        a.x,
                        a.y,
                        a.vx,
                        a.vy,
                        a.angle,
                        a.energy,
                        if a.alive { 1. } else { 0. },
                        a.genome as f32,
                        a.age,
                        a.food as f32,
                        a.captures as f32,
                        a.actions[0],
                        a.actions[1],
                    ]
                })
                .collect(),
            food: self.food.iter().map(|f| f.ready_at <= self.step).collect(),
        }
    }
    pub fn scores(&self) -> Vec<Score> {
        let mut scores = Vec::new();
        for s in 0..2 {
            for g in 0..self.genomes[s].len() {
                let mut score = Score {
                    genome: g,
                    species: s,
                    ..Score::default()
                };
                for a in self
                    .agents
                    .iter()
                    .filter(|a| a.species == s && a.genome == g)
                {
                    score.organisms += 1;
                    score.survival += a.age;
                    score.food += a.food as f32;
                    score.captures += a.captures as f32;
                    score.energy += a.energy;
                    score.effort += a.effort;
                }
                if score.organisms > 0 {
                    let n = score.organisms as f32;
                    score.survival /= n;
                    score.food /= n;
                    score.captures /= n;
                    score.energy /= n;
                    score.effort /= n;
                }
                scores.push(score);
            }
        }
        scores
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn world() -> World {
        World::new(
            Config {
                predators: 2,
                prey: 4,
                food: 20,
                ..Config::default()
            },
            42,
            [
                vec![vec![0.; neural::WEIGHTS]],
                vec![vec![0.; neural::WEIGHTS]],
            ],
        )
        .unwrap()
    }
    #[test]
    fn deterministic_and_reset() {
        let mut a = world();
        let mut b = world();
        a.advance(120);
        b.advance(120);
        assert_eq!(
            serde_json::to_string(&a.snapshot()).unwrap(),
            serde_json::to_string(&b.snapshot()).unwrap()
        );
        assert_ne!(a.agents[0].x, world().agents[0].x);
        assert_eq!(world().step, 0);
    }
    #[test]
    fn movement_energy_and_walls() {
        let mut w = world();
        w.agents[0].x = 1193.;
        w.agents[0].angle = 0.;
        let energy = w.agents[0].energy;
        w.advance(30);
        assert!(w.agents[0].energy < energy);
        assert!(w.agents[0].x <= 1194.);
        assert!(w.agents[0].vx.abs() <= w.config.speed * 1.08);
    }
    #[test]
    fn sensors_are_local_and_bounded() {
        let mut w = world();
        w.agents[0].x = 100.;
        w.agents[0].y = 100.;
        w.agents[0].angle = 0.;
        for a in &mut w.agents[1..] {
            a.x = 800.;
            a.y = 700.;
        }
        w.reindex();
        assert_eq!(w.observe(0)[8], 0.);
        w.agents[2].x = 140.;
        w.agents[2].y = 100.;
        w.reindex();
        let x = w.observe(0);
        assert_eq!(x[8], 1.);
        assert!(x.iter().all(|v| v.is_finite() && v.abs() <= 1.));
        w.agents[2].x = 60.;
        w.config.fov = PI;
        w.reindex();
        assert_eq!(w.observe(0)[8], 0.);
    }
    #[test]
    fn capture_food_and_obstacle_collision() {
        let mut w = world();
        w.agents[0].x = 100.;
        w.agents[0].y = 100.;
        w.agents[2].x = 102.;
        w.agents[2].y = 100.;
        w.tick();
        assert!(!w.agents[2].alive);
        assert_eq!(w.agents[0].captures, 1);
        let f = w.food[0].clone();
        w.agents[3].x = f.x;
        w.agents[3].y = f.y;
        w.tick();
        assert!(w.agents[3].food >= 1);
        assert!(w.food[0].ready_at > w.step);
        let o = w.obstacles[0].clone();
        w.agents[1].x = o.x;
        w.agents[1].y = o.y;
        w.tick();
        assert!(
            (dist2(w.agents[1].x - o.x, w.agents[1].y - o.y).sqrt() - (o.radius + 6.)).abs() < 0.01
        );
    }
    #[test]
    fn rejects_bad_genomes_and_config() {
        assert!(World::new(Config::default(), 0, [vec![vec![0.; 3]], vec![]]).is_err());
        assert!(Config {
            width: f32::NAN,
            ..Config::default()
        }
        .validate()
        .is_err());
    }
}
