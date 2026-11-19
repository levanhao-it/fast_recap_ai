# Fast Recap AI

PWA miá»…n phÃ­: ghi Ã¢m â†’ transcript â†’ tÃ³m táº¯t â†’ há»i Ä‘Ã¡p â†’ slide â†’ mind map â†’ ghi chÃº. AI cháº¡y **hoÃ n toÃ n trÃªn thiáº¿t bá»‹** (Whisper + LLM qua WebGPU/WASM), khÃ´ng cáº§n API key hay tráº£ phÃ­.

## Cháº¡y
```
npm install
npm run dev        # phÃ¡t triá»ƒn
npm test           # unit test
npm run build      # build PWA vÃ o dist/
```
Cáº§n HTTPS (hoáº·c localhost) Ä‘á»ƒ dÃ¹ng micro vÃ  service worker.

## TÃ­nh nÄƒng
| TÃ­nh nÄƒng | CÃ¡ch lÃ m |
|---|---|
| Record & Transcribe | MediaRecorder + Whisper (Transformers.js, worker); nháº­p file Ã¢m thanh; sá»­a transcript, báº¥m má»‘c thá»i gian Ä‘á»ƒ nghe láº¡i |
| AI Summaries | LÃ m sáº¡ch transcript â†’ chia chunk theo token (cÃ³ chá»“ng láº¥p) â†’ trÃ­ch xuáº¥t JSON cÃ³ rÃ ng buá»™c schema cho tá»«ng chunk â†’ gá»™p & loáº¡i trÃ¹ng â†’ viáº¿t pháº§n tÃ³m táº¯t tá»« cÃ¡c Ã½ Ä‘Ã£ trÃ­ch. Má»—i Ã½ kÃ¨m má»‘c thá»i gian (báº¥m Ä‘á»ƒ nghe láº¡i), viá»‡c cáº§n lÃ m cÃ³ owner/háº¡n vÃ  tick hoÃ n thÃ nh Ä‘Æ°á»£c. CÃ³ máº«u theo loáº¡i ná»™i dung (há»p, bÃ i giáº£ng, phá»ng váº¥n, ghi chÃº giá»ng nÃ³i), tá»± tÃ³m táº¯t sau khi transcribe (tuá»³ chá»n), sá»­a/sao chÃ©p káº¿t quáº£ |
| Smart Q&A | Embedding `multilingual-e5-small` + truy xuáº¥t top-k, tráº£ lá»i kÃ¨m má»‘c thá»i gian nguá»“n |
| Auto Slides | LLM â†’ Markdown â†’ bá»™ slide (trÃ¬nh chiáº¿u toÃ n mÃ n hÃ¬nh), xuáº¥t PPTX / PDF (in) |
| Mind Map | LLM â†’ Markdown â†’ markmap tÆ°Æ¡ng tÃ¡c, xuáº¥t SVG |
| Organized Notes | IndexedDB (Dexie), thÆ° má»¥c/tháº», tÃ¬m kiáº¿m toÃ n vÄƒn khÃ´ng dáº¥u, xuáº¥t Markdown |
| Äá»“ng bá»™ & chia sáº» | Supabase free (tuá»³ chá»n), chá»‰ Ä‘á»“ng bá»™ vÄƒn báº£n; link chia sáº» chá»‰ Ä‘á»c |

## AI miá»…n phÃ­ tuá»³ chá»n (cháº¥t lÆ°á»£ng cao hÆ¡n)
Trong **CÃ i Ä‘áº·t â†’ Nguá»“n AI** cÃ³ thá»ƒ chá»n Groq (Llama 3.3 70B) hoáº·c Google Gemini (2.5 Flash) báº±ng API key miá»…n phÃ­ cá»§a báº¡n. Khi báº­t, vÄƒn báº£n báº£n ghi Ä‘Æ°á»£c gá»­i tá»›i nhÃ  cung cáº¥p Ä‘Ã³ (Ã¢m thanh thÃ¬ khÃ´ng); máº·c Ä‘á»‹nh váº«n lÃ  cháº¡y trÃªn thiáº¿t bá»‹. GÃ³i free cÃ³ giá»›i háº¡n tá»‘c Ä‘á»™, app tá»± chá» vÃ  thá»­ láº¡i khi gáº·p lá»—i 429.

## MÃ´ hÃ¬nh & thiáº¿t bá»‹
- Chá»n mÃ´ hÃ¬nh trong **CÃ i Ä‘áº·t**; mÃ´ hÃ¬nh táº£i má»™t láº§n (Whisper 75â€“250MB, LLM 0.4â€“2GB) rá»“i cache offline. NÃªn dÃ¹ng Wiâ€‘Fi.
- WebGPU (Chrome/Edge Android & desktop) cho tá»‘c Ä‘á»™ tá»‘t. KhÃ´ng cÃ³ WebGPU â†’ cháº¡y WASM vá»›i mÃ´ hÃ¬nh nhá» (cháº­m hÆ¡n, cháº¥t lÆ°á»£ng tháº¥p hÆ¡n).
- Runtime ONNX (wasm) Ä‘Æ°á»£c táº£i tá»« jsDelivr láº§n Ä‘áº§u rá»“i cache.
- iOS: ghi Ã¢m cÃ³ thá»ƒ dá»«ng khi táº¯t mÃ n hÃ¬nh; app giá»¯ mÃ n hÃ¬nh sÃ¡ng khi ghi.

## Supabase (miá»…n phÃ­, tuá»³ chá»n)
1. Táº¡o project táº¡i supabase.com, cháº¡y [supabase/schema.sql](supabase/schema.sql) trong SQL editor.
2. Nháº­p URL + anon key trong CÃ i Ä‘áº·t (hoáº·c `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), Ä‘Äƒng kÃ½/Ä‘Äƒng nháº­p, báº¥m **Äá»“ng bá»™ ngay**.
3. NÃºt **Chia sáº»** trong ghi chÃº táº¡o link `/s/<token>` (báº¥t ká»³ ai cÃ³ link Ä‘á»u xem Ä‘Æ°á»£c).
Ã‚m thanh khÃ´ng bao giá» Ä‘Æ°á»£c táº£i lÃªn.

## Deploy miá»…n phÃ­ (Cloudflare Pages)
Build command `npm run build`, output `dist`. `public/_redirects` Ä‘Ã£ xá»­ lÃ½ SPA routing. Icon táº¡o báº±ng `node scripts/make-icons.mjs`.
