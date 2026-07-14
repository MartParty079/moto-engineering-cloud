import ActivityKit
import CoreLocation
import Foundation

@MainActor
final class RideActivityController: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var activity: Activity<RideActivityAttributes>?
    private var attributes: RideActivityAttributes?
    private var state = RideActivityAttributes.ContentState(
        speedMph: 0,
        speedLimitMph: nil,
        headingDegrees: nil,
        headingText: "—",
        distanceMiles: 0,
        roadName: nil,
        preferences: RideDisplayPreferences(),
        lastUpdated: Date()
    )

    private var lastLocation: CLLocation?
    private var lastActivityUpdate = Date.distantPast
    private var lastRoadLookupAt = Date.distantPast
    private var lastRoadLookupLocation: CLLocation?
    private var lastRoadLookupHeading: CLLocationDirection?
    private var roadLookupInFlight = false
    private var apiBaseURL = URL(string: "https://moto-engineering-cloud.vercel.app")!
    private var accessToken: String?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.activityType = .automotiveNavigation
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 2
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.allowsBackgroundLocationUpdates = true
        activity = Activity<RideActivityAttributes>.activities.first
    }

    func handle(message: [String: Any]) {
        guard let command = message["command"] as? String else { return }
        switch command {
        case "start":
            Task { await start(message: message) }
        case "update":
            applyWebSnapshot(message["snapshot"] as? [String: Any])
            Task { await refreshActivity(force: false) }
        case "settings":
            if let values = message["preferences"] as? [String: Any] {
                state.preferences = parsePreferences(values)
                Task { await refreshActivity(force: true) }
            }
        case "end":
            applyWebSnapshot(message["snapshot"] as? [String: Any])
            Task { await endRide() }
        default:
            break
        }
    }

    private func start(message: [String: Any]) async {
        let preferences = parsePreferences(message["preferences"] as? [String: Any] ?? [:])
        guard preferences.enabled, ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        if let base = message["apiBaseURL"] as? String, let url = URL(string: base) {
            apiBaseURL = url
        }
        accessToken = message["accessToken"] as? String

        let formatter = ISO8601DateFormatter()
        let startDate = (message["startedAt"] as? String).flatMap(formatter.date(from:)) ?? Date()
        let rideAttributes = RideActivityAttributes(
            rideId: message["rideId"] as? String ?? UUID().uuidString,
            bikeName: message["bikeName"] as? String ?? "Motorcycle",
            startedAt: startDate
        )
        attributes = rideAttributes
        state = RideActivityAttributes.ContentState(
            speedMph: 0,
            speedLimitMph: nil,
            headingDegrees: nil,
            headingText: "—",
            distanceMiles: 0,
            roadName: nil,
            preferences: preferences,
            lastUpdated: Date()
        )
        applyWebSnapshot(message["snapshot"] as? [String: Any])

        for existing in Activity<RideActivityAttributes>.activities {
            await existing.end(
                ActivityContent(state: existing.content.state, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }

        do {
            activity = try Activity.request(
                attributes: rideAttributes,
                content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(30)),
                pushType: nil
            )
        } catch {
            print("Unable to start ride Live Activity: \(error)")
        }

        lastLocation = nil
        lastRoadLookupLocation = nil
        lastRoadLookupAt = .distantPast
        requestLocationAccess()
        locationManager.startUpdatingLocation()
    }

    private func requestLocationAccess() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            locationManager.requestAlwaysAuthorization()
        case .authorizedAlways:
            break
        default:
            locationManager.requestWhenInUseAuthorization()
        }
    }

    private func endRide() async {
        locationManager.stopUpdatingLocation()
        if let activity {
            state.lastUpdated = Date()
            await activity.end(
                ActivityContent(state: state, staleDate: nil),
                dismissalPolicy: .immediate
            )
        }
        activity = nil
        attributes = nil
        lastLocation = nil
        lastRoadLookupLocation = nil
    }

    private func applyWebSnapshot(_ snapshot: [String: Any]?) {
        guard let snapshot else { return }
        if let value = number(snapshot["speedMph"]) { state.speedMph = max(0, Int(value.rounded())) }
        if let value = number(snapshot["speedLimitMph"]) { state.speedLimitMph = Int(value.rounded()) }
        if let value = number(snapshot["headingDegrees"]) {
            state.headingDegrees = Int(value.rounded())
            state.headingText = cardinal(value)
        }
        if let value = snapshot["headingText"] as? String, !value.isEmpty { state.headingText = value }
        if let value = number(snapshot["distanceMiles"]) { state.distanceMiles = max(state.distanceMiles, value) }
        if let value = snapshot["roadName"] as? String, !value.isEmpty { state.roadName = value }
        if let values = snapshot["preferences"] as? [String: Any] { state.preferences = parsePreferences(values) }
        state.lastUpdated = Date()
    }

    private func parsePreferences(_ values: [String: Any]) -> RideDisplayPreferences {
        var output = RideDisplayPreferences()
        output.enabled = bool(values["enabled"], fallback: output.enabled)
        output.speed = bool(values["speed"], fallback: output.speed)
        output.speedLimit = bool(values["speedLimit"], fallback: output.speedLimit)
        output.direction = bool(values["direction"], fallback: output.direction)
        output.tripTime = bool(values["tripTime"], fallback: output.tripTime)
        output.mileage = bool(values["mileage"], fallback: output.mileage)
        if let raw = values["primaryMetric"] as? String, let metric = RideMetric(rawValue: raw) {
            output.primaryMetric = metric
        }
        if output.visibleMetrics.isEmpty { output.speed = true }
        if !output.isVisible(output.primaryMetric) {
            output.primaryMetric = output.visibleMetrics.first ?? .speed
        }
        return output
    }

    private func bool(_ value: Any?, fallback: Bool) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        return fallback
    }

    private func number(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        if let value = value as? String { return Double(value) }
        return nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestAlwaysAuthorization()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last,
              location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 80 else { return }

        if let previous = lastLocation {
            let segmentMiles = location.distance(from: previous) * 0.000621371
            if segmentMiles >= 0, segmentMiles < 0.5 {
                state.distanceMiles += segmentMiles
            }
        }
        lastLocation = location

        if location.speed >= 0 {
            state.speedMph = max(0, Int((location.speed * 2.236936).rounded()))
        }
        let course = location.course >= 0 ? location.course : nil
        if let course {
            state.headingDegrees = Int(course.rounded())
            state.headingText = cardinal(course)
        }
        state.lastUpdated = Date()

        Task { await refreshActivity(force: false) }
        if shouldRefreshRoad(at: location, heading: course) {
            Task { await refreshRoadInfo(at: location, heading: course) }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Ride location error: \(error)")
    }

    private func refreshActivity(force: Bool) async {
        guard let activity else { return }
        if !force, Date().timeIntervalSince(lastActivityUpdate) < 1 { return }
        lastActivityUpdate = Date()
        state.lastUpdated = Date()
        await activity.update(
            ActivityContent(state: state, staleDate: Date().addingTimeInterval(20))
        )
    }

    private func shouldRefreshRoad(at location: CLLocation, heading: CLLocationDirection?) -> Bool {
        if roadLookupInFlight { return false }
        if lastRoadLookupLocation == nil { return true }
        if Date().timeIntervalSince(lastRoadLookupAt) >= 180 { return true }
        if let previous = lastRoadLookupLocation,
           location.distance(from: previous) >= 130 { return true }
        if let heading, let previousHeading = lastRoadLookupHeading,
           angleDifference(heading, previousHeading) >= 30 { return true }
        return false
    }

    private func refreshRoadInfo(at location: CLLocation, heading: CLLocationDirection?) async {
        roadLookupInFlight = true
        defer { roadLookupInFlight = false }

        var components = URLComponents(url: apiBaseURL.appendingPathComponent("api/road-info"), resolvingAgainstBaseURL: false)
        var items = [
            URLQueryItem(name: "lat", value: String(location.coordinate.latitude)),
            URLQueryItem(name: "lon", value: String(location.coordinate.longitude)),
            URLQueryItem(name: "provider", value: "auto"),
            URLQueryItem(name: "speed", value: String(state.speedMph))
        ]
        if let heading { items.append(URLQueryItem(name: "heading", value: String(heading))) }
        if let previous = lastRoadLookupLocation {
            items.append(URLQueryItem(name: "prevLat", value: String(previous.coordinate.latitude)))
            items.append(URLQueryItem(name: "prevLon", value: String(previous.coordinate.longitude)))
        }
        components?.queryItems = items
        guard let url = components?.url else { return }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let accessToken, !accessToken.isEmpty {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
            let road = try JSONDecoder().decode(RoadInfoResponse.self, from: data)
            if let mph = road.limit?.mph { state.speedLimitMph = Int(mph.rounded()) }
            if let name = road.road, !name.isEmpty { state.roadName = name }
            lastRoadLookupLocation = location
            lastRoadLookupHeading = heading
            lastRoadLookupAt = Date()
            await refreshActivity(force: true)
        } catch {
            print("Road information lookup failed: \(error)")
        }
    }

    private func cardinal(_ degrees: Double) -> String {
        let labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        let normalized = degrees.truncatingRemainder(dividingBy: 360)
        let positive = normalized < 0 ? normalized + 360 : normalized
        return labels[Int((positive / 45).rounded()) % labels.count]
    }

    private func angleDifference(_ a: Double, _ b: Double) -> Double {
        abs((a - b + 540).truncatingRemainder(dividingBy: 360) - 180)
    }
}

private struct RoadInfoResponse: Decodable {
    struct Limit: Decodable { let mph: Double? }
    let status: String?
    let road: String?
    let limit: Limit?
}
