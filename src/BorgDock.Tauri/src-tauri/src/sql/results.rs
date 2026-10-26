use super::ResultSet;
use std::mem::size_of;

pub const MAX_ROWS: usize = 10_000;
const MAX_BYTES: usize = 16 * 1024 * 1024;
const MAX_RESULT_SETS: usize = 100;

#[derive(Default)]
pub struct BoundedResults {
    pub sets: Vec<ResultSet>,
    pub rows: usize,
    bytes: usize,
    ignoring_set: bool,
}

impl BoundedResults {
    pub fn begin(&mut self, columns: Vec<String>) {
        let bytes = columns
            .iter()
            .map(|column| column.len() + size_of::<String>())
            .sum::<usize>();
        self.ignoring_set =
            self.sets.len() >= MAX_RESULT_SETS || bytes > MAX_BYTES.saturating_sub(self.bytes);
        if self.ignoring_set {
            if let Some(last) = self.sets.last_mut() {
                last.truncated = true;
            }
            return;
        }
        self.bytes += bytes;
        self.sets.push(ResultSet {
            columns,
            rows: Vec::new(),
            row_count: 0,
            truncated: false,
        });
    }

    pub fn accepts_row(&mut self) -> bool {
        if self.ignoring_set {
            return false;
        }
        if self.rows >= MAX_ROWS || self.bytes >= MAX_BYTES {
            if let Some(last) = self.sets.last_mut() {
                last.truncated = true;
            }
            return false;
        }
        true
    }

    pub fn push(&mut self, row: Vec<Option<String>>) {
        if !self.accepts_row() {
            return;
        }
        let bytes = size_of::<Vec<Option<String>>>()
            + row.len() * size_of::<Option<String>>()
            + row.iter().flatten().map(String::len).sum::<usize>();
        let Some(set) = self.sets.last_mut() else {
            return;
        };
        if bytes > MAX_BYTES.saturating_sub(self.bytes) {
            set.truncated = true;
            self.bytes = MAX_BYTES;
            return;
        }
        self.bytes += bytes;
        self.rows += 1;
        set.rows.push(row);
        set.row_count += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_are_bounded_across_result_sets() {
        let mut results = BoundedResults::default();
        results.begin(vec!["id".into()]);
        for _ in 0..MAX_ROWS {
            results.push(vec![None]);
        }
        assert!(!results.sets[0].truncated);
        results.begin(vec!["other".into()]);
        results.push(vec![None]);
        assert_eq!(results.rows, MAX_ROWS);
        assert!(results.sets[1].truncated);
        assert!(results.sets[1].rows.is_empty());
    }

    #[test]
    fn byte_limit_includes_cell_overhead_and_marks_discarded_rows() {
        let mut results = BoundedResults::default();
        results.begin(vec!["body".into()]);
        results.push(vec![Some("x".repeat(MAX_BYTES))]);
        assert_eq!(results.rows, 0);
        assert!(results.sets[0].truncated);
        assert!(results.bytes <= MAX_BYTES);
        results.push(vec![Some("small".into())]);
        assert_eq!(results.rows, 0);
    }

    #[test]
    fn empty_result_sets_keep_columns_and_metadata_is_bounded() {
        let mut results = BoundedResults::default();
        for _ in 0..MAX_RESULT_SETS + 1 {
            results.begin(vec!["id".into()]);
        }
        assert_eq!(results.sets.len(), MAX_RESULT_SETS);
        assert!(results.sets.last().unwrap().truncated);
    }
}
