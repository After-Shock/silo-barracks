import { useEffect, useState } from "react";
import { readFlags } from "../../../lib/hub-tabs";
import { NAV_AVAILABILITY_EVENT } from "../../../lib/events";

// Hub tab flags, refreshed when the navbar re-checks integrations after the page has rendered.
export default function useHubFlags() {
  const [flags, setFlags] = useState(readFlags);
  useEffect(() => {
    const update = () => setFlags(readFlags());
    window.addEventListener(NAV_AVAILABILITY_EVENT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(NAV_AVAILABILITY_EVENT, update); window.removeEventListener("storage", update); };
  }, []);
  return flags;
}
