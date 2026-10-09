"use client";

import React, { useEffect, useId, useRef } from "react";
import { lockBodyScroll } from "./body-scroll-lock";

interface SlideOverDrawerProps {
  isOpen: boolean;
  suspended?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  extra?: React.ReactNode;
  footer?: React.ReactNode;
}

const widthClasses = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  full: "max-w-full",
};

export default function SlideOverDrawer({
  isOpen,
  suspended = false,
  onClose,
  title,
  subtitle,
  children,
  width = "3xl",
  extra,
  footer,
}: SlideOverDrawerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const wasSuspended = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (suspended) { wasSuspended.current = true; return; }
    if (!isOpen) { wasSuspended.current = false; return; }
    const resuming = wasSuspended.current;
    wasSuspended.current = false;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!resuming) returnFocusRef.current = previouslyFocused;
    const unlockBody = lockBodyScroll();
    const dialog = dialogRef.current;
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
    const focusFrame = window.requestAnimationFrame(() => { if (!resuming) closeButtonRef.current?.focus(); });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBody();
      scrollableAncestors.forEach(({ element, overflow }) => { element.style.overflow = overflow; });
      window.removeEventListener("keydown", handleKeyDown);
      if (!dialog?.closest("[inert]")) returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen, suspended]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" inert={suspended} aria-hidden={suspended || undefined}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div
          ref={dialogRef}
          className={`min-h-0 w-screen ${widthClasses[width]} bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform animate-in slide-in-from-right duration-300 ease-out`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal={suspended ? undefined : true}
          aria-labelledby={titleId}
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base sm:text-lg font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "Be Vietnam Pro, sans-serif" }}
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {extra}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-600"
                aria-label="Đóng bảng chi tiết can thiệp"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div data-modal-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-6 [scrollbar-gutter:stable]">
            {children}
          </div>

          {/* Optional Footer */}
          {footer && (
            <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
