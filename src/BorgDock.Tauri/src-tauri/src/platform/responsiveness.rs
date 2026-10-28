//! Hang evidence in borgdock.log. A watchdog thread pings the GUI thread,
//! checks every visible window's renderer heartbeat and samples the process's
//! memory. It logs when one of them stops answering and again when it answers,
//! with what the renderer last reported (the last click or key press, its JS
//! heap). WebView2 process failures are logged too.
//!
//! The renderer half lives in `src/services/responsiveness.ts`.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, Runtime};

const TICK: Duration = Duration::from_secs(1);
/// A window whose heartbeat (every 2 s) is this late is reported frozen.
const RENDERER_SILENCE: Duration = Duration::from_secs(6);
/// The watchdog itself sleeping this much longer than a tick means the whole
/// process was paused: system sleep, a debugger, or CPU or memory pressure.
const STALL: Duration = Duration::from_secs(5);
const MEMORY_JUMP_BYTES: u64 = 512 * 1024 * 1024;
const MEMORY_JUMP_QUIET: Duration = Duration::from_secs(10);
const RESOURCE_INTERVAL: Duration = Duration::from_secs(10 * 60);
const MIB: u64 = 1024 * 1024;

/// What a window's renderer reports with each heartbeat.
#[derive(Debug, Clone, Default, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RendererHeartbeat {
    pub visible: bool,
    /// The last click or key press, and how long ago.
    pub last_interaction: Option<String>,
    pub heap_mb: Option<u32>,
}

