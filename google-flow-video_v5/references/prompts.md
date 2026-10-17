## Prompt đầu/cuối (OPENING / CLOSING)

Script tự nối `OPENING` vào đầu và `CLOSING` vào cuối cột Script của Excel (Script giữ nguyên 100%). Hai đoạn này nằm ở đầu file `google_flow_automation.js`. **Bản hiện tại được chỉnh theo khối chỉ dẫn cố định mà người duyệt video dùng ở cột K "Prompt điều chỉnh" (file `American Cultural (3).xlsx`, sheet BA (2))**, tức là đúc kết từ các lỗi đã gặp (thiếu thoại, sai hình ảnh, nhân vật bị nhân đôi...). Nội dung:

**OPENING (đầu)**
- **Chỉ dùng ảnh tham chiếu:** giữ đúng phong cách (không "thật" hơn), danh tính, khuôn mặt, màu da, tóc, tỉ lệ cơ thể, trang phục, phụ kiện, chỗ ngồi/đứng, nền, ánh sáng, bảng màu, nét vẽ ở mọi khung hình.
- **Chỉ các nhân vật có trong ảnh:** không thêm, bớt, nhân đôi, thay thế, biến đổi, thiết kế lại hay đổi chỗ ai; không có người thừa hoặc người nền (lỗi "x2 nhân vật").
- **MÁY QUAY CỐ ĐỊNH:** một cảnh liên tục, một vị trí máy và khung hình như ảnh tham chiếu; **cấm cắt cảnh, zoom, pan, tilt, cận cảnh, đổi khung, đổi góc, chuyển động máy, đổi vị trí nhân vật**. Cỡ cảnh ghi trong Script (vd. "Medium shot") hiểu là khung hình của ảnh.
- **Người nói:** chỉ người có nhãn trước dòng thoại (vd. `BA:` hay `BA (male, wearing a blue shirt):`) được nói và mấp máy môi; người khác ngậm miệng, chỉ lắng nghe/phản ứng.
- **Lời dẫn / Voice Over (không có nhãn):** chỉ phát giọng dẫn, **không nhân vật nào mấp máy môi**.

**CLOSING (cuối)**
- **Đọc đủ, đúng nguyên văn, một lần:** không bỏ, rút gọn, tóm tắt, diễn đạt lại, lặp hay thêm chữ; video **kết thúc ngay sau từ cuối cùng** (lỗi "thiếu thoại").
- **Chỉ tiếng thoại hoặc lời dẫn:** không nhạc nền, nhạc phim, hiệu ứng âm thanh, tiếng người xung quanh hay lời thừa; giọng rõ và tách biệt.
- Nhắc lại: cùng phong cách và khuôn mặt như ảnh, chỗ ngồi/đứng cố định, cử chỉ nhất quán, máy cố định không zoom, không cắt, không chuyển động.

> **Thay đổi so với bản trước (cần biết):** (1) bản trước cho phép cắt cảnh và đổi góc máy, bản này **cấm hết**; (2) bản trước để người dẫn chuyện trong ảnh `VoC speaking` mấp máy môi đọc lời dẫn, bản này theo cột K nên **không ai mấp máy môi**; (3) thêm yêu cầu đọc nguyên văn, dừng ngay sau từ cuối, và cấm nhạc nền/âm thanh thừa. Nếu muốn quay lại mức cũ cho một mục nào, sửa đúng đoạn đó trong `OPENING`/`CLOSING`.

Muốn chỉnh prompt: sửa hằng `OPENING` / `CLOSING` trong file `.js`, rồi inject lại toàn bộ script. Nếu model vẫn gán sai người nói, thêm mô tả nhận dạng vào Visual Prompt trong Excel (vd. "BA is the male in the blue shirt").

## v4: Script đã có sẵn rule → gửi nguyên văn (`raw`)

Nhiều file kịch bản (vd. `American Cultural (4).xlsx`, các sheet Dev/PM/Tester) đã ghi sẵn khối rule ở đầu mỗi ô Script ("Animate only from the provided reference image...", "Use one continuous, static medium-wide shot...", "Read the complete dialogue exactly as written..."). Khi đó **không nối OPENING/CLOSING** nữa: gọi `startGenerate(ảnh, script, giây, true)` (tham số thứ 4 `raw = true`), hoặc dùng hàng đợi với `raw: true` (mặc định). Cách kiểm tra: mọi dòng của sheet đều bắt đầu bằng cùng một khối rule (`export_queue.py` in `header_chars` > 0). Nếu chỉ một số dòng có rule thì hỏi user. Prompt gửi đi phải bằng đúng nội dung Excel: so `promptLength` với độ dài ô Script, và so checksum hàng đợi.
