import SwiftUI

/// Sources and machines, pushed from Settings: the same list as Connect your work, without its Done button.
struct MachinesView: View {
    var body: some View {
        ConnectWorkView(onDone: nil)
            .navigationTitle("Sources")
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// Connect your work: where GitHub, Azure DevOps and the T3 machines come from and whether each works.
/// Shown once after the first sign-in and from Settings.
struct ConnectWorkView: View {
    /// Nil when shown from Settings.
    let onDone: (() -> Void)?

    @Environment(AppModel.self) private var app
    @State private var addingMachine = false
    @State private var linkingDesktop = false

    var body: some View {
        let account = app.account
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if onDone != nil {
                    Text("Connect your work")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(BD.text)
                        .padding(.horizontal, 20)
                    Text("BorgDock's server reads these for you, so this iPhone works even when your computers are asleep.")
                        .font(.system(size: 16.5))
                        .foregroundStyle(BD.text2)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                }
                if let sources = account.sources {
                    SourcesList(sources: sources, addMachine: { addingMachine = true }, linkDesktop: { linkingDesktop = true })
                } else if let error = account.loadError {
                    StatusCard(icon: "exclamationmark.triangle", text: error, tone: .warn)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.top, onDone == nil ? 0 : 12)
            .padding(.bottom, 24)
        }
        .background(BD.bg)
        .refreshable { await account.reload() }
        .safeAreaInset(edge: .bottom) {
            if let onDone {
                Button("Done", action: onDone)
                    .buttonStyle(.bdPrimary)
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                    .padding(.bottom, 6)
                    .background {
                        LinearGradient(colors: [BD.bg.opacity(0), BD.bg.opacity(0.92), BD.bg], startPoint: .top, endPoint: .bottom)
                            .ignoresSafeArea()
                    }
                    .accessibilityIdentifier("connect-done")
            }
        }
        .task { if account.sources == nil { await account.reload(reportErrors: false) } }
        .sheet(isPresented: $addingMachine) { AddMachineView() }
        .sheet(isPresented: $linkingDesktop) { LinkDesktopView() }
    }
}

/// GitHub accounts, Azure DevOps, T3 machines and the desktop app, grouped like the mockup.
struct SourcesList: View {
    let sources: Sources
    let addMachine: () -> Void
    let linkDesktop: () -> Void

    var body: some View {
        if !sources.github.isEmpty {
            CellGroupHeader(title: "GitHub")
            CellGroup(indent: 66) {
                ForEach(sources.github) { account in
                    Cell(title: account.login, subtitle: through(account.via, machine: account.machine, tool: "gh"), leading: {
                        IconTile(systemImage: "chevron.left.forwardslash.chevron.right", background: Color(hex: 0x17181C))
                    }, trailing: {
                        SourceBadge(via: account.via, ok: account.ok, error: account.error)
                    })
                }
            }
        }
        if let ado = sources.ado {
            CellGroupHeader(title: "Azure DevOps")
            CellGroup(indent: 66) {
                Cell(title: "\(ado.org) · \(ado.project)", subtitle: through(ado.via, machine: ado.machine, tool: "az"), leading: {
                    IconTile(systemImage: "checklist", background: Color(hex: 0x2D6BE4))
                }, trailing: {
                    SourceBadge(via: ado.via, ok: ado.ok, error: ado.error)
                })
            }
        }
        CellGroupHeader(title: "T3 machines")
        CellGroup(indent: 66) {
            ForEach(sources.machines) { machine in
                MachineCell(machine: machine)
            }
            Button(action: addMachine) {
                Cell(title: "Add a machine", chevron: true, titleColor: BD.accentText) {
                    IconTile(systemImage: "plus", background: BD.accentSoft, foreground: BD.accentText)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("add-machine")
        }
        DesktopsGroup(title: "Desktop app · optional", desktops: sources.desktops ?? [], link: linkDesktop)
    }

    private func through(_ via: SourceVia, machine: String?, tool: String) -> String {
        switch via {
        case .account: "Through your sign-in"
        case .machine: "Through \(machine ?? "a machine")'s \(tool)"
        }
    }
}

struct MachineCell: View {
    let machine: Machine

    var body: some View {
        Cell(title: machine.label, subtitle: machine.statusLine, leading: {
            IconTile(systemImage: machine.symbol, background: machine.online ? BD.accent : BD.text3)
        }, trailing: {
            if machine.online { Circle().fill(BD.green).frame(width: 9, height: 9).accessibilityLabel("Online") }
        })
    }
}

/// "✓ Connected", "via machine" or the error.
private struct SourceBadge: View {
    let via: SourceVia
    let ok: Bool
    let error: String?

    var body: some View {
        if !ok {
            ToneChip(text: "Not working", tone: .bad, systemImage: "exclamationmark", small: true)
                .accessibilityHint(error ?? "")
        } else if via == .machine {
            ToneChip(text: "via machine", small: true, accent: true)
        } else {
            ToneChip(text: "Connected", tone: .ok, systemImage: "checkmark", small: true)
        }
    }
}
