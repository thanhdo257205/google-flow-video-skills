#!/usr/bin/env python3
"""Kiểm tra thư viện cần để ghép video. Chỉ cài khi có --install (hỏi user trước khi chạy lệnh này)."""
import importlib, os, shutil, subprocess, sys

def find_ffmpeg():
    if os.environ.get('FFMPEG') and os.path.exists(os.environ['FFMPEG']): return os.environ['FFMPEG']
    p = shutil.which('ffmpeg')
    if p: return p
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception: return None

def model_cached(name='small'):
    root = os.path.join(os.path.expanduser('~'), '.cache', 'huggingface', 'hub')
    return os.path.isdir(os.path.join(root, 'models--Systran--faster-whisper-' + name))

def main():
    install = '--install' in sys.argv
    missing = []
    print('Python', sys.version.split()[0], 'OK' if sys.version_info >= (3, 9) else '=> CẦN Python >= 3.9')
    for mod, pkg in [('openpyxl', 'openpyxl'), ('numpy', 'numpy'), ('faster_whisper', 'faster-whisper'), ('imageio_ffmpeg', 'imageio-ffmpeg')]:
        try: importlib.import_module(mod); print('%-16s OK' % pkg)
        except Exception: print('%-16s THIẾU' % pkg); missing.append(pkg)
    ff = find_ffmpeg(); print('ffmpeg           %s' % (ff or 'THIẾU (hoặc cài gói imageio-ffmpeg)'))
    if ff is None and 'imageio-ffmpeg' not in missing: missing.append('imageio-ffmpeg')
    print('Mô hình Whisper small: %s' % ('đã có trong cache' if model_cached() else 'CHƯA có, sẽ tải ~500 MB ở lần chạy đầu (cần mạng, có thể mất nhiều phút)'))
    if missing:
        cmd = [sys.executable, '-m', 'pip', 'install'] + sorted(set(missing))
        print('Lệnh cài:', ' '.join(cmd))
        if install: sys.exit(subprocess.call(cmd))
        sys.exit(1)
    print('Đủ thư viện.')

if __name__ == '__main__': main()
