"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DISCARD_CHANGES_MESSAGE, useUnsavedChanges } from "@/lib/use-unsaved-changes";

export function useDialogClose(isOpen: boolean, onClose: () => void, busy: boolean, dirty?: boolean) {
  const [state, setState] = useState({ open: isOpen, edited: false });
  if (state.open !== isOpen) setState({ open: isOpen, edited: false });
  const edited = state.open === isOpen && state.edited;
  useUnsavedChanges(isOpen && (dirty ?? edited));
  const markChanged = (event: FormEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("form")) setState({ open: isOpen, edited: true });
  };
  const requestClose = useCallback(() => {
    if (busy) return;
    if (!(dirty ?? edited) || window.confirm(DISCARD_CHANGES_MESSAGE)) onClose();
  }, [busy, dirty, edited, onClose]);
  return { requestClose, markChanged };
}
