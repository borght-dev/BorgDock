import SwiftUI
import VisionKit

/// Add a machine: scan the QR code `npx borgdock connect` shows on it, or type its code. The phone proves it saw
/// the code with an HMAC over its device key, and the pairing request is signed with that key.
struct AddMachineView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var pairing = false
    @State private var pairError: String?
    @State private var paired: Machine?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text("Add a machine")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(BD.text)
                    Text("On it, run \(Text("npx borgdock connect").font(.system(size: 16, design: .monospaced)))")
                        .font(.system(size: 16))
                        .foregroundStyle(BD.text2)
                        .padding(.top, 6)
                    if let paired {
                        PairedCard(machine: paired) { dismiss() }
                            .padding(.top, 24)
                    } else {
                        PairingCodeEntry(busy: pairing, error: pairError, initial: app.account.pendingPairing) { link in
                            Task { await pair(link) }
                        }
                        .padding(.top, 14)
                    }
                    ConnectorFacts()
                        .padding(.top, 20)
                }
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .background(BD.bg)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
            .tint(BD.text)
        }
    }

    private func pair(_ link: PairingLink) async {
        guard await app.account.authorize("Add a machine that can run agents") else { return }
        pairing = true
        pairError = nil
        defer { pairing = false }
        do {
            paired = try await app.account.pair(link)
        } catch let error as APIError where error.isConflict {
            pairError = "That code expired or was already used. Run npx borgdock connect again for a new one."
        } catch {
            pairError = error.localizedDescription
        }
    }
}

/// The camera (or, without one, what the machine shows) plus a field for the typed code.
struct PairingCodeEntry: View {
    let busy: Bool
    let error: String?
    var initial: PairingLink?
    let onPair: (PairingLink) -> Void

    var body: some View {
        CodeEntry(
            busy: busy, busyLabel: "Pairing…", error: error, initial: initial,
            placeholder: "Code, e.g. KQ7M-2DX4-9FQR-T8WN", action: "Pair", cameraLabel: "the pairing code",
            fromURL: PairingLink.init(url:), fromTyped: PairingLink.init(typedCode:),
            onSubmit: onPair
        ) {
            TerminalPreview()
        }
    }
}

/// A QR code scanned by the camera, or typed: what Add a machine and Link a desktop share. `preview` shows what
/// to scan on devices without a camera (and the simulator).
struct CodeEntry<Link: Equatable, Preview: View>: View {
    let busy: Bool
    let busyLabel: String
    let error: String?
    var initial: Link?
    let placeholder: String
    let action: String
    /// "the pairing code", for VoiceOver.
    let cameraLabel: String
    let fromURL: (URL) -> Link?
    let fromTyped: (String) -> Link?
    let onSubmit: (Link) -> Void
    @ViewBuilder let preview: Preview

