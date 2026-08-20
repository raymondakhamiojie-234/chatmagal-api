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
      resetToken: token,
      resetExpiry: { gt: new Date() }
    }
  });

  if (!contact) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif; text-align:center; padding:50px;">
        <h2>Link Expired or Invalid</h2>
        <p>Please request a new setup link from the Falcus Media chat.</p>
      </body></html>
    `);
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
          <form action="/api/account/setup" method="POST">
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
      resetToken: token,
      resetExpiry: { gt: new Date() }
    }
  });

  if (!contact) {
    return res.status(400).send('Link Expired or Invalid.');
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

  // Mock sending email: In a real app we'd use SendGrid or Nodemailer here.
  console.log(`📧 [EMAIL MOCK] Sent verification code ${verificationCode} to ${contact.email}`);

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
          <form action="/api/account/recover" method="POST">
            <input type="hidden" name="token" value="\${token}" />
            <input type="password" name="password" placeholder="New Password" required minlength="8" />
            <button type="submit">Reset Password</button>
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
      resetToken: token,
      resetExpiry: { gt: new Date() }
    }
  });

  if (!contact) {
    return res.status(400).send('Link Expired or Invalid.');
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
