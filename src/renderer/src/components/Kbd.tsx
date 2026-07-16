/**
 * Keyboard hint cap (DESIGN v3 §4): 9px Geist Mono, 1px border, radius 3.
 * Standalone in copy ("press ⌘K") or inside a Button via its `kbd` prop.
 */
export function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <kbd className="kbd">{children}</kbd>
}
