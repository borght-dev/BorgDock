import SwiftUI
import UserNotifications

/// Account, sources, machines, notifications, safety, devices and the server.
struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var permission: UNAuthorizationStatus = .notDetermined
    @State private var editingServer = false
    @State private var confirmSignOut = false
    @State private var revoking: DeviceInfo?
    @State private var addingMachine = false
    @State private var linkingDesktop = false
    @State private var sendingTest = false

    private var account: AccountStore { app.account }
    private var isSheet: Bool { if case .settings = app.router.sheet { true } else { false } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                accountSection
                sourcesSection
                machinesSection
                DesktopsGroup(title: "Desktop", desktops: account.desktops) { linkingDesktop = true }
                notificationsSection
                safetySection
                devicesSection
                serverSection
                Button("Sign out of this iPhone", role: .destructive) { confirmSignOut = true }
                    .buttonStyle(.bdDanger)
                    .padding(.horizontal, 16)
                    .padding(.top, 28)
                    .accessibilityIdentifier("sign-out")
                Text(versionText)
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text3)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 14)
            }
            .padding(.bottom, 32)
        }
        .background(BD.bg)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if isSheet {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
        .tint(BD.text)
        .task { await reload() }
        .refreshable { await reload() }
        .serverEditor(isPresented: $editingServer)
        .sheet(isPresented: $addingMachine) { AddMachineView() }
        .sheet(isPresented: $linkingDesktop) { LinkDesktopView() }
        .confirmationDialog("Sign out of BorgDock on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await account.signOut() } }
        } message: {
            Text("The server forgets this device and stops sending it notifications.")
        }
        .confirmationDialog(
            "Sign out \(revoking?.name ?? "this device")?",
            isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }),
            titleVisibility: .visible,
            presenting: revoking
        ) { device in
            Button("Sign out", role: .destructive) { Task { await revoke(device) } }
        } message: { _ in
            Text("That device has to sign in again, and machines stop trusting its key.")
        }
    }

    // MARK: Sections

    @ViewBuilder
    private var accountSection: some View {
        CellGroupHeader(title: "Account")
        CellGroup(indent: 66) {
            let owner = account.owner
            Cell(title: owner?.name ?? app.config?.user.name ?? "Signed in",
                 subtitle: [owner?.email, account.account.map { "\($0.devices.count) \($0.devices.count == 1 ? "device" : "devices")" }].compactMap { $0 }.joined(separator: " · ")) {
                PersonAvatar(name: owner?.name ?? app.config?.user.name ?? "?", size: 40)
            }
        }
    }

    @ViewBuilder
    private var sourcesSection: some View {
        CellGroupHeader(title: "Sources")
        CellGroup(indent: 66) {
            let github = account.sources?.github ?? []
            NavigationLink(value: Route.machines) {
                Cell(title: "GitHub", value: github.isEmpty ? "None" : "\(github.count) \(github.count == 1 ? "account" : "accounts")", chevron: true) {
                    IconTile(systemImage: "chevron.left.forwardslash.chevron.right", background: Color(hex: 0x17181C))
                }
            }
            .buttonStyle(.plain)
            NavigationLink(value: Route.machines) {
                Cell(title: "Azure DevOps", value: adoValue, chevron: true) {
                    IconTile(systemImage: "checklist", background: Color(hex: 0x2D6BE4))
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var adoValue: String {
        guard let ado = account.sources?.ado else { return "None" }
        if !ado.ok { return "Not working" }
        return ado.via == .machine ? "via \(ado.machine ?? "machine")" : "Connected"
    }

    @ViewBuilder
    private var machinesSection: some View {
        CellGroupHeader(title: "Machines")
        CellGroup(indent: 66) {
            ForEach(account.sources?.machines ?? []) { machine in
                MachineCell(machine: machine)
            }
            Button { addingMachine = true } label: {
                Cell(title: "Add a machine", chevron: true, titleColor: BD.accentText) {
                    IconTile(systemImage: "plus", background: BD.accentSoft, foreground: BD.accentText)
                }
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var notificationsSection: some View {
        CellGroupHeader(title: "Notifications")
        CellGroup {
            if permission != .authorized && permission != .provisional && permission != .ephemeral {
                Button {
                    Task {
                        if permission == .denied, let url = URL(string: UIApplication.openSettingsURLString) {
                            await UIApplication.shared.open(url)
                        } else {
                            await PushRegistrar.requestPermissionAndRegister()
                            permission = await PushRegistrar.authorizationStatus()
                        }
                    }
                } label: {
                    Cell(title: permission == .denied ? "Notifications are off" : "Allow notifications",
                         subtitle: permission == .denied ? "Turn them on in iOS Settings" : nil, chevron: true, titleColor: BD.accentText)
                }
                .buttonStyle(.plain)
            }
            if let preferences = account.preferences {
                ForEach(ActivityCategory.allCases) { category in
                    deliveryRow(category, current: preferences.delivery(category))
                }
                ToggleCell(title: "Quiet while I'm at my desk", subtitle: quietAtDeskLine, isOn: Binding(
                    get: { preferences.quietAtDesk },
                    set: { value in Task { await account.update { $0.quietAtDesk = value } } }
                ))
            }
            Button { Task { await sendTest() } } label: {
                Cell(title: sendingTest ? "Sending…" : "Send a test notification", titleColor: BD.accentText)
            }
            .buttonStyle(.plain)
            .disabled(sendingTest)
        }
    }

    /// The desktop is what knows you're at your desk; without one linked the setting does nothing.
    private var quietAtDeskLine: String {
        let desktops = account.desktops
        if desktops.isEmpty { return "Needs a linked desktop" }
        if desktops.contains(where: \.atDesk) { return "You're at your desk now" }
        return desktops.count == 1 ? "\(desktops[0].name) says when you're at your desk" : "Your desktops say when you're at your desk"
    }

    private func deliveryRow(_ category: ActivityCategory, current: CategoryDelivery) -> some View {
        Menu {
            Picker(category.filterTitle, selection: Binding(
                get: { current },
                set: { value in Task { await account.update { $0.categories[category.rawValue] = value } } }
            )) {
                ForEach(CategoryDelivery.allCases, id: \.self) { delivery in
                    Text(delivery.label).tag(delivery)
                }
            }
        } label: {
            Cell(title: category.filterTitle, value: current.label, chevron: true)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("delivery-\(category.rawValue)")
    }

    @ViewBuilder
    private var safetySection: some View {
        CellGroupHeader(title: "Safety")
        CellGroup {
            ToggleCell(title: "Face ID for agents, merges, approvals", isOn: Binding(
                get: { account.faceIdForActions },
                set: { value in Task { await account.update { $0.faceIdForActions = value } } }
            ))
        }
        Text("Agent commands are always signed with this iPhone's Secure Enclave key; Face ID adds a check that it's you.")
            .font(.system(size: 13))
            .foregroundStyle(BD.text3)
            .padding(.horizontal, 32)
            .padding(.top, 8)
    }

    @ViewBuilder
    private var devicesSection: some View {
        if let devices = account.account?.devices, !devices.isEmpty {
            CellGroupHeader(title: "Devices")
            CellGroup(indent: 66) {
                ForEach(devices.sorted { $0.current && !$1.current }) { device in
                    Button { if !device.current { revoking = device } } label: {
                        Cell(title: device.current ? "\(device.name) · this iPhone" : device.name, subtitle: deviceLine(device)) {
                            IconTile(systemImage: device.isDesktop ? "desktopcomputer" : "iphone", background: BD.fill2, foreground: BD.text)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(device.current)
                }
            }
        }
    }

    private func deviceLine(_ device: DeviceInfo) -> String {
        let seen = device.current ? "Active now" : "Last seen \(CompactTime.ago(device.lastSeenAt)) ago"
        let trusted = device.trustedBy.isEmpty ? "" : " · trusted by \(device.trustedBy.joined(separator: ", "))"
        return seen + trusted
    }

    @ViewBuilder
    private var serverSection: some View {
        CellGroupHeader(title: "Server")
        CellGroup {
            Button { editingServer = true } label: {
                Cell(title: account.serverInfo?.name ?? "BorgDock", subtitle: ServerSettings.displayName(app.serverURL), chevron: true)
            }
            .buttonStyle(.plain)
        }
    }

    private var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "BorgDock \(version) (\(build))"
    }

    // MARK: Actions

    private func reload() async {
        permission = await PushRegistrar.authorizationStatus()
        async let info: Void = account.loadServerInfo()
        await account.reload()
        await info
    }

    private func sendTest() async {
        sendingTest = true
        defer { sendingTest = false }
        do {
            _ = try await app.api.sendTestPush()
            app.toasts.show("Test notification sent")
        } catch {
            app.report(error)
        }
    }

    private func revoke(_ device: DeviceInfo) async {
        do {
            _ = try await app.api.revokeSession(id: device.sessionId)
            app.toasts.show("\(device.name) is signed out")
            await account.reload()
        } catch {
            app.report(error)
        }
    }
}

extension CategoryDelivery {
    var label: String {
        switch self {
        case .immediate: "Right away"
        case .summary: "In a summary"
        case .off: "Off"
        }
    }
}
