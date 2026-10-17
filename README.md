# Google Flow Video Skills

Hai skill Claude Code cho quy trình tạo và ghép video trên Google Flow. Mỗi skill có `SKILL.md`, mã nguồn và tài liệu riêng, có thể sử dụng độc lập hoặc nối tiếp nhau.

| Skill | Phiên bản | Chức năng |
| --- | --- | --- |
| [google-flow-video](google-flow-video_v5/SKILL.md) | v5 | Tạo video từ kịch bản Excel qua Claude in Chrome; hỗ trợ hàng đợi, tải video và ghi tiến độ. |
| [google-flow-video-merge](google-flow-video-merge_v1/SKILL.md) | v1 | Nhóm và ghép video theo kịch bản Excel; cắt khoảng lặng, kiểm tra từ lặp và xuất báo cáo. |

## Cài đặt cho Claude Code

Clone repository:

```powershell
git clone https://github.com/thanhdo257205/google-flow-video-skills.git
cd google-flow-video-skills
```

Chép toàn bộ thư mục của từng skill vào `.claude/skills/` trong dự án cần sử dụng:

```powershell
New-Item -ItemType Directory -Force .claude/skills | Out-Null
Copy-Item -Recurse google-flow-video_v5 .claude/skills/google-flow-video
Copy-Item -Recurse google-flow-video-merge_v1 .claude/skills/google-flow-video-merge
```

Hoặc cài vào `$HOME/.claude/skills/` để sử dụng cho nhiều dự án. Giữ nguyên cấu trúc `SKILL.md`, `scripts/` và `references/` của mỗi skill.

## Yêu cầu và cách dùng

### Tạo video

Cần Claude Code, Claude in Chrome, tài khoản Google Flow có quyền tạo video, file Excel kịch bản và ảnh tham chiếu nếu kịch bản yêu cầu. Các script hỗ trợ sử dụng PowerShell và Python; xem [hướng dẫn v5](google-flow-video_v5/SKILL.md) để biết quy trình và yêu cầu chi tiết.

Ví dụ yêu cầu Claude Code:

> Dùng skill google-flow-video để tạo video từ file Excel của tôi.

Skill sẽ hỏi các thông số đầu vào trước khi chạy. Việc tạo video sử dụng credit của tài khoản Google Flow.

### Ghép video

Cần Python 3.9+, openpyxl, numpy, ffmpeg (hoặc imageio-ffmpeg) và faster-whisper. Chạy script sau để kiểm tra môi trường:

```powershell
python google-flow-video-merge_v1/scripts/check_deps.py
```

Ví dụ yêu cầu Claude Code:

> Dùng skill google-flow-video-merge để ghép các video đã tải theo file Excel kịch bản.

Xem [hướng dẫn merge](google-flow-video-merge_v1/SKILL.md) về đầu vào, quy tắc nhóm, cài thư viện và kiểm tra kết quả. Cần nghe/xem lại kết quả ghép, đặc biệt tại các điểm cắt.

## Phạm vi repository

Repository chứa skill tạo video v5 và skill merge v1. Video, log chạy, file ZIP, kịch bản Excel và dữ liệu cá nhân được giữ ở máy người dùng. Các phiên bản skill cũ không nằm trong bản phát hành này.

Các selector giao diện Google Flow có thể cần cập nhật khi giao diện thay đổi.
