---
name: google-flow-video
description: Tự động tạo video trên Google Flow (flow.google.com) từ file Excel kịch bản bằng Claude in Chrome, tải về 720p, đổi tên và xếp vào thư mục theo scenario; có chế độ tạo lại video lỗi, chế độ Agent và chế độ hàng đợi (chạy cả sheet trong trang, nhiều sheet/nhiều project). Ưu tiên bấm nút bằng JavaScript, hạn chế dùng chuột. Dùng khi người dùng yêu cầu tạo video từ file Excel kịch bản, tạo lại video lỗi, hoặc chạy pipeline Google Flow.
---

# Google Flow Video Automation (v5)

**v4 so với v3:** (1) **chế độ hàng đợi** (`references/queue-mode.md`) chạy cả sheet bên trong trang, kèm mover nền, log riêng cho từng sheet; (2) thao tác giao diện bằng **JavaScript, hạn chế `computer`**: `applySettings`, `openSettingsPanel`, `closeSettingsPanel` (đã xác minh), `closeAgentPanel`/`agentPanelOpen` (đã xác minh), `enableAutoApprove` (luôn bấm "Always approve" ở chế độ Agent; chưa xác minh selector); (3) tự **Retry** khi tile báo "failed to generate"/"timed out" (không tốn credit); (4) hộp xác nhận **Always approve** luôn bấm, và khi **hết quota Agent** thì tự chuyển sang **thủ công** (Omni 1.1 Flash, thời lượng tự ước tính) rồi chạy tiếp, không dừng hỏi; (5) khi Script đã chứa sẵn rule thì gửi nguyên văn (`raw`); (6) tên file tải về có hậu tố thời gian; (7) cảnh báo log lạc do thư mục làm việc.

**v5 so với v4:** sửa mâu thuẫn quy tắc Agent (`references/agent-mode.md`: ngoại lệ luôn bấm "Always approve" ở hộp xác nhận credit video đầu tiên) và ví dụ `verifyScript()` ghi đúng `v17`.

Tự động tạo video trên Google Flow (flow.google.com) từ file Excel kịch bản, sử dụng Claude Code + Claude in Chrome.

## Bản đồ tài liệu (đọc đúng lúc)

Thư mục skill gồm `SKILL.md` (file này), `scripts/` và `references/`. Các đường dẫn `scripts/...` và `references/...` dưới đây tính từ thư mục chứa skill này. **Thư mục làm việc** (nơi có file Excel kịch bản) là nơi tạo `logs/`, `videos/`, `videos_redo/`.

| Tệp | Đọc khi nào |
|-----|-------------|
| `scripts/google_flow_automation.js` | BƯỚC 3: inject toàn bộ vào trang Flow |
| `scripts/progress.ps1` | Ghi/xem tiến độ (`P` trong các lệnh bên dưới = đường dẫn tới tệp này) |
| `references/progress-log.md` | **Trước BƯỚC 0 và mỗi lần chạy**: cách ghi log tiến độ, bảng credit, bảng "Khi chạy lại" |
| `references/prompts.md` | Khi cần biết/chỉnh Prompt đầu và cuối (OPENING / CLOSING) |
| `references/redo-mode.md` | Khi user chọn "Tạo lại video lỗi" (câu 00) |
| `references/agent-mode.md` | Khi user chọn chế độ Agent (câu 0); đã có số liệu chạy thật, hộp xác nhận, quota |
| `references/queue-mode.md` | **Chạy từ ~10 video trở lên hoặc nhiều sheet**: quy trình hàng đợi, thư mục từng sheet, xử lý lỗi, mover |
| `scripts/export_queue.py` | Hàng đợi: xuất `scenes.json`/`queue.json`/checksum từ một sheet Excel |
| `scripts/mover_daemon.ps1` | Hàng đợi: chuyển file tải về vào `videos/<Scenario>/` và ghi log `downloaded`/`moved` |
| `scripts/finalize_log.py` | Hàng đợi: đồng bộ sự kiện của trang vào log và sắp lại thứ tự trạng thái |
| `references/model-duration.md` | BƯỚC 5: đặt model và thời lượng bằng `applySettings` (bỏ qua nếu Agent) |
| `references/troubleshooting.md` | Khi gặp lỗi; kèm các lưu ý chung |

## QUAN TRỌNG — ĐỌC TRƯỚC KHI CHẠY

### Quy tắc bắt buộc

