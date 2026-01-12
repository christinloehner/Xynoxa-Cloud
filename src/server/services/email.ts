/*
 * Copyright (C) 2025 Christin Löhner
 */

import nodemailer from 'nodemailer';

const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "127.0.0.1",
    port: Number(process.env.MAIL_PORT) || 2525,
    auth: process.env.MAIL_USERNAME ? {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
    } : undefined
});

export async function sendEmail({
    to,
    subject,
    html
}: {
    to: string;
    subject: string;
    html: string;
}) {
    const from = process.env.MAIL_FROM_ADDRESS
        ? `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`
        : '"Xynoxa Cloud" <hello@example.com>';

    await transport.sendMail({
        from,
        to,
        subject,
        html
    });
}
