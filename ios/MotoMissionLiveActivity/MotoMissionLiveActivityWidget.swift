import ActivityKit
import SwiftUI
import WidgetKit

@main
struct MotoMissionWidgetBundle: WidgetBundle {
    var body: some Widget {
        MotoMissionLiveActivityWidget()
    }
}

struct MotoMissionLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RideActivityAttributes.self) { context in
            RideActivityView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.88))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let metrics = orderedMetrics(context.state.preferences)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    CompactMetricView(metric: metrics.first ?? .speed, context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let metric = metrics.dropFirst().first {
                        CompactMetricView(metric: metric, context: context)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.bikeName)
                        .font(.caption.bold())
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 18) {
                        ForEach(Array(metrics.dropFirst(2).prefix(3)), id: \.self) { metric in
                            CompactMetricView(metric: metric, context: context)
                        }
                    }
                }
            } compactLeading: {
                CompactMetricView(metric: metrics.first ?? .speed, context: context, compact: true)
            } compactTrailing: {
                if let metric = metrics.dropFirst().first {
                    CompactMetricView(metric: metric, context: context, compact: true)
                }
            } minimal: {
                CompactMetricView(metric: metrics.first ?? .speed, context: context, compact: true)
            }
        }
        .supplementalActivityFamilies([.small])
    }
}

private struct RideActivityView: View {
    @Environment(\.activityFamily) private var activityFamily
    let context: ActivityViewContext<RideActivityAttributes>

    var body: some View {
        if activityFamily == .small {
            SmallRideActivityView(context: context)
        } else {
            FullRideActivityView(context: context)
        }
    }
}

private struct SmallRideActivityView: View {
    let context: ActivityViewContext<RideActivityAttributes>

    var body: some View {
        let metrics = orderedMetrics(context.state.preferences)
        HStack(spacing: 12) {
            MetricValueView(metric: metrics.first ?? .speed, context: context, large: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 8) {
                ForEach(Array(metrics.dropFirst().prefix(2)), id: \.self) { metric in
                    MetricValueView(metric: metric, context: context, large: false)
                }
            }
        }
        .padding(12)
    }
}

private struct FullRideActivityView: View {
    let context: ActivityViewContext<RideActivityAttributes>

    var body: some View {
        let metrics = orderedMetrics(context.state.preferences)
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("MOTO MISSION")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    Text(context.attributes.bikeName)
                        .font(.headline)
                        .lineLimit(1)
                }
                Spacer()
                if let road = context.state.roadName {
                    Text(road)
                        .font(.caption)
                        .lineLimit(1)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .center, spacing: 16) {
                MetricValueView(metric: metrics.first ?? .speed, context: context, large: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(Array(metrics.dropFirst().prefix(4)), id: \.self) { metric in
                        MetricValueView(metric: metric, context: context, large: false)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
    }
}

private struct MetricValueView: View {
    let metric: RideMetric
    let context: ActivityViewContext<RideActivityAttributes>
    let large: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            metricValue
                .font(large ? .system(size: 42, weight: .bold, design: .rounded) : .title3.bold())
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.65)
            Text(metric.title.uppercased())
                .font(.system(size: large ? 11 : 9, weight: .semibold))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var metricValue: some View {
        switch metric {
        case .speed:
            Text("\(context.state.speedMph)")
        case .speedLimit:
            Text(context.state.speedLimitMph.map(String.init) ?? "--")
        case .direction:
            Text(context.state.headingText)
        case .tripTime:
            Text(context.attributes.startedAt, style: .timer)
        case .mileage:
            Text(context.state.distanceMiles, format: .number.precision(.fractionLength(1)))
        }
    }
}

private struct CompactMetricView: View {
    let metric: RideMetric
    let context: ActivityViewContext<RideActivityAttributes>
    var compact = false

    var body: some View {
        VStack(spacing: 0) {
            value
                .font(compact ? .caption.bold() : .headline.bold())
                .monospacedDigit()
                .lineLimit(1)
            if !compact {
                Text(metric.title)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var value: some View {
        switch metric {
        case .speed:
            Text("\(context.state.speedMph)")
        case .speedLimit:
            Text(context.state.speedLimitMph.map(String.init) ?? "--")
        case .direction:
            Text(context.state.headingText)
        case .tripTime:
            Text(context.attributes.startedAt, style: .timer)
        case .mileage:
            Text(context.state.distanceMiles, format: .number.precision(.fractionLength(1)))
        }
    }
}

private func orderedMetrics(_ preferences: RideDisplayPreferences) -> [RideMetric] {
    let visible = preferences.visibleMetrics
    guard visible.contains(preferences.primaryMetric) else { return visible }
    return [preferences.primaryMetric] + visible.filter { $0 != preferences.primaryMetric }
}
