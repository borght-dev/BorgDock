import SwiftUI

// The expanded agent-question notification's content. Lives in Shared so the app can render it in its DEBUG
// gallery for screenshots; the notification content extension hosts it.

@MainActor
@Observable
final class QuestionCardModel {
    var card: NotificationQuestion?
    var fallbackContext = ""
    var fallbackQuestion = ""
    var selection = 0
    @ObservationIgnored var onSelect: ((Int) -> Void)?

    func select(_ index: Int) {
        selection = index
        onSelect?(index)
    }
}

struct QuestionCardView: View {
    let model: QuestionCardModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.card?.context ?? model.fallbackContext)
                .font(.system(size: 14))
                .foregroundStyle(BD.text2)
                .lineLimit(1)
            Text(model.card?.question ?? model.fallbackQuestion)
                .font(.system(size: 21, weight: .bold))
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            if let card = model.card {
                VStack(spacing: 8) {
                    ForEach(Array(card.options.enumerated()), id: \.offset) { index, option in
                        OptionRow(
                            option: option,
                            recommended: card.recommended == index,
                            selected: model.selection == index
                        ) { model.select(index) }
                    }
                }
                .padding(.top, 14)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct OptionRow: View {
    let option: NotificationQuestion.Option
    let recommended: Bool
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle().strokeBorder(selected ? BD.accent : BD.text3, lineWidth: 1.5)
                    if selected {
                        Circle().fill(BD.accent)
                        Circle().fill(.white).frame(width: 8, height: 8)
                    }
                }
                .frame(width: 22, height: 22)
                .padding(.top, 1)
                VStack(alignment: .leading, spacing: 3) {
                    (Text(option.label).font(.system(size: 16.5, weight: .semibold)).foregroundStyle(BD.text)
                        + (recommended ? Text("  Recommended").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.accentText) : Text("")))
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 15))
                            .foregroundStyle(BD.text2)
                    }
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(selected ? BD.accentSoft : BD.fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(BD.accent, lineWidth: 1)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
