// PDF -> içerik paketi (Gemini API, ücretsiz katman, kendi anahtarınla)
import { S } from './store.js';
import { normalizePack } from './packs.js';

const SCHEMA_TEXT = `JSON şeması (SADECE bu JSON'u döndür, açıklama yazma):
{
  "title": "Paket adı", "course": "Ders adı", "emoji": "tek emoji",
  "topics": [ { "name": "Konu adı", "examHits": 0 } ],
  "cards": [
    { "type": "info", "topic": "Konu adı", "hook": "max 12 kelimelik merak uyandıran kanca", "body": "1-3 kısa cümle, en önemli terimler **kalın**", "emoji": "🧬", "mnemonic": "(varsa) akılda tutma kodu" },
    { "type": "mcq", "topic": "Konu adı", "hook": "kısa kanca", "question": "Soru", "options": ["A","B","C","D","E"], "answer": 0, "explain": "neden doğru, 1-2 cümle", "exam": "" },
    { "type": "tf", "topic": "Konu adı", "hook": "kısa kanca", "statement": "İfade", "answer": true, "explain": "1 cümle" }
  ]
}`;

const STYLE = `Sen tıp fakültesi öğrencileri için "sağlıklı brainrot" tarzında mikro-öğrenme içeriği üreten bir eğitmensin.
Kurallar:
- Dil: Türkçe. Tıbbi terimlerin doğru yazımını koru, gerekirse Latince/İngilizce karşılığı parantezde.
- Her kart TEK bir bilgi taşır, 10 saniyede okunur. Uzun paragraf yok.
- "hook": Shorts videosu açılışı gibi: şaşırtıcı, merak uyandıran, soru soran ya da karşılaştıran bir cümle. Clickbait ama YALAN DEĞİL.
- Akılda kalıcılık: benzetmeler, abartılı ama doğru imgeler, kısaltma/kodlamalar (mnemonic), karşıtlıklar kullan.
- Bilgi doğruluğu en önemli kural: sadece PDF'te olan ya da standart ders kitabı bilgisi; emin olmadığın şeyi yazma.
- Kart sırası: konu anlatım sırasını takip et. Yaklaşık her 3 bilgi kartından sonra o bilgileri yoklayan 1 soru kartı (mcq veya tf) koy.
- Hocanın sınavda soracağı tipteki bilgilere (tanımlar, sayılar, sınıflamalar, istisnalar, "en sık/ilk/tek" bilgileri) öncelik ver.`;

export function buildPrompt(kind, existingHooks = [], count = 40) {
  let task;
  if (kind === 'exam') {
    task = `Ekteki PDF ÇIKMIŞ SINAV SORULARI içeriyor.
- Her soruyu "mcq" (veya doğru/yanlış ise "tf") kartına çevir. Soru metnini ve şıkları olduğu gibi koru (yazım hatalarını düzelt).
- "exam" alanına sorunun kaynağını yaz (ör. "2023 Kurul 1 Final"). Bilinmiyorsa "Çıkmış soru".
- Cevap anahtarı PDF'te varsa onu kullan. Yoksa doğru cevabı sen belirle ve karta "aiAnswer": true ekle.
- "hook": sorunun neyi yokladığını eğlenceli bir şekilde söyleyen kısa cümle (ör. "Hocanın en sevdiği tuzak: …").
- "explain": doğru cevabın nedeni + yanlış şıkların neden yanlış olduğu, kısa.
- "topics" listesinde her konu için "examHits" = o konudan kaç soru geldiği. Bu, öğrencinin "hoca radarı" olacak.
- Ayrıca en sık sorulan 3-5 konu için, sorunun yokladığı bilgiyi öğreten birer "info" kartı ekle (hook'ta "📌 Sık soruluyor" gibi ifade kullanabilirsin).`;
  } else {
    task = `Ekteki PDF bir KONU ANLATIMI / DERS SLAYTI.
- Yaklaşık ${count} kart üret (en fazla ${count + 10}). Önemli bilgilerin hepsini kapsamaya çalış.
- Tüm "examHits" değerleri 0 olsun (çıkmış soru bilgisi yok).`;
  }
  const avoid = existingHooks.length
    ? `\nBu paket için zaten şu kancalar var, bunları ve aynı bilgileri TEKRARLAMA, PDF'in kalan kısımlarından devam et:\n- ${existingHooks.slice(-80).join('\n- ')}`
    : '';
  return `${STYLE}\n\nGÖREV:\n${task}${avoid}\n\n${SCHEMA_TEXT}`;
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
}

function extractJSON(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('Yapay zekâ geçerli JSON döndürmedi');
}

export async function generateFromPdf({ files, kind, title, course, existingHooks = [], onStatus = () => {} }) {
  const { apiKey, model } = S().settings;
  if (!apiKey) throw new Error('Önce Ayarlar\'dan ücretsiz Gemini API anahtarını gir.');
  const size = files.reduce((s, f) => s + f.size, 0);
  if (size > 18 * 1024 * 1024) throw new Error('Dosyalar toplamda 18 MB\'tan küçük olmalı. PDF\'i bölüp parça parça ekle.');
  onStatus('PDF okunuyor…');
  const parts = [];
  for (const f of files) parts.push({ inline_data: { mime_type: 'application/pdf', data: await toBase64(f) } });
  parts.push({ text: buildPrompt(kind, existingHooks) + (title ? `\nPaket adı: "${title}".` : '') + (course ? ` Ders: "${course}".` : '') });
  onStatus('Yapay zekâ kartları hazırlıyor… (30-90 sn sürebilir)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 32000 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 429) throw new Error('Ücretsiz kota doldu (429). Bir dakika bekle ya da yarın dene. ' + msg);
    if (res.status === 400 && /API key/i.test(msg)) throw new Error('API anahtarı geçersiz görünüyor.');
    throw new Error(`Gemini hatası (${res.status}): ${msg}`);
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error('Boş yanıt geldi (' + (data.candidates?.[0]?.finishReason || 'bilinmiyor') + ')');
  onStatus('Kartlar kontrol ediliyor…');
  const raw = extractJSON(text);
  if (title) raw.title = title;
  if (course) raw.course = course;
  return normalizePack(raw);
}
