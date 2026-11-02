import UIKit
import UserNotifications

/// Asks for notification permission and registers with APNs. The device token goes to the server
/// from AppDelegate via AppModel.uploadPushToken.
@MainActor
enum PushRegistrar {
    /// Debug builds are signed with the development aps-environment, so their tokens are sandbox tokens.
    static var environment: ApnsEnvironment {
        #if DEBUG
        .sandbox
        #else
        .production
        #endif
    }

    /// After an interactive sign-in.
    static func requestPermissionAndRegister() async {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
    }

    /// On every launch while signed in: tokens can change, so register again when allowed. Never prompts.
    static func registerIfAllowed() async {
        switch await authorizationStatus() {
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }
}
