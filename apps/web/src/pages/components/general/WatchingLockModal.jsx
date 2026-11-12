import { useCallback, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchActiveSessions, getCachedActiveSessions } from "../../../lib/session-cache";
import { describeWatcher, findWatchingSessions } from "../../../lib/watching-lock";

async function loadSessions() {
  try {
    return await fetchActiveSessions();
  } catch (error) {
    console.log("Watching check: falling back to cached sessions", error);
    return getCachedActiveSessions() || [];
  }
}

/**
 * Soft lock for destructive actions. `guard(target, actionLabel)` resolves to
 * { proceed, watched }: proceed=true straight away when nobody is playing the
 * target, otherwise after the admin picks "Proceed anyway" in the modal.
 */
export function useWatchingLock() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const close = useCallback((proceed) => {
    const resolve = resolver.current;
    resolver.current = null;
    setState(null);
    resolve?.({ proceed, watched: true });
  }, []);

  const guard = useCallback(async (target, actionLabel = "continue") => {
    const watchers = findWatchingSessions(await loadSessions(), target);
    if (!watchers.length) return { proceed: true, watched: false };
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({ watchers, actionLabel, label: target?.label });
    });
  }, []);

  const modal = (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent className="watching-lock-modal">
        <DialogHeader>
          <DialogTitle>Someone is watching this</DialogTitle>
          <DialogDescription className="tw:sr-only">Someone is watching this</DialogDescription>
        </DialogHeader>
        {state?.watchers.map((session, index) => {
          const watcher = describeWatcher(session);
          return (
            <p key={session.Id || index} className="mb-1">
              <strong>{watcher.text}</strong>
              {watcher.device ? <span className="d-block small opacity-75">{watcher.device}</span> : null}
            </p>
          );
        })}
        <p className="mt-3 mb-0">
          If you {state?.actionLabel}{state?.label ? ` “${state.label}”` : ""} now, their playback may stop or fail. You can wait until they finish, or carry on anyway.
        </p>
        <DialogFooter>
          <button type="button" className="btn btn-primary" onClick={() => close(false)} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={() => close(true)}>
            Proceed anyway
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, modal };
}

export default useWatchingLock;
