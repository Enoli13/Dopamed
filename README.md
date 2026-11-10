# 🧠 Dopamed: sağlıklı brainrot ile tıp çalışması (Android)

> Tıp fakültesi ve ders çalışma uygulaması: PDF'ten kart, çıkmış soru düellosu, aralıklı tekrar (flashcard / spaced repetition).

🌐 **Proje sayfası:** [https://enoli13.github.io/dopamed/](https://enoli13.github.io/dopamed/) · ⬇ [Son sürümü indir](https://github.com/Enoli13/dopamed/releases/latest)


Konu PDF'lerini, ders slaytlarını ve çıkmış soruları Reels/Shorts tadında kısa kartlara çeviren Android uygulaması. Reklam yok, satın alma yok, tamamen ücretsiz.

## Ne yapıyor?

| Özellik | Nasıl çalışıyor |
|---|---|
| 📱 **Shorts tarzı akış** | Dikey kaydırma. Her kart tek bir bilgi, merak uyandıran bir kanca cümlesi ve akılda tutma kodu içeriyor. Araya mini sorular giriyor. |
| ⚔️ **Çıkmış soru düellosu** | 10 soruluk, süreli ve combo puanlı yarış. Rakibin kendi rekorun. Çıkmış sorular ve hocanın sevdiği konular daha sık geliyor. |
| 🔁 **Aralıklı tekrar (SRS)** | Yanlış yaptığın ya da "tekrar göster" dediğin kartlar 10 dakika sonra akışa geri döner. Bildiğin kartların arası 1, 3, 7… gün diye açılır. |
| 🛑 **Günlük hedef ve durma noktası** | Varsayılan hedef 25 kart. Hedef dolunca "bugünlük bitti" ekranı gelir. Günde bir kez +10 bonus tur hakkın var, sonra akış yarına kadar kilitlenir. Sonsuz kaydırma yok. |
| 🎯 **Hoca radarı** | Çıkmış soru PDF'i eklendiğinde her konudan kaç soru geldiğini sayar. Sık sorulan konular "📌 Hocanın favorisi" etiketiyle işaretlenir. |
| ✨ **Değişken ödül, dozunda** | Kartların yaklaşık %12'si "altın kart" (2x XP). Combo, seviye, seri ve konfeti var ama hepsi günlük hedefle sınırlı. |

## Telefona kurmak

1. Bu repoda **Releases** bölümüne git ve en son `Dopamed.apk` dosyasını telefona indir.
2. Dosyayı aç ve "bilinmeyen kaynaklardan yüklemeye izin ver" seçeneğini onayla.
3. Yeni sürümler eskisinin üzerine kurulur, ilerlemen silinmez. Repo sabit bir imza anahtarı kullandığı için bu böyle çalışıyor.

`main` dalına yapılan her push'ta GitHub Actions APK'yı ücretsiz derleyip yeni bir release yayınlar.

## İçerik nereden geliyor? (3 ücretsiz yol)

1. **Hazır paketler:** `www/packs/` klasörüne `.json` dosyası ekleyip adını `www/packs/index.json` dosyasına yaz. Bu paketler uygulamanın içinde gelir.
2. **Uygulama içinden yapay zekâ ile:** Ayarlar'a ücretsiz bir Gemini API anahtarı gir (aistudio.google.com/apikey adresinden alınır). Sonra Paketler → "PDF'den üret" adımlarını izle. Taranmış (fotoğraf) PDF'ler de çalışır.
3. **Anahtarsız:** Paketler → "API anahtarı olmadan ücretsiz yöntem" bölümünden komutu kopyala. gemini.google.com'a PDF'i ve komutu ver, çıkan JSON'u "JSON yapıştır" ile ekle.

## Paket formatı

```json
{
  "title": "Hücre Zarı", "course": "Tıbbi Biyoloji", "emoji": "🧫",
  "topics": [{ "name": "Zarın yapısı", "examHits": 3 }],
  "cards": [
    { "type": "info", "topic": "Zarın yapısı", "hook": "Kısa kanca", "body": "1-3 cümle, **kalın** terimler", "emoji": "🌊", "mnemonic": "akılda tutma kodu" },
    { "type": "mcq", "topic": "Zarın yapısı", "question": "Soru?", "options": ["A", "B", "C", "D", "E"], "answer": 2, "explain": "Neden", "exam": "2023 Final" },
    { "type": "tf", "topic": "Zarın yapısı", "statement": "İfade", "answer": false, "explain": "Neden" }
  ]
}
```

`exam` alanı dolu olan sorular çıkmış soru sayılır: düelloda öncelikli gelir ve hoca radarını besler. `"aiAnswer": true` alanı, cevabın PDF'teki anahtardan değil yapay zekâdan geldiğini gösterir; uygulama bu sorularda uyarı gösterir.

## Geliştirme

Uygulama bağımlılıksız düz HTML/CSS/JS ile yazıldı (`www/`). Tarayıcıda denemek için `www` klasöründe `python3 -m http.server` çalıştırıp `localhost:8000` adresini açman yeterli. Android paketi Capacitor ile oluşturuluyor.

- `www/js/store.js`: kayıt, XP, seri ve SRS algoritması
- `www/js/packs.js`: paket doğrulama, günlük tur ve düello soru seçimi
- `www/js/ai.js`: PDF'ten Gemini ile paket üretimi ve komut metni
- `www/js/app.js`: ekranlar

Lisans: MIT
