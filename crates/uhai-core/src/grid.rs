/// Dense spatial hash with reusable cell allocations. Queries visit cells in stable order.
#[derive(Clone)]
pub struct Grid {
    cells: Vec<Vec<usize>>,
    cols: usize,
    rows: usize,
    cell: f32,
}
impl Grid {
    pub fn new(width: f32, height: f32, cell: f32) -> Self {
        let cols = (width / cell).ceil() as usize;
        let rows = (height / cell).ceil() as usize;
        Self {
            cells: vec![Vec::new(); cols * rows],
            cols,
            rows,
            cell,
        }
    }
    fn coords(&self, x: f32, y: f32) -> (usize, usize) {
        (
            (x / self.cell).max(0.) as usize,
            (y / self.cell).max(0.) as usize,
        )
    }
    pub fn clear(&mut self) {
        for cell in &mut self.cells {
            cell.clear();
        }
    }
    pub fn insert(&mut self, id: usize, x: f32, y: f32) {
        let (cx, cy) = self.coords(x, y);
        let idx = cy.min(self.rows - 1) * self.cols + cx.min(self.cols - 1);
        self.cells[idx].push(id);
    }
    pub fn visit(&self, x: f32, y: f32, r: f32, mut f: impl FnMut(usize)) {
        let (x0, y0) = self.coords(x - r, y - r);
        let (x1, y1) = self.coords(x + r, y + r);
        for cy in y0.min(self.rows - 1)..=y1.min(self.rows - 1) {
            for cx in x0.min(self.cols - 1)..=x1.min(self.cols - 1) {
                for &id in &self.cells[cy * self.cols + cx] {
                    f(id);
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_queries_and_reset() {
        let mut g = Grid::new(100., 100., 10.);
        g.insert(0, 5., 5.);
        g.insert(1, 85., 85.);
        let mut found = vec![];
        g.visit(4., 4., 3., |i| found.push(i));
        assert_eq!(found, vec![0]);
        g.clear();
        g.visit(-1., 0., 1000., |_| panic!("grid was not cleared"));
    }
}
