## Troubleshooting

| Lỗi | Cách sửa |
|-----|----------|
| `Image "xxx" not found` | Upload ảnh vào project, kiểm tra tên chính xác. Lưới Flow là virtual scroll (chỉ ~8 tile trong DOM) nên ảnh cũ nằm sâu bên dưới không quét thấy; script từ v15 tự **tìm ảnh bằng ô search trước** (`setSearch`), thêm vào prompt rồi xóa search |
| `"Add to prompt" not found` | Thử lại — có thể có overlay khác đang mở |
| `Submit disabled` | Kiểm tra chip ảnh và nội dung prompt |
| `Settings panel not open` | v4: `await window.openSettingsPanel()` (JS `.click()` mở được panel — đã xác minh); hoặc dùng luôn `applySettings({model, seconds})`. Chế độ Agent bật thì không có nút settings thường: `setAgentMode(false)` trước |
| `Not ready: generating` | Đợi thêm 20s rồi check lại |
| Tạo ảnh thay vì video | Mở panel settings, chọn chế độ **Video** (không cần bật Agent mode) |
| `verifyScript()` trả `ok: false` | Inject lại toàn bộ script |
| Chrome báo "not connected" rồi tự phục hồi | Chạy `verifyScript()` ngay; mất script thì inject lại; kiểm tra tile + log trước khi gửi lại (xem mục "Khi Chrome mất kết nối hoặc trang tải lại") |
| Click settings không mở panel | `openSettingsPanel()` thử `.click()` rồi chuỗi sự kiện pointer/mouse. Chỉ khi cả hai thất bại mới dùng `computer` click tọa độ **đã nhân** `scale = chiều rộng khung ảnh / innerWidth` (ảnh chụp lớn hơn viewport ~1.02–1.2) và báo user để bổ sung selector |
| `Duration mismatch` khi `generateVideo` | Thời lượng hiện tại khác số giây đã truyền. Đặt lại ở BƯỚC 5 và xác nhận bằng `getCurrentDuration()` trước khi gọi lại. Script chặn gửi nên không mất credit |
| `isVideoReady()` báo `no new tile` | Chưa gọi `generateVideo()` trong lần load trang này (script chụp danh sách tile ở đầu `generateVideo`), hoặc trang đã reload → inject lại |
| `Quality "720p" not found` / `Download not found` | Script đã tự thử 3 lần. Kết quả trả kèm `available` — nếu tên chất lượng khác (vd. "720p (Original)") thì truyền đúng tên đó vào tham số thứ 2. Nếu `clickedDownloadItem: true` thì script đã bấm vào mục "Download" làm phương án phụ: kiểm tra Downloads xem có file tải ngoài ý muốn không |
| Video tạo ra bị "hiện thực" hơn ảnh tham chiếu | Xem mục "Prompt đầu/cuối"; nếu vẫn lệch, thử model `Veo 3.1 - Quality` |
| Tile hiện "Failed – Sorry, this video failed to generate" hoặc "Generation timed out. Please try again." (có nút `Retry`, ghi "You have not been charged") | Lỗi tạo phía Flow, không tốn credit. v4: `isVideoReady()` tự bấm `Retry` (tối đa 4 lần/video) và ghi sự kiện `retry`; đã thành công sau 1 lần Retry ở cả 3 sheet. Quá 4 lần → vòng lặp dừng, báo user |
| `applySettings` báo `Settings button not found` / `isAgentMode()` trả `null` | Panel Agent đang mở che thanh prompt. v4: `await window.closeAgentPanel()` (đã gọi sẵn trong `applySettings`) |
| Agent báo "You've reached your Flow Agent quota limit" | Hết quota Agent, không tạo được video và không mất credit. Không dừng hỏi: tự chuyển thủ công (Omni 1.1 Flash, thời lượng tự ước tính) và chạy tiếp — `runQueue` làm sẵn (sự kiện `mode_switch`) |
| File tải về có tên `4.1D_20261006181720.mp4` | Bình thường: Flow thêm hậu tố thời gian. `mover_daemon.ps1` bỏ hậu tố này; nếu tự viết lệnh tìm file thì dùng mẫu `<tên>*.mp4` |
| `logs\` lạc ở thư mục gốc / `-Show` chỉ thấy vài video | `progress.ps1` ghi vào `.\logs` của thư mục HIỆN TẠI. Chạy lệnh từ trong thư mục sheet hoặc truyền `-Dir <sheet>\logs`; nếu đã lạc, gộp dòng vào log đúng rồi xóa thư mục lạc |
| Tile hiện "Failed – The video failed to load." (có nút `Retry`, không có tên) | Lỗi tải video ở phía trình duyệt, không phải lỗi tạo. `isVideoReady()` và `trashVideoByName()` tự bấm `Retry` tối đa 2 lần; nếu vẫn lỗi thì tự bấm `Retry` trên tile hoặc tải lại trang |
| Không thấy file mới trong Downloads | File tải về có thể trễ vài phút. Kiểm tra `LastWriteTime` trước khi `Move-Item`, tránh chuyển nhầm file cũ cùng tên |

## Lưu ý

- **Agent mode không bắt buộc.** Chế độ thủ công: panel settings ở chế độ **Video** (model, thời lượng, 720p, x1 như BƯỚC 5; `applySettings` làm hết). Chế độ Agent: xem `references/agent-mode.md`
- **Ảnh upload trước** vào project — script chỉ tìm ảnh đã có, không tự upload
- **Không chỉnh sửa Script từ Excel** — prompt giữ nguyên 100%
- **Thư mục `videos/`** — tạo nếu chưa có trước khi Move-Item
- **Re-inject khi page reload** — nếu trang reload, script mất, phải inject lại
- **Ưu tiên JS, hạn chế `computer`** (con trỏ chuột/ảnh chụp tốn token và chậm). Đã xác minh bằng JS: mở panel settings (`.click()` trên `.settings-trigger-button`), chọn model/thời lượng, đóng panel (gửi phím Escape vào `.cdk-overlay-container`, gửi lên `document` thì KHÔNG đóng), bật/tắt Agent, bấm Retry/Download/Rename/Add to prompt. Chỉ dùng `computer` khi một hàm JS báo lỗi, và sau đó hỏi user để bổ sung selector vào script
- **Khi nào được chụp ảnh:** chẩn đoán lỗi (xem BƯỚC 6B), hoặc user nhờ xem màn hình
