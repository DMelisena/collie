import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router";
import { ListTree, ScrollText, X } from "lucide-react";

import { RouteHeader } from "@/components/app-header";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import type { HistoryData } from "@/lib/loaders";
import { panePath } from "@/lib/nav";
import { summaryFeedOf } from "@/lib/summary-feed";
import { useRootData } from "@/lib/route-data";
import { t } from "@/lib/i18n";
import { useLocale } from "@/hooks/use-locale";
import { useNav } from "@/hooks/use-nav";
import { cn } from "@/lib/utils";

// One agent's summary chat (Captain's brief): a rolling feed of summaries that reads like a
// conversation, never the raw turns. LAZY ON PURPOSE — same loader as the History route
// (`historyLoader`), same journal read, and the only new work is the pure projection
// (`lib/summary-feed.ts`) that folds those entries down to existing-summary-or-recap items. The
// shortcut to the full live session is the pane route this screen is a child of; "back" already
// lands there (the same rule `historyPath` states), and the header also offers it as a direct tap.

export function SummaryRoute() {
  // SAFETY: this route's loader is `historyLoader`, the same one `/pane/:paneId/history` uses, and
  // it returns `HistoryData`. React Router types a data-mode `useLoaderData()` as `unknown`.
  const data = useLoaderData() as HistoryData;
  useLocale();
  const root = useRootData();
  const { paneId = "" } = useParams();
  const nav = useNav();
  const scope = data.scope;

  const agent =
    root.agents.find((a) => a.paneId === paneId) ?? root.shellPanes.find((p) => p.paneId === paneId);
  const title = agent?.paneLabel ?? agent?.sessionName ?? agent?.workspaceLabel ?? paneId;

  const feed = useMemo(() => summaryFeedOf(data.entries), [data.entries]);
  const up = () => nav.up(panePath(paneId, scope));

  return (
    <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[100dvw] flex-1 flex-col md:max-w-screen-md lg:max-w-screen-lg xl:max-w-screen-xl 2xl:max-w-[1400px]">
      <RouteHeader
        onHome={up}
        width="wide"
        rightLead={
          // The shortcut the Captain's brief asks for: one tap from the summary straight to the
          // existing full live session view — the same pane route "back" already lands on, offered
          // here too so it never costs a second navigation to find it.
          <button
            type="button"
            onClick={up}
            aria-label={t("summary.openFullSession")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/60"
          >
            <ListTree className="size-4" />
          </button>
        }
        rightTrail={
          <button
            type="button"
            onClick={up}
            aria-label={t("summary.closeAria")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted/60"
          >
            <X className="size-4" />
          </button>
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ScrollText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-semibold leading-tight">{t("summary.title")}</span>
          </div>
          <div className="truncate text-xs leading-tight text-muted-foreground">{title}</div>
        </div>
      </RouteHeader>

      <div className="relative min-h-0 min-w-0 flex-1">
        <ChatMessageList clearBand={12} className="px-3 py-3">
          {feed.length === 0 ? (
            <div className="px-2 py-16 text-center text-sm leading-relaxed text-muted-foreground">
              {t("summary.empty")}
            </div>
          ) : (
            feed.map((item) => (
              <div
                key={item.id}
                data-slot="summary-item"
                className={cn(
                  "mb-2 rounded-md border px-3 py-2 text-sm",
                  item.kind === "existing"
                    ? "border-border bg-muted/30"
                    : "border-dashed border-muted-foreground/30",
                )}
              >
                <p className="font-content whitespace-pre-wrap break-words">{item.text}</p>
              </div>
            ))
          )}
        </ChatMessageList>
      </div>
    </div>
  );
}
