/**
 * ConfirmDialog — drop-in replacement for window.confirm().
 *
 * Usage (imperative, matches window.confirm ergonomics):
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm("Delete this notice?");
 *   if (!ok) return;
 *
 * Or with a title + description:
 *
 *   const ok = await confirm({
 *     title:       "Execute Academic Year Rollover?",
 *     description: "This cannot be undone.",
 *     confirmLabel: "Execute",
 *     danger:       true,
 *   });
 *
 * Mount <ConfirmDialogProvider /> once in AdminLayout (wrapping children).
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ─── Context ──────────────────────────────────────────────────────────────────

const ConfirmContext = createContext(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null); // { title, description, confirmLabel, danger }
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const opts =
      typeof options === "string"
        ? { title: options, description: null, confirmLabel: "Confirm", danger: false }
        : {
            title:        options.title        ?? "Are you sure?",
            description:  options.description  ?? null,
            confirmLabel: options.confirmLabel ?? "Confirm",
            danger:       options.danger       ?? false,
          };

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState(opts);
    });
  }, []);

  const handleClose = (result) => {
    setState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(open) => { if (!open) handleClose(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
          </DialogHeader>
          {state?.description && (
            <p className="text-sm text-gray-500 -mt-2 px-1">{state.description}</p>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              variant={state?.danger ? "destructive" : "default"}
              onClick={() => handleClose(true)}
            >
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmDialogProvider>");
  return ctx;
}
