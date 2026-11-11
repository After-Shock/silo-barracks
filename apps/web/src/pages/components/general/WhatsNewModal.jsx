import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RiMagicLine, RiMailLine, RiMovie2Line, RiPaletteLine, RiSpeedLine, RiUploadCloud2Line } from "@remixicon/react";
import axios from "../../../lib/axios_instance";
import { APP_VERSION_STORAGE_KEY, OPEN_WHATS_NEW_EVENT } from "../../../lib/events";
import releaseNotes from "../../../whats-new.json";

const SEEN_VERSION_KEY = "silo_barracks_whats_new_seen_version";

const iconMap = {
  magic: RiMagicLine,
  movie: RiMovie2Line,
  palette: RiPaletteLine,
  speed: RiSpeedLine,
  upload: RiUploadCloud2Line,
  mail: RiMailLine,
};

function getNotes(version) {
  return releaseNotes[version] || [
    {
      icon: RiMagicLine,
      title: "Silo Barracks activity monitoring",
      body: "Native Silo sessions now power live activity and observed playback history. Built on the Barracks dashboard.",
    },
  ];
}

function resolveIcon(icon) {
  return iconMap[icon] || RiMagicLine;
}

export default function WhatsNewModal({ enabled = true }) {
  const [version, setVersion] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const cachedVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
    if (cachedVersion) {
      setVersion(cachedVersion);
      if (localStorage.getItem(SEEN_VERSION_KEY) !== cachedVersion) {
        setShow(true);
      }
      return;
    }

    let active = true;
    axios
      .get("/auth/isConfigured")
      .then((response) => {
        if (!active) return;
        const nextVersion = response.data?.version;
        if (!nextVersion) return;

        setVersion(nextVersion);
        if (localStorage.getItem(SEEN_VERSION_KEY) !== nextVersion) {
          setShow(true);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    const openWhatsNew = () => {
      if (!enabled) return;
      if (version) {
        setShow(true);
        return;
      }

      axios
        .get("/auth/isConfigured")
        .then((response) => {
          const nextVersion = response.data?.version || "";
          setVersion(nextVersion);
          setShow(Boolean(nextVersion));
        })
        .catch(() => {});
    };

    window.addEventListener(OPEN_WHATS_NEW_EVENT, openWhatsNew);
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, openWhatsNew);
  }, [enabled, version]);

  function closeModal() {
    if (version) {
      localStorage.setItem(SEEN_VERSION_KEY, version);
    }
    setShow(false);
  }

  const notes = getNotes(version);

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          closeModal();
        }
      }}
    >
      <DialogContent
        className="whats-new-modal tw:max-w-[min(920px,calc(100vw-28px))] tw:sm:max-w-[min(920px,calc(100vw-28px))]"
        showCloseButton={false}
      >
        <DialogTitle className="tw:sr-only">What&apos;s new</DialogTitle>
        <DialogDescription className="tw:sr-only">The newest Silo Barracks changes</DialogDescription>
        <div className="whats-new-body">
        <button type="button" className="whats-new-close" onClick={closeModal} aria-label="Close what's new">
          ×
        </button>
        <div className="whats-new-hero">
          <span>
            <RiMagicLine size={17} />
            What&apos;s new
          </span>
          <h2>Silo Barracks {version}</h2>
          <p>A quick look at the newest bits before you dive back in.</p>
        </div>
        <div className="whats-new-list">
          {notes.map((item) => {
            const Icon = resolveIcon(item.icon);
            return (
              <article key={item.title}>
                <Icon size={22} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              </article>
            );
          })}
        </div>
        <div className="whats-new-actions">
          <Button type="button" variant="primary" onClick={closeModal}>
            Got it
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
