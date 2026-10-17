# Google Flow Video Skills

Tự động hóa việc tạo nhiều video ngắn từ kịch bản Excel trên Google Flow, sau đó ghép các đoạn thành video hoàn chỉnh bằng Claude Code. Bạn chuẩn bị kịch bản và ảnh tham chiếu, giao việc bằng ngôn ngữ tự nhiên; Claude thực hiện các thao tác tạo, đổi tên, tải về, sắp xếp và ghi tiến độ theo hướng dẫn của skill.

Repository gồm hai skill độc lập. Có thể dùng riêng skill tạo video, riêng skill ghép video, hoặc dùng nối tiếp trong cùng một quy trình.

| Skill | Phiên bản | Chức năng |
| --- | --- | --- |
| [google-flow-video](google-flow-video_v5/SKILL.md) | v5 | Tạo video từ kịch bản Excel qua Claude in Chrome; hỗ trợ hàng đợi, tải video và ghi tiến độ. |
| [google-flow-video-merge](google-flow-video-merge_v1/SKILL.md) | v1 | Nhóm và ghép video theo kịch bản Excel; cắt khoảng lặng, kiểm tra từ lặp và xuất báo cáo. |

## Dành cho ai

Dành cho người làm nội dung, đào tạo hoặc xây dựng video tình huống có nhiều phân cảnh và lời thoại được quản lý trong Excel. Phù hợp khi bạn cần tạo hàng chục đoạn video theo cùng một bộ kịch bản, dùng ảnh tham chiếu để giữ nhân vật và bối cảnh, rồi ghép lại theo thứ tự.

Bạn không cần viết mã để sử dụng hằng ngày. Bạn cần biết chuẩn bị file Excel, mở đúng project Flow, trả lời các câu hỏi thiết lập của Claude và tự xem, nghe để duyệt kết quả. Người phụ trách kỹ thuật có thể hỗ trợ cài phần mềm và thư viện trong lần đầu.

## Công cụ giúp làm gì

Nếu làm thủ công, mỗi video đều cần chọn ảnh, dán kịch bản, chọn thông số, bấm tạo, chờ, đổi tên và tải về. Hai skill giúp thực hiện quy trình lặp lại đó và xử lý các đoạn sau khi tải:

- **Tạo video:** đọc các dòng kịch bản trong Excel, tìm ảnh tham chiếu trên Flow, gửi yêu cầu tạo video, đổi tên theo cột `Name of video` và tải về 720p.
- **Quản lý nhiều video:** chạy hàng đợi theo sheet, lưu video theo `Scenario`, ghi log để hỗ trợ chạy tiếp khi bị gián đoạn và tạo lại các video bạn chỉ định.
- **Ghép video:** xác định nhóm từ mã video trong Excel, cắt khoảng lặng đầu/cuối, hỗ trợ phát hiện và cắt từ lặp bằng nhận dạng giọng nói, nối các đoạn và xuất báo cáo.

Quy trình sử dụng: **Chuẩn bị Excel và ảnh → giao việc cho Claude Code → tạo video trên Flow → xem và yêu cầu tạo lại nếu cần → ghép video → duyệt bản hoàn chỉnh.**

Skill là bộ hướng dẫn và script để Claude Code thực hiện công việc. Người dùng vẫn cần tài khoản Google Flow và tự duyệt chất lượng hình ảnh, nhân vật, lời thoại cũng như các điểm cắt sau khi ghép.

## Chuẩn bị lần đầu

Quy trình tạo video hiện hướng đến **Windows**, vì các bước quản lý file và tiến độ dùng PowerShell. macOS/Linux chưa được kiểm chứng cho toàn bộ quy trình.

| Thành phần | Cần cho | Chuẩn bị |
| --- | --- | --- |
| Node.js 22 trở lên và npm | Cài bằng npx | Cài trên máy trước khi chạy lệnh cài skill. |
| Claude Code | Cả hai skill | Dùng tab Code trong ứng dụng Claude hoặc CLI, mở đúng thư mục dự án và cấp quyền đọc/ghi cần thiết. Claude Chat thông thường không đủ cho quy trình này. |
| Google Chrome và Claude in Chrome | Tạo video | Đăng nhập và kết nối tiện ích với Claude Code; kiểm tra Claude truy cập được tab Flow. |
| Google Flow | Tạo video | Có tài khoản được sử dụng Flow, đủ credit và project đã tải ảnh tham chiếu. |
| Python và openpyxl | Đọc Excel, xuất hàng đợi | Cài trong môi trường Python mà Claude Code sử dụng. |
| Python 3.9+, numpy, ffmpeg và faster-whisper | Ghép video | Skill có script kiểm tra phụ thuộc; có thể dùng imageio-ffmpeg thay ffmpeg trên PATH. Mô hình Whisper tải ở lần dùng đầu. |

