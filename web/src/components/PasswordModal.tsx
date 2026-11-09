import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { api } from "../api";
import { errorMessage } from "../format";
import { Field, Modal } from "./ui";
export function PasswordModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const password = String(data.get("new_password"));
      if (password !== data.get("confirm_password"))
        throw new Error("两次输入的新密码不一致");
      await api("/account/password", "POST", {
        current_password: data.get("current_password"),
        new_password: password,
      });
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="修改管理员密码"
      description="修改后其他会话失效。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <Field label="当前密码">
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </Field>
        <Field label="新密码" hint="12–72 字节。">
          <input
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </Field>
        <Field label="确认新密码">
          <input
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
        </Field>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <KeyRound size={15} />
            )}
            更新密码
          </button>
        </div>
      </form>
    </Modal>
  );
}
