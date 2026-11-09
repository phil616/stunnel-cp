import { Tabs, TextInput } from "@mantine/core";
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
          <Tabs value={modeFilter} onChange={(v) => setModeFilter(v || "all")}>
            <Tabs.List>
              <Tabs.Tab value="all">
                全部隧道 ({snapshot.tunnels.length})
              </Tabs.Tab>
              <Tabs.Tab value="server">服务端</Tabs.Tab>
              <Tabs.Tab value="client">客户端</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <TextInput
            aria-label="搜索隧道"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称或地址…"
            leftSection={<Search size={16} />}
          />
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
