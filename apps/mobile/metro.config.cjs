const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

// Try TypeScript extensions before JS
config.resolver.sourceExts = ['tsx', 'ts', 'jsx', 'js', 'json'];

// Strip .js extension from imports so Metro can resolve to .tsx/.ts files.
// TypeScript's NodeNext moduleResolution requires .js extensions on imports,
// but Metro must resolve them to the actual .tsx/.ts source files.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shouldStripJs =
    (moduleName.startsWith('.') || moduleName.startsWith('@/')) &&
    moduleName.endsWith('.js');

  if (shouldStripJs) {
    const base = moduleName.slice(0, -3);
    for (const ext of context.sourceExts) {
      try {
        return resolve(context, base + '.' + ext, platform);
      } catch {
        // Try next extension
      }
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
