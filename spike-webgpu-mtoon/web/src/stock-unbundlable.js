// The app build's stand-in for @pixiv/three-vrm/nodes (vite.config.js, STOCK_STUB): the stock 3.5.5 module
// can't be bundled with three r187 at all, so a built app can only report that. See results/vite-build-stock.txt.
throw new Error('@pixiv/three-vrm/nodes 3.5.5 cannot be bundled with three r187: Rolldown MISSING_EXPORT "transformedNormalView" is not exported by three.tsl.js (vite build fails)');
