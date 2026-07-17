# Hardware Interface Baseline

## Initial scope
- ESP32-S3 controller.
- GPS receiver.
- ICM-42688-class IMU or reviewed equivalent.
- Local storage as required by the offline buffer design.
- Regulated and protected motorcycle power input.
- ISO 9141/K-Line physical interface hardware.

Wheel-speed and suspension sensors are outside the initial scope.

## Electrical requirements
- Document nominal and absolute input ranges.
- Include reverse-polarity, transient, overcurrent, and appropriate ESD protection.
- Confirm logic-level compatibility for every signal.
- Avoid powering external modules from an unverified rail.
- Establish grounding and connector strategy before vehicle installation.

## K-Line boundary
- Begin with receive and diagnostic observation goals.
- Any transmit behavior requires protocol research, a bounded command set, and separate authorization.
- The interface must not affect engine control when the logger is unpowered, disconnected, booting, or faulted.

## Pinout control
The reviewed pinout must identify:
- board pin and function;
- electrical direction;
- voltage level;
- pull-up or pull-down behavior;
- boot-state risk;
- connector and wire label;
- test point where applicable.

## Verification gates
1. Bench power verification.
2. Static current and thermal check.
3. GPS and IMU communication test.
4. Storage and brownout recovery test.
5. K-Line electrical-level observation with protection installed.
6. Vehicle installation inspection.
7. Stationary vehicle test before any road test.

Results must include measured values and test conditions.
