/**
 * Notification Service (FR-07)
 * Ensures:
 * - Notifications are created for administrators ONLY.
 * - Students and staff never receive match notifications.
 */

import { Notification } from '../types';
import { appStorage } from './storage';

export const notificationService = {
  async getAdminNotifications(): Promise<Notification[]> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') {
      return [];
    }
    return appStorage.getNotifications();
  },

  async createNotification(data: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<Notification> {
    const newNotif: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      audience: 'admin',
      type: data.type,
      message: data.message,
      relatedId: data.relatedId,
      read: false,
      createdAt: new Date().toISOString(),
    };

    appStorage.addNotification(newNotif);
    return newNotif;
  },

  async markAsRead(id: string): Promise<void> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') return;

    const notifs = appStorage.getNotifications();
    const item = notifs.find((n) => n.id === id);
    if (item) {
      item.read = true;
      appStorage.saveNotifications(notifs);
    }
  },

  async markAllAsRead(): Promise<void> {
    const user = appStorage.getCurrentUser();
    if (!user || user.role !== 'admin') return;

    const notifs = appStorage.getNotifications();
    notifs.forEach((n) => {
      n.read = true;
    });
    appStorage.saveNotifications(notifs);
  },
};
