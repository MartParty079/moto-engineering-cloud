const providerKey = 'motoRoadProvider';
const migrationKey = 'motoRoadProviderFreeBetaV1';

if (!localStorage.getItem(migrationKey)) {
  localStorage.setItem(providerKey, 'osm');
  localStorage.setItem(migrationKey, '1');
}
