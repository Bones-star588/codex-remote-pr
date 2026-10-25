export type PanelSide = 'sidebar' | 'inspector';
export interface PanelWidths {
  sidebar: number;
  inspector: number;
}

export const defaultPanelWidths: PanelWidths = { sidebar: 275, inspector: 340 };
export const panelMinimums: PanelWidths = { sidebar: 200, inspector: 280 };
export const inspectorOverlayBreakpoint = 900;
const minimumConversationWidth = 320;

export function fitPanelWidths(
  preferred: PanelWidths,
  viewport: number,
  sidebarCollapsed: boolean,
  inspectorOpen: boolean
): PanelWidths {
  const overlay = viewport < inspectorOverlayBreakpoint;
  const sidebarMaximum = viewport - minimumConversationWidth -
    (inspectorOpen && !overlay ? panelMinimums.inspector : 0);
  const sidebar = clampPanelWidth(preferred.sidebar, panelMinimums.sidebar, sidebarMaximum);
  const inspectorMaximum = overlay ? viewport - 32 :
    viewport - minimumConversationWidth - (sidebarCollapsed ? 0 : sidebar);
  return {
    sidebar,
    inspector: clampPanelWidth(preferred.inspector, panelMinimums.inspector, inspectorMaximum)
  };
}

export function panelWidthMaximum(
  side: PanelSide,
  widths: PanelWidths,
  viewport: number,
  sidebarCollapsed: boolean,
  inspectorOpen: boolean
): number {
  const overlay = viewport < inspectorOverlayBreakpoint;
  const maximum = side === 'sidebar'
    ? viewport - minimumConversationWidth - (inspectorOpen && !overlay ? widths.inspector : 0)
    : overlay ? viewport - 32 : viewport - minimumConversationWidth - (sidebarCollapsed ? 0 : widths.sidebar);
  return Math.max(panelMinimums[side], maximum);
}

export function clampPanelWidth(width: number, minimum: number, maximum: number): number {
  return Math.round(Math.max(minimum, Math.min(width, maximum)));
}
