"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** An XP-styled button that navigates (XP.css styles buttons, not links). */
export function NavButton({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onMouseEnter={() => router.prefetch(href)}
      onClick={() => router.push(href)}
    >
      {children}
    </button>
  );
}
