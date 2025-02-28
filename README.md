A full-stack web-application MVP that receives a video file (all media formats are supported) and spits back the subtitles for its audio in an `.srt` file.
It uses Whisper.cpp for the AI processing that happens in order to turn the speech from audio into text.

**Quick Start:**

 **Step 1:** Clone the repository

 **Step 1.5:** Install the package-lock.json dependencies ( `npm install` )

 **Step 2:** `cd wishper.cpp` and `make` in Terminal

 **Step 3:** `bash ./models/download-ggml-model.sh base.en` to download the english STT model

 **Step 4:** `npm run dev` to run the entire application
