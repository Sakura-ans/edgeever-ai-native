import { useEffect, useRef, useState, type KeyboardEvent, type PointerEventHandler, type ReactNode } from "react";
import {
  Boxes,
  BookOpen,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileImage,
  ListTree,
  Network,
  Redo2,
  Trash2,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DIAGRAM_SELECTABLE_STRUCTURES,
  DIAGRAM_STRUCTURE_GROUPS,
  DIAGRAM_SELECTABLE_THEMES,
  FLOWCHART_SELECTABLE_THEMES,
  diagramThemeSwatches,
  flowchartThemeSwatches,
  resolveDiagramTheme,
  resolveFlowchartTheme,
  type DiagramStructure,
  type DiagramTheme,
} from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { MemoEditorToolbarDivider, MemoEditorToolbarRow } from "@/components/MemoEditorToolbarChrome";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DiagramAppearance } from "@/lib/diagram-theme";
import { parseDiagramZoomPercent } from "@/lib/diagram-zoom";
import { cn } from "@/lib/utils";

const structureGroupLabelKey = (id: typeof DIAGRAM_STRUCTURE_GROUPS[number]["id"]) => (
  `diagram.structureGroup${id.charAt(0).toUpperCase()}${id.slice(1)}` as "diagram.structureGroupMap"
);

import {StructureThumb} from "./DiagramThumbnails";

