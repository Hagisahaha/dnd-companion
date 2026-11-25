/**
 * Entry point. When a module throws while loading, Metro reports it to the global error
 * handler and keeps going with `undefined`, so the visible crash is usually a confusing
 * follow-up error. This handler forwards the FIRST fatal error with its stack in the
 * message, so the real cause shows on the device's error screen.
 */
const previous = global.ErrorUtils?.getGlobalHandler?.();
let reported = false;
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  if (isFatal && !reported && error instanceof Error) {
    reported = true;
    const detailed = new Error(`${error.name}: ${error.message}\n\n${String(error.stack ?? '').slice(0, 1500)}`);
    previous?.(detailed, isFatal);
    return;
  }
  previous?.(error, isFatal);
});

require('expo-router/entry');
