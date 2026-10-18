// Run: cd src/frontend && npm test   (Node's built-in test runner — no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipKey, splitTemplate, numberClips, buildPlan, missingClips, requiredPieces, announcementTexts, unrecordedTexts } from './voiceClips.js';

test('unrecordedTexts lists the languages of an announcement with no recording', () => {
  const a = { message_text: 'School closes early.', message_text_ar: 'المدرسة تغلق مبكرا', speak_language: 'both' };
  assert.deepEqual(unrecordedTexts(a, {}), [{ lang: 'en', text: 'School closes early.' }, { lang: 'ar', text: 'المدرسة تغلق مبكرا' }]);
  assert.deepEqual(unrecordedTexts(a, { en: { 'School closes early': 'en-1.ogg' } }), [{ lang: 'ar', text: 'المدرسة تغلق مبكرا' }]);
  assert.deepEqual(unrecordedTexts(a, { en: { 'School closes early': 'x' }, ar: { 'المدرسة تغلق مبكرا': 'y' } }), []);
  assert.deepEqual(unrecordedTexts({ message_text: 'Hi' }, undefined), [{ lang: 'en', text: 'Hi' }]);
});

test('clipKey collapses spaces and drops edge punctuation only', () => {
  assert.equal(clipKey('  ، القسم  '), 'القسم');
  assert.equal(clipKey('Attention please.  Number'), 'Attention please. Number');
  assert.equal(clipKey(' . '), '');
});

test('numberClips composes 1–999 from recorded parts', () => {
  assert.deepEqual(numberClips(7, 'en'), ['en/n/7']);
  assert.deepEqual(numberClips(100, 'ar'), ['ar/h/100']);
  assert.deepEqual(numberClips(125, 'ar'), ['ar/h/100', 'ar/wn/25']);   // مية + وخمسة وعشرين
  assert.deepEqual(numberClips(125, 'en'), ['en/h/100', 'en/n/25']);
  assert.deepEqual(numberClips(999, 'ar'), ['ar/h/900', 'ar/wn/99']);
  assert.equal(numberClips(0, 'en'), null);
  assert.equal(numberClips(1000, 'en'), null);
});

test('splitTemplate handles real school templates', () => {
  assert.deepEqual(
    splitTemplate('تنبيه من فضلك. التذكرة رقم {ticket}،  القسم {department} رقم غرفة {room}'),
    [{ text: 'تنبيه من فضلك. التذكرة رقم' }, { var: 'ticket' }, { text: 'القسم' }, { var: 'department' }, { text: 'رقم غرفة' }, { var: 'room' }],
  );
  assert.deepEqual(
    splitTemplate('Attention please.{department} Department  room number {room} Ticket Number {ticket}, '),
    [{ text: 'Attention please' }, { var: 'department' }, { text: 'Department room number' }, { var: 'room' }, { text: 'Ticket Number' }, { var: 'ticket' }],
  );
  assert.deepEqual(splitTemplate('{number}'), [{ var: 'ticket' }]);
});

test('buildPlan uses recordings and falls back to TTS per piece', () => {
  const custom = { ar: { 'التذكرة رقم': 'ar-a.ogg', 'الحسابات': 'ar-b.ogg' } };
  assert.deepEqual(
    buildPlan('التذكرة رقم {ticket} {department} غرفة {room}', { number: 125, department: 'الحسابات', room: '2' }, 'ar', custom),
    [
      { src: '/api/voice/clips/ar-a.ogg' },
      { src: '/voice/ar/h/100.ogg' }, { src: '/voice/ar/wn/25.ogg' },
      { src: '/api/voice/clips/ar-b.ogg' },
      { tts: 'غرفة' },
      { src: '/voice/ar/n/2.ogg' },
    ],
  );
  assert.deepEqual(buildPlan('room {room}', { room: 'B-3' }, 'en'), [{ tts: 'room' }, { tts: 'B-3' }]);
  assert.deepEqual(buildPlan('room {room}', { room: null }, 'en'), [{ tts: 'room' }]);
  assert.deepEqual(buildPlan('{ticket}', { number: 1500 }, 'en'), [{ tts: '1500' }]);
});

test('missingClips lists each unrecorded piece once per language', () => {
  const missing = missingClips(
    { callEn: 'Number {ticket}', recallEn: 'Number {ticket}', callAr: 'رقم {ticket}', recallAr: '' },
    [{ name: 'Student Affairs', name_ar: null }, { name: 'Accounting', name_ar: 'الحسابات' }],
    { ar: { 'رقم': 'x.ogg', 'الحسابات': 'y.ogg' } },
  );
  assert.deepEqual(missing, [
    { lang: 'en', text: 'Number' },
    { lang: 'en', text: 'Student Affairs' },
    { lang: 'en', text: 'Accounting' },
    { lang: 'ar', text: 'Student Affairs' },
  ]);
});

test('announcementTexts follows speak_language, Arabic falls back to the English text', () => {
  assert.deepEqual(announcementTexts({ message_text: 'School closes at 12', message_text_ar: 'المدرسة تغلق ١٢', speak_language: 'both' }),
    [{ lang: 'en', text: 'School closes at 12' }, { lang: 'ar', text: 'المدرسة تغلق ١٢' }]);
  assert.deepEqual(announcementTexts({ message_text: 'Hello', message_text_ar: null, speak_language: 'ar' }), [{ lang: 'ar', text: 'Hello' }]);
  assert.deepEqual(announcementTexts({ message_text: 'Hi' }), [{ lang: 'en', text: 'Hi' }]);
});

test('requiredPieces covers templates, departments and announcements, tagged by source', () => {
  const pieces = requiredPieces(
    { callEn: 'Number {ticket}', recallEn: '', callAr: 'رقم {ticket}', recallAr: '' },
    [{ name: 'Accounting', name_ar: 'الحسابات' }],
    [{ message_text: 'Number', speak_language: 'en' }, { message_text: 'Closing early.', message_text_ar: 'إغلاق مبكر', speak_language: 'both' }],
  );
  assert.deepEqual(pieces, [
    { lang: 'en', text: 'Number', source: 'template' },
    { lang: 'en', text: 'Accounting', source: 'department' },
    { lang: 'ar', text: 'رقم', source: 'template' },
    { lang: 'ar', text: 'الحسابات', source: 'department' },
    { lang: 'en', text: 'Closing early', source: 'announcement' },
    { lang: 'ar', text: 'إغلاق مبكر', source: 'announcement' },
  ]);
});

test('buildPlan uses the active voice folders from the manifest', () => {
  const custom = { voice: 'Yasmin', clips: '/api/voice/clips/Yasmin', numbers: '/api/voice/clips/Yasmin', ar: { 'رقم': 'ar-x.ogg' } };
  assert.deepEqual(buildPlan('رقم {ticket}', { number: 125 }, 'ar', custom), [
    { src: '/api/voice/clips/Yasmin/ar-x.ogg' },
    { src: '/api/voice/clips/Yasmin/ar/h/100.ogg' },
    { src: '/api/voice/clips/Yasmin/ar/wn/25.ogg' },
  ]);
  // Sarah: numbers ship with the app, phrases live in her folder
  assert.deepEqual(buildPlan('{ticket}', { number: 7 }, 'en', { numbers: '/voice', clips: '/api/voice/clips/Sarah' }), [{ src: '/voice/en/n/7.ogg' }]);
});
