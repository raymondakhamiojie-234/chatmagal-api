import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Render Password Setup Page
export const renderAccountSetup = async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).send('Invalid token');
  }

  // Find contact by resetToken (reused for setup token initially)
  const contact = await prisma.contact.findFirst({
    where: {
      resetToken: token
    }
  });

  if (!contact) {
    return res.status(400).send('This link is invalid or has already been used. Please request a new setup link from the chat.');
  }

  if (contact.resetExpiry && new Date() > contact.resetExpiry) {
    return res.status(400).send('This link has expired (it is only valid for 1 hour). Please request a new setup link from the chat.');
  }

  res.send(`
    <html>
      <head>
        <title>Falcus Media - Secure Account Setup</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
          h2 { color: #111827; margin-top: 0; }
          p { color: #4b5563; font-size: 0.9rem; }
          input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
          button { width: 100%; padding: 0.75rem; background-color: #2563eb; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
          button:hover { background-color: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Secure Account Setup</h2>
          <p>Hi ${contact.name}, please create a secure password for your Falcus Media account (${contact.email}).</p>
          <form action="/api/account/setup" method="POST" onsubmit="document.getElementById('submitBtn').disabled = true; document.getElementById('submitBtn').innerText = 'Saving...';">
            <input type="hidden" name="token" value="${token}" />
            <input type="password" name="password" placeholder="Create Password" required minlength="8" />
            <input type="password" name="confirmPassword" placeholder="Confirm Password" required minlength="8" />
            <button type="submit">Create Password</button>
          </form>
        </div>
      </body>
    </html>
  `);
};

// Process Password Setup
export const processAccountSetup = async (req: Request, res: Response) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || password !== confirmPassword || password.length < 8) {
    return res.status(400).send('Invalid request or passwords do not match/are too short.');
  }

  const contact = await prisma.contact.findFirst({
    where: {
      resetToken: token
    }
  });

  if (!contact) {
    return res.status(400).send('This link is invalid or has already been used. Please request a new setup link from the chat.');
  }

  if (contact.resetExpiry && new Date() > contact.resetExpiry) {
    return res.status(400).send('This link has expired. Please request a new setup link from the chat.');
  }

  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  // Generate a 6 digit verification code to send to the user's email
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 15);

  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      passwordHash: hash,
      resetToken: null,
      resetExpiry: null,
      verificationCode: verificationCode,
      verificationExpiry: expiry
    }
  });

  // Send email using Nodemailer if configured, otherwise mock
  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Falcus Media" <noreply@chatmagal.com>',
        to: contact.email,
        subject: 'Your Login Verification Code',
        text: `Hello ${contact.name},\n\nYour account verification code is: ${verificationCode}\n\nPlease enter this code in the WhatsApp chat to complete your registration.\n\nThank you,\nFalcus Media`,
        html: `<p>Hello ${contact.name},</p><p>Your account verification code is: <strong>${verificationCode}</strong></p><p>Please enter this code in the WhatsApp chat to complete your registration.</p><p>Thank you,<br/>Falcus Media</p>`
      });
      console.log(`📧 [EMAIL SENT] Verification code sent to ${contact.email}`);
    } catch (emailErr) {
      console.error(`📧 [EMAIL ERROR] Failed to send email to ${contact.email}:`, emailErr);
    }
  } else {
    // Mock sending email: In a real app we'd use SendGrid or Nodemailer here.
    console.log(`📧 [EMAIL MOCK] Sent verification code ${verificationCode} to ${contact.email}`);
  }

  res.send(`
    <html>
      <head>
        <title>Password Saved</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #f3f4f6; }
          .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: inline-block; }
          h2 { color: #10b981; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Password Saved Successfully! ✅</h2>
          <p>We've sent a 6-digit verification code to your email.</p>
          <p>Please return to the Falcus Media chat and enter the code to complete your registration.</p>
        </div>
      </body>
    </html>
  `);
};

// Render Password Reset Page
export const renderAccountRecover = async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) return res.status(400).send('Invalid token');

  const contact = await prisma.contact.findFirst({
    where: {
      resetToken: token,
      resetExpiry: { gt: new Date() }
    }
  });

  if (!contact) {
    return res.status(400).send('Reset link expired or invalid.');
  }

  res.send(`
    <html>
      <head>
        <title>Falcus Media - Reset Password</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
          h2 { color: #111827; margin-top: 0; }
          input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
          button { width: 100%; padding: 0.75rem; background-color: #2563eb; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Reset Password</h2>
          <p>Enter a new password for \${contact.email}.</p>
          <form action="/api/account/recover" method="POST" onsubmit="document.getElementById('submitBtn').disabled = true; document.getElementById('submitBtn').innerText = 'Resetting...';">
            <input type="hidden" name="token" value="\${token}" />
            <input type="password" name="password" placeholder="New Password" required minlength="8" />
            <button id="submitBtn" type="submit">Reset Password</button>
          </form>
        </div>
      </body>
    </html>
  `);
};

