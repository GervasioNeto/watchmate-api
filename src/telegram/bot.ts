import { webhookCallback } from 'grammy';
import { telegramBot } from './client';
import { registerTelegramHandlers } from './handlers';

// O bot só precisa receber mensagens (os comandos); os avisos são enviados pela API.
const ALLOWED_UPDATES: ['message'] = ['message'];

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
// No Render, o endereço público vem pronto em RENDER_EXTERNAL_URL.
const publicApiUrl = (process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '')
  .trim()
  .replace(/\/+$/, '');

if (telegramBot) registerTelegramHandlers(telegramBot);

// Com o segredo (no servidor publicado), o Telegram entrega as mensagens em POST
// /telegram/webhook e manda o segredo em cada chamada; sem ele, a chamada é recusada.
export const telegramWebhook =
  telegramBot && webhookSecret
    ? webhookCallback(telegramBot, 'express', { secretToken: webhookSecret })
    : null;

// Liga o bot junto com a API. Com segredo, registra o webhook. Sem ele (na sua máquina),
// o bot busca as mensagens por polling e não precisa de endereço público. Qualquer erro
// aqui só vai para o log: a API segue funcionando sem o bot.
export async function startTelegramBot(): Promise<void> {
  if (!telegramBot) {
    console.log('Bot do Telegram desligado: falta TELEGRAM_BOT_TOKEN.');
    return;
  }

  try {
    if (webhookSecret) {
      if (!publicApiUrl) throw new Error('Defina API_PUBLIC_URL para registrar o webhook.');
      await telegramBot.api.setWebhook(`${publicApiUrl}/telegram/webhook`, {
        secret_token: webhookSecret,
        allowed_updates: ALLOWED_UPDATES,
      });
      console.log('Bot do Telegram recebendo pelo webhook.');
      return;
    }

    // Sem await: o polling roda enquanto a API estiver de pé.
    telegramBot
      .start({
        allowed_updates: ALLOWED_UPDATES,
        onStart: (info) => console.log(`Bot do Telegram @${info.username} ouvindo por polling.`),
      })
      .catch((err) => console.error('O bot do Telegram parou', err));
  } catch (err) {
    console.error('Não foi possível ligar o bot do Telegram', err);
  }
}
