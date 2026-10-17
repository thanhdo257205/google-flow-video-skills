---
name: google-flow-video-merge
description: Ghép các video con (tải từ Google Flow, tên như 13.1, 14A.1, 15A.2) thành video hoàn chỉnh theo luật tên trong cột "Name of video" của file Excel; tự cắt khoảng lặng đầu/cuối, cắt từ nói lặp (đối chiếu lời thoại), nối bằng chuyển cảnh mờ, bằng ffmpeg và Whisper chạy trên máy. Dùng khi người dùng nhờ ghép/nối/dựng các video con của một Scenario thành một video.
---

# Ghép video con thành video hoàn chỉnh (v1)

Đầu vào: thư mục chứa các file `<tên video>.mp4` đã tải (thường do skill `google-flow-video` tạo) và file Excel có cột **Name of video** + **Script**. Đầu ra: mỗi nhóm ghép là một file `.mp4` và một file `merge_report.json`.

## CHỈ CHẠY TRONG CLAUDE CODE
Skill chạy lệnh Python/ffmpeg trên máy và đọc/ghi file, nên **chỉ chạy được trong Claude Code** (tab Code của app hoặc CLI), không chạy được trong Claude Chat. Nếu đang ở Chat (không có công cụ chạy lệnh): **DỪNG** và bảo người dùng mở Claude Code, chọn thư mục làm việc rồi yêu cầu lại. Người dùng cần cấp quyền cho thư mục chứa video, file Excel và thư mục kết quả.

## Bản đồ tài liệu
| Tệp | Dùng để |
|-----|---------|
| `references/grouping-rules.md` | Luật ghép theo tên (đọc kỹ trước khi giải thích nhóm cho người dùng) |
| `references/editing-pipeline.md` | Các bước dựng, thông số, lỗi đã gặp |
| `scripts/check_deps.py` | Kiểm tra (và cài, khi được phép) thư viện cần có |
| `scripts/group_logic.py` | Tính nhóm ghép từ cột Name of video (chạy riêng để xem nhóm) |
| `scripts/merge_videos.py` | Chạy toàn bộ: nhóm, cắt, nối, kiểm tra |

Các đường dẫn `scripts/...` tính từ thư mục chứa skill này.

## Thư viện cần có trên máy (kiểm tra TRƯỚC khi làm gì khác)
Chạy `python scripts/check_deps.py`. Cần:
- **Python 3.9 trở lên**
- **openpyxl** (đọc Excel), **numpy**
- **ffmpeg**: có sẵn trên PATH, hoặc gói Python **imageio-ffmpeg** (đã kèm ffmpeg, dùng khi `winget`/mạng không tải được ffmpeg)
- **faster-whisper** (nhận dạng giọng nói để tìm từ lặp) và **mô hình `small`** (~500 MB, tải ở lần chạy đầu, cần mạng, có thể mất nhiều phút; tải xong dùng offline)

Nếu thiếu: **hỏi người dùng trước** rồi mới chạy `python scripts/check_deps.py --install` (pip cài vào Python của người dùng). Không tự cài khi chưa được đồng ý. Ghi chú: trên Windows có thể thấy cảnh báo "symlink" của Hugging Face, bỏ qua được. Khi gọi Whisper, skill tự giải mã âm thanh bằng ffmpeg và đưa mảng số vào (tránh lỗi lệch phiên bản thư viện `av`).

## BƯỚC 0: hỏi người dùng (bắt buộc, một lần, không đoán)
Hỏi gộp (tối đa 4 câu mỗi lượt `AskUserQuestion`) mọi điều chưa rõ:
1. **File Excel, sheet và Scenario** cần ghép (sheet phải có cột `Scenario`, `Name of video`, `Script`; ô Scenario gộp tự điền tiếp).
2. **Thư mục chứa video con** đã tải (đường dẫn đầy đủ; không tự chọn thư mục).
3. **Thư mục lưu kết quả và cách đặt tên** (mặc định gợi ý: `<tên nhóm>.mp4`, ví dụ `14A.1+15A.1+15A.2.mp4`).
4. **Video đứng một mình** (nhóm chỉ có một video, như `9.1`): bỏ qua hay sao chép sang thư mục kết quả (`--singles skip|copy`).
5. Có **cắt từ lặp** không (mặc định có) và **ngôn ngữ lời thoại** (mặc định `en`).
6. Mọi cảnh báo `!` mà `group_logic.py` in ra (xem mục "Điểm cần hỏi lại") và mọi điều khác không chắc.

