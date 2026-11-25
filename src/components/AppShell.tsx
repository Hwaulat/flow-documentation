import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  FolderKanban,
  HardDrive,
  Menu,
  Search,
  Trash2,
} from "lucide-react";

import { GlobalSearchDialog } from "@/components/GlobalSearchDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAppData } from "@/lib/app-data";
import { cn } from "@/lib/utils";

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { snapshot, storageError } = useAppData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const trashCount = useMemo(() => {
    const projects = snapshot.projects.filter((item) => item.deletedAt !== null).length;
    const features = snapshot.features.filter((item) => item.deletedAt !== null).length;
    const points = snapshot.points.filter((item) => item.deletedAt !== null).length;
    const attachments = snapshot.attachments.filter((item) => item.deletedAt !== null).length;
    return projects + features + points + attachments;
  }, [snapshot]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isEditableElement(event.target)
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navItems = [
    {
      to: "/" as const,
      label: "Dasbor",
      icon: FolderKanban,
      active: pathname === "/" || pathname.startsWith("/projects"),
      badge: null as number | null,
    },
    {
      to: "/trash" as const,
      label: "Sampah",
      icon: Trash2,
      active: pathname === "/trash",
      badge: trashCount > 0 ? trashCount : null,
    },
    {
      to: "/backup" as const,
      label: "Cadangan & Ekspor",
      icon: Archive,
      active: pathname === "/backup",
      badge: null as number | null,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header
        data-print-hide="true"
        className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md"
      >
        <div className="flex h-15 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 md:gap-6">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Buka menu navigasi"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                      FD
                    </span>
                    FlowDoc
                  </SheetTitle>
                  <SheetDescription>
                    Dokumentasi alur proyek & kebutuhan pelanggan lokal.
                  </SheetDescription>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1" aria-label="Navigasi seluler">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          item.active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </span>
                        {item.badge !== null && (
                          <Badge
                            variant={item.active ? "secondary" : "outline"}
                            className="px-1.5 py-0 text-[11px]"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-6 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <HardDrive className="h-3.5 w-3.5" />
                    Penyimpanan Lokal Saja
                  </div>
                  <p className="mt-1">
                    Data disimpan di peramban ini (IndexedDB) tanpa akun atau login.
                  </p>
                </div>
              </SheetContent>
            </Sheet>

            <Link to="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-1 py-0.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-bold tracking-tight text-primary-foreground shadow-sm">
                FD
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold tracking-tight">FlowDoc</span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  Dokumentasi Alur Proyek
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Navigasi utama">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      item.active
                        ? "bg-accent text-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.badge !== null && (
                      <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSearchOpen(true)}
              className="h-9 gap-2 rounded-xl border-border/90 bg-card px-3 text-muted-foreground shadow-xs hover:bg-accent/60 hover:text-foreground sm:w-64 sm:justify-between"
              aria-label="Buka pencarian global"
            >
              <span className="flex items-center gap-2 text-xs sm:text-sm">
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cari dokumentasi...</span>
                <span className="sm:hidden">Cari</span>
              </span>
              <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                /
              </kbd>
            </Button>

            <div
              title="Data tersimpan secara lokal di peramban ini tanpa login"
              className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Lokal · Tanpa Login
            </div>
          </div>
        </div>
      </header>

      {storageError && (
        <div
          data-print-hide="true"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive"
        >
          {storageError}
        </div>
      )}

      <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
