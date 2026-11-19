

# Fast Recap AI

PWA miễn phí: ghi âm → transcript → tóm tắt → hỏi đáp → slide → mind map → ghi chú. AI chạy **hoàn toàn trên thiết bị** (Whisper + LLM qua WebGPU/WASM), không cần API key hay trả phí.

## Chạy
```
npm install
npm run dev        # phát triển
npm test           # unit test
npm run build      # build PWA vào dist/
```
Cần HTTPS (hoặc localhost) để dùng mic và service worker.

## Tính năng
| Tính năng | Cách làm |
|---|---|
| Record & Transcribe | MediaRecorder + Whisper (Transformers.js, worker); nhập file âm thanh; sửa transcript, bấm mốc thời gian để nghe lại |
| AI Summaries | Làm sạch transcript → chia chunk theo token (có chồng lấp) → trích xuất JSON có ràng buộc schema cho từng chunk → gộp & loại trùng → viết phần tóm tắt từ các ý đã trích. Mỗi ý kèm mốc thời gian (bấm để nghe lại), việc cần làm có owner/hạn và tick hoàn thành được. Có mẫu theo loại nội dung (họp, bài giảng, phỏng vấn, ghi chú giọng nói), tự tóm tắt sau khi transcribe (tùy chọn), sửa/sao chép kết quả |
| Smart Q&A | Embedding `multilingual-e5-small` + truy xuất top-k, trả lời kèm mốc thời gian nguồn |
| Auto Slides | LLM → Markdown → bộ slide (trình chiếu toàn màn hình), xuất PPTX / PDF (in) |
| Mind Map | LLM → Markdown → markmap tương tác, xuất SVG |
| Organized Notes | IndexedDB (Dexie), thư mục/thẻ, tìm kiếm toàn văn không dấu, xuất Markdown |
| Đồng bộ & chia sẻ | Supabase free (tùy chọn), chỉ đồng bộ văn bản; link chia sẻ chỉ đọc |

## AI miễn phí tùy chọn (chất lượng cao hơn)
Trong **Cài đặt → Nguồn AI** có thể chọn Groq (Llama 3.3 70B) hoặc Google Gemini (2.5 Flash) bằng API key miễn phí của bạn. Khi bật, văn bản bản ghi được gửi tới nhà cung cấp đó (âm thanh thì không); mặc định vẫn là chạy trên thiết bị. Gói free có giới hạn tốc độ, app tự chờ và thử lại khi gặp lỗi 429.

## Mô hình & thiết bị
- Chọn mô hình trong **Cài đặt**; mặc định dùng LLM 0.5B (~0.4GB) để giảm thời gian tải lần đầu. Các mô hình lớn hơn tải 1–2GB. Model được cache offline sau lần tải đầu; nên dùng Wi‑Fi.
- WebGPU (Chrome/Edge Android & desktop) cho tốc độ tốt. Không có WebGPU → chạy WASM với mô hình nhỏ (chậm hơn, chất lượng thấp hơn).
- Một số GPU giới hạn compute workgroup storage thấp hơn yêu cầu của WebGPU runtime; khi gặp lỗi này, ứng dụng tự chuyển sang WASM. WASM vẫn chạy trên thiết bị nhưng chậm hơn.
- Runtime ONNX (wasm) được tải từ jsDelivr lần đầu rồi cache.
- iOS: ghi âm có thể dừng khi tắt màn hình; app giữ màn hình sáng khi ghi.

## Supabase (miễn phí, tùy chọn)
1. Tạo project tại supabase.com, chạy [supabase/schema.sql](supabase/schema.sql) trong SQL editor.
2. Nhập URL + anon key trong Cài đặt (hoặc `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), đăng ký/đăng nhập, bấm **Đồng bộ ngay**.
3. Nút **Chia sẻ** trong ghi chú tạo link `/s/<token>` (bất kỳ ai có link đều xem được).
Âm thanh không bao giờ được tải lên.

## Deploy miễn phí (Cloudflare Pages)
Build command `npm run build`, output `dist`. `public/_redirects` đã xử lý SPA routing. Icon tạo bằng `node scripts/make-icons.mjs`.