Chỉ cần Chrome và Flow khi tạo video. Nếu đã có các đoạn video cùng file Excel phù hợp, bạn có thể dùng riêng skill ghép trên máy.

## Cài đặt cho Claude Code

### Cài qua npx

Mở terminal tại **thư mục chứa kịch bản và dữ liệu của bạn**, rồi chạy:

```powershell
npx google-flow-video-skills
```

Lệnh trên chép cả hai skill vào `.claude/skills/`. Có thể chọn cài riêng một skill hoặc cài cho mọi dự án:

```powershell
npx google-flow-video-skills --skill video
npx google-flow-video-skills --skill merge
npx google-flow-video-skills --global
```

Nếu skill đã tồn tại, lệnh sẽ dừng để giữ các thay đổi cục bộ. Thêm `--force` khi muốn ghi đè các file cùng tên để cập nhật. Lệnh cài chỉ chép file skill; các thư viện Python/ffmpeg cần được kiểm tra riêng theo hướng dẫn từng skill.

Để lấy bản mới nhất trên npm và cập nhật hai skill đã cài tại dự án hiện tại:

```powershell
npx google-flow-video-skills@latest --force
```

Nếu đã cài bằng `--global`, thêm `--global` vào lệnh cập nhật. Sao lưu các chỉnh sửa riêng trong thư mục skill trước khi ghi đè.

Sau khi cài tại dự án, cấu trúc sẽ gồm:

```text
thu-muc-du-an/
└── .claude/
    └── skills/
        ├── google-flow-video/
        │   ├── SKILL.md
        │   ├── scripts/
        │   └── references/
        └── google-flow-video-merge/
            ├── SKILL.md
            ├── scripts/
            └── references/
```

Bạn cũng có thể cài trực tiếp bản trên GitHub:

```powershell
npm exec --yes --package=github:thanhdo257205/google-flow-video-skills -- google-flow-video-skills
```

### Cài thủ công

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

## Cách dùng hằng ngày

### 1. Chuẩn bị kịch bản Excel của bạn

Dùng file `.xlsx` của bạn, với dòng đầu là tiêu đề và mỗi dòng tiếp theo là một đoạn video. Giữ nguyên tên các cột sau:

| Cột | Nội dung |
| --- | --- |
| `Scenario` | Nhóm kịch bản, dùng để chia thư mục kết quả. Ô gộp được hiểu là áp dụng cho các dòng bên dưới trong nhóm. |
| `Scene` | Tên phân cảnh để chọn phạm vi cần tạo. |
| `Name of video` | Mã video, dùng để đặt tên và xác định nhóm ghép. Mã cần duy nhất trong sheet. |
| `Script` | Mô tả cảnh và lời thoại gửi cho Flow. |
| `Selected image` | Tên ảnh tham chiếu phải khớp với ảnh đã tải lên project Flow. |

Có thể giữ thêm cột ghi chú của bạn. Riêng skill ghép cần các cột `Scenario`, `Name of video` và `Script`. Lưu file trước khi giao việc, tránh chỉnh sửa dữ liệu trong lúc Claude đang đọc hoặc chạy hàng đợi.

Repository và package npm **không kèm file Excel mẫu hay kịch bản thực tế**. Các tên file, sheet và đường dẫn trong ví dụ dưới đây chỉ để minh họa; hãy thay bằng dữ liệu của bạn.

### 2. Mở project Flow và giao việc tạo video

Mở Chrome, đăng nhập Google Flow và tải ảnh tham chiếu lên project. Sau đó mở Claude Code trong thư mục dữ liệu đã cài skill và gửi yêu cầu đủ thông tin:

> Dùng skill google-flow-video để tạo video từ file kich-ban.xlsx, sheet DaoTao, Scenario 1, Scene 2A và Scene 2B. Project Flow: [dán link project của tôi]. Hãy kiểm tra dữ liệu và hỏi các thông số còn thiếu trước khi bắt đầu.

Claude sẽ đọc kịch bản, kiểm tra tiến độ cũ nếu có và hỏi các lựa chọn cần thiết: phạm vi video, chế độ tạo, model/thời lượng khi dùng chế độ thủ công, cách xử lý video đã có và chi phí credit ước tính. Bạn chốt thông số trước khi bắt đầu.

Ở chế độ **thủ công**, Claude đặt model và thời lượng theo lựa chọn đã thống nhất. Ở chế độ **Agent**, Flow tự quyết một số thông số; bạn cần kiểm tra cài đặt Agent trước khi chạy. Với nhiều video hoặc nhiều sheet, xem [quy trình hàng đợi](google-flow-video_v5/references/queue-mode.md).

