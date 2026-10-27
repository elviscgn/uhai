use serde::{Deserialize, Serialize};

pub const INPUTS: usize = 24;
pub const HIDDEN: usize = 16;
pub const WEIGHTS: usize = (INPUTS + 1) * HIDDEN + (HIDDEN + 1) * HIDDEN + (HIDDEN + 1) * 2;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Brain {
    pub layers: Vec<Vec<f32>>,
    pub actions: [f32; 2],
}

fn layer<const I: usize, const O: usize>(x: &[f32; I], w: &[f32]) -> [f32; O] {
    let mut y = [0.0; O];
    for (j, out) in y.iter_mut().enumerate() {
        let row = &w[j * (I + 1)..(j + 1) * (I + 1)];
        let mut sum = row[I];
        for i in 0..I {
            sum += x[i] * row[i];
        }
        *out = sum.tanh();
    }
    y
}

pub fn forward(w: &[f32], x: &[f32; INPUTS]) -> ([f32; HIDDEN], [f32; HIDDEN], [f32; 2]) {
    debug_assert_eq!(w.len(), WEIGHTS);
    let a = layer::<INPUTS, HIDDEN>(x, w);
    let b = layer::<HIDDEN, HIDDEN>(&a, &w[(INPUTS + 1) * HIDDEN..]);
    let y = layer::<HIDDEN, 2>(&b, &w[(INPUTS + 1) * HIDDEN + (HIDDEN + 1) * HIDDEN..]);
    (a, b, y)
}

pub fn inspect(w: &[f32], x: &[f32; INPUTS]) -> Brain {
    let (a, b, actions) = forward(w, x);
    Brain {
        layers: vec![x.to_vec(), a.to_vec(), b.to_vec(), actions.to_vec()],
        actions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn zero_and_bias_forward() {
        let mut w = vec![0.; WEIGHTS];
        assert_eq!(forward(&w, &[1.; INPUTS]).2, [0.; 2]);
        w[WEIGHTS - 1] = 0.7;
        assert!((forward(&w, &[0.; INPUTS]).2[1] - 0.7_f32.tanh()).abs() < 1e-6);
    }
    #[test]
    fn bounded_and_serializable() {
        let w = vec![3.; WEIGHTS];
        let b = inspect(&w, &[1.; INPUTS]);
        assert!(b.layers.iter().flatten().all(|v| v.abs() <= 1.));
        let saved = serde_json::to_string(&b).unwrap();
        let restored: Brain = serde_json::from_str(&saved).unwrap();
        assert_eq!(b.actions, restored.actions);
    }
}
