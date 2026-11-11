/** Axes written by the on-screen sticks and read once per simulation frame. */
export const touchInput = {
  /** Sticks are on screen and should be mixed into the flight controls. */
  enabled: false,
  thrust: 0,
  strafe: 0,
  vertical: 0,
  roll: 0,
  /** -1..1. Positive yaws the same way as moving the mouse right. */
  lookX: 0,
  /** -1..1. Positive pitches the nose up (before invert-Y). */
  lookY: 0,
  reset() {
    this.thrust = 0;
    this.strafe = 0;
    this.vertical = 0;
    this.roll = 0;
    this.lookX = 0;
    this.lookY = 0;
  },
};
