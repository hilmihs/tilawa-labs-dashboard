/**
 * Lives outside actions.ts on purpose: a "use server" module may only export
 * async functions, and a stray const there silently strips every export from
 * the module.
 */
export const COUNTDOWN_SLUG = "countdown";
