/** Host platform, or `undefined` when running outside the Electron shell. */
export function usePlatform(): NodeJS.Platform | undefined {
  return window.workestrator?.platform;
}

export function useIsMac(): boolean {
  return usePlatform() === "darwin";
}
