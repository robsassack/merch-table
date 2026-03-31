"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function AdminDialogPortal(props: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(props.children, document.body);
}
