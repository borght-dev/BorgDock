import SwiftUI

/// The desktop's Filter menu as a sheet: every field it filters on, in its order; a field opens its values with how
/// many pull requests each matches within your other filters. Every change rewrites the list's query at once.
/// Mockup: design/ios-pr-list/mockups.html, section 02.
struct PrFilterSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// A chip opens the sheet on its field.
    let startField: QueryField?
    @State private var path: [QueryField] = []

    var body: some View {
        NavigationStack(path: $path) {
            fields
                .navigationDestination(for: QueryField.self) { PrFilterValuesView(field: $0) }
        }
        .tint(BD.text)
        .presentationDetents([.large])
        .presentationBackground(BD.sheet)
        .onAppear { if let startField, PrFacets.fields.contains(where: { $0.field == startField }) { path = [startField] } }
    }

    private var fields: some View {
        let list = app.prList
        let parsed = ParsedQuery(parsing: list.query)
        return ScrollView {
            CellGroup {
                ForEach(PrFacets.fields, id: \.field) { entry in
                    NavigationLink(value: entry.field) {
                        CompactCell(title: entry.label, subtitle: entry.hint, minHeight: 48) {
                            summary(parsed.terms.first { $0.field == entry.field })
                            CellChevron()
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("prs-filter-field-\(entry.field.rawValue)")
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 96)
        }
        .background(BD.sheet)
        .navigationTitle("Filter")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Clear all") { list.setQuery(PrQuery.clearTerms(list.query)) }
                    .disabled(parsed.terms.isEmpty)
                    .accessibilityIdentifier("prs-filter-clear")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
            }
        }
        .safeAreaInset(edge: .bottom) { PrFilterShowButton() }
    }

    /// What a field holds, or Any.
    @ViewBuilder
    private func summary(_ term: QueryTerm?) -> some View {
        if let term, let focus = app.focus.focus {
            let context = PrListContext(focus: focus, list: app.prList, logins: app.focus.myLogins, ciGroups: app.focus.ciGroups)
            let chip = PrFacets.chip(term, name: context.name)
            Text(term.negate ? "not \(chip.values)" : chip.values)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(BD.accentText)
                .lineLimit(1)
                .frame(maxWidth: 170, alignment: .trailing)
        } else {
            Text("Any").font(.system(size: 15)).foregroundStyle(BD.text3)
        }
    }
}

/// "Show 37 pull requests": how many the filters leave, before you close the sheet.
private struct PrFilterShowButton: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let count = app.focus.focus.map { PrListContext(focus: $0, list: app.prList, logins: app.focus.myLogins, ciGroups: app.focus.ciGroups).count(app.prList.query) } ?? 0
        Button { dismiss() } label: {
            Text(count == 1 ? "Show 1 pull request" : "Show \(count) pull requests")
                .font(.system(size: 16.5, weight: .semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 50)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(BD.accent)
        .foregroundStyle(BD.onAccent)
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 8)
        .background(LinearGradient(stops: [.init(color: BD.sheet.opacity(0), location: 0), .init(color: BD.sheet, location: 0.45)], startPoint: .top, endPoint: .bottom))
        .accessibilityIdentifier("prs-filter-show")
    }
}

/// One field's values: Is or Is not, then every value with its count and a check for the ones picked. Several values
/// match any of them.
struct PrFilterValuesView: View {
    @Environment(AppModel.self) private var app
    let field: QueryField
    @State private var negateChoice: Bool?
    @State private var find = ""

    var body: some View {
        let list = app.prList
        let term = ParsedQuery(parsing: list.query).terms.first { $0.field == field }
        let selected = term?.values ?? []
        let negate = negateChoice ?? term?.negate ?? false
        let values = values(selected: selected)
        let shown = find.isEmpty ? values : values.filter { $0.label.localizedCaseInsensitiveContains(find) || $0.value.contains(find.lowercased()) }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Picker("Match", selection: Binding(get: { negate }, set: { setNegate($0, selected: selected) })) {
                    Text("Is").tag(false)
                    Text("Is not").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .accessibilityIdentifier("prs-filter-negate")

                if shown.isEmpty {
                    Text(find.isEmpty ? "No open pull request has one." : "Nothing matches “\(find)”.")
                        .font(.system(size: 15))
                        .foregroundStyle(BD.text2)
                        .padding(.horizontal, 28)
                        .padding(.top, 20)
                } else {
                    CellGroup(indent: field == .author ? 58 : 16) {
                        ForEach(shown) { value in
                            Button { toggle(value.value, selected: selected, negate: negate) } label: { row(value, on: selected.contains(value.value)) }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(selected.contains(value.value) ? .isSelected : [])
                                .accessibilityIdentifier("prs-filter-value-\(value.value)")
                        }
                    }
                    .padding(.top, 14)
                }
                Text("Counts are within your other filters. Picking several matches any of them.")
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text2)
                    .padding(.horizontal, 32)
                    .padding(.top, 8)
                    .padding(.bottom, 96)
            }
        }
        .background(BD.sheet)
        .navigationTitle(PrFacets.label(field))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(FindField(text: $find, prompt: "Find \(PrFacets.label(field).lowercased())", shown: PrFacets.fixedValues(field) == nil))
        .safeAreaInset(edge: .bottom) { PrFilterShowButton() }
    }

    private func row(_ value: PrFacets.Value, on: Bool) -> some View {
        CompactCell(title: value.label, minHeight: 48) {
            if field == .author {
                if value.label == "You" { MeAvatar(size: 30) } else { PersonAvatar(name: value.label, size: 30) }
            }
        } trailing: {
            Text("\(value.count)").font(.system(size: 15)).monospacedDigit().foregroundStyle(BD.text2)
            Image(systemName: "checkmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .opacity(on ? 1 : 0)
                .frame(width: 20)
        }
    }

    /// The field's values counted within the other filters; a picked value no open pull request carries stays listed.
    private func values(selected: [String]) -> [PrFacets.Value] {
        guard let focus = app.focus.focus else { return [] }
        let context = PrListContext(focus: focus, list: app.prList, logins: app.focus.myLogins, ciGroups: app.focus.ciGroups)
        let values = PrFacets.values(field, in: context.facts(except: field, query: app.prList.query), ctx: context.ctx)
        let missing = selected.filter { picked in !values.contains { $0.value == picked } }
        return missing.map { PrFacets.Value(value: $0, label: PrFacets.chip(QueryTerm(field, [$0]), name: context.name).values, count: 0) } + values
    }

    private func toggle(_ value: String, selected: [String], negate: Bool) {
        let list = app.prList
        let values = selected.contains(value) ? selected.filter { $0 != value } : selected + [value]
        list.setQuery(PrQuery.setTerm(list.query, field, values, negate: negate))
    }

    private func setNegate(_ negate: Bool, selected: [String]) {
        negateChoice = negate
        guard !selected.isEmpty else { return }
        let list = app.prList
        list.setQuery(PrQuery.setTerm(list.query, field, selected, negate: negate))
    }
}

/// A search field over the values, for the open-ended lists (authors, repositories, labels…); fixed lists are short.
private struct FindField: ViewModifier {
    @Binding var text: String
    let prompt: String
    let shown: Bool

    func body(content: Content) -> some View {
        if shown {
            content.searchable(text: $text, placement: .navigationBarDrawer(displayMode: .always), prompt: prompt)
        } else {
            content
        }
    }
}
