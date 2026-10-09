"use client";

import React, { useEffect, useId, useRef } from "react";
import { lockBodyScroll } from "./body-scroll-lock";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";
  footer?: React.ReactNode;
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "lg",
  footer,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockBody = lockBodyScroll();
    const scrollableAncestors: { element: HTMLElement; overflow: string }[] = [];
    let ancestor = dialogRef.current?.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (/(auto|scroll)/.test(window.getComputedStyle(ancestor).overflowY)) {
        scrollableAncestors.push({ element: ancestor, overflow: ancestor.style.overflow });
        ancestor.style.overflow = "hidden";
      }
      ancestor = ancestor.parentElement;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBody();
      scrollableAncestors.forEach(({ element, overflow }) => { element.style.overflow = overflow; });
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        ref={dialogRef}
        className={`relative flex max-h-[calc(100dvh-2rem)] w-full flex-col sm:max-h-[calc(100dvh-3rem)] ${maxWidthMap[maxWidth]} bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-10 transition-all transform animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="text-lg font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
            >
              {title}
            </h3>
            {description && (
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                {description}
              </div>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600"
            aria-label="Đóng"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div data-modal-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 [scrollbar-gutter:stable] [--modal-scroll-padding:1.25rem] sm:[--modal-scroll-padding:1.5rem]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 p-4 sm:px-6 border-t border-slate-100 bg-slate-50/60">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
