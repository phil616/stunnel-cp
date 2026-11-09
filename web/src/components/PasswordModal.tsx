import { useId, useRef, useState } from "react";
import { Alert, Button, PasswordInput, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { api } from "../api";
import { errorMessage } from "../format";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { Modal } from "./ui";
export function PasswordModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const formId = useId();
  const form = useForm({
    initialValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
    validate: {
      confirm_password: (value, values) =>
        value === values.new_password ? null : "两次输入的新密码不一致",
    },
  });
  const guard = useUnsavedChanges(
    form.isDirty(),
    busy,
    () => submitting.current,
  );
  async function submit(values: typeof form.values) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/account/password", "POST", {
        current_password: values.current_password,
        new_password: values.new_password,
      });
      form.reset();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        title="修改管理员密码"
        description="修改后其他会话失效。"
        closeOnClickOutside={false}
        closeOnEscape={!guard.confirming}
        trapFocus={!guard.confirming}
        busy={busy}
        footer={
          <>
            <Button
              variant="default"
              disabled={busy || guard.confirming}
              onClick={() => guard.requestClose(onClose)}
            >
              取消
            </Button>
            <Button
              type="submit"
              form={formId}
              loading={busy}
              disabled={busy || guard.confirming}
            >
              更新密码
            </Button>
          </>
        }
        onClose={() => guard.requestClose(onClose)}
      >
        <form id={formId} onSubmit={form.onSubmit(submit)}>
          <fieldset className="form-fields" disabled={busy || guard.confirming}>
            <Stack gap="md">
              <PasswordInput
                label="当前密码"
                autoComplete="current-password"
                required
                data-autofocus
                {...form.getInputProps("current_password")}
              />
              <PasswordInput
                label="新密码"
                description="12–72 字节。"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
                {...form.getInputProps("new_password")}
              />
              <PasswordInput
                label="确认新密码"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
                {...form.getInputProps("confirm_password")}
              />
            </Stack>
          </fieldset>
          {error && (
            <Alert color="red" role="alert" mt="md">
              {error}
            </Alert>
          )}
        </form>
      </Modal>
      {guard.confirmation}
    </>
  );
}
