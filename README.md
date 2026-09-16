# 🎙️ English Coach

Trang web tĩnh để tự luyện nói tiếng Anh 1-1: **giáo án do AI soạn qua CLI**, người học nghe giọng đọc (text-to-speech), nói vào micro và được chấm độ khớp từng câu.

Không backend, không build step — chỉ HTML/CSS/JS thuần, deploy thẳng lên GitHub Pages.

---

## Chạy thử tại máy

Trang dùng `fetch()` để đọc `data/index.json`, nên **không mở bằng `file://`** được. Chạy một web server tĩnh:

```bash
npx serve .
```

Rồi mở <http://localhost:3000>. Dùng **Chrome hoặc Edge** — Firefox/Safari chưa hỗ trợ đầy đủ Web Speech API cho phần micro.

---

## Soạn giáo án bằng Codex CLI

### Soạn cả lộ trình

Danh sách chủ đề A1 → C1 nằm ở [`data/curriculum.json`](data/curriculum.json) — 40 bài chia theo 5 trình độ. Soạn mọi bài còn thiếu:

```bash
node tools/gen-series.mjs --jobs 3
```

| Tham số | Ý nghĩa |
| --- | --- |
| `--level A2` | Chỉ soạn một trình độ |
| `--only id1,id2` | Chỉ soạn vài bài |
| `--limit 5` | Dừng sau 5 bài |
| `--jobs 3` | Số bài chạy song song (tối đa 4) |
| `--force` | Soạn lại cả bài đã có |
| `--list` | Chỉ liệt kê bài nào đã có, bài nào chưa |

Thêm chủ đề mới = thêm một mục vào `curriculum.json` rồi chạy lại — bài đã có tự động được bỏ qua.

### Soạn một bài lẻ

```bash
node tools/gen-lesson.mjs --topic "Đặt phòng khách sạn" --level A2 --partner "Lễ tân" --turns 12
```

Script sẽ: dựng prompt → đẩy vào Codex qua stdin → lấy JSON trong output → kiểm tra schema → ghi `data/lessons/<id>.json` → build lại `data/index.json`.

Codex được gọi với `--output-schema tools/lesson.schema.json`, nên model bị ép trả đúng cấu trúc giáo án thay vì văn xuôi lẫn JSON.

| Tham số | Ý nghĩa |
| --- | --- |
| `--topic` | Chủ đề (bắt buộc) |
| `--level` | `A1` `A2` `B1` `B2` `C1`, mặc định `A2` |
| `--partner` | Vai AI đóng trong hội thoại |
| `--turns` | Số lượt hội thoại, 6–30 |
| `--notes` | Yêu cầu thêm |
| `--id` | Ghi đè slug (mặc định sinh từ chủ đề) |
| `--dry-run` | Chỉ in prompt, không gọi CLI |
| `--from-file` | Đọc JSON có sẵn thay vì gọi CLI |
| `--force` | Ghi đè bài đã tồn tại |

Mặc định gọi:

```
codex exec --skip-git-repo-check -s read-only --color never --output-schema tools/lesson.schema.json -o <tmp> -
```

Đổi CLI khác qua biến môi trường `AI_CLI` (`codex`, `claude`, hoặc lệnh bất kỳ) và `AI_CLI_ARGS`:

```bash
AI_CLI=claude node tools/gen-lesson.mjs --topic "Ở sân bay" --level A2
```

Với lệnh tự đặt, dùng hai placeholder trong `AI_CLI_ARGS`: `{{OUT}}` là file chứa câu trả lời cuối (có thì stdout bị bỏ qua), `{{SCHEMA}}` là đường dẫn tới `tools/lesson.schema.json`.

Nếu AI trả về dữ liệu hỏng, nguyên văn output được lưu ở `data/.last-raw-<id>.txt` để xem lại.

**Không có CLI?** Nút **✨ Soạn giáo án** trên web sinh sẵn prompt — copy dán vào bất kỳ chatbot nào, rồi dán JSON trả về vào ô *Xem thử ngay* để học liền (lưu trong trình duyệt, gắn nhãn *Nháp*). Bấm *Tải bản nháp* để lấy file `.json` và bỏ vào `data/lessons/`.