// Process Password Reset
export const processAccountRecover = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 8) {
    return res.status(400).send('Invalid request or password too short.');
  }

  const contact = await prisma.contact.findFirst({
    where: {
      resetToken: token
    }
  });

  if (!contact) {
    return res.status(400).send('This link is invalid or has already been used. Please request a new setup link from the chat.');
  }

  if (contact.resetExpiry && new Date() > contact.resetExpiry) {
    return res.status(400).send('This link has expired. Please request a new setup link from the chat.');
  }

  const hash = await bcrypt.hash(password, 10);

  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      passwordHash: hash,
      resetToken: null,
      resetExpiry: null
    }
  });

  res.send(`
    <html>
      <head><title>Password Reset Successful</title>
      <style>body{font-family:sans-serif;text-align:center;padding:50px;}</style></head>
      <body>
        <h2 style="color:#10b981;">Password Reset Successfully! ✅</h2>
        <p>You can now return to the chat.</p>
      </body>
    </html>
  `);
};

// ==========================================
// CLIENT PORTAL API ENDPOINTS (MOBILE APP)
// ==========================================

// POST /api/account/client-login
export const clientLogin = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide email or phone number and password.' });
    }

    const trimmed = identifier.trim();
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed, mode: 'insensitive' } },
          { phoneNumber: trimmed }
        ]
      },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!contact || !contact.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials or no password set for this account.' });
    }

    const isMatch = await bcrypt.compare(password, contact.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email/phone or password.' });
    }

    return res.json({
      success: true,
      client: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phoneNumber: contact.phoneNumber,
        customerId: contact.customerId,
        accountStatus: contact.accountStatus,
        emailVerified: contact.emailVerified,
        workspaceId: contact.workspaceId
      },
      orders: contact.orders
    });
  } catch (err: any) {
    console.error('Error in clientLogin:', err);
    return res.status(500).json({ error: 'Server error during client login' });
  }
};

// GET /api/account/client-orders
export const getClientOrders = async (req: Request, res: Response) => {
  try {
    const contactId = req.query.contactId as string;
    if (!contactId) return res.status(400).json({ error: 'Missing contactId' });

    const orders = await prisma.order.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, orders });
  } catch (err: any) {
    console.error('Error fetching client orders:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/account/client-messages
export const getClientMessages = async (req: Request, res: Response) => {
  try {
    const contactId = req.query.contactId as string;
    if (!contactId) return res.status(400).json({ error: 'Missing contactId' });

    const messages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
      take: 100
    });

    return res.json({ success: true, messages });
  } catch (err: any) {
    console.error('Error fetching client messages:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/account/client-message
export const sendClientMessage = async (req: Request, res: Response) => {
  try {
    const { contactId, messageText } = req.body;
    if (!contactId || !messageText) {
      return res.status(400).json({ error: 'Missing contactId or messageText' });
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { workspace: true }
    });

    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const newMessage = await prisma.message.create({
      data: {
        workspaceId: contact.workspaceId,
        contactId: contact.id,
        direction: 'INBOUND',
        lane: 'SUPPORT',
        content: { body: messageText },
        status: 'READ'
      }
    });

    // Notify workspace and contact socket rooms
    try {
      const { getIo } = require('../../config/socket');
      const io = getIo();
      io.to(contact.workspaceId).emit('newMessage', newMessage);
      io.to(`contact:${contact.id}`).emit('newMessage', newMessage);
    } catch (e) {}

    // If bot is enabled, generate automated AI response
    if (contact.botEnabled) {
      const { processInboundWhatsAppMessage } = require('../services/whatsappService');
      processInboundWhatsAppMessage({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: contact.workspace.metaPhoneNumberId || 'mobile-sim' },
              contacts: [{ wa_id: contact.phoneNumber, profile: { name: contact.name || 'Client' } }],
              messages: [{
                from: contact.phoneNumber,
                id: 'm_' + Date.now(),
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: { body: messageText },
                type: 'text'
              }]
            }
          }]
        }]
      }).catch((botErr: any) => console.error('Error generating AI reply:', botErr));
    }

    return res.json({ success: true, message: newMessage });
  } catch (err: any) {
    console.error('Error in sendClientMessage:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

