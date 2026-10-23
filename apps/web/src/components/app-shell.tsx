"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/zuno/tooltip";
import type { LegalSession } from "@/lib/legal-session";

const LegalSessionContext = createContext<LegalSession | null>(null);

export function useLegalSession() {
  const session = useContext(LegalSessionContext);
  if (!session) throw new Error("useLegalSession must be used inside AppShell");
  return session;
}

export function AppShell({ session, children }: { session: LegalSession; children: ReactNode }) {
  return (
    <LegalSessionContext.Provider value={session}>
      <TooltipProvider>
        <SidebarProvider
          style={{
            "--sidebar-width": "var(--layout-sidebar-width)",
            "--sidebar-width-icon": "var(--layout-sidebar-collapsed-width)",
          } as CSSProperties}
        >
          <AppSidebar session={session} />
          <SidebarInset>
            <AppTopbar session={session} />
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="min-h-full min-w-0 flex-1 rounded-xl bg-muted/50 p-4 md:p-6">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </LegalSessionContext.Provider>
  );
}
