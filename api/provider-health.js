export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    googleRoads: { configured: Boolean(process.env.GOOGLE_ROADS_API_KEY) },
    googlePlaces: { configured: Boolean(process.env.GOOGLE_PLACES_API_KEY) },
    tomTom: { configured: Boolean(process.env.TOMTOM_API_KEY) },
    openStreetMap: { configured: true }
  });
}
