// Patches the bookings namespace with new editor-related strings (presets,
// per-day accordion, copy-to flow). Idempotent — runs as many times as you
// want without duplicating keys.

import { readFileSync, writeFileSync } from 'node:fs';

const PATCHES = {
  es: {
    weekdayLong: { mon: 'lunes', tue: 'martes', wed: 'miércoles', thu: 'jueves', fri: 'viernes', sat: 'sábado', sun: 'domingo' },
    editor: {
      presetsTitle: 'Plantillas rápidas',
      presetsHint: 'Aplica una plantilla a tus días laborables y luego ajusta lo que quieras.',
      byDay: 'Por día',
      closedDay: 'Cerrado',
      closed: 'Cerrado',
      open: 'Abierto',
      addRange: 'Añadir horario',
      copyTo: 'Copiar a otros días',
      copyFromHint: 'Copiar el horario de {{day}} a:',
      copyToWeekdays: 'Aplicar a Lun-Vie',
      orPickDays: 'O elige días',
      applyCopy: 'Aplicar',
      overlap: 'Ese horario se solapa con otro existente.',
      preset: {
        morning: { label: 'Mañanas' },
        afternoon: { label: 'Tardes' },
        morning_afternoon: { label: 'Mañana y tarde' },
        full_day: { label: 'Día completo' },
        applyQuestion: '¿A qué días aplicarlo?',
        applyWeekdays: 'Sólo Lun-Vie',
        applyAll: 'Toda la semana',
      },
    },
  },
  en: {
    weekdayLong: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
    editor: {
      presetsTitle: 'Quick templates',
      presetsHint: 'Apply a template to your weekdays and then tweak as you like.',
      byDay: 'Per day',
      closedDay: 'Closed',
      closed: 'Closed',
      open: 'Open',
      addRange: 'Add time range',
      copyTo: 'Copy to other days',
      copyFromHint: 'Copy {{day}} schedule to:',
      copyToWeekdays: 'Apply to Mon-Fri',
      orPickDays: 'Or pick days',
      applyCopy: 'Apply',
      overlap: 'That range overlaps with an existing one.',
      preset: {
        morning: { label: 'Mornings' },
        afternoon: { label: 'Afternoons' },
        morning_afternoon: { label: 'Morning + afternoon' },
        full_day: { label: 'Full day' },
        applyQuestion: 'Apply to which days?',
        applyWeekdays: 'Mon-Fri only',
        applyAll: 'Whole week',
      },
    },
  },
  fr: {
    weekdayLong: { mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi', fri: 'vendredi', sat: 'samedi', sun: 'dimanche' },
    editor: {
      presetsTitle: 'Modèles rapides',
      presetsHint: 'Applique un modèle aux jours de semaine puis ajuste à ta guise.',
      byDay: 'Par jour',
      closedDay: 'Fermé',
      closed: 'Fermé',
      open: 'Ouvert',
      addRange: 'Ajouter un créneau',
      copyTo: 'Copier vers d\'autres jours',
      copyFromHint: 'Copier l\'horaire de {{day}} à :',
      copyToWeekdays: 'Appliquer Lun-Ven',
      orPickDays: 'Ou choisis les jours',
      applyCopy: 'Appliquer',
      overlap: 'Ce créneau chevauche un autre existant.',
      preset: {
        morning: { label: 'Matinées' },
        afternoon: { label: 'Après-midis' },
        morning_afternoon: { label: 'Matin et après-midi' },
        full_day: { label: 'Journée complète' },
        applyQuestion: 'À quels jours ?',
        applyWeekdays: 'Lun-Ven seulement',
        applyAll: 'Toute la semaine',
      },
    },
  },
  pt: {
    weekdayLong: { mon: 'segunda', tue: 'terça', wed: 'quarta', thu: 'quinta', fri: 'sexta', sat: 'sábado', sun: 'domingo' },
    editor: {
      presetsTitle: 'Modelos rápidos',
      presetsHint: 'Aplica um modelo aos teus dias úteis e depois ajusta como quiseres.',
      byDay: 'Por dia',
      closedDay: 'Fechado',
      closed: 'Fechado',
      open: 'Aberto',
      addRange: 'Adicionar horário',
      copyTo: 'Copiar para outros dias',
      copyFromHint: 'Copiar o horário de {{day}} para:',
      copyToWeekdays: 'Aplicar Seg-Sex',
      orPickDays: 'Ou escolhe dias',
      applyCopy: 'Aplicar',
      overlap: 'Esse horário sobrepõe-se a outro existente.',
      preset: {
        morning: { label: 'Manhãs' },
        afternoon: { label: 'Tardes' },
        morning_afternoon: { label: 'Manhã e tarde' },
        full_day: { label: 'Dia completo' },
        applyQuestion: 'A que dias aplicar?',
        applyWeekdays: 'Só Seg-Sex',
        applyAll: 'Semana completa',
      },
    },
  },
  de: {
    weekdayLong: { mon: 'Montag', tue: 'Dienstag', wed: 'Mittwoch', thu: 'Donnerstag', fri: 'Freitag', sat: 'Samstag', sun: 'Sonntag' },
    editor: {
      presetsTitle: 'Schnellvorlagen',
      presetsHint: 'Wende eine Vorlage auf deine Wochentage an und passe nach Belieben an.',
      byDay: 'Pro Tag',
      closedDay: 'Geschlossen',
      closed: 'Geschlossen',
      open: 'Offen',
      addRange: 'Zeitfenster hinzufügen',
      copyTo: 'Auf andere Tage kopieren',
      copyFromHint: 'Plan von {{day}} kopieren auf:',
      copyToWeekdays: 'Auf Mo-Fr anwenden',
      orPickDays: 'Oder Tage wählen',
      applyCopy: 'Anwenden',
      overlap: 'Dieses Zeitfenster überschneidet sich mit einem bestehenden.',
      preset: {
        morning: { label: 'Vormittage' },
        afternoon: { label: 'Nachmittage' },
        morning_afternoon: { label: 'Vor- und Nachmittag' },
        full_day: { label: 'Ganzer Tag' },
        applyQuestion: 'Auf welche Tage?',
        applyWeekdays: 'Nur Mo-Fr',
        applyAll: 'Ganze Woche',
      },
    },
  },
};

for (const lang of ['es', 'en', 'fr', 'pt', 'de']) {
  const path = `src/locales/${lang}.json`;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  j.bookings = j.bookings ?? {};
  j.bookings.weekday = j.bookings.weekday ?? {};
  j.bookings.weekday.long = PATCHES[lang].weekdayLong;
  j.bookings.editor = j.bookings.editor ?? {};
  Object.assign(j.bookings.editor, PATCHES[lang].editor);
  // Update foot hint to match the new pattern (was "tap a chip to remove")
  j.bookings.editor.tapChipToRemove = lang === 'es'
    ? 'Toca una hora para quitarla.'
    : lang === 'en'
    ? 'Tap a time to remove it.'
    : lang === 'fr'
    ? 'Appuie sur un créneau pour le supprimer.'
    : lang === 'pt'
    ? 'Toca num horário para o remover.'
    : 'Tippe auf eine Zeit zum Entfernen.';
  writeFileSync(path, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('OK', path);
}