impl RendererHeartbeat {
    fn context(&self) -> String {
        let mut parts = Vec::new();
        if let Some(interaction) = &self.last_interaction {
            parts.push(format!("last input: {interaction}"));
        }
        if let Some(heap) = self.heap_mb {
            parts.push(format!("js heap {heap} MiB"));
        }
        if parts.is_empty() {
            "no input yet".into()
        } else {
            parts.join(", ")
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Finding {
    GuiBlocked(Duration),
    GuiResponsive(Duration),
    RendererFrozen {
        label: String,
        silent: Duration,
        context: String,
    },
    RendererResponsive {
        label: String,
        after: Duration,
    },
    Stalled(Duration),
}

struct Renderer {
    last_beat: Instant,
    report: RendererHeartbeat,
    frozen_since: Option<Instant>,
}

/// The decisions, with time passed in so tests can drive them.
struct Watch {
    renderers: HashMap<String, Renderer>,
    ping_sent: Option<Instant>,
    gui_reported: Option<Duration>,
    /// Silence before this moment is not the renderer's fault: the GUI thread
    /// or the whole process was stuck and heartbeats could not arrive.
    excused_until: Instant,
    last_tick: Instant,
}

/// The GUI thread is reported blocked at these waits, then every minute.
const GUI_REPORTS: [Duration; 5] = [
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(15),
    Duration::from_secs(30),
    Duration::from_secs(60),
];

fn next_gui_report(reported: Option<Duration>) -> Duration {
    match reported {
        None => GUI_REPORTS[0],
        Some(last) => GUI_REPORTS
            .iter()
            .copied()
            .find(|threshold| *threshold > last)
            .unwrap_or(last + Duration::from_secs(60)),
    }
}

impl Watch {
    fn new(now: Instant) -> Self {
        Self {
            renderers: HashMap::new(),
            ping_sent: None,
            gui_reported: None,
            excused_until: now,
            last_tick: now,
        }
    }

    fn beat(&mut self, label: &str, report: RendererHeartbeat, now: Instant) -> Option<Finding> {
        let renderer = self
            .renderers
            .entry(label.to_string())
            .or_insert_with(|| Renderer {
                last_beat: now,
                report: RendererHeartbeat::default(),
                frozen_since: None,
            });
        renderer.last_beat = now;
        renderer.report = report;
        renderer
            .frozen_since
            .take()
            .map(|since| Finding::RendererResponsive {
                label: label.to_string(),
                after: now - since,
            })
    }

    fn forget(&mut self, label: &str) {
        self.renderers.remove(label);
    }

    /// Whether a new ping should go to the GUI thread.
    fn should_ping(&self) -> bool {
        self.ping_sent.is_none()
    }

    fn pinged(&mut self, now: Instant) {
        self.ping_sent = Some(now);
    }

    fn tick(&mut self, now: Instant, answered_at: Option<Instant>) -> Vec<Finding> {
        let mut findings = Vec::new();
        let gap = now - self.last_tick;
        self.last_tick = now;
        if gap > TICK + STALL {
            findings.push(Finding::Stalled(gap));
            self.excused_until = now;
        }

        if let Some(sent) = self.ping_sent {
            match answered_at {
                Some(answered) => {
                    if self.gui_reported.take().is_some() {
                        findings.push(Finding::GuiResponsive(answered - sent));
                        self.excused_until = now;
                    }
                    self.ping_sent = None;
                }
                None => {
                    let waited = now - sent;
                    if waited >= next_gui_report(self.gui_reported) {
                        findings.push(Finding::GuiBlocked(waited));
                        self.gui_reported = Some(waited);
                    }
                }
            }
        }

        if self.gui_reported.is_none() {
            let excused_until = self.excused_until;
            for (label, renderer) in &mut self.renderers {
                let quiet_since = renderer.last_beat.max(excused_until);
                if renderer.report.visible
                    && renderer.frozen_since.is_none()
                    && now - quiet_since >= RENDERER_SILENCE
                {
                    renderer.frozen_since = Some(renderer.last_beat);
                    findings.push(Finding::RendererFrozen {
                        label: label.clone(),
                        silent: now - renderer.last_beat,
                        context: renderer.report.context(),
                    });
                }
            }
        }
        findings
    }

    fn renderer_summary(&self) -> String {
        let mut labels: Vec<_> = self.renderers.iter().collect();
        labels.sort_by(|a, b| a.0.cmp(b.0));
        labels
            .iter()
            .map(|(label, renderer)| {
                let heap = renderer
                    .report
                    .heap_mb
                    .map(|mb| format!(" {mb} MiB"))
                    .unwrap_or_default();
                let shown = if renderer.report.visible {
                    "visible"
                } else {
                    "hidden"
                };
                format!("{label} ({shown}{heap})")
            })
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// Managed state: the heartbeat command writes it, the watchdog reads it.
pub struct Responsiveness {
    watch: Mutex<Watch>,
}

impl Default for Responsiveness {
    fn default() -> Self {
        Self {
            watch: Mutex::new(Watch::new(Instant::now())),
        }
    }
}

impl Responsiveness {
    fn lock(&self) -> std::sync::MutexGuard<'_, Watch> {
        self.watch.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn forget(&self, label: &str) {
        self.lock().forget(label);
    }
}

/// Every window's renderer calls this every 2 s while it is visible, and once
/// when it is hidden. Async so the log write on recovery stays off the GUI
/// thread.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn renderer_heartbeat(
    window: tauri::Window,
    watch: tauri::State<'_, Responsiveness>,
    beat: RendererHeartbeat,
) -> Result<(), String> {
    let finding = watch.lock().beat(window.label(), beat, Instant::now());
    if let Some(finding) = finding {
        report(&finding, None);
    }
    Ok(())
}

fn seconds(duration: Duration) -> String {
    format!("{:.1}s", duration.as_secs_f64())
}

fn report(finding: &Finding, memory: Option<&Memory>) {
    let private = memory
        .map(|m| format!(" (private {} MiB)", m.private_bytes / MIB))
        .unwrap_or_default();
    match finding {
        Finding::GuiBlocked(waited) => {
            log::warn!(
                "responsiveness: GUI thread blocked for {}{private}",
                seconds(*waited)
            )
        }
        Finding::GuiResponsive(after) => {
            log::warn!(
                "responsiveness: GUI thread responsive again after {}{private}",
                seconds(*after)
            )
        }
        Finding::RendererFrozen {
            label,
            silent,
            context,
        } => log::warn!(
            "responsiveness: window '{label}' renderer silent for {}, {context}",
            seconds(*silent)
        ),
        Finding::RendererResponsive { label, after } => log::warn!(
            "responsiveness: window '{label}' renderer responsive again after {}",
            seconds(*after)
        ),
        Finding::Stalled(gap) => log::warn!(
            "responsiveness: whole process paused for {} (system sleep, debugger, or CPU/memory pressure){private}",
            seconds(*gap)
        ),
    }
}

pub fn start<R: Runtime>(app: tauri::AppHandle<R>) {
    let spawned = std::thread::Builder::new()
        .name("responsiveness-watchdog".into())
        .spawn(move || run(app));
    if let Err(error) = spawned {
        log::error!("responsiveness: watchdog did not start: {error}");
    }
}

fn run<R: Runtime>(app: tauri::AppHandle<R>) {
    let answered: Arc<Mutex<Option<Instant>>> = Arc::default();
    let mut last_memory = Memory::read();
    let mut last_jump: Option<Instant> = None;
    let mut last_resources = Instant::now();
    if let Some(memory) = &last_memory {
        log::info!("responsiveness: watchdog started, {}", memory.describe());
    }
    loop {
        std::thread::sleep(TICK);
        let now = Instant::now();
        let watch = app.state::<Responsiveness>();
        let memory = Memory::read();

        let (findings, ping, renderers) = {
            let mut watch = watch.lock();
            let answer = *answered.lock().unwrap_or_else(|p| p.into_inner());
            let findings = watch.tick(now, answer);
            let ping = watch.should_ping();
            if ping {
                watch.pinged(now);
            }
            (findings, ping, watch.renderer_summary())
        };
        for finding in &findings {
            report(finding, memory.as_ref());
        }
        if ping {
            *answered.lock().unwrap_or_else(|p| p.into_inner()) = None;
            let answered = answered.clone();
            let _ = app.run_on_main_thread(move || {
                *answered.lock().unwrap_or_else(|p| p.into_inner()) = Some(Instant::now());
            });
        }

        if let (Some(before), Some(after)) = (&last_memory, &memory) {
            let grew = after.private_bytes.saturating_sub(before.private_bytes);
            let quiet = last_jump.is_none_or(|at| now - at >= MEMORY_JUMP_QUIET);
            if grew >= MEMORY_JUMP_BYTES && quiet {
                log::warn!(
                    "responsiveness: private memory jumped {} -> {} MiB in one second",
                    before.private_bytes / MIB,
                    after.private_bytes / MIB
                );
                last_jump = Some(now);
            }
        }
        if now - last_resources >= RESOURCE_INTERVAL {
            last_resources = now;
            if let Some(memory) = &memory {
                log::info!(
                    "responsiveness: {}, windows: {renderers}",
                    memory.describe()
                );
            }
        }
        last_memory = memory;
    }
}

struct Memory {
    private_bytes: u64,
    peak_working_set: u64,
    handles: u32,
    gdi_objects: u32,
    user_objects: u32,
}

impl Memory {
    #[cfg(windows)]
    fn read() -> Option<Self> {
        use windows::Win32::System::ProcessStatus::{
            GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
        };
        use windows::Win32::System::Threading::{
            GetCurrentProcess, GetGuiResources, GetProcessHandleCount, GR_GDIOBJECTS,
            GR_USEROBJECTS,
        };
        unsafe {
            let process = GetCurrentProcess();
            let mut counters = PROCESS_MEMORY_COUNTERS_EX {
                cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
                ..Default::default()
            };
            GetProcessMemoryInfo(
                process,
                (&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX)
                    .cast::<PROCESS_MEMORY_COUNTERS>(),
                counters.cb,
            )
            .ok()?;
            let mut handles = 0;
            let _ = GetProcessHandleCount(process, &mut handles);
            Some(Self {
                private_bytes: counters.PrivateUsage as u64,
                peak_working_set: counters.PeakWorkingSetSize as u64,
                handles,
                gdi_objects: GetGuiResources(process, GR_GDIOBJECTS),
                user_objects: GetGuiResources(process, GR_USEROBJECTS),
            })
        }
    }

    #[cfg(not(windows))]
    fn read() -> Option<Self> {
        None
    }

    fn describe(&self) -> String {
        format!(
            "private {} MiB, peak working set {} MiB, {} handles, {} GDI / {} USER objects",
            self.private_bytes / MIB,
            self.peak_working_set / MIB,
            self.handles,
            self.gdi_objects,
            self.user_objects
        )
    }
}

/// Logs WebView2's own verdicts: a renderer it found unresponsive, or a
/// browser, renderer or GPU process that exited.
pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("responsiveness")
        .on_webview_ready(|webview| watch_process_failures(&webview))
        .build()
}

#[cfg(windows)]
fn watch_process_failures<R: Runtime>(webview: &tauri::Webview<R>) {
    let label = webview.label().to_string();
    let result = webview.with_webview(move |platform| {
        if let Err(error) = add_process_failed_handler(&platform.controller(), label.clone()) {
            log::warn!("responsiveness: no process-failure handler for '{label}': {error}");
        }
    });
    if let Err(error) = result {
        log::warn!(
            "responsiveness: no process-failure handler for '{}': {error}",
            webview.label()
        );
    }
}

#[cfg(not(windows))]
fn watch_process_failures<R: Runtime>(_webview: &tauri::Webview<R>) {}

#[cfg(windows)]
fn add_process_failed_handler(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    label: String,
) -> windows::core::Result<()> {
    use webview2_com::ProcessFailedEventHandler;

    let mut token = 0i64;
    unsafe {
        controller.CoreWebView2()?.add_ProcessFailed(
            &ProcessFailedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    log::error!(
                        "responsiveness: window '{label}': {}",
                        describe_failure(&args)
                    );
                }
                Ok(())
            })),
            &mut token,
        )
    }
}

