/**
 * Entry point. Installs a crash catcher before anything else loads, so a startup
 * failure on a device shows its stack instead of a generic "problem running" screen.
 */
import { AppRegistry } from 'react-native';

function showCrash(error) {
  const { CrashScreen } = require('./src/components/CrashScreen');
  const React = require('react');
  function Crashed() {
    return React.createElement(CrashScreen, { error });
  }
  AppRegistry.registerComponent('main', () => Crashed);
}

const previous = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  if (isFatal) {
    console.error(error);
    showCrash(error);
    try {
      // If the app had already started, restart it on the crash screen.
      AppRegistry.runApplication('main', { rootTag: global.__lastRootTag ?? 1, initialProps: {} });
    } catch {
      previous?.(error, isFatal);
    }
  } else {
    previous?.(error, isFatal);
  }
});

try {
  require('expo-router/entry');
} catch (error) {
  showCrash(error);
}
