### BƯỚC 5: Thiết lập model + duration (1 lần) — BỎ QUA nếu dùng chế độ Agent

**Thứ tự bắt buộc: model TRƯỚC, rồi thời lượng, rồi xác nhận.** Đổi model có thể **reset thời lượng** và **đổi các tùy chọn có sẵn** (đã kiểm chứng trên panel thật):
- `Omni 1.1 Flash`: thời lượng 4s / 6s / 8s / **10s**.
- Các model **Veo 3.1** (Lite, Fast, Quality, Lite [Lower Priority]): chỉ **4s / 6s / 8s** (không có 10s), và dòng chọn chất lượng 360p/720p biến mất khỏi panel. Scene ước tính 10s mà dùng Veo → hỏi user (cắt còn 8s, hay dùng Omni).

**5.1 Mở panel settings.** Click JS không mở được panel (Angular CDK), nên phải dùng click chuột thật của công cụ `computer`. Thứ tự (theo kết quả thử thực tế):

1. **Click theo tọa độ có nhân tỉ lệ** (mở được panel ngay lần đầu trong cả 2 lần thử):

```javascript
// [claude-in-chrome → javascript_tool]
window.getSettingsButtonCenter()
// Kết quả: { x: 946, y: 609, innerWidth: 1536, innerHeight: 674 }
```

Tọa độ ảnh chụp có thể lớn hơn viewport (đã thấy khung 1568 so với `innerWidth` 1536 → ~1.02, và khung 1383 so với 1150 → ~1.2). **Luôn tính lại**: `scale = chiều rộng khung ảnh chụp (số "coordinate frame" công cụ báo) / innerWidth`, rồi click tại `[x*scale, y*scale]`:

```
// [claude-in-chrome → computer] action=left_click, coordinate=[x*scale, y*scale]
```

2. **Dự phòng: click theo `ref`** (`find` rồi click): trong lần thử thực tế, click theo `ref` **chưa mở được panel** (2 lần), nên chỉ dùng khi cách 1 không được:

```
// [claude-in-chrome → find] query = "settings trigger button in the prompt bar (Video 720p 10s)"
// [claude-in-chrome → computer] action=left_click, ref="ref_N"
```

**5.2 Xác nhận panel đã mở** (bắt buộc sau mỗi lần click):

```javascript
// [claude-in-chrome → javascript_tool]
window.isSettingsPanelOpen()   // phải trả true
```

Trả `false` → click lại (đổi sang cách còn lại), tối đa 3 lần. Vẫn không mở được → lỗi mức "dừng hẳn" (xem mục báo lỗi): gửi `PushNotification` và dừng.

**5.3 Đặt model, rồi thời lượng, rồi xác nhận lại.** Ô chọn model là **nút mở menu** (`aria-haspopup="menu"`), không phải ô `mat-select`. Tên model phải **khớp chính xác** (`Veo 3.1 - Lite` khác `Veo 3.1 - Lite [Lower Priority]`):

```javascript
// [claude-in-chrome → javascript_tool]
await window.selectModel("Omni 1.1 Flash")
// { success: true, selected: "...", changed: true, durationOptions: ["4s","6s","8s","10s"], note: "..." }
// Model không có: { success: false, error: "Model not found", available: [...] }
// Panel bị đóng sau khi chọn: { success: false, error: "Settings panel closed..." } → mở lại panel (5.1) và kiểm tra getCurrentModel()
window.getCurrentModel()       // phải trả đúng tên model vừa chọn (cần panel đang mở)
window.selectDuration(10)      // phải trả { success: true, ... }; không có thì trả available
window.getCurrentDuration()    // phải trả đúng số giây vừa chọn (10)
```

`selectModel` / `selectDuration` báo lỗi hoặc giá trị đọc lại khác mục tiêu → xử lý như 5.1 rồi chọn lại, tối đa 3 lần. **Không được chuyển sang tạo video khi chưa khớp cả model lẫn thời lượng.** (`getCurrentSettings()` chỉ đọc được số giây/chế độ/số lượng khi panel đóng; **tên model chỉ đọc được khi panel mở**.)

```
// [claude-in-chrome → computer] action=key, text="Escape"
// Đóng settings panel
```

**Chế độ "Tự ước tính":** thời lượng khác nhau theo từng scene, nên mỗi scene phải lặp lại 5.1–5.3 (mở panel, đặt, xác nhận, đóng) **trước khi** gọi `startGenerate` của scene đó.


## v4: làm bằng JS (không cần `computer`)

Một lệnh thay cho BƯỚC 5.1–5.3 (đã xác minh trên Flow thật; không tốn credit):

```javascript
// [claude-in-chrome → javascript_tool]
await window.applySettings({ model: 'Omni 1.1 Flash', seconds: 10 })
// → { success: true, model: 'Omni 1.1 Flash', settings: 'Video · 720p · 10s crop_16_9 x1' }
```
`applySettings` tắt Agent (nếu đang bật), mở panel bằng `.click()` JS, chọn model rồi thời lượng, đọc lại, và đóng panel bằng phím Escape gửi vào `.cdk-overlay-container`. `success: false` kèm `step` (`agent-off`/`open`/`model`/`duration`) cho biết bước nào lỗi. Các bước bằng chuột ở phần trên chỉ là phương án dự phòng khi `applySettings` báo lỗi.