#[cfg(windows)]
fn describe_failure(
    args: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs,
) -> String {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2ProcessFailedEventArgs2, COREWEBVIEW2_PROCESS_FAILED_KIND,
        COREWEBVIEW2_PROCESS_FAILED_REASON,
    };
    use windows::core::{Interface, PWSTR};

    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    let _ = unsafe { args.ProcessFailedKind(&mut kind) };
    let mut text = process_failed_kind(kind.0).to_string();
    if let Ok(details) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
        let mut reason = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
        let mut exit_code = 0;
        let mut description = PWSTR::null();
        unsafe {
            let _ = details.Reason(&mut reason);
            let _ = details.ExitCode(&mut exit_code);
            let _ = details.ProcessDescription(&mut description);
        }
        let description = webview2_com::take_pwstr(description);
        text.push_str(&format!(
            " ({}, exit code {exit_code}{})",
            process_failed_reason(reason.0),
            if description.is_empty() {
                String::new()
            } else {
                format!(", {description}")
            }
        ));
    }
    text
}

fn process_failed_kind(kind: i32) -> &'static str {
    match kind {
        0 => "browser process exited",
        1 => "renderer process exited",
        2 => "renderer process unresponsive",
        3 => "frame renderer process exited",
        4 => "utility process exited",
        5 => "sandbox helper process exited",
        6 => "GPU process exited",
        7 => "PPAPI plugin process exited",
        8 => "PPAPI broker process exited",
        _ => "unknown process exited",
    }
}

