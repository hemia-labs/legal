"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import type { LegalSession } from "@/lib/legal-session";

const LegalSessionContext = createContext<LegalSession | null>(null);

export function useLegalSession() {
  const session = useContext(LegalSessionContext);
  if (!session) throw new Error("useLegalSession must be used inside AppShell");
  return session;
}

export function AppShell({ session, children }: { session: LegalSession; children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <LegalSessionContext.Provider value={session}>
      <div className="flex min-h-screen">
        <AppSidebar session={session} collapsed={sidebarCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar
            session={session}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={() => setSidebarCollapsed((current) => !current)}
          />
          <main className="min-w-0 flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </LegalSessionContext.Provider>
  );
}
