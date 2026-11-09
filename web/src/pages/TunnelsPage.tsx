import { Search } from "lucide-react";
import { Empty } from "../components/ui";
import type { Snapshot, Tunnel } from "../api";
import type { ReactNode } from "react";

export function TunnelsPage({
  snapshot,
  modeFilter,
  setModeFilter,
  query,
  setQuery,
  filteredTunnels,
  tunnelTable,
}: {
  snapshot: Snapshot;
  modeFilter: string;
  setModeFilter: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  filteredTunnels: Tunnel[];
  tunnelTable: (items: Tunnel[], compact?: boolean) => ReactNode;
}) {
  return (
    <>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs">
            {[
              ["all", "全部隧道"],
              ["server", "服务端"],
              ["client", "客户端"],
            ].map(([id, label]) => (
              <button
                className={modeFilter === id ? "selected" : ""}
                key={id}
                onClick={() => setModeFilter(id)}
              >
                {label}
                {id === "all" && <span>{snapshot.tunnels.length}</span>}
              </button>
            ))}
          </div>
          <div className="filter-input">
            <Search size={16} />
            <input
              aria-label="搜索隧道"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称或地址…"
            />
          </div>
        </div>
        {query && filteredTunnels.length === 0 ? (
          <Empty icon={Search} title="没有匹配的隧道" />
        ) : (
          tunnelTable(filteredTunnels)
        )}
      </section>
    </>
  );
}
