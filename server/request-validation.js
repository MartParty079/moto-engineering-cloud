// Query values must be single decimal numbers; Number('') and Number(null) are zero.
export function queryNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return NaN;
  return Number(value);
}

export function validCoordinates(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function requireGet(req, res) {
  res.setHeader('Allow', 'GET');
  if (req.method === 'GET') return true;
  res.status(405).json({ error: 'Method not allowed' });
  return false;
}
