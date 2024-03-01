
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bodyParser = require('body-parser');
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const speech = require("@google-cloud/speech");
const { Readable } = require("stream");
const fluentffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const cors = require("cors");
import OpenAI from "openai";
import { fileURLToPath } from 'url';
import path from 'path';
import { ChromaClient } from "chromadb";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAiEmbeddingFunction } from "chromadb";
const embedder = new GoogleGenerativeAiEmbeddingFunction({googleApiKey: "AIzaSyDwN8udOcqGBXZPTIvVQO8qjjbmE2OIBUw" });

const cclient = new ChromaClient({ path: "http://localhost:6969" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openai = new OpenAI();


const encoding = "LINEAR16";
const sampleRateHertz = 16000;
const languageCode = "en-US";
const projectId = 'voltaic-flag-413206';
const client = new speech.SpeechClient({ projectId }); 

import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } from "@google/generative-ai";
const MODEL_NAME = "gemini-1.0-pro";
const API_KEY = "AIzaSyDwN8udOcqGBXZPTIvVQO8qjjbmE2OIBUw";

async function run(kid) {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  
    const generationConfig = {
      temperature: 0.9,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };
  
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];
  

    const parts = [
        {text: `${kid}`},
    ];
  
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });
  
    const response = result.response;
    console.log(response.text());
    return response.text();
  }
  
  

const request = {
  config: {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
  },
  interimResults: true,
};

server.listen(6069, () => {
    console.log("server is working");
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());


app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});



io.on("connection", (socket) => {
    console.log("client connected");
    let recognizeStream = null;

    socket.on("audio_chunk", (audioChunk) => {
        if (!recognizeStream) {
            recognizeStream = client.streamingRecognize(request)
                .on('error', console.error)
                .on('data', data => { 
                    const results = data.results;
                    const isFinal = results[0].isFinal;
                    const transcript = data.results[0] && data.results[0].alternatives[0]
                                       ? data.results[0].alternatives[0].transcript
                                       : '(No transcript detected)'; 
                    if (isFinal) {
                        console.log(`F trn: ${transcript}`);
                        socket.emit("f-transcription", transcript);
                    } 
                    socket.emit("transcription", transcript);socket.emit("transcription", transcript);
                    
 
                });
        }

        const audioStream = new Readable();
        audioStream.push(audioChunk);
        audioStream.push(null); // Indicate end of stream

        fluentffmpeg(audioStream)
            .fromFormat('webm')
            .audioFrequency(sampleRateHertz)
            .audioCodec('pcm_s16le') // Encoding for LINEAR16
            .format('s16le') // This should match LINEAR16 audio format
            .on('error', (err, stdout, stderr) => {
                console.error('An error occurred: ' + err.message, stdout, stderr);
            })
            .pipe(recognizeStream, { end: false });
    });

    socket.on("disconnect", () => {
        if (recognizeStream) {
            recognizeStream.end();
        }
    });
});



app.post("/vectoring", async (req, res) => { // Notice async here
    try {
        const {userId, transcript } = req.body;
        console.log(transcript);

        const collection0 = await cclient.getOrCreateCollection({ name: userId, embeddingFunction: embedder, });
        let text = await run(transcript); 
 
        const uniqueId = uuidv4();
        await collection0.add({
            ids: [uniqueId], 
            documents: [text], 
        })

        res.status(200).json({ message: "successful vector" });

    } catch (error) {
        console.error("Error in /vectoring route:", error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});
