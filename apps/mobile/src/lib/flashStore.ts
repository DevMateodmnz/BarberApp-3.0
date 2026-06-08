/**
 * Flash message store — transient success/feedback messages.
 *
 * Used to carry a one-shot message across navigation boundaries,
 * e.g. showing "Service record created successfully" on the
 * Home screen after navigating back from the Record Service screen.
 */
import { create } from 'zustand';

interface FlashState {
  /** Current flash message, or null if none. */
  message: string | null;
  /** Sets a flash message for display on the next screen. */
  setMessage: (message: string) => void;
  /** Clears the current flash message. */
  clearMessage: () => void;
}

export const useFlashStore = create<FlashState>((set) => ({
  message: null,
  setMessage: (message: string) => set({ message }),
  clearMessage: () => set({ message: null }),
}));
