import prisma from './prisma';

export async function getUserGroupId(userId: string): Promise<string | null> {
  const membership = await prisma.membroDoGrupo.findUnique({ where: { usuarioId: userId } });
  return membership?.grupoId ?? null;
}
