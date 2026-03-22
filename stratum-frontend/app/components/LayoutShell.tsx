"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import AppShell from "./AppShell";
import { ACCESS_TOKEN_KEY } from "@/lib/api";

export default function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const isPublicRoute = pathname === "/" || pathname.startsWith("/signin");

  useEffect(() => {
    if (isPublicRoute) {
      setAuthChecked(true);
      return;
    }

    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      router.replace("/");
      return;
    }

    setAuthChecked(true);
  }, [isPublicRoute, router]);

  // Keep public routes clean: no persistent app shell.
  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!authChecked) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
