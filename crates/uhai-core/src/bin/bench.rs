use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::time::Instant;
use uhai_core::{
    grid::Grid,
    neural,
    world::{Config, World},
};
fn main() {
    for n in [120, 500, 1000] {
        let cfg = Config {
            predators: n / 5,
            prey: n - n / 5,
            ..Config::default()
        };
        let mut rng = ChaCha8Rng::seed_from_u64(43);
        let mut population = || {
            (0..24)
                .map(|_| {
                    (0..neural::WEIGHTS)
                        .map(|_| rng.random_range(-0.35..0.35))
                        .collect()
                })
                .collect()
        };
        let genomes = [population(), population()];
        let mut w = World::new(cfg, 42, genomes).unwrap();
        let start = Instant::now();
        let mut active_updates = 0;
        for _ in 0..600 {
            active_updates += w.agents.iter().filter(|a| a.alive).count();
            w.tick();
        }
        let sec = start.elapsed().as_secs_f64();
        println!(
            "{}",
            serde_json::json!({"agents":n,"steps":600,"seconds":sec,
            "steps_per_second":600./sec,"active_agent_updates_per_second":active_updates as f64/sec,
            "active_updates":active_updates,"genomes_per_species":24,
            "survivors":w.agents.iter().filter(|a|a.alive).count()})
        );
    }
    let w = vec![0.03; neural::WEIGHTS];
    let x = [0.1; 24];
    let start = Instant::now();
    for _ in 0..100_000 {
        std::hint::black_box(neural::forward(std::hint::black_box(&w), &x));
    }
    println!(
        "{}",
        serde_json::json!({"forwards_per_second":100_000./start.elapsed().as_secs_f64()})
    );
    let mut grid = Grid::new(1200., 800., 64.);
    for i in 0..500 {
        grid.insert(i, (i * 73 % 1200) as f32, (i * 31 % 800) as f32);
    }
    let start = Instant::now();
    let mut visited = 0;
    for _ in 0..100_000 {
        grid.visit(600., 400., 150., |i| {
            std::hint::black_box(i);
            visited += 1;
        });
    }
    println!(
        "{}",
        serde_json::json!({"queries_per_second":100_000./start.elapsed().as_secs_f64(),"candidates_per_query":visited/100_000})
    );
}
