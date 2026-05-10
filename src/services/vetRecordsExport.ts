import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Dog, VetRecord, VetRecordType } from '../types';

export interface VetExportStrings {
  title: string;
  subtitle: string;
  dogName: string;
  dogBreed: string;
  dogAge: string;
  ageYears: string;
  ageMonths: string;
  emptyHint: string;
  typeLabel: Record<VetRecordType, string>;
  fields: {
    date: string;
    vetName: string;
    clinic: string;
    notes: string;
    productName: string;
    batchNumber: string;
    nextDueAt: string;
    severity: string;
  };
  severity: { low: string; medium: string; high: string };
  generatedOn: string;             // "Generated on {{date}}"
  signature: string;
  signatureSubtitle: string;
  shareDialogTitle: string;
}

export interface VetExportData {
  dog: Dog;
  records: VetRecord[];
  strings: VetExportStrings;
  /** Locale for date formatting. Defaults to 'es-ES'. */
  locale?: string;
}

const TYPE_COLORS: Record<VetRecordType, string> = {
  vaccine: '#10B981',
  visit: '#3B82F6',
  allergy: '#F59E0B',
  medication: '#8B5CF6',
  surgery: '#EF4444',
  lab_result: '#06B6D4',
};

const TYPE_EMOJIS: Record<VetRecordType, string> = {
  vaccine: '💉',
  visit: '🩺',
  allergy: '⚠️',
  medication: '💊',
  surgery: '🏥',
  lab_result: '🧪',
};

function escapeHtml(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

function buildHtml(data: VetExportData): string {
  const { dog, records, strings } = data;
  const locale = data.locale ?? 'es-ES';

  const ageStr = `${dog.age} ${dog.age === 1 ? strings.ageYears : strings.ageMonths}`;

  const recordRows = records.length === 0
    ? `<tr><td colspan="3" class="empty">${escapeHtml(strings.emptyHint)}</td></tr>`
    : records.map((r) => {
      const tint = TYPE_COLORS[r.type];
      const emoji = TYPE_EMOJIS[r.type];
      const dateStr = formatDate(r.date.toDate(), locale);
      const fields: string[] = [];
      if (r.vetName) fields.push(`<strong>${escapeHtml(strings.fields.vetName)}:</strong> ${escapeHtml(r.vetName)}`);
      if (r.clinic) fields.push(`<strong>${escapeHtml(strings.fields.clinic)}:</strong> ${escapeHtml(r.clinic)}`);
      if (r.productName) fields.push(`<strong>${escapeHtml(strings.fields.productName)}:</strong> ${escapeHtml(r.productName)}`);
      if (r.batchNumber) fields.push(`<strong>${escapeHtml(strings.fields.batchNumber)}:</strong> ${escapeHtml(r.batchNumber)}`);
      if (r.nextDueAt) fields.push(`<strong>${escapeHtml(strings.fields.nextDueAt)}:</strong> ${escapeHtml(formatDate(r.nextDueAt.toDate(), locale))}`);
      if (r.severity) fields.push(`<strong>${escapeHtml(strings.fields.severity)}:</strong> ${escapeHtml(strings.severity[r.severity])}`);
      const meta = fields.length ? `<div class="meta">${fields.join(' · ')}</div>` : '';
      const notes = r.notes ? `<div class="notes">${escapeHtml(r.notes)}</div>` : '';
      return `
        <tr>
          <td class="date-col">
            <div class="date-pill" style="background:${tint}22; color:${tint};">${escapeHtml(dateStr)}</div>
          </td>
          <td class="type-col">
            <div class="type-tag" style="background:${tint};">${emoji} ${escapeHtml(strings.typeLabel[r.type])}</div>
          </td>
          <td class="content-col">
            <div class="title">${escapeHtml(r.title)}</div>
            ${meta}
            ${notes}
          </td>
        </tr>
      `;
    }).join('');

  const dogPhotoHtml = dog.photoURL
    ? `<img class="dog-photo" src="${escapeHtml(dog.photoURL)}" alt="${escapeHtml(dog.name)}" />`
    : `<div class="dog-photo-placeholder">${escapeHtml((dog.name || 'D').charAt(0).toUpperCase())}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 32px 24px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; }
    .header {
      display: flex; gap: 18px; align-items: center;
      padding-bottom: 16px; border-bottom: 3px solid #F5A623;
      margin-bottom: 20px;
    }
    .dog-photo, .dog-photo-placeholder {
      width: 80px; height: 80px; border-radius: 50%; object-fit: cover;
      border: 4px solid #F5A623; flex-shrink: 0;
    }
    .dog-photo-placeholder {
      background: #F5A623; color: #fff; font-size: 36px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
    }
    .title-block { flex: 1; }
    .title-block h1 { font-size: 22px; color: #F5A623; }
    .title-block .sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .dog-meta { font-size: 13px; color: #1f2937; margin-top: 6px; }
    .dog-meta strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; color: #6b7280; text-transform: uppercase;
         letter-spacing: 1px; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; font-size: 12px; }
    .date-col { width: 90px; }
    .type-col { width: 130px; }
    .date-pill { display: inline-block; padding: 4px 8px; border-radius: 999px; font-weight: 700; font-size: 11px; }
    .type-tag { display: inline-block; color: #fff; padding: 4px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
    .title { font-weight: 800; font-size: 13px; color: #1f2937; }
    .meta { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
    .notes { font-size: 11px; color: #1f2937; margin-top: 6px; line-height: 1.5; font-style: italic; padding: 6px 8px; background: #f9fafb; border-left: 3px solid #F5A623; }
    .empty { text-align: center; color: #9ca3af; padding: 40px 0 !important; font-style: italic; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb;
              display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
    .footer strong { color: #1f2937; }
  </style>
</head>
<body>
  <div class="header">
    ${dogPhotoHtml}
    <div class="title-block">
      <h1>🐾 ${escapeHtml(strings.title)}</h1>
      <div class="sub">${escapeHtml(strings.subtitle)}</div>
      <div class="dog-meta">
        <strong>${escapeHtml(strings.dogName)}:</strong> ${escapeHtml(dog.name)}
        &nbsp;·&nbsp; <strong>${escapeHtml(strings.dogBreed)}:</strong> ${escapeHtml(dog.breed)}
        &nbsp;·&nbsp; <strong>${escapeHtml(strings.dogAge)}:</strong> ${escapeHtml(ageStr)}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${escapeHtml(strings.fields.date)}</th>
        <th>${escapeHtml(strings.typeLabel.vaccine).split(' ')[0]}</th>
        <th>${escapeHtml(strings.title)}</th>
      </tr>
    </thead>
    <tbody>
      ${recordRows}
    </tbody>
  </table>

  <div class="footer">
    <div>${escapeHtml(strings.generatedOn.replace('{{date}}', new Date().toLocaleDateString(locale)))}</div>
    <div>
      <strong>${escapeHtml(strings.signature)}</strong> · ${escapeHtml(strings.signatureSubtitle)}
    </div>
  </div>
</body>
</html>`;
}

export async function exportVetRecordsPdf(data: VetExportData): Promise<void> {
  const html = buildHtml(data);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    await Print.printAsync({ uri });
    return;
  }
  await Sharing.shareAsync(uri, {
    dialogTitle: data.strings.shareDialogTitle,
    mimeType: 'application/pdf',
    UTI: Platform.OS === 'ios' ? 'com.adobe.pdf' : undefined,
  });
}
