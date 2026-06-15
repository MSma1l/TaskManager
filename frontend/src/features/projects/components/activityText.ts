/**
 * Maps an activity `action` to its i18n key (shared between the task activity
 * tab in TaskDetailDrawer and the project-level ActivityPanel).
 */
export function activityKey(action: string): string {
  switch (action) {
    case 'CREATED': return 'collab.actCreated';
    case 'MOVED': return 'collab.actMoved';
    case 'ASSIGNED': return 'collab.actAssigned';
    case 'PLANNED': return 'collab.actPlanned';
    case 'STARTED': return 'collab.actStarted';
    case 'DONE': return 'collab.actDone';
    case 'APPROVED': return 'collab.actApproved';
    case 'COMMENTED': return 'collab.actCommented';
    default: return '';
  }
}

/**
 * Friendly localized phrase for an activity action. Falls back to the raw
 * action string when unknown.
 */
export function activityLine(t: (key: string) => string, action: string): string {
  const key = activityKey(action);
  return key ? t(key) : action;
}
