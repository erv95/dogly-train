const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const functionsDir = path.resolve(__dirname, 'functions');

config.resolver.blockList = [
  new RegExp(`^${functionsDir.replace(/\\/g, '\\\\')}.*`),
];

module.exports = config;
