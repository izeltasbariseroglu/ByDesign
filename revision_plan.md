# ByDesign - Revizyon Planı

Yapımcı Ece Hanım'ın ilettiği son 30 saniye revizyonlarına istinaden yapılacak teknik değişikliklerin planı aşağıdadır. (Sorular Ece Hanım tarafından yanıtlanmış ve kararlar netleştirilmiştir.)

## Mevcut Durum Analizi ve Kontroller

- **Zamanlayıcı (Timer):** Mevcut `timer.js` dosyasında 120. saniyede (son 30 saniyeye girildiğinde) `BREAK` evresi başlıyor ve sayaç `ERR::[ms]` şeklinde bir hata formatına geçiyor. Normalde 10-120 saniye arası 2:00'dan 0:00'a doğru sahte bir geri sayım yapıyor.
- **UI (HUD):** `hud.js` dosyasındaki `activateBreakTimer()` fonksiyonu sayacı ekranın ortasına almak için gerekli CSS değişimlerini aniden (glitch stili ve kırmızı renk vb.) yapıyor.
- **Kontroller:** `inputManipulator.js` dosyası `BREAK` evresinde girdileri tamamen kesmek yerine rastgele geciktirme, düşürme ve tersine çevirme (manipülasyon) yapıyor. Ayrıca `playerController.js` fare ile kamera kontrolünü `pointerLock` (imleç kilidi) üzerinden sağlıyor.

**Mevcut Durumda Engelleyici Bir Durum Var mı?**
Hayır, kararlaştırılan değişikliklerin uygulanması için doğrudan kodu engelleyecek mimarisel bir sorun bulunmamaktadır.

---

## Yapılacak Geliştirmeler (Ayrıntılı Plan)

### 1. Oyuncu Kontrolünün Tamamen Alınması

- **Klavye Kontrolleri:** `src/player/inputManipulator.js` dosyası güncellenecek. `BREAK` moduna (son 30 saniye) girildiğinde klavye manipülasyonu tamamen kaldırılacak ve tüm `getInputs()` çağrıları her zaman `false` (hareket yok) döndürecek.
- **Fare (Mouse) Kontrolleri:** `src/core/game.js` dosyasında, oyun `BREAK` durumuna (120. saniye) geçtiğinde `document.exitPointerLock()` çağrılarak farenin serbest kalması sağlanacak. Ayrıca `playerController.js` içinde `BREAK` durumundayken farenin kamerayı döndürmesi (`mousemove` event'i) tamamen devre dışı bırakılacak.

### 2. Zamanlayıcının Merkezde Yavaş Yavaş Bozulması (Glitch/Agresif Stil)

- `src/ui/hud.js` dosyasındaki `activateBreakTimer()` fonksiyonu güncellenecek. Sayacın formatı glitche (`ERR::`) dönmek yerine normal sayaç formatında (`0:30`, `0:29` vb.) kalacak ve ekranın merkezine gelecek.
- **Kademeli Geçiş (Gradual Effect):** Sayaç merkeze geldiğinde _aniden_ titreyen agresif kırmızı bir hale geçmek yerine, rengi beyazdan kırmızıya doğru yavaş yavaş geçecek ve glitch (titreme) efekti saniyeler ilerledikçe yavaş yavaş artacak şekilde CSS veya JS üzerinden interpolasyon (kademeli animasyon) mantığı eklenecek.

### 3. Oyun Süresinin (Son 30 Saniyenin) Hızlanması (Seçenek A)

- `src/systems/timer.js` güncellenecek. Geri sayım 0:30'dan başlayıp 0:00'a doğru devam edecek.
- Sürenin oyuncu kontrolü dışında hızlanması için, 120. saniyeden sonra zaman akışı katsayısı (`delta`) oyun döngüsünde (örneğin 3x vb.) artırılacak. Böylece hem ekrandaki sayaç daha hızlı geri sayacak hem de oyunun "Çöküş" (Collapse) evresine daha çabuk varılacak.

### 4. Bitişte (0:00'da) Ekstra 5 Saniyelik Glitch Sahnesi

- `src/core/game.js` dosyasında, hızlanmış zaman akışıyla 150. saniyeye ulaşıldığında (`END` evresi) sayaç `0:00`'da duracak.
- Mevcut sistemde final ekranı öncesi uygulanan 1.5 saniyelik bekleme süresi, **5 saniyeye (5000ms)** çıkarılacak.
- Bu ekstra 5 saniye boyunca ekrandaki yoğun glitch (gerçekliğin kırılması) efekti ekranda asılı kalacak. 5 saniyenin bitiminde ise oyun kilitlenip fotoğraf gösterme ekranına (End Screen) geçiş yapacak.
