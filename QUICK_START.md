# AI Dubbing Studio — Quick Start Guide / មគ្គុទ្ទេសក៍ចាប់ផ្តើមរហ័ស

---

## 🇰🇭 ភាសាខ្មែរ (Khmer Quick Start)

### ជំហានទី ១៖ ដំឡើង និងបើកកម្មវិធីដំបូង
1. បើកកម្មវិធី **AI Dubbing Studio PRO**។
2. នៅលើផ្ទាំងស្វាគមន៍ (Welcome Guide)៖
   - ជ្រើសរើស **ម៉ូដែល Whisper** (ណែនាំយក `base` ដើម្បីទទួលបានល្បឿន និងភាពត្រឹមត្រូវល្អ)។
   - បញ្ចូល **Gemini API Key** (ចុចតំណភ្ជាប់ដើម្បីបង្កើត Key ឥតគិតថ្លៃលើ Google AI Studio) រួចចុច **"សាកល្បង"** ដើម្បីផ្ទៀងផ្ទាត់។
   - ចុច **"ចាប់ផ្តើមប្រើប្រាស់"**។

### ជំហានទី ២៖ ដំណើរការបញ្ចូលសម្លេង (Dubbing Workflow)
1. **នាំចូលវីដេអូ (Load Video):** ចុចប៊ូតុង **"បើកវីដេអូ"** ឬទាញទម្លាក់ឯកសារវីដេអូ (MP4/MKV/MOV) ចូលទៅក្នុងផ្ទាំងកម្មវិធី។
2. **សម្គាល់សំឡេង (Transcribe):** ចុចប៊ូតុង **"Transcribe"** ពណ៌ខៀវ ដើម្បីទាញយកអត្ថបទរងដោយស្វ័យប្រវត្តិតាមរយៈ Faster-Whisper។
3. **បកប្រែជាភាសាខ្មែរ (Translate):** ចុចប៊ូតុង **"Translate"** ដើម្បីបកប្រែទៅជាភាសាខ្មែរតាមរយៈ Gemini AI។
4. **កែសម្រួល & កំណត់តួអង្គ (Edit & Assign Voices):**
   - កែសម្រួលអត្ថបទខ្មែរផ្ទាល់នៅលើតារាងអត្ថបទរង។
   - ជ្រើសរើសសំឡេងតួអង្គ (A1-A5) តាមតួប្រុស ឬតួស្រី។
5. **បង្កើតសំឡេង (Generate Audio):** ចុច **"Generate Audio"** ដើម្បីបង្កើតសំឡេងបញ្ចូលតាមរយៈបច្ចេកវិទ្យា Edge-TTS។
6. **នាំចេញវីដេអូ (Export Video):** ចុចប៊ូតុង **"នាំចេញវីដេអូ"** (Export) នៅផ្នែកខាងលើស្តាំ។ កម្មវិធីនឹងធ្វើការច្របាច់សំឡេង (BGM Ducking) និងបញ្ចូលអត្ថបទរងចូលក្នុងវីដេអូពេញលេញ។

---

## 🇬🇧 English Quick Start

### Step 1: Initial Setup
1. Launch **AI Dubbing Studio PRO**.
2. On the **Welcome Guide** dialog:
   - Select your **Whisper Model** (`base` is recommended for optimal balance between speed and accuracy).
   - Enter your **Gemini API Key** (click the link to get a free key from Google AI Studio) and click **"Test"** to confirm.
   - Click **"Get Started"**.
   - *Tip:* You can also click **"Sample Project (10s)"** to immediately preview a completed dubbing project without importing media.

### Step 2: The 6-Step Dubbing Workflow
1. **Load Video:** Click **"Load Video"** or drag and drop your video file (MP4, MKV, MOV).
2. **Transcribe:** Click **"Transcribe"** to automatically extract time-coded speech segments using local Faster-Whisper.
3. **Translate:** Click **"Translate"** to translate source text into natural Khmer using Gemini AI.
4. **Edit & Assign Voices:**
   - Review and fine-tune translated text in the subtitle editor table.
   - Assign voice presets (A1–A5: Male/Female) to individual speakers.
5. **Generate Audio:** Click **"Generate Audio"** to synthesize studio-grade neural voice clips.
6. **Export Video:** Click **"Export Video"** in the top-right header to render the final video with automatic background music ducking and synchronized speech.
