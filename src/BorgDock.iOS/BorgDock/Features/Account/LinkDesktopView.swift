import SwiftUI

/// Link a desktop: scan the QR code the BorgDock desktop app shows, or type its code. The approval is signed with
/// this iPhone's key; the desktop then picks up a session that can only read activity, mark it read and say
/// whether you're at your desk.
struct LinkDesktopView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var linking = false
    @State private var linkError: String?
    @State private var linked: DesktopLinkApproval?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Text("Link a desktop")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(BD.text)
                    Text("Scan the code BorgDock shows on your computer")
                        .font(.system(size: 16))
                        .foregroundStyle(BD.text2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.top, 6)
                    if let linked {
                        LinkedCard(name: linked.deviceName) { dismiss() }
                            .padding(.top, 24)
                    } else {
                        CodeEntry(
                            busy: linking, busyLabel: "Linking…", error: linkError, initial: app.account.pendingDesktopLink,
                            placeholder: "Code, e.g. KQ7M-2DX4", action: "Link", cameraLabel: "the desktop's code",
                            fromURL: DesktopLink.init(url:), fromTyped: DesktopLink.init(typedCode:),
                            onSubmit: { link in Task { await approve(link) } }
                        ) {
                            DesktopPreview()
                        }
                        .padding(.top, 14)
                    }
                    DesktopFacts()
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

    private func approve(_ link: DesktopLink) async {
        guard await app.account.authorize("Link a desktop to your BorgDock") else { return }
        linking = true
        linkError = nil
        defer { linking = false }
        do {
            linked = try await app.account.linkDesktop(link)
        } catch let error as APIError where error.isConflict || error.isGone {
            linkError = "That code expired or was already used. Show a new one on the desktop."
        } catch {
            linkError = error.localizedDescription
        }
    }
}

/// What the desktop shows, for devices without a camera (and the simulator).
private struct DesktopPreview: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                ForEach([Color(hex: 0xFF5F57), Color(hex: 0xFEBC2E), Color(hex: 0x28C840)], id: \.self) { Circle().fill($0).frame(width: 10, height: 10) }
                Spacer()
                Text("BorgDock").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.55))
                Spacer()
                Color.clear.frame(width: 42, height: 10)
            }
            .padding(12)
            .background(.white.opacity(0.04))
            VStack(spacing: 8) {
                BDAppTile(size: 34)
                Text("Link your iPhone").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                ZStack {
                    Image(systemName: "qrcode")
                        .font(.system(size: 100, weight: .light))
                        .foregroundStyle(.black)
                        .padding(14)
                        .background(.white, in: RoundedRectangle(cornerRadius: 10))
                    ScanFrame().frame(width: 176, height: 176)
                }
                Text("KQ7M-2DX4")
                    .font(.system(size: 17, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.top, 2)
                Text("or type this code on the iPhone").font(.system(size: 13)).foregroundStyle(.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(hex: 0x111214))
    }
}

/// "Linked Work laptop".
private struct LinkedCard: View {
    let name: String
    let done: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(BD.green)
            Text("Linked \(name)").font(.system(size: 20, weight: .semibold)).multilineTextAlignment(.center)
            Text("It shares what you've read with this iPhone and says when you're at your desk.")
                .font(.system(size: 15)).foregroundStyle(BD.text2).multilineTextAlignment(.center)
            Button("Done", action: done).buttonStyle(.bdPrimary)
                .accessibilityIdentifier("link-desktop-done")
        }
        .padding(20)
        .bdCard(radius: 24)
        .padding(.horizontal, 16)
    }
}

/// What a linked desktop can and can't do, under the camera.
private struct DesktopFacts: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What a linked desktop does").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text2)
            fact("checkmark.circle", "What you read there is read here too, and the other way round.")
            fact("moon", "Says when you're at your desk, so this iPhone can stay quiet.")
            fact("lock", "Can't start agents, merge or approve. Only this iPhone signs those.")
            Text("The code works once and expires in 10 minutes. Unlink the desktop in Settings any time.")
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
