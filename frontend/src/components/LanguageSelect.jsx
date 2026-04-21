import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function LanguageSelect({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (!open) {
      return undefined;
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return undefined;
    }

    function updateMenuPosition() {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const viewportPadding = 16;
      const availableHeightBelow = window.innerHeight - rect.bottom - viewportPadding;
      const availableHeightAbove = rect.top - viewportPadding;
      const openUpward = availableHeightBelow < 220 && availableHeightAbove > availableHeightBelow;
      const maxHeight = Math.max(160, openUpward ? availableHeightAbove - 8 : availableHeightBelow - 8);

      setMenuStyle({
        left: rect.left,
        top: openUpward ? "auto" : rect.bottom + 8,
        bottom: openUpward ? window.innerHeight - rect.top + 8 : "auto",
        width: rect.width,
        maxHeight,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <label className="field">
      <span>{label}</span>
      <div className={`custom-select${open ? " custom-select--open" : ""}`} ref={rootRef}>
        <button
          type="button"
          className="custom-select__trigger"
          ref={triggerRef}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected.label}</span>
          <span className="custom-select__caret">{open ? "▲" : "▼"}</span>
        </button>
      </div>

      {open && menuStyle
        ? createPortal(
            <div className="custom-select__menu custom-select__menu--portal" ref={menuRef} style={menuStyle}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`custom-select__option${option.value === value ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </label>
  );
}
