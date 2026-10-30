import { create } from 'zustand';

type ModalType = 'create-resume' | 'settings' | 'jd-analysis' | 'translate' | 'export' | 'import' | 'generate-resume' | 'grammar-check' | 'journal' | 'cover-letter' | 'interview' | 'version-history' | null;

interface UIStore {
  sidebarOpen: boolean;
  activeModal: ModalType;
  returnModal: ModalType;
  theme: 'light' | 'dark' | 'system';
  settingsTab: string;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setSettingsTab: (tab: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  activeModal: null,
  returnModal: null,
  theme: (localStorage.getItem('resumer_appearance') as 'light' | 'dark' | 'system') || 'light',
  settingsTab: 'general',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (modal) => set((state) => ({
    activeModal: modal,
    returnModal: modal === 'settings' && state.activeModal !== 'settings' ? state.activeModal : modal === 'settings' ? state.returnModal : null,
  })),
  closeModal: () => set((state) => ({ activeModal: state.activeModal === 'settings' ? state.returnModal : null, returnModal: null })),
  setTheme: (theme) => { localStorage.setItem('resumer_appearance', theme); set({ theme }); },
  setSettingsTab: (tab) => set({ settingsTab: tab }),
}));
