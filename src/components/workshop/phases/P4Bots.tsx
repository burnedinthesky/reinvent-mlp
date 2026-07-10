/* P4 · Expedition entry point — the phase was split into src/.../phases/p4/ during
   the training-loop redesign (P4 redesign §6). This re-export keeps the stable
   import path (`./phases/P4Bots`) that AppShell uses. */

export { P4Bots } from "./p4/P4Bots";
