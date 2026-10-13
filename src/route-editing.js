import { validTrackPoint, segmentMiles, MAX_GPX_POINTS } from './gpx.js';

export function summarizeGeometry(segments, waypoints = []) {
  const points = segments.flat();
  if (points.length < 2 || points.length + waypoints.length > MAX_GPX_POINTS || ![...points, ...waypoints].every(validTrackPoint)) throw new Error('Edited geometry needs 2–100,000 valid points.');
  let gainFeet = 0;
  for (const segment of segments) for (let i = 1; i < segment.length; i++) {
    if (Number.isFinite(segment[i].ele) && Number.isFinite(segment[i-1].ele)) gainFeet += Math.max(0, segment[i].ele - segment[i-1].ele) * 3.28084;
  }
  return { segments, waypoints, pointCount: points.length, distanceMiles: segments.reduce((n,s) => n + segmentMiles(s), 0), gainFeet };
}

// Indices are zero-based internally. Never bridge an original segment gap.
export function editRoute(route, { from = 0, to = route.pointCount - 1, reverse = false, splitAt = null, point = null, merge = null } = {}) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= route.pointCount || to < from + 1) throw new Error('Choose a valid inclusive range of at least two points.');
  let offset = 0;
  let segments = route.segments.map(segment => {
    const selected = segment.filter((p,i) => offset + i >= from && offset + i <= to).map(p => ({...p}));
    offset += segment.length; return selected;
  }).filter(s => s.length);
  if (point) {
    if (!Number.isInteger(point.index) || point.index < 0 || point.index >= segments.flat().length || !validTrackPoint(point)) throw new Error('Choose a valid point and latitude/longitude.');
    let index = 0;
    segments = segments.map(s => s.map(p => index++ === point.index ? {...p, lat:point.lat, lon:point.lon} : p));
  }
  if (splitAt != null) {
    if (!Number.isInteger(splitAt) || splitAt < 1 || splitAt >= segments.flat().length) throw new Error('Split must be between the first and last point.');
    let index = 0;
    segments = segments.flatMap(s => {const cut = splitAt - index; index += s.length; return cut > 0 && cut < s.length ? [s.slice(0,cut),s.slice(cut)] : [s];});
  }
  if (reverse) segments = segments.reverse().map(s => s.reverse());
  // Merging appends separate segments. A connecting road must come from a routing engine.
  if (merge) segments.push(...merge.segments.map(s => s.map(p => ({...p}))));
  return summarizeGeometry(segments, [...route.waypoints.map(p => ({...p})), ...(merge?.waypoints || []).map(p => ({...p}))]);
}

export function elevationProfile(route) {
  const samples = []; let miles = 0;
  route.segments.forEach((segment, segmentIndex) => segment.forEach((point,i) => {
    if (i) miles += segmentMiles([segment[i-1],point]);
    samples.push({miles, elevation: Number.isFinite(point.ele) ? point.ele : null, segment:segmentIndex});
  }));
  return samples;
}