0. **BẮT BUỘC hỏi user mọi điều chưa chắc ngay từ đầu** (BƯỚC 0), gộp vào 1 lần `AskUserQuestion` (tối đa 4 câu/lần; nhiều hơn thì hỏi thêm lượt liền sau, vẫn trước khi chạy). Luôn có câu về model và thời lượng (trừ chế độ Agent). **KHÔNG được tự đoán hay tự chọn**, kể cả khi có giá trị "mặc định" — mặc định chỉ là lựa chọn được gợi ý đầu tiên. Chỉ bỏ qua câu nào khi user đã nói rõ giá trị đó trong chính tin nhắn yêu cầu. Mỗi session mới đều phải hỏi lại. Khi đã trả lời xong hết thì **chạy tự động từ đầu đến cuối**, không hỏi lại.
1. **Sau BƯỚC 0, KHÔNG dừng để hỏi user** giữa pipeline. Chạy liên tục từ scene đầu đến scene cuối. Ngoại lệ duy nhất: lỗi mức "dừng hẳn" trong mục "Báo lỗi cho user" bên dưới — gửi `PushNotification` rồi dừng.
2. **KHÔNG dùng screenshot** để kiểm tra. Luôn dùng `isVideoReady()` (JS check, trả text).
2b. **Bấm nút bằng JavaScript, hạn chế tối đa `computer`** (chuột/tọa độ/ảnh chụp). Đã xác minh làm được bằng JS: mở/đóng panel settings, chọn model và thời lượng, bật/tắt Agent, bấm Retry, đổi tên, tải xuống. Chỉ dùng `computer` khi hàm JS báo lỗi; khi đó **hỏi user** (nhờ mở trang/hộp thoại để tìm selector) rồi cập nhật selector vào script thay vì bấm tay lặp lại.
3. **KHÔNG inject script bằng cách nhờ user paste vào console.** Luôn dùng `javascript_tool` inject trực tiếp.
4. **KHÔNG dùng `<script src>` hay `fetch+eval`** — Google Flow có Trusted Types CSP, chặn tất cả.
5. **Inject toàn bộ script trong 1 lệnh `javascript_tool` duy nhất.** Không chia chunks.
6. **Sau khi inject, gọi `verifyScript()`** để xác nhận. Nếu `ok: false`, inject lại.
7. **`window.wait` phải tồn tại.** Script đã tự expose `window.wait`. Nếu `verifyScript()` báo thiếu `wait`, inject lại toàn bộ.

### Khi Chrome mất kết nối hoặc trang tải lại

Mất kết nối rồi tự phục hồi, hoặc trang tải lại, có thể làm mất script đã inject (`window.__gen` và danh sách tile cũng mất). Việc phải làm **ngay** khi kết nối lại:

1. Chạy `window.verifyScript()`. Nếu `ok: false` hoặc báo không có hàm nào → **inject lại toàn bộ script** (1 lệnh duy nhất), rồi chạy lại `verifyScript()`.
2. Nếu đang giữa chừng một scene: **không gọi `startGenerate` lại ngay**. Kiểm tra danh sách tile trên Flow xem scene đó đã được gửi chưa (tile có tiêu đề là prompt, hoặc đã mang tên video) và xem log tiến độ (`submitting` / `submitted`). Chỉ tạo lại khi chắc chắn chưa gửi; mơ hồ → hỏi user.
3. Panel settings có thể đã đóng/đổi: kiểm tra `getCurrentSettings()` đúng thời lượng/chế độ trước khi tạo (BƯỚC 5).

Giữ tab Flow ở nền trước và không để máy ngủ khi đang chạy: tab ẩn hoặc máy ngủ có thể làm JavaScript chậm hoặc bị ngắt giữa chừng.

### Báo lỗi cho user (PushNotification)

`PushNotification` là công cụ **deferred**: ngay sau BƯỚC 0, nạp schema bằng `ToolSearch` với query `select:PushNotification`. Công cụ gửi thông báo desktop (và lên điện thoại nếu có Remote Control). Nếu user đang xem terminal thì công cụ tự bỏ qua và báo "not sent" — đó là bình thường, không phải lỗi.

Gọi với `status: "proactive"`. Mỗi thông báo: **1 dòng, dưới 200 ký tự, không markdown, bắt đầu bằng điều user cần biết** (scene nào + lỗi gì + Claude đã làm gì tiếp). Ví dụ: `Scene 2A: thieu anh 02_BA_speaking_wide.png, da dung pipeline`.

