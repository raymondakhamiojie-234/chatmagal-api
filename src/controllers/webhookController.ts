import { Request, Response } from 'express';
import { handleInboundSupport, handleStatusUpdate } from '../services/whatsappService';

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
};

export const processWebhook = (req: Request, res: Response) => {
  // Immediately respond with 200 OK to Meta
  res.sendStatus(200);

  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value) {
      const value = body.entry[0].changes[0].value;
      const metaPhoneNumberId = value.metadata?.phone_number_id;

      if (!metaPhoneNumberId) return;

      if (value.messages) {
        // Handle inbound message
        handleInboundSupport(value.messages[0], metaPhoneNumberId);
      } else if (value.statuses) {
        // Handle message status update
        handleStatusUpdate(value.statuses[0], metaPhoneNumberId);
      }
    }
  }
};
