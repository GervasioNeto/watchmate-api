import { sendToUser } from '../../push/subscriptions';
import type { NotificationChannel, NotificationEventType } from '../types';

// O push é do próprio app, então leva tudo: o que o Telegram leva e também recados,
// comentários, reações e os convites do "Bora?". Chega em cada aparelho em que a pessoa
// ligou os avisos.
export const pushChannel: NotificationChannel = {
  events: new Set<NotificationEventType>([
    'series-added',
    'episode-watched',
    'season-finished',
    'note-left',
    'episode-commented',
    'episode-reacted',
    'invite-sent',
    'invite-answered',
    'invite-canceled',
  ]),
  async send(recipient, notification) {
    await sendToUser(recipient.id, {
      title: notification.title,
      body: notification.body,
      path: notification.link.path,
      tag: notification.thread,
      image: notification.imageUrl,
      renotify: notification.renotify ?? false,
      actions: (notification.actions ?? []).map((action) => ({
        action: action.id,
        title: action.label,
        path: action.path,
      })),
      badge: notification.badge ?? null,
    });
  },
};
