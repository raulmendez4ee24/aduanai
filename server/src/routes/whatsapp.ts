import { Router } from 'express';
import { handleWhatsAppMessage, sendWhatsAppMessage } from '../services/whatsapp';
import { prisma } from '../lib/prisma';

export const whatsappRouter = Router();

// Webhook verification (GET) — YCloud envía esto para verificar el endpoint
whatsappRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// Webhook para mensajes entrantes (POST)
whatsappRouter.post('/webhook', async (req, res) => {
  try {
    const event = req.body;

    // YCloud envía diferentes tipos de eventos
    if (event.type !== 'whatsapp.inbound_message.received') {
      return res.status(200).json({ status: 'ignored' });
    }

    const message = event.whatsappInboundMessage;
    if (!message || message.type !== 'text') {
      return res.status(200).json({ status: 'ignored' });
    }

    const from = message.from;
    const body = message.text?.body || '';

    console.log(`📱 WhatsApp de ${from}: ${body}`);

    // Procesar mensaje
    const reply = await handleWhatsAppMessage({
      from,
      body,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    // Enviar respuesta
    await sendWhatsAppMessage(from, reply);

    // Log en audit
    const tenant = await prisma.tenant.findFirst({ where: { id: 'demo-tenant' } });
    if (tenant) {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: 'whatsapp_message',
          entity: 'whatsapp',
          details: JSON.stringify({ from, body, reply: reply.substring(0, 200) }),
        },
      });
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error en webhook WhatsApp:', err);
    res.status(200).json({ status: 'error' });
  }
});
