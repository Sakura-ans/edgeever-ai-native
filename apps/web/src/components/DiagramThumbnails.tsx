import type {ReactNode} from "react";
import {DIAGRAM_SELECTABLE_STRUCTURES} from "@edgeever/shared";
const nodePath = (form: typeof DIAGRAM_SELECTABLE_STRUCTURES[number], x: number, y: number, w: number, h: number) => {
  if (form === "line" || form === "brace" || form === "map") return null;
  if (form === "circle" || form === "ellipse") {
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />;
  }
  if (form === "hexagon") {
    return <polygon points={`${x + 4},${y} ${x + w - 4},${y} ${x + w},${y + h / 2} ${x + w - 4},${y + h} ${x + 4},${y + h} ${x},${y + h / 2}`} />;
  }
  const rx = form === "capsule" ? h / 2 : 3;
  return <rect x={x} y={y} width={w} height={h} rx={rx} />;
};

const ThumbFrame = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 96 56" className="h-12 w-full text-slate-500" fill="currentColor" stroke="currentColor" strokeWidth="1.2">
    {children}
  </svg>
);

export const StructureThumb = ({ structure }: { structure: typeof DIAGRAM_SELECTABLE_STRUCTURES[number] }) => {
  if (structure === "brace") {
    return (
      <ThumbFrame>
        <rect x="6" y="22" width="20" height="12" rx="3" fill="currentColor" opacity="0.35" stroke="none" />
        <path d="M 32 10 C 40 10 40 10 40 20 C 40 28 48 28 48 28 C 40 28 40 28 40 36 C 40 46 40 46 32 46" fill="none" />
        <path d="M 48 16 H 86 M 48 28 H 86 M 48 40 H 86" fill="none" />
      </ThumbFrame>
    );
  }
  if (structure === "org") {
    return (
      <ThumbFrame>
        <rect x="38" y="6" width="20" height="10" rx="2" fill="currentColor" opacity="0.35" stroke="none" />
        <path d="M 48 16 V 24 H 16 V 28 M 48 24 H 80 V 28 M 48 24 V 28" fill="none" />
        <g fill="white"><rect x="6" y="28" width="20" height="10" rx="2" /><rect x="38" y="28" width="20" height="10" rx="2" /><rect x="70" y="28" width="20" height="10" rx="2" /></g>
      </ThumbFrame>
    );
  }
  if (structure === "tree") {
    return (
      <ThumbFrame>
        <rect x="6" y="8" width="20" height="10" rx="2" fill="currentColor" opacity="0.35" stroke="none" />
        <path d="M 26 13 H 36 V 44 M 36 13 H 52 M 36 28 H 52 M 36 44 H 52" fill="none" />
        <g fill="white"><rect x="52" y="8" width="22" height="10" rx="2" /><rect x="52" y="23" width="22" height="10" rx="2" /><rect x="52" y="38" width="22" height="10" rx="2" /></g>
      </ThumbFrame>
    );
  }
  if (structure === "timeline") {
    return (
      <ThumbFrame>
        <rect x="6" y="22" width="16" height="10" rx="2" fill="currentColor" opacity="0.35" stroke="none" />
        <path d="M 22 27 H 90 M 40 27 V 14 M 62 27 V 40 M 84 27 V 14" fill="none" />
        <g fill="white"><rect x="30" y="6" width="20" height="8" rx="2" /><rect x="52" y="40" width="20" height="8" rx="2" /><rect x="74" y="6" width="16" height="8" rx="2" /></g>
      </ThumbFrame>
    );
  }
  if (structure === "fishbone") {
    return (
      <ThumbFrame>
        <rect x="72" y="22" width="18" height="12" rx="3" fill="currentColor" opacity="0.35" stroke="none" />
        <path d="M 72 28 H 8 M 58 28 L 46 12 M 58 28 L 46 44 M 38 28 L 26 12 M 38 28 L 26 44" fill="none" />
        <g fill="white"><rect x="36" y="6" width="16" height="8" rx="2" /><rect x="36" y="42" width="16" height="8" rx="2" /><rect x="16" y="6" width="16" height="8" rx="2" /><rect x="16" y="42" width="16" height="8" rx="2" /></g>
      </ThumbFrame>
    );
  }
  const oneSided = structure === "logic";
  const lineOnly = structure === "line" || structure === "map";
  const root = { x: oneSided ? 8 : 38, y: 20, w: oneSided ? 22 : 20, h: 12 };
  const left = [{ x: 6, y: 8 }, { x: 6, y: 32 }];
  const right = oneSided
    ? [{ x: 42, y: 6 }, { x: 42, y: 22 }, { x: 42, y: 38 }]
    : [{ x: 68, y: 8 }, { x: 68, y: 32 }];
  const leaf = { w: 18, h: 10 };
  const cx = root.x + root.w / 2;
  const cy = root.y + root.h / 2;
  return (
    <ThumbFrame>
      <rect x={root.x} y={root.y} width={root.w} height={root.h} rx={3} fill="currentColor" opacity="0.35" stroke="none" />
      {(oneSided ? right : [...left, ...right]).map((item, index) => (
        <g key={index}>
          <path d={`M ${oneSided ? root.x + root.w : (item.x < cx ? root.x : root.x + root.w)} ${cy} C ${item.x + (item.x < cx ? leaf.w : 0)},${cy} ${cx},${item.y + leaf.h / 2} ${item.x + (item.x < cx ? leaf.w : 0)},${item.y + leaf.h / 2}`} fill="none" opacity="0.7" />
          {lineOnly ? (
            <path d={`M ${item.x} ${item.y + leaf.h} H ${item.x + leaf.w}`} fill="none" />
          ) : (
            <g fill="white" stroke="currentColor">{nodePath(structure, item.x, item.y, leaf.w, leaf.h)}</g>
          )}
        </g>
      ))}
    </ThumbFrame>
  );
};

