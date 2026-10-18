/**
 * @file /server/services/mailer.js
 * @description Email delivery service using Nodemailer.
 * Sends dual notifications upon enquiry submission:
 * 1. Detailed alert to firm principals (msfusionarchitects@gmail.com, besimdesigne@gmail.com)
 * 2. Automated acknowledgment email to prospective client.
 * Designed with fault tolerance: failures are logged without blocking lead persistence.
 */

import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

let transporter = null;

/**
 * Initializes and returns the Nodemailer transporter instance if SMTP is configured.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    logger.info(`SMTP Transporter configured with host: ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  } else {
    logger.warn('SMTP credentials not configured in environment. Outgoing emails will be logged only.');
  }

  return transporter;
}

/**
 * Formats calculator estimation data into a readable summary.
 * @param {string|null} calcDataJson 
 * @returns {string} HTML snippet
 */
function formatCalculatorSummary(calcDataJson) {
  if (!calcDataJson) return '<p><em>No calculator estimation parameters provided.</em></p>';
  try {
    const data = typeof calcDataJson === 'string' ? JSON.parse(calcDataJson) : calcDataJson;
    return `
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
        ${Object.entries(data).map(([k, v]) => `
          <tr>
            <td style="padding: 6px 12px; border: 1px solid #e2e8f0; font-weight: 600; text-transform: capitalize; background: #f8fafc; width: 40%;">${k.replace(/_/g, ' ')}</td>
            <td style="padding: 6px 12px; border: 1px solid #e2e8f0;">${typeof v === 'object' ? JSON.stringify(v) : v}</td>
          </tr>
        `).join('')}
      </table>
    `;
  } catch (_) {
    return `<p>${calcDataJson}</p>`;
  }
}

/**
 * Sends internal notification to firm principals and client confirmation email.
 * @param {Object} enquiry - Full enquiry database record
 */
