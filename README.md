# 🎙️ English Coach

Trang web tĩnh để tự luyện nói tiếng Anh 1-1: **giáo án do AI soạn qua CLI**, người học nghe giọng đọc (text-to-speech), nói vào micro và được chấm độ khớp từng câu.

Không backend, không build step — chỉ HTML/CSS/JS thuần, deploy thẳng lên GitHub Pages.

---

## Chạy thử tại máy

Trang dùng `fetch()` để đọc `data/index.json`, nên **không mở bằng `file://`** được. Server tĩnh có sẵn trong repo, không cần cài gì:

```bash
node tools/serve.mjs
```

Rồi mở <http://localhost:4173>. Dùng **Chrome hoặc Edge** — Firefox/Safari chưa hỗ trợ đầy đủ Web Speech API cho phần micro.

## Bảng lệnh

| Lệnh | Việc |
| --- | --- |
| `node tools/serve.mjs` | Chạy web local (không cần npm install) |
| `node tools/doctor.mjs` | Kiểm tra toàn bộ: Codex, schema, lộ trình, 100 giáo án, index, file web |
| `node tools/stats.mjs` | Thống kê nội dung theo trình độ; `--words` xem từ vựng lặp nhiều nhất |
| `node tools/gen-series.mjs` | Soạn mọi bài còn thiếu trong lộ trình |
| `node tools/gen-lesson.mjs` | Soạn một bài lẻ |
| `node tools/rewrite.mjs` | Soạn lại **một phần** của một bài (rẻ hơn nhiều so với cả bài) |
| `node tools/build-index.mjs` | Build lại `data/index.json` |
| `node tools/validate.mjs` | Kiểm tra schema của mọi giáo án |

Mọi lệnh đều có `--help`. Cũng chạy được qua npm: `npm run doctor`, `npm run serve`, `npm run gen`, `npm run stats`.

Chạy `doctor` trước khi push — nó bắt được những thứ `validate` bỏ sót: id lệch tên file, chủ đề trùng, `index.json` lệch thư mục `lessons`, bài thiếu phần nghe hiểu.

---

## Soạn giáo án bằng Codex CLI

### Soạn cả lộ trình

Danh sách chủ đề nằm ở [`data/curriculum.json`](data/curriculum.json) — **100 bài** chia theo 5 trình độ: A1 (20), A2 (22), B1 (22), B2 (20), C1 (16). Soạn mọi bài còn thiếu:

```bash
node tools/gen-series.mjs --jobs 3
```

Mỗi bài mất khoảng 2 phút, nên soạn lại toàn bộ 100 bài với 4 luồng hết chừng 50 phút.

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

