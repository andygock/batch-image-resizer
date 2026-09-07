// Invalidate synchronously in event handlers, before the next effect can run.
export function createJobOwner() {
  let current;
  return {
    cancel() {
      current?.abort();
      current = undefined;
    },
    start() {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted,
      };
    },
  };
}
