import { useEffect, useRef, useState } from "react";

export function LanguageSelect({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <label className="field">
      <span>{label}</span>
      <div className={`custom-select${open ? " custom-select--open" : ""}`} ref={rootRef}>
        <button type="button" className="custom-select__trigger" onClick={() => setOpen((current) => !current)}>
          <span>{selected.label}</span>
          <span className="custom-select__caret">{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className="custom-select__menu">
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
          </div>
        ) : null}
      </div>
    </label>
  );
}
