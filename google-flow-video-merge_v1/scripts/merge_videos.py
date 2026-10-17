#!/usr/bin/env python3
"""Ghép các video con thành video hoàn chỉnh theo luật trong group_logic.py:
   cắt khoảng lặng đầu/cuối, cắt từ lặp (đối chiếu lời thoại trong cột Script), chuyển cảnh mờ.
Ví dụ: python merge_videos.py --excel "X.xlsx" --sheet "American Cultural - Role Dev" --scenario "Scenario 3" --src "D:\\videos" --out "D:\\merged"
"""
import argparse, difflib, json, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from group_logic import group, read_sheet
from check_deps import find_ffmpeg

HEAD_PAD, TAIL_PAD = 0.30, 0.35         # chừa lại quanh lời nói khi bỏ khoảng lặng đầu/cuối (giây)
XF, XF_SHORT = 0.30, 0.08               # chuyển cảnh: dài khi cả hai mối đều lặng, ngắn khi lời nói sát mối nối
CUT_FADE = 0.03                         # hạ âm cực ngắn tại điểm cắt từ lặp
NOISE, MIN_SIL = '-35dB', 0.3
FF = find_ffmpeg()
ENC = ['-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '24',
       '-c:a', 'aac', '-b:a', '160k', '-ar', '48000']


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-800:])
    return r


def probe(f):
    e = subprocess.run([FF, '-hide_banner', '-i', f], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', e).groups()
    return {'dur': int(h) * 3600 + int(m) * 60 + float(s)}


def silences(f, dur):
    e = subprocess.run([FF, '-hide_banner', '-i', f, '-af', 'silencedetect=noise=%s:d=%s' % (NOISE, MIN_SIL),
                        '-vn', '-f', 'null', '-'], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', e)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', e)]
    return [(s, en[i] if i < len(en) else dur) for i, s in enumerate(st)]