fn process_failed_reason(reason: i32) -> &'static str {
    match reason {
        0 => "unexpected",
        1 => "unresponsive",
        2 => "terminated",
        3 => "crashed",
        4 => "launch failed",
        5 => "out of memory",
        6 => "profile deleted",
        _ => "unknown reason",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn visible(interaction: &str) -> RendererHeartbeat {
        RendererHeartbeat {
            visible: true,
            last_interaction: Some(interaction.into()),
            ..Default::default()
        }
    }

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn a_blocked_gui_thread_is_reported_at_growing_intervals_then_its_recovery() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.pinged(start);
        let mut findings = Vec::new();
        for second in 1..=16 {
            findings.extend(watch.tick(start + secs(second), None));
        }
        assert_eq!(
            findings,
            vec![
                Finding::GuiBlocked(secs(2)),
                Finding::GuiBlocked(secs(5)),
                Finding::GuiBlocked(secs(15)),
            ]
        );
        let answered = start + secs(16);
        assert_eq!(
            watch.tick(start + secs(17), Some(answered)),
            vec![Finding::GuiResponsive(secs(16))]
        );
        assert!(watch.should_ping());
    }

    #[test]
    fn a_quick_answer_reports_nothing() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.pinged(start);
        assert!(watch
            .tick(start + secs(1), Some(start + Duration::from_millis(3)))
            .is_empty());
    }

    #[test]
    fn a_silent_visible_renderer_is_reported_once_with_its_last_input() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.beat("main", visible("click 'Hide failing'"), start);
        assert!(watch.tick(start + secs(5), None).is_empty());
        let findings = watch.tick(start + secs(6), None);
        assert_eq!(
            findings,
            vec![Finding::RendererFrozen {
                label: "main".into(),
                silent: secs(6),
                context: "last input: click 'Hide failing'".into(),
            }]
        );
        assert!(watch.tick(start + secs(7), None).is_empty());
        assert_eq!(
            watch.beat("main", visible("key v"), start + secs(9)),
            Some(Finding::RendererResponsive {
                label: "main".into(),
                after: secs(9),
            })
        );
    }

    #[test]
    fn hidden_windows_are_not_expected_to_beat() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.beat("flyout", RendererHeartbeat::default(), start);
        for second in 1..=60 {
            assert!(watch.tick(start + secs(second), None).is_empty());
        }
    }

    #[test]
    fn renderer_silence_while_the_gui_thread_is_blocked_is_not_the_renderers_fault() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.beat("main", visible("key v"), start);
        watch.pinged(start);
        for second in 1..=10 {
            for finding in watch.tick(start + secs(second), None) {
                assert!(matches!(finding, Finding::GuiBlocked(_)), "{finding:?}");
            }
        }
        // Answered at 10 s; the queued heartbeats arrive right after.
        let findings = watch.tick(start + secs(11), Some(start + secs(10)));
        assert_eq!(findings, vec![Finding::GuiResponsive(secs(10))]);
        assert!(watch.tick(start + secs(12), None).is_empty());
    }

    #[test]
    fn a_paused_process_is_reported_and_excuses_the_renderers() {
        let start = Instant::now();
        let mut watch = Watch::new(start);
        watch.beat("main", visible("key v"), start);
        assert_eq!(
            watch.tick(start + secs(30), None),
            vec![Finding::Stalled(secs(30))]
        );
        assert!(watch.tick(start + secs(31), None).is_empty());
    }

    #[test]
    fn the_report_names_what_the_renderer_was_doing() {
        let report = RendererHeartbeat {
            visible: true,
            last_interaction: Some("key v 1.2s ago".into()),
            heap_mb: Some(812),
        };
        assert_eq!(
            report.context(),
            "last input: key v 1.2s ago, js heap 812 MiB"
        );
    }
}