| Mức | Ví dụ | Hành động |
|-----|-------|-----------|
| **Dừng hẳn và gửi thông báo ngay** | Thiếu ảnh tham chiếu; `verifyScript()` vẫn `ok: false` sau 2 lần inject; `Submit disabled` do hết credit; trang đòi đăng nhập/CAPTCHA | Gửi thông báo, **dừng pipeline** (đây là ngoại lệ của quy tắc 1) |
| **Thử lại 1 lần; vẫn lỗi thì gửi thông báo và qua scene tiếp** | `generateVideo` / rename / tải thất bại; video chưa xong sau ~3 phút | Gửi thông báo, ghi vào danh sách lỗi, chạy tiếp scene sau |
| **Tự xử lý, KHÔNG gửi thông báo** | Video chưa xong (check lại), thử lại lần 2 thành công | Chỉ ghi vào bảng tổng kết |

Quy tắc chống spam: tối đa **1 thông báo cho mỗi scene lỗi**, không gửi thông báo tiến độ. Khi chạy hết (hoặc khi dừng), gửi **1 thông báo tổng kết**, ví dụ: `Xong 2/3 scene: 2A ok, 2B ok, 2C loi (khong tai duoc). File trong videos/`. Đồng thời in bảng tổng kết (scene, tên video, trạng thái, đường dẫn file) trong chat.

Lưu ý: Claude không thể gửi thông báo nếu chính phiên bị treo hoặc bị ngắt.

### Trạng thái bền vững (progress.<run>.jsonl)

> Chi tiết đầy đủ trong `references/progress-log.md` (**bắt buộc đọc** trước BƯỚC 0): tên run, các lệnh ghi/xem, bảng trạng thái, bảng credit, bảng "Khi chạy lại".

### Model khuyến nghị

- **Opus 4.6 / Sonnet 5.5**: Hoạt động tốt. Sonnet 5.5 tối ưu chi phí.
- **Haiku 4.5**: KHÔNG phù hợp — không inject được script, dừng giữa chừng.

## Yêu cầu

- **Claude Code** (desktop app) với **Claude in Chrome** extension đã kết nối
- Tài khoản Google Flow với quyền truy cập project
- File Excel kịch bản
- **Link project Google Flow** (user cung cấp)
- **Ảnh tham chiếu đã upload sẵn** trong project Google Flow

## Cấu trúc file Excel

| Cột | Mô tả | Ví dụ |
|-----|--------|-------|
| **Scenario** | Tên kịch bản | Scenario 3 |
| **Scene** | Tên phân cảnh | Scene 2A: Decision A |
| **Name of video** | Tên video | 13A.1 |
| **Script** | Prompt gửi cho AI (giữ nguyên 100%) | Animate only... |
| **Selected image** | Tên ảnh tham chiếu | 02_BA_speaking_wide.png |

> **Cột A (Scenario) là tên thư mục con** trong `videos/` (xem bước 6D): `videos/<Scenario>/<tên video>.mp4`, ví dụ `videos/Scenario 3/14A.1.mp4`. Cột A là **ô gộp**: giá trị (vd. `Scenario 3`) chỉ nằm ở ô đầu của vùng gộp (vd. `A4:A15`); các dòng còn lại đọc ra rỗng. Khi đọc Excel phải **điền tiếp giá trị của dòng trên** (forward-fill) cho mọi dòng thuộc cùng vùng gộp.

> Sheet `BA` có đủ 5 cột trên. Các sheet `DEV`, `PM`, `TESTER` chỉ có 3 cột (Scenario, Scene, Script) — thiếu tên video và ảnh, nên phải hỏi user (BƯỚC 0). Cột "Name of video" của scene ghép có thể ghi nhiều tên nối bằng `&`; xem mục "Scene ghép nhiều khối".

---

## Prompt đầu/cuối (OPENING / CLOSING)

> Chi tiết trong `references/prompts.md`. Script tự nối `OPENING` vào đầu và `CLOSING` vào cuối cột Script (Script giữ nguyên 100%); hai đoạn này nằm ở đầu `scripts/google_flow_automation.js`.

---

## PIPELINE — TỪNG BƯỚC CỤ THỂ

### BƯỚC 0: Hỏi user (BẮT BUỘC, mỗi session mới, 1 lần duy nhất)

**Việc đầu tiên của mỗi session mới**, trước khi mở Chrome hay inject script:

1. **Chỉ đọc file Excel** (không có tác dụng phụ) để xác định các scene cần chạy.
2. **Liệt kê mọi điểm chưa chắc** (xem danh sách dưới), rồi gọi `AskUserQuestion` hỏi tất cả cùng lúc và chờ user trả lời. Không tự điền câu trả lời, không suy ra từ lần chạy trước hay từ giá trị đang hiển thị trong panel settings của Flow.

