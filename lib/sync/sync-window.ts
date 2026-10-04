/**
 * When a program is worth syncing.
 *
 * Two dials, both cheap: whether the program has a meeting scheduled today
 * (answered from jadwal_sync, no upstream call), and what time it is. Inside
 * class hours a program with class today keeps the 15-minute cadence the board
 * is built around; everything else drops to hourly.
 *
 * A program with no class today is NOT silenced forever — with `allowSlowLane`
 * it still runs hourly, because its schedule can change upstream and nothing
 * here would ever notice.
 */
export const FAST_LANE_MINUTES = 15;
export const SLOW_LANE_MINUTES = 60;

/** Class hours in WIB: inclusive start, exclusive end. */
export const WINDOW_START_HOUR_WIB = 4;
export const WINDOW_END_HOUR_WIB = 22;

/**
 * Quiet hours in WIB — no sync at all, whatever the lane says. Requested by
 * DevOps (9 Sep 2026): the upstream servers do their own morning work in this
 * window and our pulls land on top of it.
 *
 * This one is a hard stop, not a lane: it sits above `hasMeetingToday` in
 * decideRun, and the cron routes check it before honouring `?full=1`/`?sweep=1`
 * — an override that skipped the window would skip the quiet hours too, which
 * is exactly what DevOps asked us not to do. The admin buttons in
 * /admin/programs stay open on purpose: those are one human, deliberately,
 * usually during an incident.
 */
export const BLACKOUT_START_HOUR_WIB = 5;
export const BLACKOUT_END_HOUR_WIB = 8;

export type RunDecision = {
  run: boolean;
  reason: "no-meeting-today" | "too-soon" | "in-window" | "out-of-window" | "slow-lane" | "blackout";
};

/**
 * Hour of day in WIB, whatever the server's own timezone is. The container runs
 * UTC and every schedule in this repo is WIB, so this conversion is the whole
 * point — reading `getHours()` would put the window seven hours out.
 */
export function hourInJakarta(now: Date): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number(s);
}

/** Quiet hours, in WIB — see BLACKOUT_START_HOUR_WIB. */
export function inSyncBlackout(now: Date): boolean {
  const hour = hourInJakarta(now);
  return hour >= BLACKOUT_START_HOUR_WIB && hour < BLACKOUT_END_HOUR_WIB;
}

export function decideRun(input: {
  now: Date;
  hasMeetingToday: boolean;
  minutesSinceLastRun: number;
  allowSlowLane?: boolean;
}): RunDecision {
  const { now, hasMeetingToday, minutesSinceLastRun, allowSlowLane = false } = input;

  if (inSyncBlackout(now)) return { run: false, reason: "blackout" };

  if (!hasMeetingToday) {
    if (allowSlowLane && minutesSinceLastRun >= SLOW_LANE_MINUTES) {
      return { run: true, reason: "slow-lane" };
    }
    return { run: false, reason: "no-meeting-today" };
  }

  const hour = hourInJakarta(now);
  const inWindow = hour >= WINDOW_START_HOUR_WIB && hour < WINDOW_END_HOUR_WIB;
  const need = inWindow ? FAST_LANE_MINUTES : SLOW_LANE_MINUTES;

  if (minutesSinceLastRun < need) return { run: false, reason: "too-soon" };
  return { run: true, reason: inWindow ? "in-window" : "out-of-window" };
}
