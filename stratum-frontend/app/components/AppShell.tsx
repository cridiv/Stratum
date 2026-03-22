"use client";

import type { ReactNode } from "react";
import SideBar, { SidebarProvider, useSidebar } from "./SideBar";
import ThemeProvider from "./ThemeProvider";

function ShellContent({ children }: { children: ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <div
      className={[
        "min-h-screen transition-[padding] duration-200 ease-out",
        isOpen ? "pl-55" : "pl-0",
      ].join(" ")}
    >
      <main className="min-h-screen">{children}</main>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <SideBar />
        <ShellContent>{children}</ShellContent>
      </SidebarProvider>
    </ThemeProvider>
  );
}
