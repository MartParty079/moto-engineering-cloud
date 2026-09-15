// Keep unknown sensor readings unknown. Zero is a valid measured coordinate.
export function validPosition(position) {
  const c = position?.coords;
  return Boolean(c && Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90
    && Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180
    && Number.isFinite(position.timestamp) && position.timestamp > 0);
}

export function freshPosition(position, maximumAge, now = Date.now()) {
  if (!validPosition(position)) return false;
  const age = now - position.timestamp;
  return age >= 0 && age <= maximumAge;
}
