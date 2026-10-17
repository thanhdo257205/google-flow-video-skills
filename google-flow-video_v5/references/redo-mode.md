#### Chế độ tạo lại video lỗi (khi câu 00 = tạo lại video lỗi)

Dùng khi có một **file Excel video lỗi** do người duyệt video lập (ví dụ `American Cultural (3).xlsx`, sheet `BA (2)`), thay vì file kịch bản chính. Claude **hỏi user** đường dẫn file và tên sheet.

**Các cột của file video lỗi** (đã đọc từ sheet `BA (2)`; cột A–F giống file chính):

| Cột | Tiêu đề | Dùng để |
|-----|---------|---------|
| A | Scenario | Thư mục con (ô gộp, **điền tiếp** giá trị dòng trên) |
| B | Scene | Tên phân cảnh |
| C | Name of video | Tên video |
| D | Script | **Prompt gốc** (dùng khi dòng không có cột K) |
| E | Selected image | Ảnh tham chiếu |
| G | Dạng bug | Lỗi gặp (vd. "thiếu thoại", "sai về mặt hình ảnh", "x2 nhân vật") |
| H, I | Feedback, Status (Missing/OK) | Phản hồi; `Missing` = cần tạo lại, `OK` = đạt |
| K | **Prompt điều chỉnh** | Prompt đã chỉnh, **đầy đủ chỉ dẫn** |

Sheet `note` giải thích quy ước (ô tím = thiếu chữ/cắt chữ/sai ảnh; ô vàng = đạt). Cột J ("Text"/"Video") chưa rõ nghĩa chắc chắn; không dùng.

**Quy tắc ghép prompt (QUAN TRỌNG):**
- **Dòng có cột K:** gửi **nguyên văn cột K**, **KHÔNG nối `OPENING`/`CLOSING`** (K đã có đủ chỉ dẫn; nối thêm sẽ trùng lặp/mâu thuẫn). Gọi với tham số `raw = true`: `window.startGenerate(ảnh, nội_dung_K, số_giây, true)`.
- **Dòng không có cột K** (vd. `Missing` mà chưa có prompt chỉnh): dùng **Script gốc (cột D) và ghép `OPENING`/`CLOSING` như video thường** (không truyền `raw`). Hỏi user ở BƯỚC 0 nếu muốn bỏ qua các dòng này.
- Cột K **thay thế toàn bộ** Script gốc (kể cả câu mở đầu "Animate only…" và chữ "Medium shot"); Claude **không sửa** nội dung K.

**Những điểm phải hỏi user ở BƯỚC 0 (không tự đoán):**
- **Dòng K không có tên video/ảnh** (ví dụ video `4.1` "thiếu nhiều thoại" được tách thành 5 đoạn ở dòng 2–6, các dòng 3–6 trống cột C và E): tên file cho từng đoạn là gì, dùng ảnh nào (mặc định gợi ý: ảnh của dòng trên).
- **Thời lượng:** K không ghi thời lượng. Với chế độ "Tự ước tính", `estimateDuration` chỉ nhận lời thoại có dấu nháy “…”; **lời dẫn (Voice Over) không có dấu nháy nên ước tính sai** (ra 4s) → hỏi user thời lượng cho các dòng này.
- Có tạo cả các dòng `Missing` không có K không (xem trên).

**Xóa video cũ trước khi tạo lại, và đặt tên (QUAN TRỌNG):**
- **Tên video mới = đúng tên trong cột "Name of video"** (vd. `19B.2`), **không đặt hậu tố `_R1`, `_R2`**. Vì vậy phải xóa video cũ cùng tên trước, để trên Flow không có hai video trùng tên.
- **Với mỗi video cần tạo lại, làm theo thứ tự (từng video một):**
  1. Lấy tên video ở cột "Name of video" (điền tiếp ô gộp nếu trống).
  2. **Xóa video cũ trên Flow** bằng `await window.trashVideoByName("<tên>")` (đang ở project chứa video cũ; user cung cấp link). Nếu trong kết quả tìm có tile báo lỗi tải ("The video failed to load", không hiện tên) thì hàm tự bấm `Retry` (tối đa 2 lượt) để tên hiện ra rồi mới tìm. Hàm tìm tile có nhãn **đúng bằng tên** (không nhầm `19B.2_R1`), mở menu "More options" và bấm **"Move to trash"**. Flow chỉ **chuyển vào Trash** (khôi phục được ở trang Trash hoặc bấm Undo); **tuyệt đối không bấm "Delete all" hay xóa vĩnh viễn trong Trash**.
  3. Kết quả `success: true` → tiếp tục tạo video mới (BƯỚC 6A trở đi) với `finishPipeline("<tên>", "720p")`.
  4. Kết quả `success: false`: `not found` (không có tile cũ) → vẫn tạo video mới và ghi chú; `ambiguous` (nhiều hơn một tile trùng tên) → **không xóa**, hỏi user; lỗi khác → thử lại 1 lần, vẫn lỗi thì báo user rồi chuyển video khác. **Không tạo video mới khi chưa xử lý xong việc xóa** (tránh trùng tên).
- Xóa chỉ ảnh hưởng tile trên Flow. File cũ trong `videos\` không bị đụng.
- Bước tìm file tải về dùng mẫu `<tên>*.mp4` và lọc theo `LastWriteTime` sau `downloadStartedAt` như thường (tránh nhầm file cũ cùng tên trong Downloads).
- **File sau khi chuyển vào `videos_redo\<Scenario>\` đặt tên `<tên>.mp4`.** Nếu đã có file cùng tên trong `videos_redo`, giữ bản cũ trong `_cu` như thường.
- Nhật ký tiến độ ghi video theo tên gốc; trước khi tạo lại ghi `-Status redo -Note "<lý do>"` như thường.
- Video bị tách nhiều đoạn (vd. `4.1` thành 5 đoạn, các dòng 3–6 trống tên): **hỏi user** tên từng đoạn (gợi ý `4.1_part1`…`4.1_part5`) và có xóa tile `4.1` cũ không.
- **Cần kiểm chứng lần chạy đầu:** Flow có đặt tên file tải về đúng theo tên tile hay không; nếu khác thì chỉnh mẫu tìm file.

**Nơi lưu và ghi tiến độ:**
- Video tạo lại lưu vào **`videos_redo\<Scenario>\<tên>.mp4`** (thư mục riêng), **không đụng `videos\`**; user tự so sánh rồi quyết định thay bản cũ.
- Dùng **một lượt chạy mới** (tên run riêng, vd. `REDO__<file>__<sheet>`) để log không lẫn với lượt chạy gốc. Ghi `-Seconds` khi `submitted` như thường.
- Mọi bước khác (BƯỚC 1–6, chống tạo trùng, chờ, tải 720p, báo lỗi) giữ nguyên.
