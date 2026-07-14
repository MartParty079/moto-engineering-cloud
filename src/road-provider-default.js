const providerKey = 'motoRoadProvider';
const migrationKey = 'motoRoadProviderAutoDefaultV1';

if (!localStorage.getItem(migrationKey)) {
  const currentProvider = localStorage.getItem(providerKey);
  if (!currentProvider || currentProvider === 'osm') {
    localStorage.setItem(providerKey, 'auto');
  }
  localStorage.setItem(migrationKey, '1');
}
