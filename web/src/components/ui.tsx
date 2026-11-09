import {
  ActionIcon,
  Badge as MantineBadge,
  Button,
  Modal as MantineModal,
  Text,
  Tooltip,
} from "@mantine/core";
import type { ReactNode } from "react";
import { Network, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { certificateState } from "../api";
import type { Certificate } from "../api";
export function Brand() {
  return (
    <div className="brand">
      <Network className="brand-icon" size={36} aria-hidden="true" />
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
  const colors: Record<string, string> = {
    valid: "forest",
    disabled: "gray",
    expired: "red",
    revoked: "red",
    expiring: "yellow",
    blue: "blue",
  };
  return (
    <MantineBadge
      className="status-badge"
      variant="light"
      color={colors[kind] || "forest"}
      size="lg"
      tt="none"
    >
      {children}
    </MantineBadge>
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
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="subtle"
        color={danger ? "red" : "forest"}
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        size="lg"
      >
        <Icon size={17} />
      </ActionIcon>
    </Tooltip>
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
        <Button
          variant="light"
          leftSection={<Plus size={15} />}
          mt="md"
          onClick={action}
        >
          {label}
        </Button>
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
  closeOnClickOutside = true,
  closeOnEscape = true,
  busy = false,
  zIndex = 200,
  trapFocus = true,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  busy?: boolean;
  zIndex?: number;
  trapFocus?: boolean;
  footer?: ReactNode;
}) {
  return (
    <MantineModal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        <Text component="h2" fw={600} size="lg" lh={1.4}>
          {title}
        </Text>
      }
      size={wide ? "44rem" : "30rem"}
      classNames={{
        content: "dialog-shell",
        header: "dialog-header",
        title: "dialog-title",
        body: "dialog-layout",
        close: "dialog-close",
      }}
      xOffset={16}
      yOffset={16}
      closeOnClickOutside={closeOnClickOutside && !busy}
      closeOnEscape={closeOnEscape && !busy}
      closeButtonProps={{ "aria-label": "关闭对话框", disabled: busy }}
      returnFocus
      trapFocus={trapFocus}
      zIndex={zIndex}
    >
      <div className="dialog-content">
        {description && (
          <Text size="sm" c="dimmed" mb="lg">
            {description}
          </Text>
        )}
        {children}
      </div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </MantineModal>
  );
}
