import { create } from 'zustand';

let nextId = 0;

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'error', duration = 4000) => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default useToastStore;

// Convenience helpers — call these outside of React components too
export const toast = {
  error:   (msg) => useToastStore.getState().addToast(msg, 'error'),
  success: (msg) => useToastStore.getState().addToast(msg, 'success', 3000),
  info:    (msg) => useToastStore.getState().addToast(msg, 'info',    3000),
};
