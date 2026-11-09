import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Text } from "@mantine/core";
import { Modal } from "../components/ui";
const navigationEvent = "stcp:navigate";
export function navigateSafely(action: () => void) {
  const event = new CustomEvent<() => void>(navigationEvent, {
    cancelable: true,
    detail: action,
  });
  if (window.dispatchEvent(event)) action();
}
/** Drafts stay in component memory. All user-initiated exits use this guard. */
export function useUnsavedChanges(
  dirty: boolean,
  submitting: boolean,
  isSubmitting: () => boolean,
) {
  const state = useRef({ dirty, submitting, isSubmitting });
  state.current = { dirty, submitting, isSubmitting };
  const [confirming, setConfirming] = useState(false);
  const pending = useRef<null | (() => void)>(null);
  const requestClose = useCallback((action: () => void) => {
    const current = state.current;
    if (current.submitting || current.isSubmitting() || pending.current) return;
    if (!current.dirty) {
      action();
      return;
    }
    pending.current = action;
    setConfirming(true);
  }, []);
  const continueEditing = () => {
    pending.current = null;
    setConfirming(false);
  };
  const discard = () => {
    if (state.current.submitting || state.current.isSubmitting()) return;
    const action = pending.current;
    pending.current = null;
    setConfirming(false);
    action?.();
  };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (state.current.dirty || state.current.submitting) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const navigate = (event: Event) => {
      event.preventDefault();
      requestClose((event as CustomEvent<() => void>).detail);
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(navigationEvent, navigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(navigationEvent, navigate);
    };
  }, [requestClose]);
  const confirmation = confirming ? (
    <Modal
      title="放弃未保存的修改？"
      onClose={continueEditing}
      closeOnClickOutside={false}
      zIndex={400}
      footer={
        <>
          <Button data-autofocus onClick={continueEditing}>
            继续编辑
          </Button>
          <Button color="red" variant="light" onClick={discard}>
            放弃修改
          </Button>
        </>
      }
    >
      <Text size="sm">尚有未保存的内容。放弃后无法恢复。</Text>
    </Modal>
  ) : null;
  return { requestClose, confirming, confirmation };
}
