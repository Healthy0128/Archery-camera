// Portrait-axis remapper for DeviceOrientationEvent.
// Standard portrait axes:
// - alpha: rotation around screen-normal Z axis (twist)
// - beta: rotation around short-edge X axis (pitch)
// - gamma: rotation around long-edge Y axis (yaw)
// The game expects alpha -> horizontal aim and beta -> vertical aim,
// so remap real portrait motion before main.js consumes it.

let forwarding = false;

window.addEventListener('deviceorientation', (event) => {
  if (forwarding || event.alpha == null || event.beta == null || event.gamma == null) return;

  // Consume the native event before the game's listener sees the wrong axes.
  event.stopImmediatePropagation();

  // Portrait mapping:
  // gamma (rotation around the phone's long axis) -> horizontal aim
  // beta  (rotation around the phone's short axis) -> vertical aim, inverted
  // alpha (screen-normal twist) -> ignored for aiming
  const corrected = new DeviceOrientationEvent('deviceorientation', {
    alpha: event.gamma,
    beta: -event.beta,
    gamma: 0,
    absolute: event.absolute ?? false,
  });

  forwarding = true;
  window.dispatchEvent(corrected);
  forwarding = false;
}, { capture: true });
