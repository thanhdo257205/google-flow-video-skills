# Luật ghép video theo tên (cột "Name of video")

Định dạng tên: `<số><chữ A/B/C nếu có>.<thứ tự><đuôi chữ nếu có>` (regex `^(\d+)([ABC]?)\.(\d+)([A-Z]?)$`), ví dụ `13.1`, `14A.1`, `4.1A`, `34A.1B`. Tên sai định dạng thì báo lỗi, không đoán.

## Luật (đã chốt với người dùng)
| # | Luật | Ví dụ |
|---|------|-------|
| 1 | Cùng số đầu, **không có chữ A/B/C** → một nhóm | `13.1 + 13.2` |
| 2 | Cùng số đầu và **cùng chữ A/B/C** → một nhóm | `30A.1 + … + 30A.5` |
| 3 | **Hai số liền nhau (n và n+1) cùng chữ** → một nhóm | `14A.1 + 15A.1 + 15A.2` |
| 4 | **Đuôi chữ sau thứ tự** là đoạn con của một lời dẫn (Voice over) → ghép thành một video, theo A → B → C… | `18.1A + 18.1B + 18.1C + 18.1D` |

Ràng buộc:
- Chỉ ghép khi **cùng chữ**: A không ghép với B hoặc C.
- Số **không có chữ** không ghép với số liền kề (`13.x` không ghép với `14A.x`).
- Đuôi chữ ở luật 4 **không** phải chữ A/B/C của luật 3: `18.1A…D` không ghép với `19A/B/C` (người dùng đã xác nhận).
- Các nhóm được tính **trong từng Scenario** (ô Scenario gộp điền tiếp từ dòng trên).

## Thứ tự trong nhóm
Sắp theo số đầu tăng dần (14 trước 15); cùng số thì theo thứ tự `.1`, `.2`, `.3`; cùng thứ tự mà có đuôi chữ thì theo A, B, C… Ví dụ `34A.1A, 34A.1B, 34A.2, 35A.1…`. Chữ A/B/C ngay sau số (như `19A`) không dùng để sắp xếp, chỉ để chọn video vào cùng nhóm.

## Ví dụ Scenario 3 (sheet "American Cultural - Role Dev")
1. `13.1 + 13.2`
2. `14A.1 + 15A.1 + 15A.2`
3. `14B.1 + 15B.1 + 15B.2 + 15B.3 + 15B.4`
4. `14C.1 + 15C.1 + 15C.2`

## Kết quả đã tính cho các Scenario khác của sheet này
- Scenario 1: `4.1A+4.1B+4.1C+4.1D+4.1E`
- Scenario 2: `9.1` (một mình)
- Scenario 4: `18.1A–D` · `19A.1,19A.2+20A.1–20A.4` · `19B.1–19B.3+20B.1–20B.4` · `19C.1,19C.2+20C.1–20C.3`
- Scenario 6: `28.1A–D` · `30A.1–30A.5` · `30B.1–30B.5` · `30C.1–30C.4`
- Scenario 7: `33.1` (một mình) · `34A.1A+34A.1B+34A.2+35A.1–35A.4` (cần xác nhận) · `34B.*+35B.*` · `34C.*+35C.*`
- Scenario 8: `38.1+38.2+38.3` · `39A.*+40A.*` · `39B.*+40B.*` · `39C.*+40C.*`
- Scenario 5: không có trong sheet.

## Chưa chốt (hỏi người dùng khi gặp)
1. `34A.1A, 34A.1B, 34A.2`: mã đang gộp `34A.1A+34A.1B` thành đoạn con của `34A.1`, rồi ghép với `34A.2` và `35A.*`.
2. **Ba số liên tiếp cùng chữ** (vd. 14A, 15A, 16A): luật chỉ nói "hai số". `group_logic.py` đang nối cả chuỗi và in cảnh báo.
3. **Video đứng một mình**: bỏ qua hay giữ như một video (`--singles`).