Câu hỏi bắt buộc (hỏi **ngay từ đầu**, theo thứ tự):
00. **Loại công việc?** (hỏi ĐẦU TIÊN) — `Tạo video từ file kịch bản chính (Recommended)` hoặc `Tạo lại video lỗi từ file Excel video lỗi`. Chọn tạo lại thì làm theo `references/redo-mode.md` (mục "Chế độ tạo lại video lỗi") (hỏi thêm đường dẫn file, sheet và các điểm trong mục đó), rồi vẫn hỏi chế độ Tự chọn/Agent như bình thường.
0. **Chế độ tạo video?** — `Tự chọn (Recommended)`: script tự đặt model và thời lượng (câu 1 và 2 bên dưới); hoặc `Agent`: bật chế độ Agent của Flow, **bỏ qua câu 1 và 2** (model và thời lượng do Agent quyết định; xem `references/agent-mode.md`).
1. **Model nào?** (chỉ hỏi khi chọn Tự chọn) — `Omni 1.1 Flash (Recommended)` / `Veo 3.1 - Lite` / `Veo 3.1 - Fast` / `Veo 3.1 - Quality`.
2. **Thời lượng video?** (chỉ hỏi khi chọn Tự chọn) — `Tự ước tính (Recommended)` / `6s` / `8s` / `10s` (Other để nhập `4s`).

Hỏi thêm khi gặp một trong các tình huống sau (không tự đoán):
- Chưa có **link project Google Flow**.
- Chưa rõ **chạy sheet/scene nào**.
- **Script đã có sẵn khối rule ở đầu** (vd. "Animate only from the provided reference image..."): kiểm tra mọi dòng; nếu đã có thì gửi **nguyên văn** (`raw`, KHÔNG nối OPENING/CLOSING); nếu chỉ một số dòng có thì hỏi user.
- **Tên video** của scene ghép nhiều tên (vd. `14B.1 & 14B.2 & 14B.3`): dùng nguyên chuỗi, hay chỉ tên đầu (`14B.1`), hay cách khác.
- **Ước tính thời lượng của scene lớn hơn 10s** (Flow tối đa 10s): giữ nguyên 1 video 10s (nội dung có thể không vừa), hay tách scene (xem mục "Scene ghép nhiều khối" bên dưới).
- Sheet **không có cột ảnh hoặc tên video** (DEV/PM/TESTER chỉ có Scenario, Scene, Script): dùng ảnh nào, đặt tên video thế nào.
- **Lượt chạy:** chạy tiếp lượt cũ, tạo lại một số video (nói rõ video nào và lý do), hay bắt đầu kịch bản/tài liệu mới? Quyết định tên run `R` (mặc định `<file Excel>__<sheet>`; kịch bản mới ⇒ run mới). Tạo lại video: bản cũ được giữ trong `videos/<Scenario>/_cu/`, không bị ghi đè.
- **Chạy nhiều sheet với link project khác nhau** (vd. Dev/PM/Tester): hỏi link project của TỪNG sheet; mỗi sheet một thư mục riêng, log riêng (xem `references/queue-mode.md`). Hỏi thêm: user đã chỉnh Agent settings chưa. **Quy tắc cố định:** ở chế độ Agent, hộp xác nhận credit (xuất hiện ở video đầu tiên) luôn bấm "Always approve", không hỏi lại (`enableAutoApprove()`; `runQueue({agent:true})` tự bật).
- **Chạy nhiều sheet** (BA, DEV, PM, TESTER... đều có `Scenario 1`–`Scenario 8`): các sheet có thể có video **trùng tên** hoặc cùng tên thư mục `Scenario N`. Hỏi user: gộp chung `videos/<Scenario>/` hay thêm cấp theo sheet `videos/<Sheet>/<Scenario>/` để không ghi đè nhau (khuyến nghị: thêm cấp theo sheet khi chạy từ 2 sheet trở lên).
- Dòng **Voice Over** / lời dẫn không có nhãn người nói: ảnh `VoC speaking` là người dẫn chuyện riêng (nhân vật nữ đứng một mình, đã xác nhận). Chỉ hỏi lại nếu gặp ảnh dẫn chuyện khác mà không rõ ai là người dẫn.
- Dòng có **tin nhắn chat** (vd. `Team chat: “URGENT...”`): đọc thành tiếng, hiện chữ trên màn hình, hay bỏ qua.
- Bất kỳ điều gì khác Claude không chắc chắn.

