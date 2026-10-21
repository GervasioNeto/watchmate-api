// O que aconteceu, contado por quem fez (actorId). A camada de avisos decide quem recebe,
// o texto e por onde (ver notify.ts).
export type NotificationEvent =
  | { type: 'series-added'; actorId: string; seriesId: string }
  // Viu um episódio sozinho (vendo juntos, o par estava lá e não precisa de aviso).
  | { type: 'episode-watched'; actorId: string; seriesId: string; season: number; episode: number }
  // Marcou a temporada inteira como vista, sozinho.
  | { type: 'season-finished'; actorId: string; seriesId: string; season: number }
  // Deixou (ou trocou) o recado para o par: o balão ao lado dos avatares.
  | { type: 'note-left'; actorId: string; note: string }
  // Comentou ou reagiu a um episódio. O texto e o emoji só aparecem no aviso de quem já viu
  // o episódio: para quem não viu, seria spoiler (a mesma regra do app).
  | {
      type: 'episode-commented';
      actorId: string;
      seriesId: string;
      season: number;
      episode: number;
      comment: string;
    }
  | {
      type: 'episode-reacted';
      actorId: string;
      seriesId: string;
      season: number;
      episode: number;
      emoji: string;
    }
  // O "Bora?" (ver src/invites): chamou o par, respondeu o convite ou desfez.
  | { type: 'invite-sent'; actorId: string; inviteId: string }
  | { type: 'invite-answered'; actorId: string; inviteId: string }
  | { type: 'invite-canceled'; actorId: string; inviteId: string };

export type NotificationEventType = NotificationEvent['type'];

// Um aviso pronto, sem cara de canal nenhum: cada canal usa a forma que combina com ele.
export interface Notification {
  // A frase inteira, em pedaços; `strong` é o destaque (nomes de pessoa e de série). É a
  // forma do Telegram, que mostra uma mensagem só, com negrito.
  parts: Array<{ text: string; strong?: boolean }>;
  // A mesma coisa em duas linhas, para quem tem título e corpo (o push).
  title: string;
  body: string;
  // Avisos do mesmo assunto se substituem em vez de empilhar: dez episódios seguidos da
  // mesma série viram um aviso só, sempre com o último.
  thread: string;
  // Uma imagem larga da série (o fundo do TMDB), para quem mostra imagem (o push no Android).
  imageUrl: string | null;
  // A tela do app que o aviso abre.
  link: { label: string; path: string };
  // Toca de novo mesmo substituindo um aviso do mesmo assunto (um convite novo chama a
  // atenção; um comentário a mais na mesma conversa, não).
  renotify?: boolean;
  // Respostas direto no aviso, para quem mostra botões (o push no Android). Cada uma abre o
  // app numa tela que faz a ação: sem o app, o aviso não tem como saber quem é a pessoa.
  actions?: Array<{ id: string; label: string; path: string }>;
  // Quantos avisos novos a pessoa tem em "Entre vocês", para o número no ícone do app.
  badge?: number;
}

// Quem recebe, com o que os canais precisam para entregar.
export interface Recipient {
  id: string;
  telegramChatId: string | null;
  avisosTelegram: boolean;
}

export interface NotificationChannel {
  // Os eventos que o canal manda (ver cada canal).
  events: ReadonlySet<NotificationEventType>;
  // Entrega se a pessoa tem esse canal ligado; senão, não faz nada.
  send(recipient: Recipient, notification: Notification): Promise<void>;
}
