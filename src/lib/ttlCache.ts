// Cache em memória com validade, para respostas que mudam devagar (listas do TMDB, a
// contagem das duplas). Pedidos iguais ao mesmo tempo esperam a mesma busca, sem disparar
// duas. Erro não fica guardado: o próximo pedido tenta de novo. Some quando o servidor
// reinicia, e tudo bem: é só cache.
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;

    const value = load();
    // Apaga antes de pôr de novo: a entrada vai para o fim da fila, como a mais nova.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });

    // Passou do limite: sai a entrada mais antiga.
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }
}
