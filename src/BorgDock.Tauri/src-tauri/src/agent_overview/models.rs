/// Approximate context-window size per model id. Falls back to 200_000 if the
/// model is unknown.
pub fn tokens_max_for_model(model: &str) -> u64 {
    match model {
        m if m.starts_with("claude-opus-4-7") => 200_000,
        m if m.starts_with("claude-sonnet-4-6") => 1_000_000,
        m if m.starts_with("claude-sonnet-4-5") => 200_000,
        m if m.starts_with("claude-haiku-4-5") => 200_000,
        _ => 200_000,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_and_unknown_models() {
        assert_eq!(tokens_max_for_model("claude-sonnet-4-6"), 1_000_000);
        assert_eq!(tokens_max_for_model("claude-opus-4-7"), 200_000);
        assert_eq!(tokens_max_for_model("claude-mystery-9"), 200_000);
    }
}