Script sẽ: dựng prompt → đưa cho Codex qua argv → đọc câu trả lời cuối từ file `-o` → kiểm tra schema → ghi `data/lessons/<id>.json` → build lại `data/index.json`.

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
codex exec --cd <thư mục dự án> --skip-git-repo-check -s read-only --color never \n     --output-schema tools/lesson.schema.json -o <file tạm> "<prompt>"
```

Đổi CLI khác qua biến môi trường `AI_CLI` (`codex`, `claude`, hoặc lệnh bất kỳ) và `AI_CLI_ARGS`:

```bash
AI_CLI=claude node tools/gen-lesson.mjs --topic "Ở sân bay" --level A2
```

Với lệnh tự đặt, dùng các placeholder trong `AI_CLI_ARGS`:

| Placeholder | Thay bằng |
| --- | --- |
| `{{PROMPT}}` | Nội dung prompt. **Không** có placeholder này thì prompt đi qua stdin |
| `{{OUT}}` | File chứa câu trả lời cuối — có thì stdout bị bỏ qua |
| `{{SCHEMA}}` | Đường dẫn `tools/lesson.schema.json` |
| `{{CWD}}` | Thư mục gốc dự án |

### Ba điều rút từ `AI-Unity-Game-Factory`

Cách gọi CLI ở [`tools/ai-cli.mjs`](tools/ai-cli.mjs) làm theo `factory/providers/base.py` của dự án đó, vì ba chỗ dưới đây đều đã có người trả giá rồi:

1. **Phải tự dò đường dẫn đầy đủ của lệnh, đừng nhờ shell.** Trên Windows, npm cài CLI dưới dạng `.cmd` shim nên `spawn('codex')` báo ENOENT dù `where codex` vẫn thấy.

   Mẹo `shutil.which` bên đó **không bê thẳng sang Node được**: từ Node 20, `spawn` một file `.cmd` mà không bật shell sẽ trả về `EINVAL` (chặn theo CVE-2024-27980) — Python không chặn, Node có. Nên `resolveCommand()` đi thêm một bước: đọc nội dung `codex.CMD`, moi ra đường dẫn `codex.js` thật rồi chạy bằng chính `node` đang chạy. Vẫn đạt mục đích ban đầu là spawn thẳng, không qua shell, nên prompt không bao giờ bị escape sai dấu nháy.
2. **Prompt đi bằng argv, để trống stdin.** Phiên headless mà stdin đã bị prompt chiếm thì mọi câu hỏi xin quyền của CLI không ai trả lời được — thao tác bị từ chối *im lặng*, CLI vẫn thoát 0, và ta tưởng là thành công.
3. **Hết token có hai kiểu.** Hết quota cả tài khoản thì phải dừng cả loạt chờ reset; tràn context chỉ hỏng đúng bài đó. `gen-series.mjs` phân biệt hai trường hợp và tự dừng khi gặp quota, thay vì đốt tiếp mấy chục lượt lỗi.

Toàn bộ transcript mỗi lần gọi được ghi ra `logs/gen-<id>.log` để xem trực tiếp trong lúc chạy:

```bash
Get-Content logs/gen-dat-phong-khach-san.log -Wait
```

Nếu AI trả về dữ liệu hỏng, nguyên văn output được lưu ở `data/.last-raw-<id>.txt` để xem lại.

### Sửa một phần thay vì soạn lại cả bài

Không hài lòng đúng một mục thì đừng đốt cả bài:

```bash
node tools/rewrite.mjs --id dat-phong-khach-san --part listening
node tools/rewrite.mjs --id phong-van-xin-viec --part drills --notes "khó hơn, thêm số liệu"
```

Lệnh này cắt `lesson.schema.json` xuống đúng phần được yêu cầu rồi đưa cho Codex làm `--output-schema`, nên model **không có cách nào** trả về thừa hay thiếu trường. Phần còn lại của giáo án giữ nguyên từng chữ. Chạy `--help` để xem danh sách phần sửa được.

**Không có CLI?** Nút **✨ Soạn giáo án** trên web sinh sẵn prompt — copy dán vào bất kỳ chatbot nào, rồi dán JSON trả về vào ô *Xem thử ngay* để học liền (lưu trong trình duyệt, gắn nhãn *Nháp*). Bấm *Tải bản nháp* để lấy file `.json` và bỏ vào `data/lessons/`.

Các lệnh khác:

```bash
node tools/build-index.mjs   # build lại data/index.json
node tools/validate.mjs      # kiểm tra toàn bộ giáo án
```

---

## Đẩy lên GitHub Pages

Repo đang chạy tại **<https://xoigame.github.io/EnglishCoach/>**. Mỗi lần push vào `main`, workflow `.github/workflows/deploy-pages.yml` build lại index → validate giáo án → chạy `doctor` → deploy. Giáo án hỏng schema thì CI đỏ và **chặn deploy**, site cũ vẫn nguyên.

Vòng lặp thêm bài:

```bash
node tools/gen-series.mjs --jobs 3
node tools/doctor.mjs
git add data && git commit -m "lesson: ..." && git push
```

Dựng lại từ đầu ở repo khác thì: tạo repo public, push nhánh `main`, rồi bật Pages ở chế độ workflow:

```bash
gh repo create <user>/<repo> --public --source=. --remote=origin --push
gh api -X POST repos/<user>/<repo>/pages -f build_type=workflow
```

---

## Năm bước trong mỗi bài học

| Bước | Nội dung |
| --- | --- |
| **1 · Chuẩn bị** | Mục tiêu, từ vựng kèm IPA, mẫu câu, **lỗi người Việt hay mắc**, **cùng một ý ở hai mức trang trọng**, **khác biệt văn hoá**, lưu ý phát âm — bấm 🔊 để nghe từng mục |
| **2 · Luyện từng câu** | Nghe mẫu (có nút 🐢 chậm) → nhắc lại vào micro → chấm %, tô đỏ từ chưa khớp |
| **3 · Nghe chép** | **Bài nghe hiểu** (độc thoại riêng, kèm 3 câu trắc nghiệm, chữ giấu tới khi trả lời xong) rồi tới **nghe chép chính tả** từng câu |
| **4 · Hội thoại 1-1** | Nói chuyện liên tục với AI, sai thì được sửa **bằng giọng nói** và cho nói lại |
| **5 · Bài tập** | Dịch Việt → Anh rồi nói ra, chấm với nhiều đáp án chấp nhận được; kèm bài về nhà |

### Sửa lỗi bằng giọng nói

Đây là điểm chính của phần hội thoại: nói sai không chỉ hiện chữ đỏ mà **AI nói ra chỗ sai cho bạn nghe**, rồi bạn nói lại.

- Nếu câu bạn nói khớp với một mục trong `commonMistakes` của giáo án, AI đọc đúng lỗi đó: *"Almost. Instead of 'I want book a room', say: I would like to book a room."*
- Nếu chỉ trượt vài từ, AI đọc tên những từ máy chưa nghe rõ rồi đọc lại câu mẫu chậm.
- Nếu lệch nhiều, AI đọc câu mẫu thật chậm và **tách đôi câu** cho dễ nhắc lại.
- Sau `maxTries` lần (mặc định 2) thì tự đi tiếp để không bị kẹt.

Bật **Rảnh tay** ở tab ⚙️ Cài đặt thì micro tự mở ngay khi AI nói xong — cả buổi hội thoại chạy liên tục không cần chạm chuột. Cũng ở đó bạn chỉnh ngưỡng đạt, số lần được nói lại và tắt phần đọc sửa lỗi nếu chỉ muốn xem chữ.

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
  lesson.js                 # render pane Chuẩn bị / Luyện câu / Nghe hiểu / Bài tập
  roleplay.js               # hội thoại 1-1 (kịch bản + AI trực tiếp)
  store.js                  # tải giáo án, bản nháp, tiến độ, schema
  prompt.js                 # prompt sinh giáo án (web và CLI dùng chung)
data/curriculum.json        # lộ trình 100 chủ đề A1 → C1
data/index.json             # danh mục, sinh tự động
data/lessons/*.json         # từng giáo án
tools/gen-series.mjs        # soạn cả lộ trình
tools/gen-lesson.mjs        # soạn một bài
tools/rewrite.mjs           # soạn lại một phần của một bài
tools/doctor.mjs            # kiểm tra sức khoẻ dự án
tools/stats.mjs             # thống kê nội dung
tools/serve.mjs             # web server tĩnh, không phụ thuộc
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
  "variations": [{ "situation": "Hỏi giá phòng", "formal": "Could you tell me the rate…?", "casual": "How much is…?", "vi": "…" }],
  "culture": ["Ghi chú khác biệt văn hoá bằng tiếng Việt"],
  "listening": {
    "title": "…", "passage": "Đoạn độc thoại 45-90 từ", "vi": "Bản dịch cả đoạn",
    "questions": [{ "q": "…", "choices": ["…", "…", "…"], "answer": 1, "vi": "Vì sao đáp án đó đúng" }]
  },
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

Bắt buộc: `id`, `title`, `level`, và `dialogue.turns` từ 4 lượt trở lên. Các phần khác thiếu thì mục tương ứng trên giao diện tự ẩn — nên giáo án soạn theo schema cũ vẫn mở được bình thường, chỉ là không có phần nghe hiểu.

`tools/lesson.schema.json` là bản JSON Schema đầy đủ của cấu trúc này, và cũng chính là file đưa cho Codex qua `--output-schema`. Sửa schema thì nhớ sửa cả phần ví dụ trong `assets/js/prompt.js`.

---

## Giới hạn đã biết

- Nhận diện giọng nói chỉ chạy trên Chrome/Edge, cần HTTPS (GitHub Pages có sẵn) và cần mạng.
- Giọng đọc phụ thuộc voice cài trên máy; chọn giọng ở tab ⚙️ Cài đặt.
- Tiến độ và bản nháp lưu trong `localStorage` của từng trình duyệt, không đồng bộ giữa các máy.
