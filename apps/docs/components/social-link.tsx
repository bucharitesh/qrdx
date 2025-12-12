"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface SocialLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function SocialLink({ href, children, className }: SocialLinkProps) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </Link>
  );
}








