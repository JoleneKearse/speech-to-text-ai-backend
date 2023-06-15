const express = require("express");
const cors = require("cors");
const app = express();
const multer = require("multer");
const FormData = require("form-data");
const { Readable } = require("stream");
const axios = require("axios");
const upload = multer();
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffmetadata = require("ffmetadata");
const fs = require("fs");

// explicitly set the path to FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath);

app.use(
  cors({
    origin: [
      "https://speech-to-text-ai-nu.vercel.app/",
      "https://speech-to-text-ai-jolenekearse.vercel.app/",
      "https://speech-to-text-ai-git-main-jolenekearse.vercel.app/",
    ],
  })
);
app.use(express.json());

// UTILITY FUNCTIONS
// convert file buffer into readable stream for Whisper
const bufferToStream = (buffer) => {
  return Readable.from(buffer);
};

// convert time into seconds
const parseTimeStringToSeconds = (timeString) => {
  const [minutes, seconds] = timeString
    .split(":")
    .map((time) => parseInt(time));
  return minutes * 60 + seconds;
};

// ROUTES
app.get("/", (req, res) => {
  res.send("Welcome to the Speech-to-Text API!");
});

// for axios to make requests to OpenAI
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: "No audio file provided " });
    }
    const audioStream = bufferToStream(audioFile.buffer);

    // trim audio function with temporary filename to process audio
    const trimAudio = async (audioStream, endTime) => {
      const tempFileName = `temp-${Date.now()}.mp3`;
      const outputFileName = `output-${Date.now()}.mp3`;
      // write stream to temp file
      return new Promise((resolve, reject) => {
        audioStream
          .pipe(fs.createWriteStream(tempFileName))
          // read metadata to set endTime
          .on("finish", () => {
            ffmetadata.read(tempFileName, (err, metadata) => {
              if (err) reject(err);
              const duration = parseFloat(metadata.duration);
              if (endTime > duration) endTime = duration;
              // trim audio with FFmpeg
              ffmpeg(tempFileName)
                .setStartTime(startSeconds)
                .setDuration(timeDuration)
                .output(outputFileName)
                // delete temp files & resolve promise
                .on("end", () => {
                  fs.unlink(tempFileName, (err) => {
                    if (err) console.error("Error deleting temp file:", err);
                  });
                  const trimmedAudioBuffer = fs.readFileSync(outputFileName);
                  fs.unlink(outputFileName, (err) => {
                    if (err) console.error("Error deleting output file:", err);
                  });
                  resolve(trimmedAudioBuffer);
                })
                .on("error", reject)
                .run();
            });
          });
      });
    };
    const formData = new FormData();
    formData.append("file", audioStream, {
      filename: "audio.mp3",
      contentType: audioFile.mimetype,
    });
    formData.append("model", "whisper-1");
    formData.append("response_format", "json");

    const config = {
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    };
    // Call OpenAI Whisper API to transcribe audio
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      config
    );
    const transcription = response.data.text;
    res.json({ transcription });
  } catch (error) {
    res.status(500).json({ error: "Error transcribing audio" });
  }
});

// port
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
