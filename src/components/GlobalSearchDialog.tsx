import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Calendar,
  FileText,
  FolderKanban,
  Layers,
  MessageSquareText,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppData } from "@/lib/app-data";
import { formatDateId, POINT_SOURCE_META, POINT_SOURCES } from "@/lib/formatters";
import type { PointSource } from "@/lib/local-db";
import { searchDocumentation, type SearchResult } from "@/lib/project-search";
import { cn } from "@/lib/utils";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_META: Record<
  SearchResult["kind"],
  { label: string; icon: typeof FolderKanban; badgeClass: string }
> = {
  project: {
    label: "Proyek",
    icon: FolderKanban,
    badgeClass: "border-primary/20 bg-primary/8 text-primary",
  },
  feature: {
    label: "Fitur",
    icon: Layers,
    badgeClass: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  point: {
    label: "Poin Pelanggan",
    icon: MessageSquareText,
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const { snapshot } = useAppData();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState<string>("all");
  const [featureId, setFeatureId] = useState<string>("all");
  const [source, setSource] = useState<PointSource | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const activeProjects = useMemo(
    () =>
      snapshot.projects
        .filter((project) => project.deletedAt === null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [snapshot.projects],
  );

  const activeFeatures = useMemo(() => {
    const activeProjectIds = new Set(activeProjects.map((project) => project.id));
    return snapshot.features
      .filter(
        (feature) =>
          feature.deletedAt === null &&
          activeProjectIds.has(feature.projectId) &&
          (projectId === "all" || feature.projectId === projectId),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [snapshot.features, activeProjects, projectId]);

  const hasFilters =
    projectId !== "all" ||
    featureId !== "all" ||
    source !== "all" ||
    dateFrom !== "" ||
    dateTo !== "";

  const results = useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();
    if (trimmed) {
      return searchDocumentation(snapshot, trimmed, {
        ...(projectId !== "all" ? { projectId } : {}),
        ...(featureId !== "all" ? { featureId } : {}),
        ...(source !== "all" ? { source } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
    }

    if (!hasFilters) return [];

    // When filters are active without a query, show matching customer points so filters stay useful.
    const projectMap = new Map(activeProjects.map((project) => [project.id, project]));
    const featureMap = new Map(
      snapshot.features
        .filter((feature) => feature.deletedAt === null && projectMap.has(feature.projectId))
        .map((feature) => [feature.id, feature]),
    );

    return snapshot.points
      .filter((point) => {
        if (point.deletedAt !== null) return false;
        const feature = featureMap.get(point.featureId);
        const project = feature ? projectMap.get(feature.projectId) : undefined;
        if (!feature || !project) return false;
        if (projectId !== "all" && project.id !== projectId) return false;
        if (featureId !== "all" && feature.id !== featureId) return false;
        if (source !== "all" && point.source !== source) return false;
        if (dateFrom && point.mentionedOn < dateFrom) return false;
        if (dateTo && point.mentionedOn > dateTo) return false;
        return true;
      })
      .map((point): SearchResult => {
        const feature = featureMap.get(point.featureId)!;
        const project = projectMap.get(feature.projectId)!;
        return {
          id: point.id,
          kind: "point",
          projectId: project.id,
          projectName: project.name,
          featureId: feature.id,
          featureName: feature.name,
          targetId: `point-${point.id}`,
          text: point.content,
          date: point.mentionedOn,
          source: point.source,
          ...(point.statedBy ? { statedBy: point.statedBy } : {}),
        };
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [query, snapshot, projectId, featureId, source, dateFrom, dateTo, hasFilters, activeProjects]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, projectId, featureId, source, dateFrom, dateTo, open]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  function resetFilters() {
    setProjectId("all");
    setFeatureId("all");
    setSource("all");
    setDateFrom("");
    setDateTo("");
  }

  function openResult(result: SearchResult) {
    onOpenChange(false);
    void navigate({
      to: "/projects/$projectId",
      params: { projectId: result.projectId },
      search: { target: result.targetId },
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && document.activeElement === inputRef.current) {
      const selected = results[activeIndex];
      if (selected) {
        event.preventDefault();
        openResult(selected);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Pencarian Global Dokumentasi</DialogTitle>
          <DialogDescription>
            Cari proyek, catatan alur proses, fitur, atau poin kebutuhan pelanggan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari proyek, alur proses, fitur, atau poin pelanggan..."
            aria-label="Kata kunci pencarian global"
            className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant={showFilters || hasFilters ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFilters((prev) => !prev)}
            className="shrink-0 gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filter</span>
            {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </Button>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </div>

        {(showFilters || hasFilters) && (
          <div className="border-b bg-muted/35 px-4 py-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Proyek</Label>
                <Select
                  value={projectId}
                  onValueChange={(value) => {
                    setProjectId(value);
                    setFeatureId("all");
                  }}
                >
                  <SelectTrigger className="h-8 bg-background text-xs">
                    <SelectValue placeholder="Semua proyek" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua proyek</SelectItem>
                    {activeProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Fitur</Label>
                <Select value={featureId} onValueChange={setFeatureId}>
                  <SelectTrigger className="h-8 bg-background text-xs">
                    <SelectValue placeholder="Semua fitur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua fitur</SelectItem>
                    {activeFeatures.map((feature) => (
                      <SelectItem key={feature.id} value={feature.id}>
                        {feature.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Sumber Poin</Label>
                <Select
                  value={source}
                  onValueChange={(value) => setSource(value as PointSource | "all")}
                >
                  <SelectTrigger className="h-8 bg-background text-xs">
                    <SelectValue placeholder="Semua sumber" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua sumber</SelectItem>
                    {POINT_SOURCES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {POINT_SOURCE_META[item].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Rentang Tanggal Poin</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    aria-label="Dari tanggal"
                    className="h-8 bg-background px-2 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">-</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    aria-label="Sampai tanggal"
                    className="h-8 bg-background px-2 text-xs"
                  />
                </div>
              </div>
            </div>

            {hasFilters && (
              <div className="mt-2.5 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset filter
                </Button>
              </div>
            )}
          </div>
        )}

        <ScrollArea className="max-h-[380px]">
          <div className="p-3">
            {!query.trim() && !hasFilters ? (
              <div className="space-y-4 px-2 py-3">
                <div className="rounded-xl border bg-muted/35 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Tips Pencarian Cepat</p>
                  <p className="mt-1">
                    Ketik awalan beberapa kata sekaligus (contoh:{" "}
                    <code className="rounded bg-background px-1.5 py-0.5 text-foreground">
                      ver inv
                    </code>
                    ) untuk mencocokkan semua kata lintas proyek, alur proses, fitur, dan poin
                    pelanggan tanpa membedakan huruf besar/kecil.
                  </p>
                </div>

                {activeProjects.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="px-1 text-xs font-medium text-muted-foreground">
                      Proyek Terbaru
                    </p>
                    <div className="space-y-1">
                      {activeProjects.slice(0, 5).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            void navigate({
                              to: "/projects/$projectId",
                              params: { projectId: project.id },
                              search: {},
                            });
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{project.name}</span>
                            {project.customerName && (
                              <span className="truncate text-xs text-muted-foreground">
                                · {project.customerName}
                              </span>
                            )}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <Search className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Tidak ada dokumentasi yang cocok
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Pastikan seluruh kata kunci cocok atau longgarkan filter sumber/tanggal yang
                  sedang aktif.
                </p>
                {hasFilters && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                    className="mt-4"
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="px-2 pb-1 text-xs text-muted-foreground">
                  {results.length} hasil ditemukan
                </p>
                {results.map((result, index) => {
                  const meta = KIND_META[result.kind];
                  const Icon = meta.icon;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={`${result.kind}-${result.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => openResult(result)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        isActive
                          ? "border-primary/30 bg-accent/80"
                          : "border-transparent hover:bg-accent/50",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="outline" className={cn("gap-1 font-medium", meta.badgeClass)}>
                            <Icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                          <span className="font-medium text-foreground">{result.projectName}</span>
                          {result.featureName && (
                            <>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-muted-foreground">{result.featureName}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {result.source && (
                            <Badge
                              variant="outline"
                              className={cn("px-1.5 py-0 text-[10px]", POINT_SOURCE_META[result.source].badgeClass)}
                            >
                              {POINT_SOURCE_META[result.source].label}
                            </Badge>
                          )}
                          {result.statedBy && <span>· {result.statedBy}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDateId(result.date)}
                          </span>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-sm text-foreground/90">{result.text}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>Gunakan ↑ ↓ untuk memilih, Enter untuk membuka</span>
          <span>Pintasan: / atau Ctrl+K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
