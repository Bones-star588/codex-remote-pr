export type InspectorView = 'launcher' | 'changes' | 'activity' | 'files';

export function toggleInspectorLauncher(open: boolean, currentView: InspectorView): { open: boolean; view: 'launcher' } {
  return { open: open && currentView === 'launcher' ? false : true, view: 'launcher' };
}
