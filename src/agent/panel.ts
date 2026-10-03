/**
 * Whether the agent's panel is open: apart from the agent itself (store.ts), so the top bar and the shortcut can open
 * it without the agent, and what it needs to answer, being fetched before it is opened.
 */
import { create } from 'zustand';

interface AgentPanel {
  open: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

export const useAgentPanel = create<AgentPanel>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