Chỉ được bỏ qua một câu khi tin nhắn yêu cầu của user đã nêu rõ (ví dụ "dùng Veo 3.1 - Fast, 8s"). Sau khi có đủ câu trả lời mới chạy liên tục đến hết, không hỏi lại.

**Nếu đã có log tiến độ (`progress.<run>.jsonl`, chạy lại / tiếp tục):** chạy `progress.ps1 -Run "R" -Show` (hoặc `-List` để chọn run) ngay sau khi đọc Excel, áp dụng bảng "Khi chạy lại" ở mục "Trạng thái bền vững", in tóm tắt (đã xong / đã gửi / không chắc / credit đã tốn) và đưa các tình huống mơ hồ vào lần hỏi ở đây.

#### Scene ghép nhiều khối (một ô Script có nhiều `Visual Prompt` / `Audio/Dialogue`)

Một số dòng Excel gộp nhiều đoạn vào cùng một scene, và cột "Name of video" ghi nhiều tên nối bằng `&` (vd. Scene 3B: `14B.1 & 14B.2 & 14B.3`).

- **Một dòng Excel = một scene = 1 video**, với **toàn bộ nội dung ô Script, giữ nguyên 100%** (không cắt, không tách). Người dùng đã ghép vào cùng một scene nghĩa là muốn chúng nằm trong cùng một video.
- Claude **chỉ hỏi** (ở BƯỚC 0) có nên tách thành nhiều video không. Nếu user không yêu cầu tách thì **không tách**.
- Nếu user chọn tách: mỗi khối `Visual Prompt` + `Audio/Dialogue` thành một lần generate riêng, đặt tên theo từng tên trong cột "Name of video" (theo thứ tự).
- Lưu ý: Flow chỉ cho tối đa 10s/video. Scene ghép có nhiều thoại thường dài hơn 10s nên cần hỏi user cách xử lý ngay từ đầu.

Khi chọn "Tự ước tính": gọi `window.estimateDuration(scriptContent)` cho từng scene và dùng giá trị `recommended` (4/6/8/10s) để `selectDuration` trước khi generate scene đó.

#### Chế độ Agent (khi user chọn câu 0 = Agent)

> Chi tiết trong `references/agent-mode.md`.

#### Chế độ tạo lại video lỗi (khi câu 00 = tạo lại video lỗi)

> Chi tiết trong `references/redo-mode.md` (cột file video lỗi, quy tắc ghép prompt, xóa video cũ trên Flow trước khi tạo lại, đặt tên đúng tên cột "Name of video", nơi lưu).

### BƯỚC 1: Navigate đến project

```
[claude-in-chrome → navigate] url = link project Google Flow
```

### BƯỚC 2: Đọc file Excel

Đọc file Excel, lấy 3 cột cho mỗi scene: `imageName`, `scriptContent`, `videoName`.

### BƯỚC 3: Inject script

```javascript
// [claude-in-chrome → javascript_tool]
// Copy TOÀN BỘ nội dung file scripts/google_flow_automation.js vào đây
// Script phải được inject trong 1 lệnh duy nhất, KHÔNG chia chunks
```

**Ngay sau inject, gọi verify:**

```javascript
// [claude-in-chrome → javascript_tool]
window.verifyScript()
// Kết quả phải là: { ok: true, version: "v17", missing: [], ... }
// Nếu ok: false → inject lại toàn bộ
```

### BƯỚC 4: Kiểm tra ảnh

```javascript
// [claude-in-chrome → javascript_tool]
await window.checkImagesExist(["02_BA_speaking_wide.png", "03_DEV_closeup.png"])
// Kết quả: { all: true, missing: [] }
// Nếu missing.length > 0 → DỪNG, báo user ảnh nào thiếu
```

### BƯỚC 5: Thiết lập model + duration (1 lần) — BỎ QUA nếu dùng chế độ Agent

> **v4:** một lệnh JS làm hết: `await window.applySettings({ model: 'Omni 1.1 Flash', seconds: 10 })` (tắt Agent, mở panel, chọn model rồi thời lượng, kiểm tra, đóng panel; không cần chuột). Chi tiết và phương án dự phòng trong `references/model-duration.md`.

### BƯỚC 6: Chạy pipeline cho mỗi scene

**Lặp lại 4 sub-step này cho từng scene. KHÔNG dừng giữa chừng.**

#### 6A: Generate video (~5s)

