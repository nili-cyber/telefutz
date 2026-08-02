// Tells Metro this project lives inside an npm workspace monorepo, so it
// looks for hoisted packages (like expo-router) at the workspace root's
// node_modules instead of only inside apps/app/node_modules, which doesn't
// exist - everything's hoisted one level up.
/* const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config; */
// Tells Metro this project lives inside an npm workspace monorepo, so it
// looks for hoisted packages (like expo-router) at the workspace root's
// node_modules instead of only inside apps/app/node_modules, which doesn't
// exist - everything's hoisted one level up.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// 1. Force Expo Router to know exactly where the app source files live
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(projectRoot, "app");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 2. Allow modern Expo entry bundling rules to properly resolve hoisted entries
config.server = {
  ...config.server,
  experimentalImportBundleSupport: true,
};

module.exports = config;
