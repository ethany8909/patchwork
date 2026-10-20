// Small shared building blocks.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { back } from "../router";
import { Icon, type IconName } from "./Icon";
import type { Option } from "../data/options";

export function ScreenHeader({ title, onBack, action, sub }: {
  title: string;
  sub?: string;
  onBack?: (() => void) | true;
  action?: ComponentChildren;
}) {
  return (
    <header class="screen-header">
      {onBack && (
        <button class="icon-btn" aria-label="Back" onClick={() => (onBack === true ? back() : onBack())}>
          <Icon name="back" />
        </button>
      )}
      <div class="screen-header__text">
        <h1 tabIndex={-1} data-autofocus>{title}</h1>
        {sub && <p class="muted">{sub}</p>}
      </div>
      {action && <div class="screen-header__action">{action}</div>}
    </header>
  );
}

export function Card({ children, class: cls = "", title, icon }: { children: ComponentChildren; class?: string; title?: string; icon?: IconName }) {
  return (
    <section class={`card ${cls}`}>
      {title && (
        <h2 class="card__title">
          {icon && <Icon name={icon} size={18} />}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** 0-10 scale as large tap targets, with the number always visible (never color alone). */
export function ItchScale({ value, onChange, label = "Worst itch in the last 24 hours" }: {
  value: number | null;
  onChange: (v: number) => void;
  label?: string;
}) {
  return (
    <fieldset class="scale">
      <legend class="sr-only">{label}</legend>
      <div class="scale__row">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            type="button"
            class={`scale__btn itch-${n}`}
            aria-pressed={value === n}
            aria-label={`${n} out of 10`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div class="scale__ends muted" aria-hidden="true">
        <span>No itch</span>
        <span>Worst imaginable</span>
      </div>
    </fieldset>
  );
}

/** Each step of a multi-step flow starts at the top, with its heading announced to screen readers. */
export function useStepStart(step: number) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [step]);
}

/** Toggle an id in a list (used with functional state updates so fast taps never drop a selection). */
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function Chips({ options, selected, onToggle, label }: {
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  label: string;
}) {
  const [openHint, setOpenHint] = useState<string | null>(null);
  const toggle = onToggle;
  const hint = options.find((o) => o.id === openHint)?.hint;
  return (
    <fieldset class="chips-field">
      <legend class="sr-only">{label}</legend>
      <div class="chips">
        {options.map((o) => (
          <span class="chip-wrap">
            <button
              type="button"
              class={`chip ${o.warn ? "chip--warn" : ""}`}
              aria-pressed={selected.includes(o.id)}
              onClick={() => toggle(o.id)}
            >
              {selected.includes(o.id) && <Icon name="check" size={16} />}
              {o.label}
            </button>
            {o.hint && (
              <button
                type="button"
                class="chip-info"
                aria-label={`What does "${o.label}" mean?`}
                aria-expanded={openHint === o.id}
                onClick={() => setOpenHint(openHint === o.id ? null : o.id)}
              >
                <Icon name="info" size={16} />
              </button>
            )}
          </span>
        ))}
      </div>
      {hint && <p class="hint" role="note">{hint}</p>}
    </fieldset>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label class="toggle-row">
      <span>
        <span class="toggle-row__label">{label}</span>
        {description && <span class="toggle-row__desc muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

/** Accessible modal: traps focus, closes on Escape, restores focus afterwards. */
export function Sheet({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} class="sheet" onClose={onClose} onCancel={onClose} aria-label={title}>
      {open && (
        <div class="sheet__inner">
          <div class="sheet__head">
            <h2>{title}</h2>
            <button class="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty__icon"><Icon name={icon} size={28} /></div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div class="spinner" role="status">
      <span class="spinner__dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function PasswordField({ id, label, value, onInput, autoComplete, autoFocus, invalid, describedBy }: {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  autoComplete: "new-password" | "current-password";
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="field__with-btn">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          spellcheck={false}
          autoCapitalize="off"
          onInput={(e) => onInput(e.currentTarget.value)}
        />
        <button type="button" class="field__btn" onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