**Chế độ tạo lại video lỗi — bước thêm TRƯỚC khi gửi:** xóa video cũ cùng tên trên Flow bằng `await window.trashVideoByName("<tên>")` (chuyển vào Trash, khôi phục được; chi tiết và cách xử lý kết quả trong `references/redo-mode.md`), rồi mới gửi video mới với đúng tên đó.

**Chế độ tạo lại video lỗi:** dòng có cột K gọi `window.startGenerate(ảnh, nội_dung_K, số_giây, true)` (tham số thứ 4 = `raw`, gửi nguyên văn, không ghép OPENING/CLOSING).

**Trước lệnh 1:** ghi `submitting` (`progress.ps1 -Run "R" -Video <tên> -Status submitting -Seconds <giây>`). **Ngay khi lệnh 2 trả `done`:** ghi `submitted` **kèm `-Seconds <giây>`** (để tính credit). Trả `failed` → ghi `failed -Note "<lỗi>"`.

Tạo video **chạy ngầm** để không vướng giới hạn ~45s của `javascript_tool` (lệnh `generateVideo` trực tiếp có thể bị timeout khi trang chậm, và khi đó không biết video đã gửi chưa):

```javascript
// [claude-in-chrome → javascript_tool]  (lệnh 1)
window.startGenerate("02_BA_speaking_wide.png", "nội dung script từ Excel...", 8)
// Trả về NGAY: { started: true }. Tham số thứ 3 = số giây đã chọn (BẮT BUỘC truyền).
// Nếu đang có lượt chạy dở: { started: false, error: "Already running" } → KHÔNG gọi lại, chuyển sang lệnh 2.
```

```javascript
// [claude-in-chrome → javascript_tool]  (lệnh 2, ngay sau lệnh 1)
await window.waitForGenerate(30000)
// Chờ trong trang (tối đa 30s), trả về khi xong:
// { status: "done", result: { success: true, promptLength: 2236 }, elapsedMs: ... }
// { status: "failed", result: { success: false, error: "Duration mismatch: current 10s, expected 6s" } }
// { status: "running" }  → gọi lại waitForGenerate(30000)
```

- `done` → sang 6B.
- `failed` + `Duration mismatch` (script từ chối gửi, không tốn credit) → quay lại BƯỚC 5.1–5.3 đặt lại thời lượng rồi `startGenerate` lại.
- `failed` lỗi khác → thử lại 1 lần, vẫn lỗi → báo user và chuyển scene tiếp.
- `window.getGenerateResult()` chỉ đọc trạng thái hiện tại (không chờ).

**Quy tắc chống tạo trùng (tốn credit):** sau mọi timeout hoặc khi không nhận được phản hồi, **KHÔNG được gọi `startGenerate` lại** trước khi kiểm tra `getGenerateResult()` **và** danh sách tile (đã có tile mới chưa: `getNewTile()` / `isVideoReady()`). Nếu `running` quá ~2 phút mà không có tile mới: đặt lại `window.__gen = { status: "none" }` rồi mới `startGenerate` lại. Nếu trang vừa tải lại / Chrome vừa kết nối lại thì `window.__gen` đã mất: inject lại script rồi kiểm tra danh sách tile để biết scene hiện tại đã được gửi chưa.

`generateVideo(image, script, seconds)` vẫn dùng được trực tiếp nhưng không khuyến nghị.

#### 6B: Đợi video tạo xong

Chỉ dùng `waitForVideo` (không cần `wait` cố định):

```javascript
// [claude-in-chrome → javascript_tool]
await window.waitForVideo(30000)
// Tự kiểm tra mỗi 2s TRONG trang (không tốn token), trả về NGAY khi video xong.
// Nếu { ready: true } → chuyển sang 6C
// Nếu { ready: false, reason: "generating", progress: "67%" } → gọi lại waitForVideo(30000)
// Nếu { ready: false, reason: "no new tile" } → gọi lại; xem quy tắc chụp ảnh bên dưới
// (maxMs tối đa 30000 vì javascript_tool timeout ~45s; isVideoReady() vẫn dùng được để check tức thì)
```

**Giới hạn số lần gọi `waitForVideo(30000)`** (mỗi lần chờ tối đa 30s; giá trị tạm, **chưa đo thời gian thật** của từng model, có thể chỉnh):

| Model | Số lần tối đa | Tổng tối đa |
|-------|---------------|-------------|
| Omni 1.1 Flash, Veo 3.1 - Lite, Veo 3.1 - Fast | 10 | ~5 phút |
| Veo 3.1 - Quality | 20 | ~10 phút |

