"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SettingsModal, type SettingsSection } from "./settings-modal";

interface SettingsModalContext {
  open(section?: SettingsSection): void;
  close(): void;
}

const NOOP: SettingsModalContext = { open: () => {}, close: () => {} };
const Ctx = createContext<SettingsModalContext>(NOOP);

/** Mounted once in the (app) layout; account menus call `open()`. */
export function SettingsModalHost({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("editor");

  const open = useCallback((next?: SettingsSection) => {
    if (next) setSection(next);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <SettingsModal
        open={isOpen}
        section={section}
        onSectionChange={setSection}
        onOpenChange={setIsOpen}
      />
    </Ctx.Provider>
  );
}

export function useSettingsModal(): SettingsModalContext {
  return useContext(Ctx);
}