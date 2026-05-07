import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middlewares/auth';
import { askCopilotWithRAG } from '../services/copilot';
import { prisma } from '../lib/prisma';

export const copilotRouter = Router();

copilotRouter.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { message, conversationId } = req.body as { message?: string; conversationId?: string };

    if (!message || message.trim().length < 2) {
      return res.status(400).json({ status: 'error', message: 'Mensaje requerido' });
    }

    // RAG: recupera documentos legales, genera respuesta con citas verificadas
    const result = await askCopilotWithRAG({
      question: message,
      tenantId: req.tenantId!,
      userId: req.userId!,
    });

    const convId = conversationId || crypto.randomUUID();

    // Guardar conversación (compatibilidad con CopilotMessage existente)
    await prisma.copilotMessage.createMany({
      data: [
        { tenantId: req.tenantId!, userId: req.userId!, conversationId: convId, role: 'user', content: message },
        { tenantId: req.tenantId!, userId: req.userId!, conversationId: convId, role: 'assistant', content: result.answer },
      ],
    });

    res.json({
      status: 'ok',
      data: {
        reply: result.answer,
        conversationId: convId,
        citations: result.citations,
        confidence: result.confidence,
        consultHash: result.consultHash,
        retrievedDocsCount: result.retrievedDocsCount,
        hallucinationWarning: result.hallucinatedReferences.length > 0
          ? { count: result.hallucinatedReferences.length, refs: result.hallucinatedReferences }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Feedback sobre la última consulta
copilotRouter.patch('/feedback/:hash', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const hash = String(req.params.hash);
    const { helpful, note } = req.body as { helpful?: boolean; note?: string };
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'helpful (boolean) requerido' });
    }
    await prisma.copilotConsult.update({
      where: { consultHash: hash },
      data: { helpful, feedbackNote: note },
    });
    res.json({ status: 'ok' });
  } catch (err) { next(err); }
});