## Quy trình
1. `check_deps.py` (xem trên).
2. Chạy `python scripts/group_logic.py "<xlsx>" "<sheet>" --scenario "<Scenario>"` để xem các nhóm. **In nhóm cho người dùng xem và xác nhận** trước khi dựng. Dừng nếu tên sai định dạng.
3. Kiểm tra đủ file: `merge_videos.py --dry-run ...` in nhóm và báo **file thiếu**. Thiếu file thì dừng và báo, không ghép phần có.
4. Chạy `python scripts/merge_videos.py --excel "<xlsx>" --sheet "<sheet>" --scenario "<Scenario>" --src "<thư mục video>" --out "<thư mục kết quả>"` (thêm `--only "13.1+13.2"` để làm một nhóm).
5. Đọc `merge_report.json`: độ dài dự kiến và thực tế (phải khớp, lệch quá 0,3 giây là mất đoạn), các chỗ đã cắt lặp (giây và cụm từ), `verify.repeats_left` (phải rỗng), `verify.diff_vs_script` (khác biệt so với lời thoại; chỉ khác kiểu viết số "2" và "two", "AM" và "a.m." là bình thường).
6. Báo người dùng: danh sách file, độ dài, các chỗ đã cắt kèm mốc giây. **Nói rõ Claude chưa nghe/xem video**, chỉ kiểm tra bằng nhận dạng lời và số liệu, và nhờ người dùng nghe lại các điểm cắt.

## Luật ghép tóm tắt (chi tiết ở `references/grouping-rules.md`)
- **Cùng số đầu, không có chữ A/B/C** → một nhóm (`13.1 + 13.2`).
- **Cùng số đầu và cùng chữ A/B/C** → một nhóm.
- **Hai số liền nhau (n, n+1), cùng chữ** → một nhóm (`14A.1 + 15A.1 + 15A.2`).
- **Đuôi chữ sau thứ tự** (`4.1A–E`, `18.1A–D`, `28.1A–D`) là đoạn con của một lời dẫn → ghép thành một video A → B → C…, **không** ghép với số liền kề.
- Chỉ ghép khi cùng chữ; số không có chữ không ghép với số liền kề.
- **Thứ tự trong nhóm:** số đầu tăng dần; cùng số thì theo `.1`, `.2`, `.3`; cùng thứ tự mà có đuôi chữ thì theo A, B, C… Chữ A/B/C ngay sau số (như `19A`) không dùng để sắp xếp, chỉ để chọn video vào cùng nhóm.

## Điểm cần hỏi lại (không tự quyết)
- `34A.1A, 34A.1B, 34A.2` (đuôi chữ lẫn với thứ tự khác trong cùng nhóm).
- **Ba số liên tiếp cùng chữ** (luật chỉ nói "hai số").
- **Video đứng một mình.**
- Scenario không có trong sheet (ví dụ Scenario 5 trong sheet Role Dev).

## Giới hạn cần nói thật với người dùng
- Whisper có thể bỏ sót từ lặp hoặc tự sửa lặp; cắt giữa câu có thể làm miệng nhân vật giật nhẹ.
- Cắt từ lặp giữ bản đầy đủ phía sau; nếu người dùng muốn giữ bản đầu thì phải đổi mốc cắt.
- Khoảng lặng đo bằng âm lượng; hình vẫn chuyển động nhẹ khi nhân vật đứng yên, không có cảnh "đứng hình".
- Kết quả cuối cùng cần người dùng nghe lại.