type DiagramToolbarProps = {
  appearance: DiagramAppearance;
  canRedo: boolean;
  canUndo: boolean;
  hasSelection: boolean;
  leading?: ReactNode;
  architectureLabels?: { showAll: boolean; onToggle: () => void };
  onAutoLayout: () => void;
  outlineView?: { active: boolean; available: boolean; onToggle: () => void };
  onDeleteSelection: () => void;
  onExport: (format: "png" | "svg") => void;
  onRedo: () => void;
  onThemeChange: (theme: DiagramTheme) => void;
  showTheme?: boolean;
  themeCatalog?: "mind-map" | "flowchart";
  onStructureChange?: (structure: DiagramStructure) => void;
  structure?: DiagramStructure;
  onUndo: () => void;
  onRead?: () => void;
  zoomPercent: number;
  onZoomTo: (percent: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  readOnly: boolean;
  selectionEditor?: ReactNode;
  theme: DiagramTheme;
};

export const DiagramToolbarAddTrigger = ({
  onPointerEnter,
}: {
  onPointerEnter: PointerEventHandler<HTMLButtonElement>;
}) => {
  const { t } = useTranslation();
  return (
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="soft" onPointerEnter={onPointerEnter}>
        <Boxes className="h-4 w-4" />
        {t("diagram.componentLibrary")}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </Button>
    </DropdownMenuTrigger>
  );
};

const DiagramZoomPercentField = ({
  zoomPercent,
  onZoomTo,
}: {
  zoomPercent: number;
  onZoomTo: (percent: number) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(zoomPercent));
  const [focused, setFocused] = useState(false);
  const commitOnBlurRef = useRef(true);

  useEffect(() => {
    if (!focused) setDraft(String(zoomPercent));
  }, [focused, zoomPercent]);

  const commit = (raw = draft) => {
    const next = parseDiagramZoomPercent(raw);
    if (next == null) {
      setDraft(String(zoomPercent));
      return;
    }
    if (next !== zoomPercent) onZoomTo(next);
    setDraft(String(next));
  };

  const keepCanvasShortcutsOut = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitOnBlurRef.current = false;
      commit();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      commitOnBlurRef.current = false;
      setDraft(String(zoomPercent));
      event.currentTarget.blur();
    }
  };

  return (
    <label
      className="inline-flex h-8 w-16 cursor-text items-center justify-center gap-0 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 focus-within:bg-slate-50 focus-within:text-slate-900"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        aria-label={t("diagram.zoomPercent")}
        autoComplete="off"
        className="h-8 w-7 bg-transparent pr-0 text-right text-xs tabular-nums outline-none"
        inputMode="numeric"
        spellCheck={false}
        value={draft}
        onBlur={() => {
          if (commitOnBlurRef.current) commit();
          else commitOnBlurRef.current = true;
          setFocused(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.select();
        }}
        onKeyDown={keepCanvasShortcutsOut}
        onKeyUp={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <span aria-hidden="true" className="text-xs">%</span>
    </label>
  );
};

export const DiagramToolbar = ({
  appearance,
  canRedo,
  canUndo,
  hasSelection,
  leading,
  architectureLabels,
  onAutoLayout,
  outlineView,
  onDeleteSelection,
  onExport,
  onRedo,
  onThemeChange,
  showTheme = true,
  themeCatalog = "mind-map",
  onStructureChange,
  onUndo,
  onRead,
  zoomPercent,
  onZoomTo,
  onZoomIn,
  onZoomOut,
  readOnly,
  selectionEditor,
  structure,
  theme,
}: DiagramToolbarProps) => {
  const { t } = useTranslation();
  const resolvedTheme = themeCatalog === "flowchart" ? resolveFlowchartTheme(theme) : resolveDiagramTheme(theme);
  const themeLabel = t(`diagram.theme${resolvedTheme.charAt(0).toUpperCase()}${resolvedTheme.slice(1)}` as "diagram.themeBrand");
  return (
    <MemoEditorToolbarRow className="shrink-0 border-b border-slate-200 bg-card" role="toolbar" aria-label={t("diagram.toolbar")}>
      {outlineView ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant={outlineView.active ? "soft" : "ghost"} aria-disabled={!outlineView.available} onClick={outlineView.available ? outlineView.onToggle : undefined}>
              {outlineView.active ? <Network className="h-4 w-4" /> : <ListTree className="h-4 w-4" />}
              {t(outlineView.active ? "diagram.canvasView" : "diagram.outlineView")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t(outlineView.available ? (outlineView.active ? "diagram.canvasView" : "diagram.outlineView") : "diagram.outlineUnavailable")}</TooltipContent>
        </Tooltip>
      ) : null}
      {outlineView?.active ? <>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.undo")} disabled={!canUndo || readOnly} onClick={onUndo}><Undo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.undo")}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.redo")} disabled={!canRedo || readOnly} onClick={onRedo}><Redo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.redo")}</TooltipContent></Tooltip>
      </> : null}
      {outlineView?.active ? null : <>
      {leading ? <>{leading}<MemoEditorToolbarDivider /></> : null}
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.undo")} disabled={!canUndo || readOnly} onClick={onUndo}><Undo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.undo")}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.redo")} disabled={!canRedo || readOnly} onClick={onRedo}><Redo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.redo")}</TooltipContent></Tooltip>
      {!readOnly && <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.deleteSelection")} disabled={!hasSelection} onClick={onDeleteSelection}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.deleteSelection")}</TooltipContent></Tooltip>}
      {!readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="gap-1.5 px-2.5" aria-label={t("diagram.autoLayout")} onClick={onAutoLayout}>
              <WandSparkles className="h-4 w-4" />
              <span>{t("diagram.autoLayout")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("diagram.autoLayoutTooltip")}</TooltipContent>
        </Tooltip>
      )}
      {architectureLabels ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant={architectureLabels.showAll ? "soft" : "ghost"} className="gap-1.5 px-2.5" aria-pressed={architectureLabels.showAll} onClick={architectureLabels.onToggle}>
              {architectureLabels.showAll ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {t("diagram.allEdgeLabels")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t(architectureLabels.showAll ? "diagram.hideDenseEdgeLabels" : "diagram.showAllEdgeLabels")}</TooltipContent>
        </Tooltip>
      ) : null}
      <MemoEditorToolbarDivider />
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.zoomOut")} onClick={onZoomOut}><ZoomOut className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.zoomOut")}</TooltipContent></Tooltip>
      <DiagramZoomPercentField zoomPercent={zoomPercent} onZoomTo={onZoomTo} />
      <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("diagram.zoomIn")} onClick={onZoomIn}><ZoomIn className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{t("diagram.zoomIn")}</TooltipContent></Tooltip>
      {onRead ? <Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" onClick={onRead}><BookOpen className="h-4 w-4" />{t("diagram.readFlow")}</Button></TooltipTrigger><TooltipContent>{t("diagram.readFlowHint")}</TooltipContent></Tooltip> : null}
      <MemoEditorToolbarDivider />
      {onStructureChange ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5 px-2.5" disabled={readOnly} aria-label={t("diagram.structure")}>
                  {t(`diagram.structure${(structure && DIAGRAM_SELECTABLE_STRUCTURES.includes(structure as typeof DIAGRAM_SELECTABLE_STRUCTURES[number]) ? structure : "map").charAt(0).toUpperCase()}${(structure && DIAGRAM_SELECTABLE_STRUCTURES.includes(structure as typeof DIAGRAM_SELECTABLE_STRUCTURES[number]) ? structure : "map").slice(1)}` as "diagram.structureMap")}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("diagram.structure")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="max-h-[min(36rem,70vh)] w-[22.5rem] overflow-y-auto p-3">
            {DIAGRAM_STRUCTURE_GROUPS.map((group) => (
              <div key={group.id} className="mb-3 last:mb-0">
                <div className="mb-1.5 text-xs font-medium text-slate-500">{t(structureGroupLabelKey(group.id))}</div>
                <div className={group.items.length >= 3 ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
                  {group.items.map((value) => (
                    <DropdownMenuItem
                      key={value}
                      className={cn(
                        "h-auto flex-col items-stretch gap-1 rounded-lg border p-1.5",
                        group.items.length < 3 ? "w-[calc((100%-1rem)/3)]" : "",
                        structure === value ? "border-slate-900 bg-slate-50" : "border-slate-200",
                      )}
                      onSelect={() => onStructureChange(value)}
                    >
                      <StructureThumb structure={value} />
                    </DropdownMenuItem>
                  ))}
                </div>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {showTheme ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5 px-2.5" disabled={readOnly} aria-label={t("diagram.theme")}>
                  <span className="flex h-3.5 overflow-hidden rounded-sm border border-black/10">
                    {(themeCatalog === "flowchart" ? flowchartThemeSwatches(theme) : diagramThemeSwatches(theme).slice(0, 4)).map((color) => (
                      <span key={color} className="h-full w-2.5" style={{ background: color }} />
                    ))}
                  </span>
                  {themeLabel}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("diagram.theme")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="max-h-[min(36rem,70vh)] w-[18.5rem] overflow-y-auto p-2">
            <div className="grid grid-cols-1 gap-1">
              {(themeCatalog === "flowchart" ? FLOWCHART_SELECTABLE_THEMES : DIAGRAM_SELECTABLE_THEMES).map((value) => (
                <DropdownMenuItem
                  key={value}
                  className={cn(
                    "h-auto items-center gap-3 rounded-lg border px-2 py-1.5",
                    (themeCatalog === "flowchart" ? resolveFlowchartTheme(theme) === value : theme === value)
                      ? "border-slate-900 bg-slate-50"
                      : "border-transparent",
                  )}
                  onSelect={() => onThemeChange(value)}
                >
                  <span className="flex h-5 flex-1 overflow-hidden rounded-md border border-black/10">
                    {(themeCatalog === "flowchart" ? flowchartThemeSwatches(value) : diagramThemeSwatches(value)).map((color) => (
                      <span key={`${value}-${color}`} className="h-full flex-1" style={{ background: color }} />
                    ))}
                  </span>
                  <span className="w-10 shrink-0 text-xs text-slate-600">{t(`diagram.theme${value.charAt(0).toUpperCase()}${value.slice(1)}` as "diagram.themeBrand")}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline"><Download className="h-4 w-4" />{t("diagram.export")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onExport("png")}><FileImage className="h-4 w-4" />{t("diagram.exportPng")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("svg")}><FileCode2 className="h-4 w-4" />{t("diagram.exportSvg")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {selectionEditor}
      </>}
    </MemoEditorToolbarRow>
  );
};
