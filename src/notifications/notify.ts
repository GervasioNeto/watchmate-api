import { countUnseen } from '../inbox/read';
import { recordInboxItem } from '../inbox/record';
import prisma from '../lib/prisma';
import { pushChannel } from './channels/push';
import { telegramChannel } from './channels/telegram';
import { describeEvent, firstName } from './messages';
import type { NotificationChannel, NotificationEvent } from './types';

// Por onde os avisos saem. Cada canal diz quais eventos manda (ver `events` em cada um).
const channels: NotificationChannel[] = [telegramChannel, pushChannel];

// Só para testar sem o par: o aviso vai também para quem fez a ação.
const notifySelf = process.env.NOTIFY_SELF === 'true';

// Avisa o par sobre o que alguém fez. As rotas chamam depois de responder (`void
// notify(...)`): o aviso nunca atrasa nem derruba a ação, e um erro aqui só vai para o log.
//
// Primeiro o aviso é guardado em "Entre vocês" (ver src/inbox); os canais (push, Telegram)
// são só cópias que tentam chegar. Apagou o push ou desligou os avisos: o aviso continua lá.
export async function notify(event: NotificationEvent): Promise<void> {
  const eventChannels = channels.filter((channel) => channel.events.has(event.type));

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

    // O aviso é montado para cada um: o que fica escondido por spoiler depende do que a
    // pessoa já viu. Os envios de cada um são acompanhados (allSettled) assim que começam,
    // para uma falha nunca ficar sem tratamento enquanto o aviso do outro é montado.
    const perRecipient = await Promise.all(
      recipients.map(async (recipient) => {
        try {
          await recordInboxItem(event, recipient.id);
        } catch (err) {
          // Sem o aviso guardado, o push ainda vale a tentativa.
          console.error(`Aviso "${event.type}" não guardado em Entre vocês`, err);
        }
        if (eventChannels.length === 0) return [];

        const notification = await describeEvent(event, firstName(actor), recipient.id);
        if (!notification) return [];
        const badge = await countUnseen(recipient.id).catch(() => undefined);
        return Promise.allSettled(
          eventChannels.map((channel) => channel.send(recipient, { ...notification, badge })),
        );
      }),
    );

    for (const delivery of perRecipient.flat()) {
      if (delivery.status === 'rejected') {
        console.error(`Aviso "${event.type}" não entregue`, delivery.reason);
      }
    }
  } catch (err) {
    console.error(`Não foi possível montar o aviso "${event.type}"`, err);
  }
}
