import SwiftUI

/// Display: group, sort and what the pull request list shows, on one sheet. Kept per device.
/// Mockup: design/ios-flow/mockups.html, section 03, "Display".
struct PrDisplaySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var grouping: PrListGrouping
    @Binding var sort: PrListSort
    @Binding var mineFirst: Bool
    @Binding var showDrafts: Bool
    @Binding var dependenciesTogether: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    OptionHeader(title: "Group by")
                    Picker("Group by", selection: $grouping) {
                        ForEach(PrListGrouping.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                    .accessibilityIdentifier("prs-display-grouping")

                    OptionHeader(title: "Sort")
                    CellGroup {
                        ForEach(PrListSort.allCases) { option in
                            Button { sort = option } label: {
                                CompactCell(title: option.title, minHeight: 46) {
                                    if sort == option {
                                        Image(systemName: "checkmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.accent)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(sort == option ? .isSelected : [])
                            .accessibilityIdentifier("prs-sort-\(option.rawValue)")
                        }
                    }

                    OptionHeader(title: "Show")
                    CellGroup {
                        toggle("Your pull requests first", isOn: $mineFirst)
                        toggle("Drafts", isOn: $showDrafts)
                        toggle("Dependency updates as one group", isOn: $dependenciesTogether)
                    }
                }
                .padding(.bottom, 24)
            }
            .background(BD.sheet)
            .navigationTitle("Display")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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

    private func toggle(_ title: String, isOn: Binding<Bool>) -> some View {
        CompactCell(title: title) {
            Toggle(title, isOn: isOn).labelsHidden().tint(BD.green)
        }
    }
}

/// "Group by", "Sort", "Show": the small header above an option group.
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
