import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";
let intervalId;
let recognition;
let downloadURL = '';
let isRecording = false;

const firebaseConfig = {
        
      };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Function to start recording
function startRecording() {
    fetch('/start_recording', {
        method: 'GET'
    })
    .then(response => {
        if (response.ok) {
            // If recording started successfully, update UI
        } else {
            // Handle error if recording failed to start
            console.error('Failed to start recording:', response.statusText);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });

    // Start updating the prediction every 1 second
    intervalId = setInterval(updatePrediction, 300);

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    let transcribedText = '';
    const transcribedTextElement = document.getElementById('transcribedText');

    recognition.onresult = function(event) {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const finalTranscript = event.results[i][0].transcript;
                transcribedText += finalTranscript + ' ';
                console.log('Final result:', finalTranscript);
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        console.log('Interim result:', interimTranscript);
        transcribedTextElement.innerText = transcribedText + interimTranscript;
        if (transcribedTextElement.style.display === 'none') {
            transcribedTextElement.style.display = 'block';
        }
    };

    recognition.start();
}

// Function to stop recording
function stopRecording() {
    // Stop speech recognition
    recognition.stop();

    fetch('/stop_recording', {
        method: 'GET'
    })
    .then(response => {
        if (response.ok) {
            // If recording stopped successfully, update UI
        } else {
            // Handle error if recording failed to stop
            console.error('Failed to stop recording:', response.statusText);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
    clearInterval(intervalId);
}

// Event listener for starting recording
document.getElementById('recordButton').addEventListener('click', function() {
    if (!isRecording) {
        document.getElementById('recordButton').textContent = 'Stop Recording';
        document.getElementById('emoji').style.display = 'none';
        var audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.style.display = "none";
        const transcribedTextElement = document.getElementById('transcribedText');
        transcribedTextElement.style.display = "none";
        startRecording();
    } else {
        document.getElementById('recordButton').textContent = 'Start Recording';
        document.getElementById('prediction').innerText = 'Please Wait';
        stopRecording();
        // Wait for 3 seconds (3000 milliseconds) before calling fetchPrediction
        setTimeout(fetchPrediction, 1000);
    }
    isRecording = !isRecording;
});

// Function to fetch predicted emotion from Flask server
function fetchPrediction() {
    fetch('/predict')
    .then(response => response.json())
    .then(data => {
        // Update the 'prediction' <div> with the received prediction
        document.getElementById('prediction').innerText = 'Final Predicted Emotion: ' + data.prediction;
        document.getElementById('emoji').innerHTML = convertEmotionToEmoji(data.prediction);
        var prediction = data.prediction;
        console.log("Variable : ",prediction);
        displayAudio();
        uploadFileAndGenerateDownloadUrl().then(downloadURL => {
            sendToDatabase(prediction, downloadURL);
        }).catch(error => {
            console.error('Error uploading file:', error);
        });
    })
    .catch(error => console.error('Error:', error));
}


function uploadFileAndGenerateDownloadUrl() {
    console.log("I am here")
    const filePath = '../static/recorded_audio.wav';

    // Generate a unique file name by appending a timestamp
    const fileName = 'recorded_audio_' + Date.now() + '.wav';

    // Create a reference to the storage bucket and specify the file name
    const storageRef = ref(storage, 'files/' + fileName);

    // Get the file
    return new Promise((resolve, reject) => {
        fetch(filePath)
            .then(response => response.blob())
            .then(blob => {
            console.log("I am here")
                // Upload the file to Firebase Cloud Storage
                return uploadBytes(storageRef, blob);
            })
            .then(snapshot => {
            console.log("I am here")
                // File uploaded successfully, get download URL
                return getDownloadURL(snapshot.ref);
            })
            .then(downloadURL => {
            console.log("I am here")
                // Resolve the promise with the download URL
                resolve(downloadURL);
            })
            .catch(error => {
                // Handle any errors
                console.error("Error uploading file:", error);
                reject(error); // Reject the promise with the error
            });
    });
}

function sendToDatabase(finalPredictedEmotion, downloadURL) {
    console.log("Firestore DB is defined.");
    console.log("Calling sendToDatabase with emotion:", finalPredictedEmotion);
    console.log("Audio Download : ", downloadURL);

    const userEmail = sessionStorage.getItem("userEmail");
    const timestamp = new Date().toISOString();

    // Access db from global variable
    console.log("Firestore DB:", db); // Check if db is defined

    // Create the collection "Emotions_final" if it doesn't exist
    const emotionsCollectionRef = collection(db, "Emotions_final");

    // Add data to Firestore
    addDoc(emotionsCollectionRef, {
        userEmail: userEmail,
        timestamp: timestamp,
        emotion: finalPredictedEmotion,
        audioDownloadURL: downloadURL
    })
    .then((docRef) => {
        console.log("Document written with ID: ", docRef.id);
    })
    .catch((error) => {
        console.error("Error adding document: ", error);
        console.log("Data not added to Firestore.");
    });
}


// Function to convert emoji shortcode to Unicode representation
function convertEmotionToEmoji(shortcode) {
    const emojiUnicodeMap = {
        'neutral': '😐',
        'happy': '😊',
        'sad': '😢',
        'angry': '😠',
        'fear': '😨',
        'disgust': '🤢'
        // Add more mappings as needed
    };

    return emojiUnicodeMap[shortcode] || ''; // Return emoji Unicode or empty string if not found
}

function displayAudio(){
    // Generate a random number to serve as the cache-busting query parameter
    const cacheBuster = Math.random().toString(36).substring(7);
    const filePath = "http://127.0.0.1:5000/static/recorded_audio.wav?" + cacheBuster;
    const audioPlayer = document.getElementById('audioPlayer');
    audioPlayer.style.display = "block";
    audioPlayer.src = filePath;
}

// Function to update HTML content with prediction
function updatePrediction() {
    document.getElementById('emotionsDisplay').style.display = 'block';
    document.getElementById('emoji').style.display = 'block';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'http://127.0.0.1:5000/static/predictions.txt', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            document.getElementById('prediction').innerText = 'Partial Emotion: ' + xhr.responseText.trim();
            document.getElementById('emoji').innerHTML = convertEmotionToEmoji(xhr.responseText.trim());
        }
    };
    xhr.send();
}

// Get references to DOM elements
const fileInput = document.getElementById('audioFileInput');
const selectedFileName = document.getElementById('selectedFileName');
const analyzeButton = document.getElementById('analyzeButton');
const audioPlayer = document.getElementById('audioPlayerInput');


// Add event listener to file input
fileInput.addEventListener('change', function() {
  if (fileInput.files.length > 0) {
    const fileName = fileInput.files[0].name;
    selectedFileName.style.display = 'block';
    selectedFileName.textContent = 'Selected file: ' + fileName; // Display selected file name
    audioPlayer.src = URL.createObjectURL(fileInput.files[0]); // Set audio player source
    audioPlayer.style.display = 'block'; // Show audio player
    analyzeButton.style.display = 'block';
  } else {
    selectedFileName.textContent = 'No file selected';
    audioPlayer.src = ''; // Clear audio player source
    audioPlayer.style.display = 'none'; // Hide audio player
  }
});

// Add event listener to analyze button
analyzeButton.addEventListener('click', function() {
  const file = fileInput.files[0];
  document.getElementById('emotionsDisplay').style.display = 'block';
  document.getElementById('prediction').innerText = 'Please Wait';
  document.getElementById('transcribedText').style.display = "block";
  document.getElementById('transcribedText').innerText = 'Please Wait for Audio Transcription';
  document.getElementById('emoji').style.display = 'none';

  if (file) {
    // Perform analysis with the selected file
    analyzeAudio(file);
    transcribeAudio(file);
  } else {
    alert('Please select a file.');
  }
});


// Function to analyze the selected audio file
function analyzeAudio(file) {
  // Create a FormData object to send the file
  const formData = new FormData();
  formData.append('audio', file);

  // Fetch request to send the audio file to Flask for analysis
  fetch('/predictFile', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    // Handle the response from the server
    console.log('Final Prediction:', data.prediction);
    document.getElementById('emoji').style.display = 'block';
    document.getElementById('prediction').innerText = 'Final Predicted Emotion: ' + data.prediction;
    document.getElementById('emoji').innerHTML = convertEmotionToEmoji(data.prediction);
  })
  .catch(error => {
    console.error('Error:', error);
  });
}

// Function to analyze the selected audio file
function transcribeAudio(file) {
  // Create a FormData object to send the file
  const formData = new FormData();
  formData.append('audio', file);

  // Fetch request to send the audio file to Flask for analysis
  fetch('/transcribeFile', {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    // Handle the response from the server
    console.log('Transcribed Audio:', data.transcription);
    document.getElementById('transcribedText').innerText = data.transcription;
  })
  .catch(error => {
    console.error('Error:', error);
  });
}

document.addEventListener("DOMContentLoaded", function() {
  const recordBtn = document.querySelector(".record-btn");
  const uploadBtn = document.querySelector(".upload-btn");

  document.getElementById('recordButton').style.display = 'none';
  document.getElementById('audioPlayer').style.display = 'none';
  document.getElementById('audioPlayerInput').style.display = 'none';
  document.getElementById('selectedFileName').style.display = 'none';
  document.getElementById('analyzeButton').style.display = 'none';
  var fileUploadWrapper = document.querySelector('.file-upload-wrapper');
  fileUploadWrapper.style.display = 'none';

  recordBtn.addEventListener("click", function() {
     document.getElementById('recordButton').style.display = 'block';
     document.getElementById('audioPlayer').style.display = 'none';;
     document.getElementById('audioPlayerInput').style.display = 'none';
     document.getElementById('selectedFileName').style.display = 'none';
     document.getElementById('analyzeButton').style.display = 'none';
     fileUploadWrapper.style.display = 'none';

     document.getElementById('emotionsDisplay').style.display = 'none';
     document.getElementById('emoji').style.display = 'none';
     document.getElementById('transcribedText').style.display = 'none';

     // Reset the file input value
     fileInput.value = '';
  });

  uploadBtn.addEventListener("click", function() {
     fileUploadWrapper.style.display = 'block';
     document.getElementById('recordButton').style.display = 'none';
     document.getElementById('audioPlayer').style.display = 'none';
     document.getElementById('emotionsDisplay').style.display = 'none';

     document.getElementById('emotionsDisplay').style.display = 'none';
     document.getElementById('emoji').style.display = 'none';
     document.getElementById('transcribedText').style.display = 'none';

     // Reset the file input value
     fileInput.value = '';
  });
});

