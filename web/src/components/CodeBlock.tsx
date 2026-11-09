import { Copy } from "lucide-react";
import { IconButton } from "./ui";
export function CodeBlock({
  label,
  code,
  copy,
}: {
  label: string;
  code: string;
  copy: (value: string) => Promise<void>;
}) {
  return (
    <div className="code-block">
      <div>
        {label}
        <IconButton
          icon={Copy}
          label={`复制${label}`}
          onClick={() => copy(code)}
        />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
