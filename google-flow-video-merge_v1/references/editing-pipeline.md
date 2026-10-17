# Quy trình dựng cho mỗi nhóm (merge_videos.py)

Mỗi video con được xử lý riêng thành một đoạn trung gian (`seg_<tên>.mp4`), rồi các đoạn trong nhóm được nối bằng chuyển cảnh mờ. Cách này **đã được chọn sau một lỗi thật** (xem cuối trang).

## 1) Cắt khoảng lặng đầu/cuối
- `ffmpeg silencedetect` (ngưỡng `-35dB`, tối thiểu `0,3 s`) tìm khoảng lặng.
- Nếu khoảng lặng bắt đầu ở đầu clip (<0,15 s) và dài đủ: bỏ phần lặng đầu, **chừa 0,30 s**. Nếu khoảng lặng chạm cuối clip: bỏ phần lặng cuối, **chừa 0,35 s**.
- Khoảng nghỉ giữa các câu (0,3–0,9 s) được giữ nguyên.
- Đã đo: lúc im lặng hình vẫn chuyển động gần như lúc nói (video AI không "đứng hình"), nên tiêu chí cắt là âm thanh.

## 2) Cắt từ lặp
- Whisper (`small`, CPU, `int8`) cho từng từ kèm mốc thời gian.
- Tìm cụm 1–4 từ lặp **liền nhau**; chỉ cắt khi **lời thoại chuẩn (phần sau `Audio/Dialogue:` trong cột Script) không có cụm đó lặp liền nhau**. Nhờ vậy không cắt nhầm những chỗ lặp có chủ ý.
- Cắt từ đầu bản lặp thứ nhất tới đầu bản thứ hai (giữ bản đầy đủ phía sau). Tại điểm cắt: hạ âm 0,03 s, hình cắt thẳng.
- Ví dụ đã thấy: "today is Wednesday, today is Wednesday", "Daily Meeting, Daily Meeting", "2, 2, 3 day" (lời chuẩn "2–3 day").
- Nếu Script không có `Audio/Dialogue:` thì bỏ qua bước này cho video đó và in cảnh báo.

## 3) Chuyển cảnh mờ giữa các video trong nhóm
- **0,30 s** khi video trước có khoảng lặng cuối đã cắt **và** video sau có khoảng lặng đầu đã cắt (mối nối nằm trong im lặng).
- **0,08 s** ở các mối còn lại (lời nói chạy sát mối nối, mờ dài sẽ làm mất chữ).
- `xfade` (hình) + `acrossfade` (tiếng), xuất H.264 `yuv420p`, 24 fps, CRF 17, AAC 160 kbps. **Luôn ép `yuv420p`**: nếu không, kết quả có thể ra `yuv444p` mà nhiều trình phát không mở được.

## 4) Kiểm tra sau khi ghép (mặc định bật)
- So độ dài thực tế với dự kiến; lệch >0,3 s là **mất đoạn**, phải báo.
- Nhận dạng lại video kết quả: `repeats_left` phải rỗng; so với lời thoại chuẩn (`diff_vs_script`).
- Kiểm tra này **đã phát hiện** một lần mất câu cuối (xem dưới), nên không bỏ qua.

## Lỗi đã gặp
- **Một chuỗi `filter_complex` rất dài** (nối nhiều mảnh, trong đó có mảnh tách từ cùng một clip) từng cho kết quả **ngắn hơn dự kiến 3 giây và mất câu cuối**, dù ffmpeg không báo lỗi. Cách chữa: dựng từng clip riêng ra file trung gian rồi mới nối chuỗi (cách script đang làm), và luôn so độ dài thực tế với dự kiến.
- `faster-whisper` có thể báo lỗi `open() got an unexpected keyword argument 'metadata_errors'` khi tự đọc file (lệch phiên bản `av`): script tránh bằng cách giải mã âm thanh bằng ffmpeg rồi đưa mảng số vào.
- `winget install Gyan.FFmpeg` có thể lỗi mạng (`0x80072eff`): dùng gói Python `imageio-ffmpeg` (kèm sẵn ffmpeg).

## Tham số chỉnh trong script
`HEAD_PAD`, `TAIL_PAD`, `XF`, `XF_SHORT`, `CUT_FADE`, `NOISE`, `MIN_SIL` ở đầu `scripts/merge_videos.py`. Tùy chọn dòng lệnh: `--only`, `--singles skip|copy`, `--no-cut-repeats`, `--no-verify`, `--dry-run`, `--lang`, `--model`.

## Chưa kiểm chứng
- Chưa chạy thử với nhóm có hơn 8 video hoặc video dài hơn 10 giây.
- Chưa nghe/xem kết quả; mốc cắt dựa trên mốc thời gian từng từ của Whisper (có thể lệch vài chục mili giây).
