### Trạng thái bền vững (progress.<run>.jsonl)

Để tiếp tục đúng chỗ khi phiên bị ngắt, tải lại trang, hết credit hoặc đầy ngữ cảnh, để biết chắc scene nào đã tốn credit, và để tạo lại video lỗi hoặc đổi sang kịch bản mới mà không lẫn dữ liệu, Claude **luôn ghi tiến độ**. Mỗi **lượt chạy (run)** có **một tệp log riêng** `progress.<run>.jsonl` trong **thư mục log riêng `logs/`** (trong thư mục làm việc hiện tại, tức nơi có file Excel; tự tạo nếu chưa có; đổi bằng `-Dir`), mỗi dòng một sự kiện, chỉ nối thêm. Dùng script `progress.ps1` (một lệnh ngắn):

- **`<run>` = tên lượt chạy**, mặc định đặt theo `<tên file Excel không đuôi>__<tên sheet>`, ví dụ `American Cultural (1)__BA (2)`. **Đổi tài liệu / kịch bản / sheet ⇒ đổi run ⇒ tệp log mới** nên không bị trùng tên video với lần chạy trước. Chạy tiếp một lượt cũ ⇒ dùng lại đúng run đó.
- `P` = đường dẫn tới `scripts/progress.ps1` trong thư mục skill, `R` = tên run. **Chạy lệnh với thư mục làm việc hiện tại là thư mục có file Excel** (hoặc, khi mỗi sheet có thư mục riêng như ở chế độ hàng đợi: thư mục của sheet đó). `progress.ps1` ghi vào `.\logs` của thư mục HIỆN TẠI nên chạy nhầm thư mục sẽ tạo log lạc; truyền `-Dir <thư mục>\logs` để chắc chắn.
- **Nhiều sheet:** mỗi sheet một thư mục (`Dev\`, `PM\`, `Tester\`) với `logs\` và `videos\<Scenario>\` riêng, run riêng. Xem `references/queue-mode.md`.
- Chế độ hàng đợi: `submitting`/`submitted` được đồng bộ từ sự kiện của trang bằng `scripts/finalize_log.py` (sắp lại thứ tự cho từng video), `downloaded`/`moved` do `scripts/mover_daemon.ps1` ghi.

```powershell
# Ghi
powershell -NoProfile -ExecutionPolicy Bypass -File P -Run "R" -Video 13A.1 -Status submitted -Seconds 10
# Xem trạng thái của một lượt chạy + số lần gửi + credit đã tốn + số scene "không chắc"
powershell -NoProfile -ExecutionPolicy Bypass -File P -Run "R" -Show
# Liệt kê các lượt chạy đã có (trong logs/)
powershell -NoProfile -ExecutionPolicy Bypass -File P -List
```

Trạng thái hợp lệ (trạng thái của một video = dòng cuối của nó):

| Status | Nghĩa | Ghi khi nào |
|--------|-------|-------------|
| `submitting` | Sắp bấm gửi — **chưa chắc đã gửi** | **TRƯỚC** `startGenerate` |
| `submitted` | Đã gửi, **mỗi lần gửi tốn credit theo thời lượng** (bảng bên dưới); **luôn kèm `-Seconds`** | Ngay khi `waitForGenerate` trả `done` |
| `downloaded` | Đã bấm tải | Gộp vào lệnh PowerShell ở 6D |
| `moved` | File đã nằm trong `videos/` | Gộp vào lệnh `Move-Item` ở 6D (tự ghi kích thước file) |
| `failed` | Lỗi (kèm `-Note "lý do"`, vd. `het credit`) | Khi gặp lỗi |
| `redo` | **Cần làm lại** video này (bắt buộc kèm `-Note "lý do"`, vd. `sai nguoi noi`) | Khi user yêu cầu tạo lại hoặc Claude phát hiện video không đạt |

`-Show` có cột `sends` (số lần `submitted` của video đó) và cột `credit`. Credit tính **theo thời lượng của từng lần gửi** (tạo lại 2 lần = 2 lần tính):

| Thời lượng | 4s | 6s | 8s | 10s |
|-----------|----|----|----|-----|
| Credit mỗi lần gửi | 7 | 10 | 12 | 15 |

Chế độ Agent: Flow ghi "costing 15 credits" trên hộp xác nhận mỗi video; nếu không biết thời lượng thì tính 15. Bảng này do user cung cấp (áp dụng cho Omni 1.1 Flash; **chưa kiểm chứng cho các model Veo**, có thể khác). Lần `submitted` thiếu `-Seconds` hoặc có thời lượng ngoài bảng thì tính tạm 15 và `-Show` ghi chú "unknown duration" — vì vậy **luôn truyền `-Seconds` khi ghi `submitted`**. Đây là ước tính từ bảng giá, không đọc số dư thật từ Flow.

**Khi chạy lại (BƯỚC 0, sau khi đọc Excel và trước khi hỏi/chạy):** chọn `R`, chạy `-Show`, rồi:

| Trạng thái | Việc làm |
|------------|----------|
| `moved` | Bỏ qua scene |
| không có dòng nào | Chạy bình thường |
| `redo` | Coi như chưa làm: **tạo lại**. Trước khi chuyển file mới vào, **giữ bản cũ** (xem 6D) |
| `submitting` (không chắc đã gửi) | Tìm trên Flow tile có tiêu đề là prompt của scene (hoặc đã mang tên video). Có → coi như `submitted`; không có → chưa gửi. **Nếu mơ hồ (vd. nhiều tile giống nhau) → HỎI user**, không tự đoán |
| `submitted` / `downloaded` | **KHÔNG tạo lại** (tốn credit). Tiếp tục từ bước chờ/tải: tìm tile trên Flow, kiểm tra Downloads (`LastWriteTime`), rồi chuyển file |
| `failed`, `sends` = 0 | Chạy lại scene (nếu lỗi là hết credit thì chỉ chạy khi user báo đã có credit) |
| `failed`, `sends` > 0 | Có thể video đã được tạo: tìm tile trên Flow và tải. Không tìm thấy hoặc mơ hồ → **HỎI user**, không tự tạo lại |

**Các tình huống người dùng:**
- **Tạo lại video lỗi/không đạt:** user nói tên video (hoặc nhờ kiểm tra); Claude ghi `-Status redo -Note "<lý do>"` cho từng video rồi chạy lại đúng các video đó (cùng run), không đụng các video khác.
- **Đổi sang kịch bản / tài liệu mới:** dùng **run mới** (tên mới); log của run cũ giữ nguyên, không ảnh hưởng.
- **Chạy tiếp lượt cũ:** dùng lại đúng run đã có (`-List` để xem). Hỏi user ở BƯỚC 0 đây là trường hợp nào: *tiếp tục / tạo lại một số video / bắt đầu kịch bản mới*.

Trước khi chạy, in tóm tắt cho user: số scene đã xong, đã gửi, không chắc, cần làm lại, đã tốn khoảng bao nhiêu credit. Lưu ý: tệp chỉ ghi trạng thái, không biết video có đúng nội dung không; và Claude có thể ghi chậm một bước nếu bị ngắt đột ngột — đó là lý do phải đối chiếu với danh sách tile trên Flow.
