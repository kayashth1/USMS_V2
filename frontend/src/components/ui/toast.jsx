/**
 * Toast — lightweight in-app notification system.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success("Saved successfully");
 *   toast.error("Something went wrong");
 *   toast.info("3 records updated");
 *
 * Mount <Toaster /> once at the root (AdminLayout). That's it.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, type = "success", duration = 3500) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg, dur) => push(msg, "success", dur),
    error:   (msg, dur) => push(msg, "error",   dur ?? 5000),
    info:    (msg, dur) => push(msg, "info",     dur),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return { toast: ctx };
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

const ICONS = {
  success: <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />,
  error:   <XCircle    className="h-4 w-4 text-red-500   shrink-0 mt-0.5" />,
  info:    <Info       className="h-4 w-4 text-blue-500  shrink-0 mt-0.5" />,
};

const STYLES = {
  success: "border-green-200 bg-white",
  error:   "border-red-200   bg-white",
  info:    "border-blue-200  bg-white",
};

function Toast({ id, message, type, onDismiss }) {
  const [visible, setVisible] = useState(false);

  // Slide-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "flex items-start gap-3 w-80 rounded-lg border px-4 py-3 shadow-md",
        "transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        STYLES[type] ?? STYLES.info,
      ].join(" ")}
    >
      {ICONS[type] ?? ICONS.info}
      <p className="flex-1 text-sm text-gray-800 leading-snug">{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