Quá giới hạn mà vẫn chưa xong → gửi `PushNotification` rồi chuyển scene tiếp (ghi `failed` kèm `-Note "timeout"` vào log tiến độ; **không tạo lại** vì video có thể vẫn đang chạy).

**Lỗi tạo phía Flow (v4):** tile "Failed – Sorry, this video failed to generate" hoặc "Generation timed out. Please try again." (ghi "You have not been charged") → `isVideoReady()` tự bấm `Retry` (tối đa 4 lần/video; trả `reason: "generate failed, clicked Retry (n/4)"`), cứ gọi lại `waitForVideo`. Agent báo hết quota ("You've reached your Flow Agent quota limit") → không có tile mới, không mất credit: **không dừng hỏi**, tự chuyển sang chế độ thủ công (Omni 1.1 Flash, thời lượng tự ước tính bằng `estimateDuration`) và gửi lại scene đang chờ (`references/agent-mode.md`).

**Chụp ảnh màn hình (ngoại lệ của quy tắc 2):** kết quả JSON không cho thấy thông báo lỗi hay hộp thoại bất ngờ trên giao diện (hết credit, đòi đăng nhập...). Nếu `waitForVideo` trả `no new tile` **quá 2 lần liên tiếp**, được chụp **một** ảnh để xem trang có thông báo lỗi không, rồi xử lý theo mục "Báo lỗi cho user".

**Tile báo lỗi tải:** nếu tile mới hiện "Failed – The video failed to load." (kèm nút `Retry`, không có tên), `isVideoReady()` tự bấm `Retry` (tối đa 2 lần mỗi video, đã kiểm chứng: bấm xong tile tải lại bình thường sau ~1,5 giây) rồi báo `reason: "load failed, clicked Retry (n/2)"`; cứ gọi lại `waitForVideo` như thường. Quá 2 lần vẫn lỗi (`load failed (Retry used 2 times)`) thì xử lý như quá giới hạn thời gian bên trên.

`isVideoReady()` coi video xong khi tile mới không còn `NN%` và ảnh thumbnail đã tải. Không dựa vào tiêu đề tile (Flow có thể giữ nguyên prompt làm tiêu đề sau khi tạo xong).

#### 6C: Finish pipeline (~10s)

```javascript
// [claude-in-chrome → javascript_tool]
await window.finishPipeline("13A.1", "720p")
// Kết quả: { success: true, videoName: "13A.1", renamed: true, downloaded: true, attempts: 1, downloadStartedAt: "..." }
// Nếu downloaded: false → kèm downloadError, available (các mục menu thấy được), clickedDownloadItem.
//   Video đã được đổi tên rồi; chỉ chạy lại: await window.downloadVideoViaMenu("13A.1", "720p")
//   (KHÔNG chạy lại finishPipeline từ đầu / không rename lại)
```

Cơ chế tải trong script: chờ dần (poll mỗi ~300ms, trong trang nên **không tốn thêm token**) cho menu "Download" (tối đa 3s) và mục chất lượng (rê chuột 3s; không hiện thì bấm "Download" rồi chờ thêm 2s). Mỗi lần thất bại thì đóng menu và thử lại, tối đa **3 lần**. Mục chất lượng chỉ được bấm **một lần** nên không tải trùng. `finishPipeline` chỉ đổi tên một lần (bỏ qua nếu tile đã có tên). Lưu ý: script không biết file đã về máy chưa — bước 6D (PowerShell) kiểm tra việc đó.

#### 6D: Move file về project

File tải về có thể trễ vài phút, Downloads có thể còn file cũ cùng tên, và Flow đặt tên `<tên>_<yyyyMMddHHmmss>.mp4` (dùng mẫu `<tên>*.mp4`; khi chạy hàng đợi, `scripts/mover_daemon.ps1` lo việc này). `finishPipeline` trả `downloadStartedAt` (ISO, UTC); chỉ nhận file có `LastWriteTime` sau mốc đó. Đợi tối đa ~3 phút:

