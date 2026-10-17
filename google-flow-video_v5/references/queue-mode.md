## Chế độ hàng đợi (queue mode) — khuyến nghị khi chạy từ ~10 video trở lên

Chạy cả một sheet **bên trong trang Flow**: một vòng lặp gửi → chờ → đổi tên → tải 720p cho từng scene, không cần 3–4 lượt gọi công cụ cho mỗi video. Đã chạy thật 283 video (3 sheet) ở chế độ Agent, khoảng 1,5 phút/video. Cách chạy từng scene (BƯỚC 6A–6D) vẫn dùng cho vài video lẻ hoặc khi gỡ lỗi.

### Cấu trúc thư mục (mỗi sheet một thư mục riêng, log riêng, project Flow riêng)

```
<thư mục làm việc>\
  Dev\    scenes.json  queue.json  header.json  logs\progress.<run>.jsonl  logs\mover.log  videos\<Scenario>\<tên>.mp4
  PM\     ...
  Tester\ ...
```
- Run (`R`) mỗi sheet: `<file Excel không đuôi>__<tên sheet ngắn>`, vd. `American Cultural (4)__Dev`. Mỗi sheet có tệp log riêng nên không lẫn tên video trùng nhau.
- Mọi lệnh ghi/xem log phải chạy **từ trong thư mục sheet** (hoặc truyền `-Dir <sheet>\logs`), vì `progress.ps1` mặc định ghi vào `.\logs` của thư mục hiện tại. Chạy nhầm từ thư mục gốc sẽ tạo `logs\` lạc chỗ (đã gặp).

### Quy trình cho MỖI sheet (làm lần lượt từng sheet)

1. **BƯỚC 0 một lần cho cả lượt** (xem SKILL.md). Hỏi thêm: link project của TỪNG sheet; Agent settings (người dùng tự chỉnh). Không cần hỏi về "Always approve" (luôn bấm).
2. **Xuất dữ liệu:** `python scripts/export_queue.py "<xlsx>" "<sheet>" "<thư mục sheet>" [--start N]` → `scenes.json`, `queue.json`, `header.json`, in `CHECKSUM [số mục, số ký tự, tổng mã ký tự]`. `export_queue.py` tự tách khối rule chung ở đầu mọi Script (nếu có) vào `header.json` để chỉ phải dán phần đuôi ngắn vào trang. Kiểm tra `dup_names=0` và danh sách `images`.
3. **Mở project của sheet, kiểm tra trang:** `navigate` → inject `google_flow_automation.js` (1 lệnh) → `verifyScript()` (phải `ok: true`, version `v17`). Nếu panel Agent đang mở bên phải, `await window.closeAgentPanel()` đóng nó bằng JS (đã xác minh; `applySettings` tự gọi hàm này).
4. **Kiểm tra ảnh:** `await window.checkImagesExist([...images])` → `all: true`. Thiếu ảnh → dừng, báo user.
5. **Chế độ thiết lập:**
   - **Thủ công:** `await window.applySettings({ model: 'Omni 1.1 Flash', seconds: 10 })` (tắt Agent, mở panel, chọn model rồi thời lượng, kiểm tra, đóng panel — hoàn toàn bằng JS). Thời lượng khác nhau giữa các scene: đặt `seconds` trong từng mục của hàng đợi và gọi lại `applySettings` giữa các nhóm, hoặc chạy hàng đợi riêng cho từng thời lượng.
   - **Agent:** `await window.setAgentMode(true)`; không có bước model/thời lượng. `runQueue({agent:true})` tự bật `enableAutoApprove()` (quy tắc cố định của user: luôn bấm "Always approve" ở hộp xác nhận credit).
6. **Nạp hàng đợi** (1 lệnh `javascript_tool`): đặt `window.HDR = "<nội dung header.json>"` rồi `window.loadQueue([{name, image, script}, ...], { header: window.HDR, agent: true|false })`. Lệnh trả `[số mục, số ký tự, tổng]` — **phải bằng đúng CHECKSUM do `export_queue.py` in ra** (khi dùng header, `script` của mỗi mục là phần đuôi; checksum tính trên đuôi). Lệch → dán lại, đừng chạy. Chế độ Agent: `agent: true` (bỏ kiểm tra thời lượng). Script đã chứa sẵn rule ⇒ `raw: true` (mặc định) để KHÔNG nối thêm OPENING/CLOSING; Script chưa có rule ⇒ `raw: false`.
7. **Bật mover nền** (PowerShell, ẩn), `Since` = giờ UTC hiện tại: xem đầu `scripts/mover_daemon.ps1` (nhớ bọc `-Run` trong dấu nháy kép khi tên run có khoảng trắng). Chỉ một mover cho mỗi sheet; dừng mover của sheet trước khi sang sheet sau.
8. **Chạy:** `window.runQueue(); 'started'` (KHÔNG `await` vì `javascript_tool` hết thời gian ~45s). Theo dõi: `JSON.stringify(window.getQueueStatus(0))` hoặc dùng `Monitor` trên `<sheet>\logs\mover.log` (số dòng = số video đã chuyển; báo mỗi 8–15 video, và báo "STALL" nếu 7–8 phút không có video mới; Monitor hết hạn sau 30 phút nên phải bật lại). Khi đợi bằng `Bash` nền (`run_in_background`) thay vì thăm dò liên tục. Mỗi tile mới lấy theo quy tắc "tile đầu tiên khác trước khi gửi" nên lúc chạy KHÔNG được thao tác tay trên lưới trong tab đó.
9. **Khi `state` là `finished`/`stopped`:** `getQueueStatus(0).ev` cho toàn bộ sự kiện. Chạy `python scripts/finalize_log.py "<thư mục sheet>" --submitted "<danh sách tên có sự kiện submitted>"` (thêm `submitting`/`submitted` còn thiếu vào log rồi sắp lại đúng thứ tự cho từng video), dừng mover, đếm file trong `videos\` so với số video, rồi `progress.ps1 -Run "R" -Show` (chạy từ trong thư mục sheet).

### Sự kiện và xử lý lỗi trong vòng lặp

| Sự kiện/lỗi | Hành vi |
|---|---|
| Tile "Failed – Sorry, this video failed to generate" hoặc "Generation timed out" (Flow ghi "You have not been charged") | Tự bấm **Retry** (tối đa 4 lần/video), ghi sự kiện `retry`. Đã gặp ở cả 3 sheet; luôn thành công sau 1 lần Retry |
| Tile "Failed – The video failed to load." | Tự bấm Retry tối đa 2 lần (như cũ) |
| Tải xuống lỗi | `finishPipeline` đã thử 3 lần, `queue` thử thêm 1 lần; vẫn lỗi → `failed` + dừng. **Không** tạo lại video |
| Hộp Agent "Would you like me to kick off this 1 video generation, costing 15 credits?" (Approve / Always approve / Reject) | **Luôn bấm "Always approve"** (quy tắc cố định của user, hộp hiện ở video đầu tiên): `enableAutoApprove()` tự làm khi `runQueue({agent:true})`; sau khi bấm Flow ghi nhớ. Không bấm Approve/Reject |
| Agent hết quota ("You've reached your Flow Agent quota limit. Switch to manual prompting or come back tomorrow") | **Quy tắc cố định của user: không dừng hỏi, tự chuyển sang chế độ thủ công.** Sau 2 phút không có tile mới (không có video, không mất credit), vòng lặp ghi sự kiện `mode_switch`, tắt auto-approve, `applySettings({model:'Omni 1.1 Flash', seconds: <ước tính>})` rồi gửi lại ĐÚNG scene đó và chạy tiếp các scene còn lại; mỗi scene ước tính thời lượng bằng `estimateDuration` (4/6/8/10s; scene lời dẫn không có ngoặc kép cũng được tính theo số chữ), chỉ gọi `applySettings` khi thời lượng đổi, ghi sự kiện `settings`. Tắt bằng `runQueue({fallbackManual:false})` |
| Chờ video quá `readyTimeoutMs` (12 phút) | `failed` + dừng. **Không** tự gửi lại (có thể video vẫn đang chạy): kiểm tra tile trước |
| `Duration mismatch` (thủ công) | `failed` + dừng, chưa gửi nên không mất credit; `applySettings` lại |

Vòng lặp **không bao giờ tự gửi lại một scene đã `submitted`**. Dừng giữa chừng → xem `getQueueStatus(0)`: nếu `submitting` mà không có `submitted`, tìm tile trên Flow trước khi gửi lại (bảng "Khi chạy lại" trong `progress-log.md`).

### Thông số thực tế (Agent, Omni 1.1 Flash)
- Agent tạo tile video 720p, 16:9, x1, thời lượng 8–10s tùy script (Agent tự chọn), thời gian ~1–1,5 phút/video, mỗi lần xác nhận ghi "costing 15 credits". Đặt tên tile bằng tiêu đề tự đặt; script vẫn đổi tên đúng `Name of video` ở `finishPipeline`.
- Flow lưu file tải về là `<tên>_<yyyyMMddHHmmss>.mp4` — mover đã xử lý hậu tố này.
- Sau khi gửi bằng Agent hoặc mở lại project ở chế độ Agent, panel phiên Agent (`flow-agent-panel`) tự mở bên phải. Khi panel mở, chip Agent và nút settings không dùng được (`isAgentMode()` có thể trả `null`) — đã gây lỗi `applySettings ... Settings button not found` ở lần thử đầu của chuyển chế độ; v4 đã sửa bằng cách `closeAgentPanel()` trước. Đóng bằng JS: `flow-agent-panel .agent-panel-header .header-right button[aria-label="Close"]`.

### Chưa xác minh (cần user mở trang và chỉ nút nếu hàm trả lỗi)
Đã xác minh trên Flow thật: `closeAgentPanel()`, `agentPanelOpen()`, nhánh tự chuyển Agent → thủ công khi hết quota (xem `agent-mode.md`).
- `enableAutoApprove()`: chưa xác minh loại phần tử của "Always approve" (dùng so khớp chữ chính xác).
Khi hàm này lỗi, **hỏi user** (nhờ mở panel/hộp thoại đó) rồi cập nhật selector vào script, không dùng `computer` làm cách mặc định.
