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

## Soạn giáo án mới bằng AI CLI

```bash
node tools/gen-lesson.mjs --topic "Đặt phòng khách sạn" --level A2 --partner "Lễ tân" --turns 12
```

Script sẽ: dựng prompt → đẩy vào CLI qua stdin → lấy JSON trong output → kiểm tra schema → ghi `data/lessons/<id>.json` → build lại `data/index.json`.

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

Mặc định gọi `claude -p`. Đổi CLI khác qua biến môi trường:

```bash
AI_CLI=codex AI_CLI_ARGS="exec" node tools/gen-lesson.mjs --topic "Ở sân bay" --level A2
```

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

## Bốn bước trong mỗi bài học

| Bước | Nội dung |
| --- | --- |
| **1 · Chuẩn bị** | Mục tiêu, từ vựng kèm IPA, mẫu câu, lưu ý phát âm — bấm 🔊 để nghe từng mục |
| **2 · Luyện từng câu** | Nghe mẫu (có nút 🐢 chậm) → nhắc lại vào micro → chấm %, tô đỏ từ chưa khớp |
| **3 · Hội thoại 1-1** | Nói chuyện liên tục với AI, có gợi ý câu, nghe lại, bỏ qua |
| **4 · Bài tập** | Dịch Việt → Anh rồi nói ra, chấm với nhiều đáp án chấp nhận được; kèm bài về nhà |

### Hai chế độ hội thoại

- **Kịch bản** (mặc định) — bám đúng giáo án, chấm điểm từng lượt. Chạy hoàn toàn offline, không cần API key.
- **Tự do (AI trực tiếp)** — AI đóng vai và trả lời theo ý bạn nói, kèm một dòng sửa lỗi tiếng Việt sau mỗi câu. Cần dán API key Anthropic ở tab ⚙️ Cài đặt.

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
  speech.js                 # TTS, nhận diện giọng nói, chấm điểm
  mic.js                    # một recognizer dùng chung
  lesson.js                 # render các pane Chuẩn bị / Luyện câu / Bài tập
  roleplay.js               # hội thoại 1-1 (kịch bản + AI trực tiếp)
  store.js                  # tải giáo án, bản nháp, tiến độ, schema
  prompt.js                 # prompt sinh giáo án (web và CLI dùng chung)
data/index.json             # danh mục, sinh tự động
data/lessons/*.json         # từng giáo án
tools/gen-lesson.mjs        # soạn giáo án qua AI CLI
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