```powershell
# [PowerShell] — thay $start bằng downloadStartedAt trả về từ finishPipeline
$start = [datetime]::Parse("2026-09-30T02:35:00Z").ToUniversalTime()
$f = $null
for ($i=0; $i -lt 36 -and -not $f; $i++) {
  $f = Get-ChildItem "$env:USERPROFILE\Downloads\13A.1*.mp4" -ErrorAction SilentlyContinue |
       Where-Object { $_.LastWriteTimeUtc -gt $start } | Sort LastWriteTime -Desc | Select -First 1
  if (-not $f) { Start-Sleep 5 }
}
if ($f) {
  # Thư mục con = giá trị cột A (Scenario) của scene này, vd. "Scenario 3" (đã forward-fill ô gộp).
  # Nếu user chọn thêm cấp theo sheet: "...\videos\<Sheet>\<Scenario>"
  $dir = "C:\path\to\project\videos\Scenario 3"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null   # tạo nếu chưa có
  $dest = Join-Path $dir "13A.1.mp4"
  # Tạo lại video: GIỮ bản cũ (không ghi đè) trong thư mục _cu cạnh nó, thêm hậu tố thời gian
  if (Test-Path -LiteralPath $dest) {
    $old = Join-Path $dir "_cu"; New-Item -ItemType Directory -Force -Path $old | Out-Null
    Move-Item -LiteralPath $dest (Join-Path $old ("13A.1_" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".mp4"))
  }
  Move-Item -LiteralPath $f.FullName $dest
  # Ghi tiến độ trong CÙNG lệnh (không tốn thêm lần gọi): P = đường dẫn tới progress.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File P -Run "R" -Video 13A.1 -Status downloaded
  powershell -NoProfile -ExecutionPolicy Bypass -File P -Run "R" -Video 13A.1 -Status moved -File $dest
} else { "Chưa thấy file mới" }
```

**Thư mục đích:** `videos/<giá trị cột A>/<tên video>.mp4` (thư mục con tạo tự động nếu chưa có). Tên thư mục và tên file phải bỏ các ký tự cấm trên Windows `\ / : * ? " < > |` (thay bằng `-` hoặc bỏ); khoảng trắng và `&` được phép nhưng luôn đặt đường dẫn trong ngoặc kép / dùng `-LiteralPath`. Ghi tiến độ với `-File` trỏ tới đường dẫn đầy đủ gồm thư mục con. Các file cũ nằm thẳng trong `videos/` (như `13A.1.mp4`, `13B.1.mp4`) không tự được chuyển; chỉ chuyển khi user yêu cầu.

Chất lượng tải mặc định là **720p** (đổi bằng tham số thứ 2 của `finishPipeline`). Script luôn rename/tải đúng tile vừa tạo bởi `generateVideo()`, không dựa vào `tiles[0]` hay khớp tên.

**Sau 6D xong → quay lại 6A cho scene tiếp theo.**

---

## Chế độ hàng đợi (khuyến nghị cho nhiều video)

Thay vì lặp BƯỚC 6A–6D cho từng scene, nạp cả sheet vào trang và chạy `window.runQueue()`: vòng lặp tự gửi → chờ → đổi tên → tải, tự Retry khi Flow báo lỗi tạo, dừng khi gặp lỗi cứng hoặc hết quota Agent; mover nền chuyển file về `videos/<Scenario>/` và ghi log. Quy trình đầy đủ, cấu trúc thư mục từng sheet, checksum nội dung, theo dõi bằng `Monitor`, xử lý lỗi: **`references/queue-mode.md`**. Đã chạy thật 283 video / 3 sheet / 3 project.

## Tóm tắt pipeline (copy-paste reference)

```
Đầu session: progress.ps1 -List / -Run "R" -Show (nếu đã có log) → áp dụng bảng "Khi chạy lại"
Mỗi scene:
0. progress.ps1 -Run "R" -Status submitting          (TRƯỚC khi gửi)
1. javascript_tool → window.startGenerate(image, script, seconds) → await window.waitForGenerate(30000)
   → done: progress.ps1 -Run "R" -Status submitted   (failed: ... -Status failed -Note "...")
2. await window.waitForVideo(30000)   (lặp lại nếu chưa xong)
3. javascript_tool → await window.finishPipeline(name, "720p")
4. PowerShell → chờ file mới, Move-Item Downloads → videos/, ghi downloaded + moved (cùng một lệnh)
```

## Token tiết kiệm

- Pipeline 4 round-trip, không screenshot nào
- `verifyScript()` kiểm tra script đã inject chưa — tránh inject lại
- `isVideoReady()` check DOM trả text vài byte (so với screenshot 800-1500 tokens)
- Đọc Excel 1 lần đầu, không đọc lại
- Chế độ hàng đợi: cả sheet chạy trong trang, chỉ cần vài lượt gọi công cụ cho mỗi sheet (nạp, bật, theo dõi bằng `Monitor`) thay vì 3–4 lượt cho mỗi video

## Troubleshooting và lưu ý

> Xem `references/troubleshooting.md`.

