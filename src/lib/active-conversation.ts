// Tiny module-level signal for which conversation the user is actively viewing.
// Used by the global notifier to suppress toasts for the open chat.
let activeId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export const getActiveConversationId = () => activeId;

export const setActiveConversationId = (id: string | null) => {
  activeId = id;
  listeners.forEach((l) => l(id));
};

export const subscribeActiveConversation = (cb: (id: string | null) => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