Các lệnh khác:

```bash
node tools/build-index.mjs   # build lại data/index.json
node tools/validate.mjs      # kiểm tra toàn bộ giáo án
```

---

## Đẩy lên GitHub Pages

```bash
git init && git add . && git commit -m "English Coach"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Vào **Settings → Pages → Source: GitHub Actions**. Workflow `.github/workflows/deploy-pages.yml` sẽ build lại index, validate giáo án rồi deploy mỗi lần push vào `main`.

Sau này thêm bài chỉ cần:

```bash
node tools/gen-lesson.mjs --topic "..." --level B1
git add data && git commit -m "lesson: ..." && git push
```

---

## Năm bước trong mỗi bài học

| Bước | Nội dung |
| --- | --- |
| **1 · Chuẩn bị** | Mục tiêu, từ vựng kèm IPA, mẫu câu, **lỗi người Việt hay mắc**, lưu ý phát âm — bấm 🔊 để nghe từng mục |
| **2 · Luyện từng câu** | Nghe mẫu (có nút 🐢 chậm) → nhắc lại vào micro → chấm %, tô đỏ từ chưa khớp |
| **3 · Nghe chép** | Chữ bị che, chỉ nghe rồi gõ hoặc nói lại — phần rèn tai nghe thuần tuý |
| **4 · Hội thoại 1-1** | Nói chuyện liên tục với AI, sai thì được sửa **bằng giọng nói** và cho nói lại |
| **5 · Bài tập** | Dịch Việt → Anh rồi nói ra, chấm với nhiều đáp án chấp nhận được; kèm bài về nhà |

### Sửa lỗi bằng giọng nói

Đây là điểm chính của phần hội thoại: nói sai không chỉ hiện chữ đỏ mà **AI nói ra chỗ sai cho bạn nghe**, rồi bạn nói lại.

- Nếu câu bạn nói khớp với một mục trong `commonMistakes` của giáo án, AI đọc đúng lỗi đó: *"Almost. Instead of 'I want book a room', say: I would like to book a room."*
- Nếu chỉ trượt vài từ, AI đọc tên những từ máy chưa nghe rõ rồi đọc lại câu mẫu chậm.
- Nếu lệch nhiều, AI đọc câu mẫu thật chậm và **tách đôi câu** cho dễ nhắc lại.
- Sau `maxTries` lần (mặc định 2) thì tự đi tiếp để không bị kẹt.

Chỉnh ngưỡng đạt, số lần nói lại và bật/tắt đọc phần sửa lỗi ở tab ⚙️ Cài đặt.

### Hai chế độ hội thoại

- **Kịch bản** (mặc định) — bám đúng giáo án, chấm điểm và sửa lỗi từng lượt bằng giọng nói. Chạy hoàn toàn offline, không cần API key. Cuối buổi liệt kê những từ bạn hay sai nhất.
- **Tự do (AI trực tiếp)** — AI đóng vai và trả lời theo ý bạn nói. Mỗi lượt trả về ba phần: câu thoại (đọc lên), một câu sửa lỗi tiếng Anh ngắn (cũng đọc lên), và ghi chú tiếng Việt (hiện chữ). Cần dán API key Anthropic ở tab ⚙️ Cài đặt.

> ⚠️ **Về API key ở chế độ tự do:** key lưu trong `localStorage` và gọi thẳng `api.anthropic.com` từ trình duyệt (`dangerouslyAllowBrowser`). Trang tĩnh không giấu được key — **chỉ dùng key cá nhân có giới hạn chi tiêu**, đừng dùng key công ty hay key production, và đừng dán key trên máy công cộng. Nếu cần chia sẻ cho nhiều người học, hãy đặt một proxy nhỏ giữ key phía server thay vì phát key ra trình duyệt.

Chế độ tự do dùng model `claude-opus-5` với `effort: low` cho độ trễ thấp, và bật sẵn server-side fallback để cuộc trò chuyện không đứt khi một lượt bị từ chối.

---

## Cách chấm điểm phát âm

Trình duyệt chuyển giọng nói thành chữ (Web Speech API), sau đó so khớp **từng từ** với câu mẫu bằng thuật toán Levenshtein ở mức từ (`assets/js/speech.js`). Điểm = tỉ lệ từ khớp, có phạt khi nói thừa quá nhiều.

Nghĩa là điểm phản ánh **độ rõ ràng và đúng từ**, không phải chất lượng ngữ âm thật sự — máy nghe nhầm thì điểm thấp dù bạn nói không sai. Hãy dùng nó như một tín hiệu luyện tập, không phải thước đo chính xác. Các dạng viết tắt phổ biến (`I'm` ↔ `I am`, `don't` ↔ `do not`…) đã được quy đổi nên không bị trừ oan.

---

## Cấu trúc thư mục

```
index.html                  # toàn bộ khung giao diện
assets/css/style.css
assets/js/
  app.js                    # router + wiring
  speech.js                 # TTS, nhận diện giọng nói, chấm điểm, settings
  mic.js                    # một recognizer dùng chung
  coach.js                  # biến câu sai thành lời sửa để đọc lên
  lesson.js                 # render pane Chuẩn bị / Luyện câu / Nghe chép / Bài tập
  roleplay.js               # hội thoại 1-1 (kịch bản + AI trực tiếp)
  store.js                  # tải giáo án, bản nháp, tiến độ, schema
  prompt.js                 # prompt sinh giáo án (web và CLI dùng chung)
