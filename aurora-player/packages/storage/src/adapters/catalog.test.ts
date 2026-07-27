import { runCatalogContract } from '../contract/catalog-contract.js';
import { InMemoryCatalog } from './in-memory-catalog.js';

runCatalogContract({
  name: 'InMemoryCatalog',
  makeBackend: () => new InMemoryCatalog(),
});
