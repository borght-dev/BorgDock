use chrono::{DateTime, Duration, Utc};

use super::status::UpdatePhase;

/// How long after launch the first automatic check runs.
pub(super) const FIRST_CHECK_AFTER: std::time::Duration = std::time::Duration::from_secs(10);
/// How often the schedule looks at the clock. Short on purpose: a sleeping
/// machine pauses the timer, so the wall clock is compared on every tick and
/// a check follows within a minute of waking.
pub(super) const TICK: std::time::Duration = std::time::Duration::from_secs(60);

const CHECK_EVERY_MINUTES: i64 = 60;
const RETRY_AFTER_MINUTES: i64 = 10;

/// The last finished check or download, by the wall clock.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct Attempt {
    pub at: DateTime<Utc>,
    pub succeeded: bool,
}

/// Whether an automatic check should start now.
pub(super) fn check_due(
    auto_check_enabled: bool,
    phase: UpdatePhase,
    last: Option<Attempt>,
    now: DateTime<Utc>,
) -> bool {
    if !auto_check_enabled || phase.is_busy() {
        return false;
    }
    let Some(last) = last else { return true };
    let wait = Duration::minutes(if last.succeeded {
        CHECK_EVERY_MINUTES
    } else {
        RETRY_AFTER_MINUTES
    });
    // A clock set back leaves the attempt in the future: check, don't wait it out.
    now < last.at || now - last.at >= wait
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(time: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(time).unwrap().to_utc()
    }

    fn succeeded(time: &str) -> Option<Attempt> {
        Some(Attempt {
            at: at(time),
            succeeded: true,
        })
    }

    fn failed(time: &str) -> Option<Attempt> {
        Some(Attempt {
            at: at(time),
            succeeded: false,
        })
    }

    const IDLE: UpdatePhase = UpdatePhase::Idle;

    #[test]
    fn never_checked_is_due() {
        assert!(check_due(true, IDLE, None, at("2026-11-24T09:00:10Z")));
    }

    #[test]
    fn a_fresh_check_is_not_due() {
        let last = succeeded("2026-11-24T09:00:00Z");
        assert!(!check_due(true, IDLE, last, at("2026-11-24T09:01:00Z")));
        assert!(!check_due(true, IDLE, last, at("2026-11-24T09:59:59Z")));
    }

    #[test]
    fn due_an_hour_after_the_last_successful_check() {
        let last = succeeded("2026-11-24T09:00:00Z");
        assert!(check_due(true, IDLE, last, at("2026-11-24T10:00:00Z")));
    }

    #[test]
    fn a_failed_check_is_retried_sooner() {
        let last = failed("2026-11-24T09:00:00Z");
        assert!(!check_due(true, IDLE, last, at("2026-11-24T09:09:59Z")));
        assert!(check_due(true, IDLE, last, at("2026-11-24T09:10:00Z")));
    }

    #[test]
    fn disabled_is_never_due() {
        assert!(!check_due(false, IDLE, None, at("2026-11-24T09:00:00Z")));
        let last = succeeded("2026-11-23T09:00:00Z");
        assert!(!check_due(false, IDLE, last, at("2026-11-24T09:00:00Z")));
    }

    #[test]
    fn a_wall_clock_jump_is_due_in_either_direction() {
        let last = succeeded("2026-11-24T09:00:00Z");
        // The machine slept through the night: the next tick sees the new time.
        assert!(check_due(true, IDLE, last, at("2026-11-25T07:30:00Z")));
        // The clock was set back behind the last check.
        assert!(check_due(true, IDLE, last, at("2026-11-24T08:00:00Z")));
    }

    #[test]
    fn nothing_is_due_while_an_update_is_underway_or_waiting_for_a_restart() {
        let now = at("2026-11-24T12:00:00Z");
        for phase in [
            UpdatePhase::Checking,
            UpdatePhase::Downloading,
            UpdatePhase::Ready,
            UpdatePhase::Installing,
        ] {
            assert!(!check_due(true, phase, None, now), "{phase:?}");
        }
        // A newer release can replace one that waits for its download.
        assert!(check_due(true, UpdatePhase::Available, None, now));
    }
}
