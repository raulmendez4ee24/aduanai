import { Router } from 'express';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { chatWithCopilot } from '../services/copilot';
import { prisma } from '../lib/prisma';

export const copilotRouter = Router();

copilotRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || message.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Mensaje requerido',
      });
    }

    // Obtener historial de conversación si existe
    let history: { role: string; content: string }[] = [];
    if (conversationId) {
      const previous = await prisma.copilotMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      history = previous.map((m) => ({ role: m.role, content: m.content }));
    }

    const reply = await chatWithCopilot(message, history);

    const convId = conversationId || crypto.randomUUID();

    // Guardar ambos mensajes
    await prisma.copilotMessage.createMany({
      data: [
        {
          tenantId: req.tenantId!,
          userId: req.userId!,
          conversationId: convId,
          role: 'user',
          content: message,
        },
        {
          tenantId: req.tenantId!,
          userId: req.userId!,
          conversationId: convId,
          role: 'assistant',
          content: reply,
        },
      ],
    });

    res.json({ status: 'ok', data: { reply, conversationId: convId } });
  } catch (err) {
    next(err);
  }
});