    @State private var code = ""
    @State private var scanned: Link?
    @FocusState private var codeFocused: Bool

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                if QRScanner.isAvailable && scanned == nil && initial == nil {
                    QRScanner { url in
                        guard scanned == nil, let link = fromURL(url) else { return }
                        scanned = link
                        onSubmit(link)
                    }
                    ScanFrame().frame(width: 236, height: 236)
                } else {
                    preview
                }
                if busy {
                    ProgressView(busyLabel)
                        .padding(16)
                        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
            .frame(height: 380)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .padding(.horizontal, 16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(QRScanner.isAvailable ? "Camera: point it at \(cameraLabel)" : "This device has no camera; type the code")

            HStack(spacing: 10) {
                TextField(placeholder, text: $code)
                    .font(.system(size: 17, weight: .semibold, design: .monospaced))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($codeFocused)
                    .submitLabel(.go)
                    .onSubmit(submitTyped)
                    .padding(.horizontal, 16)
                    .frame(height: 50)
                    .background(BD.card, in: Capsule())
                    .accessibilityIdentifier("pairing-code")
                Button(action, action: submitTyped)
                    .buttonStyle(.bd(.primary, height: 50))
                    .frame(width: 92)
                    .disabled(fromTyped(code) == nil || busy)
            }
            .padding(.horizontal, 16)
            if let error {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(BD.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
        }
        .onAppear {
            if let initial { onSubmit(initial) }
        }
    }

    private func submitTyped() {
        guard let link = fromTyped(code), !busy else { return }
        codeFocused = false
        onSubmit(link)
    }
}

/// The four corner brackets over the camera.
struct ScanFrame: View {
    var body: some View {
        Canvas { context, size in
            let length: CGFloat = 46
            let radius: CGFloat = 20
            var path = Path()
            for (x, y, dx, dy) in [(0.0, 0.0, 1.0, 1.0), (size.width, 0, -1, 1), (0, size.height, 1, -1), (size.width, size.height, -1, -1)] {
                path.move(to: CGPoint(x: x, y: y + dy * length))
                path.addLine(to: CGPoint(x: x, y: y + dy * radius))
                path.addQuadCurve(to: CGPoint(x: x + dx * radius, y: y), control: CGPoint(x: x, y: y))
                path.addLine(to: CGPoint(x: x + dx * length, y: y))
            }
            context.stroke(path, with: .color(.white), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// What the machine's terminal shows, for devices without a camera (and the simulator).
private struct TerminalPreview: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                ForEach([Color(hex: 0xFF5F57), Color(hex: 0xFEBC2E), Color(hex: 0x28C840)], id: \.self) { Circle().fill($0).frame(width: 10, height: 10) }
                Spacer()
                Text("your-machine — zsh").foregroundStyle(.white.opacity(0.45))
                Spacer()
            }
            .padding(12)
            .background(.white.opacity(0.04))
            VStack(alignment: .leading, spacing: 4) {
                Text("\(Text("~").foregroundStyle(BD.brandIndigo)) npx borgdock connect")
                Text("BorgDock connector").foregroundStyle(.white.opacity(0.5))
                Text("\(Text("✓").foregroundStyle(Color(hex: 0x5CC98F))) T3 Code · gh · az")
                Text("Scan with BorgDock on your iPhone:")
                ZStack {
                    Image(systemName: "qrcode")
                        .font(.system(size: 120, weight: .light))
                        .foregroundStyle(.black)
                        .padding(14)
                        .background(.white, in: RoundedRectangle(cornerRadius: 10))
                    ScanFrame().frame(width: 200, height: 200)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                Text("or enter the code it prints").foregroundStyle(.white.opacity(0.5))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
            }
            .padding(14)
        }
        .font(.system(size: 13, design: .monospaced))
        .foregroundStyle(.white.opacity(0.85))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(hex: 0x111214))
    }
}

/// "Paired: mac-mini is online".
private struct PairedCard: View {
    let machine: Machine
    let done: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(BD.green)
            Text("\(machine.label) is paired").font(.system(size: 20, weight: .semibold))
            Text("Its connector trusts this iPhone's key now. You can start agents there.")
                .font(.system(size: 15)).foregroundStyle(BD.text2).multilineTextAlignment(.center)
            Button("Done", action: done).buttonStyle(.bdPrimary)
        }
        .padding(20)
        .bdCard(radius: 24)
        .padding(.horizontal, 16)
    }
}

/// What the connector does, under the camera.
private struct ConnectorFacts: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What the connector does").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text2)
            fact("globe", "Dials out to BorgDock. No open ports, no VPN on your phone.")
            fact("faceid", "Runs T3 commands only when you confirmed them with Face ID.")
            fact("key", "Lends its gh and az sign-ins, if you allow it.")
            Text("Only someone at the machine can add it: the code appears there, works once and expires in two minutes.")
                .font(.system(size: 14))
                .foregroundStyle(BD.text3)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 28, fill: BD.card)
        .padding(.horizontal, 16)
    }

    private func fact(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).font(.system(size: 18)).frame(width: 24).foregroundStyle(BD.text)
            Text(text).font(.system(size: 16)).foregroundStyle(BD.text)
        }
    }
}

/// VisionKit's live QR scanner. Reports each `borgdock://` link it recognises.
struct QRScanner: UIViewControllerRepresentable {
    let onScan: (URL) -> Void

    @MainActor static var isAvailable: Bool { DataScannerViewController.isSupported && DataScannerViewController.isAvailable }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            isHighlightingEnabled: false
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (URL) -> Void

        init(onScan: @escaping (URL) -> Void) { self.onScan = onScan }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let barcode) in addedItems {
                if let payload = barcode.payloadStringValue, let url = URL(string: payload), url.scheme == "borgdock" {
                    onScan(url)
                    return
                }
            }
        }
    }
}
