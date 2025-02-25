const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkDependencies() {
  // Check ffmpeg
  exec('ffmpeg -version', (error) => {
    if (error) {
      console.error('❌ ffmpeg is not installed. Please install it using:');
      console.error('   sudo apt-get update && sudo apt-get install ffmpeg');
    } else {
      console.log('✅ ffmpeg is installed');
    }
  });

  // Check whisper.cpp
  const whisperPath = path.join(__dirname, '../whisper.cpp/main');
  const modelPath = path.join(__dirname, '../whisper.cpp/models/ggml-base.en.bin');

  fs.access(whisperPath, fs.constants.X_OK, (error) => {
    if (error) {
      console.error('❌ whisper.cpp is not built. Please build it using:');
      console.error('   git clone https://github.com/ggerganov/whisper.cpp.git');
      console.error('   cd whisper.cpp && make');
    } else {
      console.log('✅ whisper.cpp is built');
    }
  });

  fs.access(modelPath, fs.constants.R_OK, (error) => {
    if (error) {
      console.error('❌ whisper model is not downloaded. Please download it using:');
      console.error('   cd whisper.cpp && bash ./models/download-ggml-model.sh base.en');
    } else {
      console.log('✅ whisper model is downloaded');
    }
  });
}

checkDependencies(); 