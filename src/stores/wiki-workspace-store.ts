import { create } from "zustand";
import { persist } from "zustand/middleware";
type SidePanel = "outline" | "backlinks" | "ai" | null;
interface WikiWorkspace {
  tabs: string[];
  initialized: boolean;
  propertiesOpen: boolean;
  editingPaths: string[];
  active: string | null;
  history: string[];
  at: number;
  bookmarks: string[];
  collapsed: string[];
  explorer: boolean;
  sidePanel: SidePanel;
  width: number;
  sort: "name" | "updated";
  open: (path: string) => void;
  close: (path: string) => string | null;
  travel: (offset: number) => string | null;
  bookmark: (path: string) => void;
  toggleFolder: (path: string) => void;
  setTabs: (tabs: string[]) => void;
}
export const useWikiWorkspace = create<WikiWorkspace>()(
  persist(
    (set, get) => ({
      tabs: [],
      initialized: false,
      propertiesOpen: true,
      editingPaths: [],
      active: null,
      history: [],
      at: -1,
      bookmarks: [],
      collapsed: [],
      explorer: true,
      sidePanel: null,
      width: 250,
      sort: "name",
      open: (path) =>
        set((s) => {
          const history = [...s.history.slice(0, s.at + 1), path].slice(-100);
          return {
            tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path],
            active: path,
            history,
            at: history.length - 1,
          };
        }),
      close: (path) => {
        const state = get(),
          index = state.tabs.indexOf(path),
          tabs = state.tabs.filter((p) => p !== path),
          active =
            state.active === path
              ? (tabs[Math.min(index, tabs.length - 1)] ?? null)
              : state.active;
        set({ tabs, active });
        return active;
      },
      travel: (offset) => {
        const s = get(),
          at = s.at + offset;
        if (at < 0 || at >= s.history.length) return null;
        const path = s.history[at];
        set({
          at,
          active: path,
          tabs: s.tabs.includes(path) ? s.tabs : [...s.tabs, path],
        });
        return path;
      },
      bookmark: (path) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(path)
            ? s.bookmarks.filter((p) => p !== path)
            : [...s.bookmarks, path],
        })),
      toggleFolder: (path) =>
        set((s) => ({
          collapsed: s.collapsed.includes(path)
            ? s.collapsed.filter((p) => p !== path)
            : [...s.collapsed, path],
        })),
      setTabs: (tabs) => set({ tabs }),
    }),
    {
      name: "resumer-wiki-workspace-v1",
      partialize: (s) => ({
        tabs: s.tabs,
        initialized: s.initialized,
        propertiesOpen: s.propertiesOpen,
        editingPaths: s.editingPaths,
        active: s.active,
        history: s.history,
        at: s.at,
        bookmarks: s.bookmarks,
        collapsed: s.collapsed,
        explorer: s.explorer,
        sidePanel: s.sidePanel,
        width: s.width,
        sort: s.sort,
      }),
    },
  ),
);
