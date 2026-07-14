import SwiftUI

@main
struct MotoMissionApp: App {
    @StateObject private var rideController = RideActivityController()

    var body: some Scene {
        WindowGroup {
            WebAppView(rideController: rideController)
                .ignoresSafeArea()
        }
    }
}
