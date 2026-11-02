import SwiftUI
import UserNotifications

@main
struct BorgDockApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appDelegate.model)
                .tint(Palette.accent)
        }
        .backgroundTask(.appRefresh(WidgetRefresher.taskIdentifier)) { await WidgetRefresher.runBackgroundRefresh() }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    let model = AppModel()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        AppContext.model = model
        let center = UNUserNotificationCenter.current()
        center.delegate = NotificationController.shared
        center.setNotificationCategories(NotificationCategories.all)
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await model.uploadPushToken(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        model.pushRegistrationError = error.localizedDescription
    }

    /// Silent pushes: `refresh` rereads the widgets' snapshot, `read` clears entries read on another device.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        if let push = BorgDockPush(userInfo: userInfo) { await NotificationController.shared.handleSilent(push) }
        return await WidgetRefresher.handleSilentPush(userInfo) ? .newData : .noData
    }
}
