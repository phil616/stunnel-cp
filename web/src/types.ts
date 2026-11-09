export type Page =
  | "overview"
  | "tunnels"
  | "certificates"
  | "authorities"
  | "audit"
  | "guide"
  | "pki-guide"
  | "operations";
export interface Confirmation {
  title: string;
  description: string;
  action: () => Promise<void>;
}
