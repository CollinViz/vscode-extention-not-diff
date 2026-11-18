export function debounce(fn: () => void, waitMs: number): { trigger(): void; dispose(): void } {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger(): void {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
      handle = setTimeout(() => {
        handle = undefined;
        fn();
      }, waitMs);
    },
    dispose(): void {
      if (handle !== undefined) {
        clearTimeout(handle);
        handle = undefined;
      }
    }
  };
}