Trong lúc chạy, giữ Chrome và tab Flow hoạt động, không để máy ngủ và tránh tự thao tác trên cùng project. Claude sẽ gửi, chờ, đổi tên, tải và xếp video; khi thiếu ảnh, hết credit, mất quyền truy cập hoặc gặp tình huống cần làm rõ, hãy xử lý theo thông báo trước khi tiếp tục.

Chi tiết: [hướng dẫn tạo video v5](google-flow-video_v5/SKILL.md).

### 3. Xem kết quả, tạo lại hoặc chạy tiếp

Video được lưu theo `Scenario`, thường ở `videos/<Scenario>/`. Log tiến độ nằm trong `logs/`; khi chạy nhiều sheet theo hàng đợi, mỗi sheet có thư mục kết quả và log riêng.

Bạn cần xem và nghe từng video để kiểm tra đúng nhân vật nói, lời thoại đủ câu, hình ảnh khớp ảnh tham chiếu và chuyển động đúng ý. Sau đó có thể nhắn:

- **Tạo lại video không đạt:** “Tạo lại video 2A.1 vì sai người nói, giữ bản cũ.”
- **Tiếp tục sau gián đoạn:** “Tiếp tục lượt chạy trước của file kich-ban.xlsx, sheet DaoTao; kiểm tra log và video đã gửi trước khi tạo tiếp.”
- **Đổi kịch bản:** “Bắt đầu lượt chạy mới cho sheet DaoTaoMoi, dùng project Flow này: [link].”

Giữ log nếu muốn chạy tiếp. Khi trạng thái gửi chưa rõ, Claude cần đối chiếu tile trên Flow trước khi gửi lại để hạn chế tạo trùng và tốn thêm credit.

### 4. Ghép các video đã duyệt

Sau khi có đủ các đoạn video, giao việc cho skill ghép bằng file Excel, sheet, Scenario và đường dẫn nguồn/đích:

> Dùng skill google-flow-video-merge để ghép video trong videos/Scenario 1 theo file kich-ban.xlsx, sheet DaoTao, Scenario 1. Lưu vào videos_merged/Scenario 1. Hãy kiểm tra thư viện và file còn thiếu, cho tôi xem nhóm ghép để xác nhận trước khi dựng.

Claude sẽ hỏi thêm cách xử lý video đứng riêng, ngôn ngữ lời thoại và có cắt từ lặp hay không. Việc nhóm phụ thuộc vào mã `Name of video`, không chỉ theo thứ tự file trong thư mục. Xem [quy tắc nhóm](google-flow-video-merge_v1/references/grouping-rules.md) nếu cần đặt mã hoặc kiểm tra một nhóm.

Nếu muốn tự kiểm tra thư viện sau khi cài bằng npx tại dự án:

```powershell
python .claude/skills/google-flow-video-merge/scripts/check_deps.py
```

Nếu cài global, script nằm trong `$HOME/.claude/skills/google-flow-video-merge/scripts/`. Claude sẽ kiểm tra và xin phép trước khi cài các thư viện còn thiếu.

Đầu ra gồm video `.mp4` và `merge_report.json`. Báo cáo và nhận dạng giọng nói hỗ trợ kiểm tra, nhưng bạn vẫn cần nghe/xem lại bản hoàn chỉnh, nhất là các điểm cắt khoảng lặng hoặc từ lặp.

Chi tiết: [hướng dẫn ghép video v1](google-flow-video-merge_v1/SKILL.md).

## Phạm vi repository

Repository chứa skill tạo video v5 và skill merge v1. Video, log chạy, file ZIP, kịch bản Excel và dữ liệu cá nhân được giữ ở máy người dùng. Các phiên bản skill cũ không nằm trong bản phát hành này.

Các selector giao diện Google Flow có thể cần cập nhật khi giao diện thay đổi.

## Phát hành npm (dành cho maintainer)

Phiên bản npm `1.0.0` đóng gói skill video v5 và merge v1; số phiên bản package độc lập với phiên bản từng skill.

```powershell
npm test
npm pack --dry-run
npm login
npm publish --access public
```

Package đã phát hành: [google-flow-video-skills trên npm](https://www.npmjs.com/package/google-flow-video-skills). Cần tài khoản có quyền xuất bản và hoàn tất xác thực mà npm yêu cầu. Với lần cập nhật tiếp theo, tăng phiên bản package trước khi publish. Chỉnh README trên GitHub không tự thay đổi README của phiên bản npm đã phát hành; cần phát hành phiên bản mới để cập nhật nội dung trên npm.

Package hiện để `UNLICENSED` vì repository chưa chọn giấy phép phân phối.
