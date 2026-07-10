/* The React context object + consumer hook, split out from WorkshopProvider so
   editing the provider logic doesn't recreate `createContext` on Fast Refresh.

   Why the split: a file that exports both a component (WorkshopProvider) and a
   non-component runtime value (useWorkshop) is not a clean Fast-Refresh
   boundary. On HMR the module re-runs, minting a NEW context object, while the
   already-mounted Provider fiber still holds the OLD one — so a re-rendered
   consumer reads the new (null) context and throws "useWorkshop must be used
   within WorkshopProvider". Keeping the context object here — in a module that
   isn't touched when the provider is edited — pins one stable identity that the
   provider and every consumer agree on across refreshes. */

import { createContext, useContext } from "react";

import type { WorkshopContextValue } from "./WorkshopContext";

export const WorkshopContext = createContext<WorkshopContextValue | null>(null);

export function useWorkshop(): WorkshopContextValue {
    const ctx = useContext(WorkshopContext);
    if (!ctx)
        throw new Error("useWorkshop must be used within WorkshopProvider");
    return ctx;
}