def audio_f32(f):
    import numpy as np
    raw = subprocess.run([FF, '-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype='float32')


_model = None


def transcribe(f, lang, size):
    """Whisper nhận mảng âm thanh đã giải mã bằng ffmpeg (tránh lỗi lệch phiên bản của thư viện av)."""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(size, device='cpu', compute_type='int8')
    segs, _ = _model.transcribe(audio_f32(f), language=lang, word_timestamps=True,
                                condition_on_previous_text=False, beam_size=5)
    return [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]


def norm(t):
    return re.findall(r"[a-z0-9']+", t.lower())


def dialogue_of(script):
    parts = re.split(r'audio\s*/\s*dialogue\s*:', script, flags=re.I)
    return parts[-1].strip() if len(parts) > 1 else ''


def find_repeats(words, ref_text):
    """Từ/cụm lặp liền nhau trong bản nghe được mà lời thoại chuẩn KHÔNG lặp.
    Trả list (start, end, cụm): cắt từ đầu bản lặp thứ nhất tới đầu bản thứ hai (giữ bản đầy đủ phía sau)."""
    toks = [(t, s, e) for s, e, w in words for t in norm(w)]
    ref = ' '.join(norm(ref_text))
    cuts, i = [], 0
    while i < len(toks):
        hit = False
        for n in (4, 3, 2, 1):
            a = [t for t, _, _ in toks[i:i + n]]
            b = [t for t, _, _ in toks[i + n:i + 2 * n]]
            if len(a) == n and a == b and (' '.join(a + a) not in ref):
                cuts.append((toks[i][1], toks[i + n][1], ' '.join(a)))
                i += 2 * n
                hit = True
                break
        if not hit:
            i += 1
    return cuts


def make_segment(src, name, dialogue, out, args):
    f = os.path.join(src, name + '.mp4')
    d0 = probe(f)['dur']
    sl = silences(f, d0)
    a, b, head, tail = 0.0, d0, False, False
    if sl and sl[0][0] < 0.15 and sl[0][1] >= HEAD_PAD + 0.1:
        a, head = sl[0][1] - HEAD_PAD, True
    if sl and sl[-1][1] >= d0 - 0.05 and d0 - sl[-1][0] >= TAIL_PAD + 0.1:
        b, tail = sl[-1][0] + TAIL_PAD, True
    cuts = []
    if args.cut_repeats:
        if dialogue:
            cuts = [c for c in find_repeats(transcribe(f, args.lang, args.model), dialogue) if a < c[0] and c[1] < b]
        else:
            print('  ! %s: không có Audio/Dialogue trong Script, bỏ qua bước cắt lặp từ' % name)
    iv = [(a, b)]
    for cs, ce, _ in cuts:
        iv = [p for x, y in iv for p in (([(x, cs), (ce, y)]) if x < cs < ce < y else [(x, y)])]
    fc = []
    for k, (x, y) in enumerate(iv):
        af = 'atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS' % (x, y)
        if len(iv) > 1:
            if k > 0:
                af += ',afade=t=in:d=%s' % CUT_FADE
            if k < len(iv) - 1:
                af += ',afade=t=out:st=%.3f:d=%s' % (y - x - CUT_FADE, CUT_FADE)
        fc.append('[0:v]trim=start=%.3f:end=%.3f,setpts=PTS-STARTPTS[v%d];[0:a]%s[a%d]' % (x, y, k, af, k))
    fc.append(''.join('[v%d][a%d]' % (k, k) for k in range(len(iv))) + 'concat=n=%d:v=1:a=1[v][a]' % len(iv))
    run([FF, '-y', '-v', 'error', '-i', f, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', '[a]'] + ENC + [out])
    return {'name': name, 'file': out, 'len': probe(out)['dur'], 'head': head, 'tail': tail,
            'trim': [round(a, 2), round(b, 2)], 'cuts': [[round(s, 2), round(e, 2), p] for s, e, p in cuts]}


def chain(segs, out, tmp):
    parts, cum, vl, al = [], segs[0]['len'], '0:v', '0:a'
    for i in range(1, len(segs)):
        p, c = segs[i - 1], segs[i]
        d = XF if (p['tail'] and c['head']) else XF_SHORT
        parts.append('[%s][%d:v]xfade=transition=fade:duration=%s:offset=%.3f[vx%d]' % (vl, i, d, cum - d, i))
        vl = 'vx%d' % i
        parts.append('[%s][%d:a]acrossfade=d=%s[ax%d]' % (al, i, d, i))
        al = 'ax%d' % i
        cum += c['len'] - d
    fcf = os.path.join(tmp, 'fc.txt')
    open(fcf, 'w').write(';'.join(parts))
    cmd = [FF, '-y', '-v', 'error']
    for s in segs:
        cmd += ['-i', s['file']]
    run(cmd + ['-/filter_complex', fcf, '-map', '[%s]' % vl, '-map', '[%s]' % al] + ENC + ['-movflags', '+faststart', out])
    return cum


def verify(out, dialogue_all, args):
    words = transcribe(out, args.lang, args.model)
    toks = [t for _, _, w in words for t in norm(w)]
    rep = find_repeats(words, dialogue_all)
    ref = norm(dialogue_all)
    sm = difflib.SequenceMatcher(None, ref, toks)
    diff = [(ref[i1:i2], toks[j1:j2]) for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal']
    return {'repeats_left': [[round(s, 2), p] for s, _, p in rep], 'diff_vs_script': diff[:20], 'ratio': round(sm.ratio(), 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--excel', required=True)
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--scenario', required=True)
    ap.add_argument('--src', required=True, help='thư mục chứa <tên>.mp4')
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', help='chỉ làm nhóm có tên này, vd "13.1+13.2"')
    ap.add_argument('--singles', choices=['skip', 'copy'], default='skip')
    ap.add_argument('--no-cut-repeats', dest='cut_repeats', action='store_false')
    ap.add_argument('--no-verify', dest='verify', action='store_false')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--lang', default='en')
    ap.add_argument('--model', default='small')
    args = ap.parse_args()
    if not FF:
        sys.exit('Không tìm thấy ffmpeg (chạy check_deps.py)')
    items = read_sheet(args.excel, args.sheet).get(args.scenario)
    if not items:
        sys.exit('Không có scenario %r trong sheet' % args.scenario)
    scripts = dict(items)
    groups, warns = group([n for n, _ in items])
    for w in warns:
        print('! ' + w)
    plan = [g for g in groups if not args.only or '+'.join(g['names']) == args.only]
    for g in plan:
        print('Nhóm:', ' + '.join(g['names']))
    missing = [n for g in plan for n in g['names'] if not os.path.exists(os.path.join(args.src, n + '.mp4'))]
    if missing:
        sys.exit('THIẾU file trong %s: %s' % (args.src, missing))
    if args.dry_run:
        return
    os.makedirs(args.out, exist_ok=True)
    report = []
    for g in plan:
        gname = '+'.join(g['names'])
        out = os.path.join(args.out, re.sub(r'[\\/:*?"<>|]', '-', gname) + '.mp4')
        if len(g['names']) == 1:
            if args.singles == 'copy':
                shutil.copy2(os.path.join(args.src, g['names'][0] + '.mp4'), out)
                print('Sao chép:', out)
            else:
                print('Bỏ qua (một mình):', gname)
            continue
        tmp = tempfile.mkdtemp()
        segs = []
        try:
            for n in g['names']:
                segs.append(make_segment(args.src, n, dialogue_of(scripts[n]), os.path.join(tmp, 'seg_%s.mp4' % n), args))
                print('  %-8s còn %.2fs, cắt lặp: %s' % (n, segs[-1]['len'], segs[-1]['cuts'] or 'không'))
            exp = chain(segs, out, tmp)
            act = probe(out)['dur']
            rec = {'group': gname, 'file': out, 'expected_s': round(exp, 2), 'actual_s': round(act, 2),
                   'clips': [{k: v for k, v in s.items() if k != 'file'} for s in segs]}
            if abs(act - exp) > 0.3:
                rec['WARNING'] = 'độ dài thực tế lệch dự kiến > 0.3s, kiểm tra có mất đoạn không'
                print('  !!', rec['WARNING'])
            if args.verify:
                rec['verify'] = verify(out, ' '.join(dialogue_of(scripts[n]) for n in g['names']), args)
            report.append(rec)
            left = rec.get('verify', {}).get('repeats_left')
            print('=> %s (%.1fs)%s' % (out, act, (' | còn lặp: %s' % left) if left else ''))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    json.dump(report, open(os.path.join(args.out, 'merge_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
