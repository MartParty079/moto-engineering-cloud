import ActivityKit
import Foundation

enum RideMetric: String, Codable, Hashable, CaseIterable {
    case speed
    case speedLimit
    case direction
    case tripTime
    case mileage

    var title: String {
        switch self {
        case .speed: return "Speed"
        case .speedLimit: return "Speed limit"
        case .direction: return "Direction"
        case .tripTime: return "Trip time"
        case .mileage: return "Mileage"
        }
    }
}

struct RideDisplayPreferences: Codable, Hashable {
    var enabled = true
    var speed = true
    var speedLimit = true
    var direction = true
    var tripTime = true
    var mileage = true
    var primaryMetric: RideMetric = .speed

    func isVisible(_ metric: RideMetric) -> Bool {
        switch metric {
        case .speed: return speed
        case .speedLimit: return speedLimit
        case .direction: return direction
        case .tripTime: return tripTime
        case .mileage: return mileage
        }
    }

    var visibleMetrics: [RideMetric] {
        RideMetric.allCases.filter(isVisible)
    }
}

struct RideActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var speedMph: Int
        var speedLimitMph: Int?
        var headingDegrees: Int?
        var headingText: String
        var distanceMiles: Double
        var roadName: String?
        var preferences: RideDisplayPreferences
        var lastUpdated: Date
    }

    var rideId: String
    var bikeName: String
    var startedAt: Date
}
