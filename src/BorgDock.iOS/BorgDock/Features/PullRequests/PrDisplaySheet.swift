import SwiftUI

/// Display: the desktop's groupings (with Then by), its five orders with a direction, its group switches, and whether
/// failing pull requests show. Inside a saved view it changes the view (Update view keeps it); outside, the built-in
/// tabs. Mockup: design/ios-pr-list/mockups.html, section 03.
struct PrDisplaySheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let list = app.prList
        let display = list.display
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    OptionHeader(title: "Group")
                    CellGroup {
                        menuRow("Group by", value: display.groupBy.label, id: "prs-display-group") {
                            groupOptions(selected: display.groupBy, includeNothing: false) { by in list.changeDisplay { $0.groupBy = by } }
                        }
                        menuRow("Then by", value: display.subGroupBy == .none ? "Nothing" : display.subGroupBy.label, id: "prs-display-subgroup") {
                            groupOptions(selected: display.subGroupBy, includeNothing: true, leaving: display.groupBy) { by in list.changeDisplay { $0.subGroupBy = by } }
                        }
                        .disabled(display.groupBy == .none)
                        .opacity(display.groupBy == .none ? 0.45 : 1)
                    }

                    OptionHeader(title: "Order")
                    CellGroup {
                        menuRow("Order by", value: display.sortBy.label, id: "prs-display-sort") {
                            ForEach(PrSortBy.allCases) { sort in
                                Button { list.changeDisplay { $0.sortBy = sort; $0.sortDir = sort.defaultDir } } label: {
                                    if sort == display.sortBy { Label(sort.label, systemImage: "checkmark") } else { Text(sort.label) }
                                    if let hint = sort.hint { Text(hint) }
                                }
                            }
                        }
                        ForEach([SortDir.desc, .asc].sorted { a, _ in a == display.sortBy.defaultDir }, id: \.self) { dir in
                            Button { list.changeDisplay { $0.sortDir = dir } } label: {
                                CompactCell(title: display.sortBy.directionLabel(dir), minHeight: 46) {
                                    if display.sortDir == dir {
                                        Image(systemName: "checkmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.accent)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(display.sortDir == dir ? .isSelected : [])
                            .accessibilityIdentifier("prs-display-dir-\(dir.rawValue)")
                        }
                    }

                    OptionHeader(title: "Groups")
                    CellGroup {
                        toggle("Pin Your turn above the groups", subtitle: display.groupBy == .status || display.groupBy == .author || display.groupBy == .none ? "Not with Status, Author or no grouping" : nil,
                               isOn: display.pinYourTurn, enabled: display.groupBy != .status && display.groupBy != .author && display.groupBy != .none) { on in
                            list.changeDisplay { $0.pinYourTurn = on }
                        }
                        toggle("Fold groups with nothing for you", isOn: display.collapseQuiet) { on in list.changeDisplay { $0.collapseQuiet = on } }
                        toggle("Show empty groups", subtitle: "Status, review, waiting on, age, size", isOn: display.showEmptyGroups) { on in
                            list.changeDisplay { $0.showEmptyGroups = on }
                        }
                    }

                    OptionHeader(title: "Failing pull requests")
                    Picker("Failing pull requests", selection: Binding(get: { list.hideFailing }, set: { list.setHideFailing($0) })) {
                        Text("Show").tag(false)
                        Text("Hide").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .accessibilityIdentifier("prs-display-failing")
                    Text("Kept on this iPhone. Hide leaves failing pull requests out of every tab but Failing.")
                        .font(.system(size: 13))
                        .foregroundStyle(BD.text2)
                        .padding(.horizontal, 32)
                        .padding(.top, 8)
                }
                .padding(.bottom, 24)
            }
            .background(BD.sheet)
            .navigationTitle(list.activeView.map { "Display · \($0.name)" } ?? "Display")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") { list.resetDisplay() }
                        .accessibilityIdentifier("prs-display-reset")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
        .tint(BD.text)
        .presentationDetents([.large])
        .presentationBackground(BD.sheet)
    }

    /// "Group by    Status ⌄": a cell that opens a menu.
    private func menuRow(_ title: String, value: String, id: String, @ViewBuilder options: () -> some View) -> some View {
        Menu {
            options()
        } label: {
            CompactCell(title: title, minHeight: 48) {
                HStack(spacing: 4) {
                    Text(value).foregroundStyle(BD.text2)
                    Image(systemName: "chevron.up.chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(BD.text3)
                }
                .font(.system(size: 15.5))
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    /// The desktop's eleven, with its hints; Then by offers Nothing first and leaves out the first level.
    @ViewBuilder
    private func groupOptions(selected: PrGroupBy, includeNothing: Bool, leaving first: PrGroupBy? = nil, pick: @escaping (PrGroupBy) -> Void) -> some View {
        if includeNothing {
            Button { pick(.none) } label: {
                if selected == .none { Label("Nothing", systemImage: "checkmark") } else { Text("Nothing") }
            }
        }
        ForEach(PrGroupBy.allCases.filter { $0 != first && !(includeNothing && $0 == .none) }) { by in
            Button { pick(by) } label: {
                if by == selected { Label(by.label, systemImage: "checkmark") } else { Text(by.label) }
                if let hint = by.hint { Text(hint) }
            }
        }
    }

    private func toggle(_ title: String, subtitle: String? = nil, isOn: Bool, enabled: Bool = true, set: @escaping (Bool) -> Void) -> some View {
        CompactCell(title: title, subtitle: subtitle) {
            Toggle(title, isOn: Binding(get: { isOn }, set: set)).labelsHidden().tint(BD.green)
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.5)
    }
}

/// Saves the list as it is now under a name: the tab, the query (as the desktop stores it) and the display.
struct PrSaveViewSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    var body: some View {
        let list = app.prList
        let display = list.display
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    CellGroup {
                        TextField("Name", text: $name)
                            .font(.system(size: 17))
                            .focused($nameFocused)
                            .submitLabel(.done)
                            .onSubmit(save)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                            .accessibilityIdentifier("prs-save-name")
                    }
                    .padding(.top, 12)

                    OptionHeader(title: "It keeps")
                    CellGroup {
                        keeps("Tab", list.view.label)
                        keeps("Filters", list.query.isEmpty ? "None" : list.query, mono: !list.query.isEmpty)
                        keeps("Group", display.groupBy == .none ? "No grouping" : display.subGroupBy == .none || display.subGroupBy == display.groupBy
                            ? display.groupBy.label : "\(display.groupBy.label), then \(display.subGroupBy.label.lowercased())")
                        keeps("Order", "\(display.sortBy.label), \(display.sortBy.directionLabel(display.sortDir).lowercased())")
                    }
                    Text(app.isReview ? "Views are saved on this iPhone." : "Views sync with BorgDock on your desktop.")
                        .font(.system(size: 13))
                        .foregroundStyle(BD.text2)
                        .padding(.horizontal, 32)
                        .padding(.top, 8)
                }
                .padding(.bottom, 24)
            }
            .background(BD.sheet)
            .navigationTitle("Save view")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save", action: save)
                        .fontWeight(.semibold)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityIdentifier("prs-save-confirm")
                }
            }
            .onAppear { nameFocused = true }
        }
        .tint(BD.text)
        .presentationDetents([.medium, .large])
        .presentationBackground(BD.sheet)
    }

    private func save() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        app.prList.saveView(name: name)
        dismiss()
    }

    private func keeps(_ title: String, _ value: String, mono: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title).font(.system(size: 15.5, weight: .medium)).foregroundStyle(BD.text)
            Spacer(minLength: 8)
            Text(value)
                .font(mono ? .system(size: 13, design: .monospaced) : .system(size: 15))
                .foregroundStyle(BD.text2)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }
}

/// "Group", "Order", "Groups": the small header above an option group.
private struct OptionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 28)
            .padding(.top, 18)
            .padding(.bottom, 7)
    }
}
