/**
 * @file /server/services/csvExport.js
 * @description RFC 4180 compliant CSV generator for exporting CRM enquiries.
 * Handles embedded quotes, commas, tabs, and line breaks safely.
 */

/**
 * Escapes a single CSV cell value according to RFC 4180 standards.
 * @param {any} val 
 * @returns {string} Escaped cell
 */
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // If string contains comma, quote, or newline, wrap in quotes and double existing quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Converts an array of enquiry database records into an RFC 4180 CSV string.
 * @param {Array<Object>} enquiries 
 * @returns {string} CSV text
 */
export function generateEnquiriesCsv(enquiries) {
  const headers = [
    'ID',
    'Created At',
    'Client Name',
    'Phone',
    'Email',
    'Business Type',
    'Project Location',
    'Area (Sq.Ft)',
    'Lead Source',
    'Pipeline Status',
    'Consent Given',
    'Admin Notes',
    'Client Message',
    'Calculator Data',
  ];

  const rows = enquiries.map((e) => [
    e.id,
    e.created_at,
    e.name,
    e.phone,
    e.email,
    e.business_type,
    e.project_location || '',
    e.area_sqft || 0,
    e.source,
    e.status,
    e.consent_given ? 'Yes' : 'No',
    e.admin_notes || '',
    e.message || '',
    e.calculator_data || '',
  ]);

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  return csvLines.join('\r\n');
}

export default {
  generateEnquiriesCsv,
};
