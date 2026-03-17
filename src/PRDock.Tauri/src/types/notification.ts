export type NotificationSeverity = 'error' | 'success' | 'warning' | 'info';

export interface NotificationAction {
  label: string;
  url: string;
}

export interface InAppNotification {
  title: string;
  message: string;
  severity: NotificationSeverity;
  launchUrl?: string;
  prNumber?: number;
  repoFullName?: string;
  actions: NotificationAction[];
}
