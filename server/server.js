require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { OpenAI } = require('openai');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const port = process.env.PORT || 5000;

// Configure multer for video upload
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const retryWithExponentialBackoff = async (operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`Retry attempt ${i + 1} after ${delay}ms`);
    }
  }
};

// Update the multer configuration
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 25 * 1024 * 1024, // 25MB limit
    fieldSize: 25 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Not a video file'));
    }
  }
});

// Ensure uploads directory exists
(async () => {
  try {
    await fsPromises.mkdir('./uploads', { recursive: true });
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
})();

app.use(cors());
app.use('/downloads', express.static('downloads'));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to format time for SRT
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function cleanupTranscript(srtContent) {
  const lines = srtContent.split('\n');
  const cleanedContent = [];
  let counter = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue;

    if (line.includes('-->')) {
      // Extract timestamp and text from the same line
      const timestampMatch = line.match(/\[?(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})\]?\s*(.*)/);
      
      if (timestampMatch) {
        const startTime = timestampMatch[1].replace('.', ',');
        const endTime = timestampMatch[2].replace('.', ',');
        let text = timestampMatch[3].trim();

        // If text is empty, try to get it from the next line
        if (!text && lines[i + 1] && !lines[i + 1].includes('-->')) {
          text = lines[i + 1].trim();
          i++; // Skip the next line since we used it
        }

        if (text) {
          cleanedContent.push(String(counter));
          cleanedContent.push(`${startTime} --> ${endTime}`);
          cleanedContent.push(text.replace(/^\s*[^a-zA-Z0-9]*\s*/, '').trim());
          cleanedContent.push('');
          counter++;
        }
      }
    }
  }

  return cleanedContent.join('\n');
}

app.post('/api/generate-subtitles', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  try {
    // Extract audio from video using ffmpeg
    console.log('Extracting audio...');
    const audioPath = req.file.path + '.wav';
    await execPromise(`ffmpeg -i "${req.file.path}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`);

    // Run whisper.cpp
    console.log('Transcribing audio...');
    const whisperPath = path.resolve(__dirname, '..', 'whisper.cpp', 'build', 'bin', 'whisper-cli');
    const modelPath = path.resolve(__dirname, '..', 'whisper.cpp', 'models', 'ggml-base.en.bin');
    
    // Add path verification and logging
    try {
      console.log('Checking paths:');
      console.log('Whisper executable:', whisperPath);
      console.log('Model path:', modelPath);
      
      await fsPromises.access(whisperPath, fs.constants.X_OK);
      await fsPromises.access(modelPath, fs.constants.R_OK);
      console.log('Found both executable and model file');
    } catch (error) {
      console.error('Path check failed:', error);
      throw new Error(`Whisper.cpp not properly installed. Please check the paths:
        - Executable: ${whisperPath}
        - Model: ${modelPath}
        Error: ${error.message}`);
    }
    
    const { stdout } = await execPromise(
      `${whisperPath} -m ${modelPath} -f "${audioPath}" -of srt`
    );

    // Create downloads directory if it doesn't exist
    await fsPromises.mkdir('./downloads', { recursive: true });

    // Save the SRT file
    const srtPath = path.join('./downloads', `${Date.now()}-subtitles.srt`);
    const cleanedTranscript = cleanupTranscript(stdout);
    await fsPromises.writeFile(srtPath, cleanedTranscript);

    // Clean up temporary files
    await fsPromises.unlink(audioPath);
    await fsPromises.unlink(req.file.path);

    const srtUrl = `/downloads/${path.basename(srtPath)}`;
    res.json({ srtUrl });

    // Delete the SRT file after 5 minutes
    setTimeout(async () => {
      try {
        await fsPromises.unlink(srtPath);
      } catch (err) {
        console.error('Error deleting SRT file:', err);
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      type: error.type,
      cause: error.cause,
      stack: error.stack,
      stderr: error.stderr, // Added for command-line errors
      stdout: error.stdout  // Added for command-line output
    });

    // Clean up temporary files in case of error
    try {
      if (req.file) {
        await fsPromises.unlink(req.file.path);
        const audioPath = req.file.path + '.wav';
        await fsPromises.unlink(audioPath).catch(() => {}); // Ignore if doesn't exist
      }
    } catch (unlinkError) {
      console.error('Error cleaning up files:', unlinkError);
    }

    let errorMessage = 'Error generating subtitles';
    if (error.code === 'ENOENT') {
      errorMessage = 'Error: Required dependencies not found. Please check server configuration.';
    } else if (error.stderr) {
      errorMessage = `Processing error: ${error.stderr}`;
    }

    res.status(500).json({ 
      error: errorMessage,
      details: {
        code: error.code,
        type: error.type,
        message: error.message
      }
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 