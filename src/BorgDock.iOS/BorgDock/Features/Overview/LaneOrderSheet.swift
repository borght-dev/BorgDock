import SwiftUI

/// Drag the Work tab's states into the order you walk them. Reset goes back to the server's walk order.
struct LaneOrderSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var stored: String
    let states: [String]
    @State private var order: [String] = []

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(order, id: \.self) { Text($0) }
                        .onMove { order.move(fromOffsets: $0, toOffset: $1) }
                } footer: {
                    Text("Grouped by verdict or sprint, the same order sorts the items inside each lane.")
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Lane order")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset") {
                        stored = ""
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        stored = LaneOrder.encode(order)
                        dismiss()
                    }
                    .accessibilityIdentifier("lane-order-done")
                }
            }
            .onAppear { order = states }
        }
        .presentationDetents([.medium, .large])
    }
}
