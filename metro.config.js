const { getDefaultConfig } = require('expo/metro-config');
const { mergeConfig } = require('metro');

const config = getDefaultConfig(__dirname);

// Extend the default blockList instead of replacing it.
// This preserves Expo's built-in exclusions and adds ours on top.
const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
  ? [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  // Block the project-level Cloud Functions folder (not node_modules/firebase/functions)
  /^(?!.*node_modules).*[\/\\]functions[\/\\].*$/,
  // Preserve Expo's default exclusions
  ...defaultBlockList,
];

module.exports = config;