data/curriculum.json        # lộ trình 40 chủ đề A1 → C1
data/index.json             # danh mục, sinh tự động
data/lessons/*.json         # từng giáo án
tools/gen-series.mjs        # soạn cả lộ trình
tools/gen-lesson.mjs        # soạn một bài
tools/generate.mjs          # prompt → CLI → JSON → file
tools/ai-cli.mjs            # gọi CLI (codex | claude | tuỳ chỉnh)
tools/lesson.schema.json    # JSON Schema ép model trả đúng cấu trúc
tools/build-index.mjs
tools/validate.mjs
```

`assets/js/prompt.js` và `assets/js/store.js` được cả trình duyệt lẫn Node import, nên prompt và schema chỉ tồn tại ở một nơi duy nhất.

---

## Schema một giáo án

```jsonc
{
  "id": "kebab-case",            // trùng tên file
  "title": "…", "topic": "…",
  "level": "A1|A2|B1|B2|C1",
  "summary": "…",
  "goals": ["…"],
  "vocab":   [{ "en": "…", "ipa": "/…/", "vi": "…", "example": "…" }],
  "patterns":[{ "en": "…", "vi": "…", "note": "…" }],
  "pronunciation": [{ "focus": "…", "tip": "…", "words": ["…"] }],
  "commonMistakes": [{ "wrong": "I want book a room.", "right": "I'd like to book a room.", "vi": "…" }],
  "dialogue": {
    "roles": { "a": "Vai AI", "b": "Vai người học" },
    "userRole": "b",
    "turns": [{ "speaker": "a", "en": "…", "vi": "…", "hint": "…" }]
  },
  "roleplay": { "persona": "…", "opener": "…", "goal": "…" },
  "drills":  [{ "vi": "…", "en": "…", "alts": ["…"] }],
  "homework": ["…"]
}
```

Bắt buộc: `id`, `title`, `level`, và `dialogue.turns` từ 4 lượt trở lên. Các phần khác thiếu thì pane tương ứng tự ẩn.

---

## Giới hạn đã biết

- Nhận diện giọng nói chỉ chạy trên Chrome/Edge, cần HTTPS (GitHub Pages có sẵn) và cần mạng.
- Giọng đọc phụ thuộc voice cài trên máy; chọn giọng ở tab ⚙️ Cài đặt.
- Tiến độ và bản nháp lưu trong `localStorage` của từng trình duyệt, không đồng bộ giữa các máy.
