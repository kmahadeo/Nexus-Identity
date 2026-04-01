/**
 * lib/logger.ts — Production-safe logger.
 *
 * Wraps console.* methods so they only emit output in development.
 * In production builds (import.meta.env.DEV === false) all calls are no-ops.
 */

const isDev = import.meta.env.DEV;

export function logError(msg: string, ...args: unknown[]): void {
  if (isDev) console.error(msg, ...args);
}

export function logWarn(msg: string, ...args: unknown[]): void {
  if (isDev) console.warn(msg, ...args);
}

export function logInfo(msg: string, ...args: unknown[]): void {
  if (isDev) console.info(msg, ...args);
}

export function logLog(msg: string, ...args: unknown[]): void {
  if (isDev) console.log(msg, ...args);
}