export async function sendEnquiryEmails(enquiry) {
  const mailer = getTransporter();

  const recipients = env.NOTIFY_EMAILS.split(',').map((e) => e.trim());
  const fromAddress = env.SMTP_USER ? `"Besim Design Portal" <${env.SMTP_USER}>` : '"Besim Design Portal" <no-reply@besimdesign.com>';

  // 1. Internal Notification Email
  const internalHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
        .card { background-color: #ffffff; max-width: 650px; margin: 0 auto; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background-color: #0f172a; padding: 24px; color: #ffffff; border-bottom: 3px solid #c5a880; }
        .header h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
        .content { padding: 24px; }
        .meta-row { display: flex; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
        .meta-label { font-weight: 600; width: 140px; color: #64748b; font-size: 13px; text-transform: uppercase; }
        .meta-value { color: #0f172a; font-size: 14px; flex: 1; }
        .message-box { background: #f8fafc; border-left: 4px solid #c5a880; padding: 14px 18px; margin: 18px 0; border-radius: 4px; font-style: italic; }
        .footer { background: #f8fafc; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2>New Commercial Project Enquiry #${enquiry.id}</h2>
        </div>
        <div class="content">
          <div class="meta-row"><div class="meta-label">Client Name:</div><div class="meta-value"><strong>${enquiry.name}</strong></div></div>
          <div class="meta-row"><div class="meta-label">Phone:</div><div class="meta-value"><a href="tel:+91${enquiry.phone}">+91 ${enquiry.phone}</a></div></div>
          <div class="meta-row"><div class="meta-label">Email:</div><div class="meta-value"><a href="mailto:${enquiry.email}">${enquiry.email}</a></div></div>
          <div class="meta-row"><div class="meta-label">Business Type:</div><div class="meta-value"><strong>${enquiry.business_type.toUpperCase()}</strong></div></div>
          <div class="meta-row"><div class="meta-label">Estimated Area:</div><div class="meta-value">${enquiry.area_sqft ? enquiry.area_sqft.toLocaleString() + ' sq.ft' : 'Not specified'}</div></div>
          <div class="meta-row"><div class="meta-label">Location:</div><div class="meta-value">${enquiry.project_location || 'Not specified'}</div></div>
          <div class="meta-row"><div class="meta-label">Lead Source:</div><div class="meta-value">${enquiry.source}</div></div>
          
          <div style="margin-top: 20px;">
            <strong>Project Message / Brief:</strong>
            <div class="message-box">${enquiry.message ? enquiry.message.replace(/\n/g, '<br>') : 'No extra message provided.'}</div>
          </div>

          ${enquiry.calculator_data ? `
            <div style="margin-top: 20px;">
              <strong>Calculator Estimates:</strong>
              ${formatCalculatorSummary(enquiry.calculator_data)}
            </div>
          ` : ''}
        </div>
        <div class="footer">
          Submitted on ${new Date().toLocaleString()} (IST) • Besim Design CRM System
        </div>
      </div>
    </body>
    </html>
  `;

  const internalText = `
New Project Enquiry #${enquiry.id}
Client: ${enquiry.name}
Phone: +91 ${enquiry.phone}
Email: ${enquiry.email}
Business Type: ${enquiry.business_type}
Area: ${enquiry.area_sqft} sq.ft
Location: ${enquiry.project_location || 'N/A'}
Source: ${enquiry.source}
Message: ${enquiry.message || 'None'}
Timestamp: ${new Date().toISOString()}
  `.trim();

  // 2. Client Auto-Acknowledgment Email
  const clientHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
        .header { background-color: #0b0f17; padding: 32px 24px; text-align: center; border-bottom: 3px solid #c5a880; }
        .brand { font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; }
        .tagline { color: #c5a880; font-size: 12px; letter-spacing: 1.5px; margin-top: 6px; }
        .content { padding: 32px 28px; line-height: 1.6; }
        .content h3 { font-size: 18px; color: #0f172a; margin-top: 0; }
        .lead-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px; }
        .footer { background: #f1f5f9; padding: 20px 24px; font-size: 12px; color: #64748b; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="brand">Besim Design</div>
          <div class="tagline">Commercial • Hospitality • Industrial Architecture</div>
        </div>
        <div class="content">
          <h3>Thank you for reaching out, ${enquiry.name}.</h3>
          <p>We have successfully received your project enquiry regarding your <strong>${enquiry.business_type}</strong> development.</p>
          
          <div class="lead-summary">
            <div><strong>Enquiry Reference:</strong> #BD-${enquiry.id.toString().padStart(4, '0')}</div>
            <div><strong>Location:</strong> ${enquiry.project_location || 'To be finalized'}</div>
            <div><strong>Estimated Area:</strong> ${enquiry.area_sqft ? enquiry.area_sqft.toLocaleString() + ' sq.ft' : 'Under assessment'}</div>
          </div>

          <p>Our principal architectural and MEP engineering team is currently reviewing your brief. We will contact you within <strong>1 business day</strong> to discuss space planning, preliminary feasibility, and project delivery timelines.</p>
          
          <p>If you have immediate site drawings, municipal approval documents, or floor plans to share, you can reply directly to this email or reach us at <a href="mailto:besimdesigne@gmail.com">besimdesigne@gmail.com</a>.</p>
          
          <p style="margin-top: 28px;">Warm regards,<br><strong>Principal Architectural Team</strong><br>Besim Design</p>
        </div>
        <div class="footer">
          Besim Design • Delhi NCR | Bengaluru | Mumbai | Goa<br>
          This is an automated confirmation sent in response to your enquiry.
        </div>
      </div>
    </body>
    </html>
  `;

  const clientText = `
Dear ${enquiry.name},

Thank you for contacting Besim Design regarding your ${enquiry.business_type} project.
We have received your enquiry (#BD-${enquiry.id.toString().padStart(4, '0')}).

Our principal architectural team is reviewing your requirements and will reach out to you within 1 business day.
You can reply directly to this email if you have preliminary architectural drawings or floor plans.

Warm regards,
Principal Architectural Team
Besim Design
  `.trim();

  // Execute mail dispatches in background without blocking lead persistence
  if (mailer) {
    try {
      // 1. Send internal alert to both studio inboxes with Reply-To set to the client
      await mailer.sendMail({
        from: fromAddress,
        to: recipients,
        replyTo: `"${enquiry.name}" <${enquiry.email}>`,
        subject: `[New Lead] ${enquiry.business_type.toUpperCase()} Enquiry from ${enquiry.name}`,
        text: internalText,
        html: internalHtml,
      });
      logger.info(`Dispatched lead notification email to: ${recipients.join(', ')}`);

      // 2. Send acknowledgment to client
      await mailer.sendMail({
        from: fromAddress,
        to: enquiry.email,
        subject: `We have received your project enquiry — Besim Design`,
        text: clientText,
        html: clientHtml,
      });
      logger.info(`Dispatched auto-acknowledgment email to client: ${enquiry.email}`);
    } catch (err) {
      logger.error('Failed to dispatch outgoing emails via SMTP transporter:', err);
    }
  } else {
    logger.info(`[MAIL SIMULATION] Internal notification ready for ${recipients.join(', ')} and confirmation for ${enquiry.email}`);
  }
}

export default {
  sendEnquiryEmails,
};
