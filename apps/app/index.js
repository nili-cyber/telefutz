// apps/app/index.js
import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

// Explicitly boot the router instance using absolute code injection
renderRootComponent(App);
