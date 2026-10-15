// O que aconteceu, contado por quem fez (actorId). A camada de avisos decide quem recebe,
// o texto e por onde (ver notify.ts).
export type NotificationEvent =
  | { type: 'series-added'; actorId: string; seriesId: string }
  // Viu um episódio sozinho (vendo juntos, o par estava lá e não precisa de aviso).
  | { type: 'episode-watched'; actorId: string; seriesId: string; season: number; episode: number }
  // Marcou a temporada inteira como vista, sozinho.
  | { type: 'season-finished'; actorId: string; seriesId: string; season: number };

// Um aviso pronto, sem cara de canal nenhum: cada canal decide como mostrar (o Telegram
// põe negrito e um botão; um push, no futuro, só o texto).
export interface Notification {
  // Pedaços da frase; `strong` é o que aparece em destaque (nomes de pessoa e de série).
  parts: Array<{ text: string; strong?: boolean }>;
  // A tela do app que o aviso abre.
  link: { label: string; path: string };
}

// Quem recebe, com o que os canais precisam para entregar.
export interface Recipient {
  id: string;
  telegramChatId: string | null;
  avisosTelegram: boolean;
}

export interface NotificationChannel {
  // Entrega se a pessoa tem esse canal ligado; senão, não faz nada.
  send(recipient: Recipient, notification: Notification): Promise<void>;
}
