import {PAID_PROVIDERS_ENABLED} from '../server/provider-policy.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    providerPolicy: 'free-only',
    googleRoads: { configured: PAID_PROVIDERS_ENABLED && Boolean(process.env.GOOGLE_ROADS_API_KEY) },
    googlePlaces: { configured: PAID_PROVIDERS_ENABLED && Boolean(process.env.GOOGLE_PLACES_API_KEY) },
    tomTom: { configured: PAID_PROVIDERS_ENABLED && Boolean(process.env.TOMTOM_API_KEY) },
    openStreetMap: { configured: true }
  });
}
