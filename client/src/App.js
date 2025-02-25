import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [srtUrl, setSrtUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && (selectedFile.type.includes('video/mp4') || selectedFile.type.includes('video/quicktime'))) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid video file (MP4 or MOV)');
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);

    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.post('/api/generate-subtitles', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      setSrtUrl(response.data.srtUrl);
    } catch (err) {
      const errorDetails = err.response?.data?.details || {};
      const errorMessage = err.response?.data?.error || 'Error generating subtitles. Please try again.';
      setError(errorMessage);
      console.error('Error details:', errorDetails);
      console.error('Full error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Video Subtitle Generator</h1>
      
      <div className="upload-container">
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          onChange={handleFileChange}
          className="file-input"
        />
        
        {file && (
          <div className="file-info">
            <p>Selected file: {file.name}</p>
            <button 
              onClick={handleUpload} 
              disabled={loading}
              className="generate-button"
            >
              {loading ? 'Generating Subtitles...' : 'Generate Subtitles'}
            </button>
          </div>
        )}

        {loading && (
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            ></div>
            <span>{uploadProgress}%</span>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {srtUrl && (
          <div className="download-section">
            <p>Subtitles generated successfully!</p>
            <a 
              href={srtUrl}
              download="subtitles.srt"
              className="download-button"
            >
              Download .srt file
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 