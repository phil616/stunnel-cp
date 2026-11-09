import { useEffect, useRef, useId, cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { Shield, X, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { certificateState } from "../api";
import type { Certificate } from "../api";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Shield size={23} strokeWidth={1.8} />
        <span />
      </span>
      <div>stunnel</div>
    </div>
  );
}
export function Badge({
  kind = "valid",
  children,
}: {
  kind?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${kind}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function CertBadge({ certificate }: { certificate?: Certificate }) {
  if (!certificate) return <Badge kind="expired">未关联</Badge>;
  const state = certificateState(certificate);
  return (
    <Badge kind={state}>
      {
        {
          valid: "有效",
          expiring: "即将到期",
          expired: "已过期",
          revoked: "已吊销",
        }[state]
      }
    </Badge>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`icon-button ${danger ? "danger-text" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} />
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const content = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{ id?: string; "aria-describedby"?: string }>,
        { id, "aria-describedby": hint ? id + "-hint" : undefined },
      )
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {content}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Empty({
  icon: Icon,
  title,
  description,
  action,
  label,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <button className="button secondary small" onClick={action}>
          <Plus size={15} />
          {label}
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton icon={X} label="关闭对话框" onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
