"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function scrollToToday() {
  const node = document.querySelector("[data-scroll-today]");
  if (node instanceof HTMLElement) node.scrollLeft = Number(node.getAttribute("data-scroll-today")) || 0;
}

function onChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const form = target.form;
  if (form?.hasAttribute("data-report-form")) {
    const query = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value !== "string" || value === "" || (key === "project" && value === "all")) return;
      query.set(key, value);
    });
    const search = query.toString();
    const action = form.getAttribute("action") ?? "";
    location.assign(action + (search ? `?${search}` : ""));
    return;
  }
  const base = target.getAttribute("data-status-go");
  if (!base) return;
  const value = target.value;
  location.assign(value === "all" ? base : `${base}?status=${encodeURIComponent(value)}#activities`);
}

function onClick(event: MouseEvent) {
  const box = document.getElementById("nav-mobile");
  if (!(box instanceof HTMLInputElement) || !box.checked) return;
  const target = event.target;
  if (target instanceof Element && target.closest("aside a")) box.checked = false;
}

export function DocumentListeners() {
  const pathname = usePathname();

  useEffect(() => {
    document.addEventListener("change", onChange);
    document.addEventListener("click", onClick);
    scrollToToday();
    return () => {
      document.removeEventListener("change", onChange);
      document.removeEventListener("click", onClick);
    };
  }, [pathname]);

  return null;
}
