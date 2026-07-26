// Local app entry point.
//
// We do NOT use the default `expo/AppEntry.js` because its `import '../../App'`
// is relative to expo's own package folder, which — under pnpm's isolated store
// (virtual-store-dir=D:/ps) — does not point back at this project. A local entry
// that imports `./App` resolves correctly regardless of where deps are stored.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
