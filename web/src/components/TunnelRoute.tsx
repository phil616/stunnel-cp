import type { Tunnel } from "../api";

function Endpoint({ value }: { value: string }) {
  const separator = value.lastIndexOf(":");
  return (
    <code title={value}>
      {value.slice(0, separator)}
      <wbr />
      <span className="endpoint-port">{value.slice(separator)}</span>
    </code>
  );
}

export function TunnelRoute({ tunnel }: { tunnel: Tunnel }) {
  return (
    <div className="route">
      <Endpoint value={tunnel.accept} />
      <Endpoint value={tunnel.connect} />
    </div>
  );
}
