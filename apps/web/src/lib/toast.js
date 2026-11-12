// react-toastify-compatible toast API on top of sonner.
//
// Call sites (App.jsx task toasts, settings) are shared with upstream and use
// the react-toastify API: toast.info/success/error/warning(message, options),
// toast.update(id, { render, type, autoClose }), toast.isActive(id),
// toast.dismiss(id), and options { toastId, autoClose, onClose, hideProgressBar }.
// Keeping that API means upstream logic patches still apply after the switch.
import { createElement } from "react";
import { toast as sonnerToast } from "sonner";
import { BarracksToast } from "@/components/ui/sonner";

const DEFAULT_DURATION_MS = 5000;
const active = new Map(); // id -> { type, message, duration, showProgress, onClose, version }
let generatedIds = 0;

function toDuration(autoClose) {
  if (autoClose === false) return Infinity;
  const value = Number(autoClose);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DURATION_MS;
}

function closed(id) {
  const entry = active.get(id);
  if (!entry) return;
  active.delete(id);
  entry.onClose?.();
}

function render(id, entry) {
  active.set(id, entry);
  sonnerToast.custom(
    () =>
      createElement(BarracksToast, {
        id,
        type: entry.type,
        message: entry.message,
        duration: entry.duration,
        showProgress: entry.showProgress,
        version: entry.version,
      }),
    {
      id,
      duration: entry.duration,
      onDismiss: () => closed(id),
      onAutoClose: () => closed(id),
    }
  );
  return id;
}

function show(type, message, options = {}) {
  const id = options.toastId ?? `barracks-toast-${++generatedIds}`;
  const previous = active.get(id);
  return render(id, {
    type,
    message,
    duration: toDuration(options.autoClose),
    showProgress: options.hideProgressBar !== true,
    onClose: options.onClose ?? previous?.onClose,
    version: (previous?.version ?? -1) + 1,
  });
}

function update(id, options = {}) {
  const previous = active.get(id);
  if (!previous) return;
  render(id, {
    ...previous,
    type: options.type ?? previous.type,
    message: options.render ?? previous.message,
    duration: options.autoClose === undefined ? previous.duration : toDuration(options.autoClose),
    showProgress: options.hideProgressBar === undefined ? previous.showProgress : options.hideProgressBar !== true,
    onClose: options.onClose ?? previous.onClose,
    version: previous.version + 1,
  });
}

export const toast = Object.assign((message, options) => show("info", message, options), {
  info: (message, options) => show("info", message, options),
  success: (message, options) => show("success", message, options),
  warning: (message, options) => show("warning", message, options),
  warn: (message, options) => show("warning", message, options),
  error: (message, options) => show("error", message, options),
  update,
  isActive: (id) => active.has(id),
  dismiss: (id) => {
    if (id === undefined) {
      sonnerToast.dismiss();
      [...active.keys()].forEach(closed);
      return;
    }
    sonnerToast.dismiss(id);
    closed(id);
  },
});

export default toast;
