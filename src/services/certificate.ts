import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { Dog } from '../types';
import { DogStats, getLevelInfo, LEVELS } from './dogStats';
import { COURSE_META } from '../data/courseMeta';

export interface CertificateData {
  dog: Dog;
  stats: DogStats;
  /** Translated strings — caller passes them in to keep the service language-agnostic. */
  strings: CertificateStrings;
  /** Optional photo as data URI (HTTPS URLs also work but data URIs render offline). */
  photoDataUri?: string;
}

export interface CertificateStrings {
  title: string;                  // "Certificate of Achievement"
  subtitle: string;               // "Dogly Train official"
  certifyText: string;            // "We hereby certify that"
  hasCompleted: string;           // "has completed {{count}} training courses"
  withXp: string;                 // "earning {{xp}} XP"
  reachingLevel: string;          // "reaching level {{level}}"
  levelName: string;              // "Maestro" / "Apprentice" / etc.
  longestStreak: string;          // "Longest streak: {{count}} days"
  coursesLabel: string;           // "Completed courses"
  issuedOn: string;               // "Issued on {{date}}"
  signatureLabel: string;         // "Dogly Train"
  signatureSubtitle: string;      // "Official trainer marketplace"
  shareDialogTitle: string;       // "Share certificate"
  /** Localized course titles keyed by course id. */
  courseTitles: Record<string, string>;
}

// ── HTML template ────────────────────────────────────────────────────────────

const LEVEL_COLORS = ['#22C55E', '#84CC16', '#F59E0B', '#EF4444', '#8B5CF6'];

