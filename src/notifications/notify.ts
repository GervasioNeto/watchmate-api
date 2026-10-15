import prisma from '../lib/prisma';
import { telegramChannel } from './channels/telegram';
import { describeEvent, firstName } from './messages';
import type { NotificationChannel, NotificationEvent } from './types';

// Por onde os avisos saem. O push do app mobile entra aqui como mais um canal.
const channels: NotificationChannel[] = [telegramChannel];

// Só para testar sem o par: o aviso vai também para quem fez a ação.
const notifySelf = process.env.NOTIFY_SELF === 'true';

// Avisa o par sobre o que alguém fez. As rotas chamam depois de responder (`void
// notify(...)`): o aviso nunca atrasa nem derruba a ação, e um erro aqui só vai para o log.
export async function notify(event: NotificationEvent): Promise<void> {
  try {
    const membership = await prisma.membroDoGrupo.findUnique({
      where: { usuarioId: event.actorId },
      select: {
        grupo: {
          select: {
            membros: {
              select: {
                usuario: {
                  select: {
                    id: true,
                    nome: true,
                    email: true,
                    telegramChatId: true,
                    avisosTelegram: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const users = membership?.grupo.membros.map((member) => member.usuario) ?? [];
    const actor = users.find((user) => user.id === event.actorId);
    const recipients = users.filter((user) => user.id !== event.actorId || notifySelf);
    if (!actor || recipients.length === 0) return;

    const notification = await describeEvent(event, firstName(actor));
    if (!notification) return;

    const deliveries = await Promise.allSettled(
      recipients.flatMap((recipient) =>
        channels.map((channel) => channel.send(recipient, notification)),
      ),
    );
    for (const delivery of deliveries) {
      if (delivery.status === 'rejected') {
        console.error(`Aviso "${event.type}" não entregue`, delivery.reason);
      }
    }
  } catch (err) {
    console.error(`Não foi possível montar o aviso "${event.type}"`, err);
  }
}