function buildHtml(data: CertificateData): string {
  const { dog, stats, strings, photoDataUri } = data;
  const level = getLevelInfo(stats.level);
  const levelColor = LEVEL_COLORS[stats.level - 1] ?? '#F5A623';
  const completed = stats.completedCourseIds ?? [];

  // Group courses by difficulty
  const grouped: Record<string, string[]> = {
    very_basic: [], basic: [], intermediate: [], advanced: [], expert: [],
  };
  for (const id of completed) {
    const meta = COURSE_META[id];
    if (meta) grouped[meta.difficulty]?.push(id);
  }
  const difficultyOrder = ['very_basic', 'basic', 'intermediate', 'advanced', 'expert'];

  const courseRows = difficultyOrder
    .filter((d) => grouped[d].length > 0)
    .map((d) => {
      const items = grouped[d]
        .map((id) => `<li>${COURSE_META[id]?.emoji ?? '🐶'} ${escape(strings.courseTitles[id] ?? id)}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    })
    .join('');

  const photoHtml = photoDataUri
    ? `<img class="dog-photo" src="${photoDataUri}" alt="dog" />`
    : `<div class="dog-photo-placeholder">${escape((dog.name || '🐶').charAt(0).toUpperCase())}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fafafa;
      color: #1f2937;
    }
    .page {
      width: 100vw;
      min-height: 100vh;
      padding: 40px 60px;
      background: linear-gradient(135deg, #fff8ec 0%, #fff 50%, #ecf6ff 100%);
      border: 14px solid ${levelColor};
      border-radius: 12px;
    }
    .ribbon {
      display: inline-block;
      background: ${levelColor};
      color: white;
      padding: 6px 18px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .title {
      font-size: 42px;
      font-weight: 900;
      color: ${levelColor};
      letter-spacing: -1px;
      line-height: 1.1;
    }
    .subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
      letter-spacing: 0.5px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
    }
    .logo {
      text-align: right;
      color: ${levelColor};
      font-weight: 900;
      font-size: 18px;
    }
    .logo small {
      display: block;
      font-size: 10px;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .body {
      display: flex;
      gap: 40px;
      align-items: center;
    }
    .dog-photo,
    .dog-photo-placeholder {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      object-fit: cover;
      border: 6px solid ${levelColor};
      flex-shrink: 0;
    }
    .dog-photo-placeholder {
      background: ${levelColor};
      color: #fff;
      font-size: 80px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .body-text { flex: 1; }
    .certify {
      font-size: 16px;
      color: #6b7280;
      font-style: italic;
    }
    .dog-name {
      font-size: 56px;
      font-weight: 900;
      color: #1f2937;
      margin: 6px 0 12px 0;
      letter-spacing: -1px;
    }
    .achievement {
      font-size: 17px;
      color: #1f2937;
      line-height: 1.6;
    }
    .stats-row {
      display: flex;
      gap: 20px;
      margin-top: 24px;
      flex-wrap: wrap;
    }
    .stat {
      background: white;
      border: 2px solid ${levelColor}40;
      border-radius: 12px;
      padding: 14px 20px;
      text-align: center;
      min-width: 110px;
    }
    .stat-value {
      font-size: 28px;
      font-weight: 900;
      color: ${levelColor};
      line-height: 1;
    }
    .stat-key {
      font-size: 10px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
    }
    .level-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: ${levelColor};
      color: white;
      padding: 8px 18px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 16px;
      margin-top: 12px;
    }
    .level-badge .emoji {
      font-size: 22px;
    }
    .courses-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px dashed ${levelColor}50;
    }
    .courses-label {
      font-size: 11px;
      font-weight: 800;
      color: ${levelColor};
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 10px;
    }
    .courses-section ul {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px 18px;
      margin-bottom: 10px;
    }
    .courses-section li {
      font-size: 13px;
      color: #1f2937;
      padding: 4px 0;
    }
    .footer {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 12px;
      color: #6b7280;
    }
    .signature {
      text-align: right;
      border-top: 1.5px solid #1f2937;
      padding-top: 6px;
      min-width: 200px;
    }
    .signature strong { color: #1f2937; font-size: 14px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <span class="ribbon">${escape(strings.subtitle)}</span>
        <h1 class="title">${escape(strings.title)}</h1>
      </div>
      <div class="logo">
        🐾 Dogly Train
        <small>Certified Progress</small>
      </div>
    </div>

    <div class="body">
      ${photoHtml}
      <div class="body-text">
        <div class="certify">${escape(strings.certifyText)}</div>
        <div class="dog-name">${escape(dog.name)}</div>
        <div class="achievement">
          ${escape(strings.hasCompleted.replace('{{count}}', String(completed.length)))} ·
          ${escape(strings.withXp.replace('{{xp}}', String(stats.xp)))}
        </div>
        <div class="level-badge">
          <span class="emoji">${level.emoji}</span>
          ${escape(strings.reachingLevel.replace('{{level}}', String(stats.level)))} — ${escape(strings.levelName)}
        </div>
        <div class="stats-row">
          <div class="stat">
            <div class="stat-value">${completed.length}</div>
            <div class="stat-key">${escape(strings.coursesLabel)}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.xp}</div>
            <div class="stat-key">XP</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.longestStreak}</div>
            <div class="stat-key">${escape(strings.longestStreak.replace('{{count}}', '').trim() || 'Streak')}</div>
          </div>
        </div>
      </div>
    </div>

    ${courseRows ? `<div class="courses-section">
      <div class="courses-label">${escape(strings.coursesLabel)}</div>
      ${courseRows}
    </div>` : ''}

    <div class="footer">
      <div>${escape(strings.issuedOn.replace('{{date}}', new Date().toLocaleDateString()))}</div>
      <div class="signature">
        <strong>${escape(strings.signatureLabel)}</strong><br />
        ${escape(strings.signatureSubtitle)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * Generate a PDF certificate and present the native share sheet.
 * Throws if generation fails; caller should wrap in try/catch.
 */
export async function generateAndShareCertificate(data: CertificateData): Promise<void> {
  const html = buildHtml(data);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 842,   // A4 landscape pt
    height: 595,
  });

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    // On platforms without sharing, fall back to opening the print dialog
    await Print.printAsync({ uri });
    return;
  }

  await Sharing.shareAsync(uri, {
    dialogTitle: data.strings.shareDialogTitle,
    mimeType: 'application/pdf',
    UTI: Platform.OS === 'ios' ? 'com.adobe.pdf' : undefined,
  });
}
