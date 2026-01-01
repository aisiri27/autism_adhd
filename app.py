from flask import Flask, render_template, request, redirect, url_for
import os
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import load_img, img_to_array
import numpy as np
import cv2

app = Flask(__name__)

# -----------------------------------------------------
# CONFIG
# -----------------------------------------------------
app.config['UPLOAD_FOLDER'] = 'static/uploads/'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# -----------------------------------------------------
# LOAD MODELS
# -----------------------------------------------------
autism_model_path = r"C:/Users/anitha/OneDrive/Desktop/Major_project/model/autism_model.h5"
emotion_model_path = r"C:/Users/anitha/OneDrive/Desktop/Major_project/model/emotion_model.h5"

autism_model = load_model(autism_model_path)
emotion_model = load_model(emotion_model_path)

# RAF-DB LABELS (correct 7-class order)
emotion_labels = [
    "Surprise", "Fear", "Disgust",
    "Happiness", "Sadness", "Anger", "Neutral"
]

# -----------------------------------------------------
# FACE DETECTION + CROPPING
# -----------------------------------------------------
def detect_and_crop_face(image_path):
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.3, minNeighbors=5)

    if len(faces) == 0:
        return None  # No face detected

    # Select largest face
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    face_img = img[y:y+h, x:x+w]

    base, ext = os.path.splitext(image_path)
    cropped_path = base + "_face" + ext

    cv2.imwrite(cropped_path, face_img)
    return cropped_path

# -----------------------------------------------------
# BASIC ROUTES
# -----------------------------------------------------
@app.route("/")
def landing():
    return render_template("landing.html")

@app.route("/signin")
def signin():
    return render_template("signin.html")

@app.route("/signup")
def signup():
    return render_template("signup.html")

@app.route("/register", methods=["POST"])
def register():
    return redirect(url_for("signin"))

@app.route("/login", methods=["POST"])
def login():
    return redirect(url_for("index"))

@app.route("/index")
def index():
    return render_template("index.html")

# -----------------------------------------------------
# AUTISM + EMOTION ANALYSIS
# -----------------------------------------------------
@app.route("/autism")
def autism():
    return render_template("autism.html")

@app.route("/autism_result", methods=["POST"])
def autism_result():

    if "image" not in request.files:
        return "No image uploaded", 400

    image_file = request.files["image"]

    if image_file.filename == "":
        return "No file selected", 400

    if not image_file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        return "Invalid file type", 400

    filename = image_file.filename
    save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    image_file.save(save_path)

    # ---------------------------
    # AUTISM PREDICTION
    # ---------------------------
    autism_img = load_img(save_path, target_size=(224, 224))
    autism_array = img_to_array(autism_img) / 255.0
    autism_array = np.expand_dims(autism_array, axis=0)

    autism_prob = autism_model.predict(autism_array)[0][0]

    autism_label = "Autism Detected" if autism_prob > 0.5 else "No Autism Detected"
    autism_conf = round(autism_prob * 100, 2)

    # ---------------------------
    # EMOTION PREDICTION (100×100 RGB)
    # ---------------------------
    cropped_face_path = detect_and_crop_face(save_path)
    face_path = cropped_face_path if cropped_face_path else save_path

    emotion_img = load_img(face_path, target_size=(100, 100), color_mode='rgb')
    emotion_array = img_to_array(emotion_img) / 255.0
    emotion_array = np.expand_dims(emotion_array, axis=0)

    emotion_pred = emotion_model.predict(emotion_array)
    emotion_index = np.argmax(emotion_pred)
    emotion_label = emotion_labels[emotion_index]
    emotion_conf = round(emotion_pred[0][emotion_index] * 100, 2)

    # ---------------------------
    # COMBINED CONFIDENCE
    # ---------------------------
    combined_confidence = round((autism_conf + emotion_conf) / 2, 2)

    # ---------------------------
    # REASONING
    # ---------------------------
    reasoning = (
        f"The detected emotion is {emotion_label}. "
        f"Using both emotion and facial markers provides better interpretability for the analysis."
    )

    return render_template(
        "autism_result.html",
        image_filename=filename,
        prediction=autism_label,
        emotion=emotion_label,
        combined_confidence=combined_confidence,
        reasoning=reasoning
    )

# -----------------------------------------------------
# ADHD TEST PAGE (JS-BASED)
# -----------------------------------------------------
@app.route("/adhd")
def adhd_test():
    return render_template("adhd.html")

@app.route("/adhd_result_local")
def adhd_result_local():
    score = int(request.args.get("score", 0))
    inattention = int(request.args.get("inattention", 0))
    hyperactivity = int(request.args.get("hyperactivity", 0))
    impulsivity = int(request.args.get("impulsivity", 0))

    if score <= 20:
        result = "🟢 Low probability of ADHD"
    elif score <= 40:
        result = "🟡 Moderate signs of ADHD. Further evaluation may help."
    else:
        result = "🔴 High signs of ADHD — consider consulting a professional."

    return render_template(
        "adhd_result.html",
        result_text=result,
        inattention=inattention,
        hyperactivity=hyperactivity,
        impulsivity=impulsivity
    )

# -----------------------------------------------------
# REAL-TIME ADHD SCREENING
# -----------------------------------------------------
@app.route("/realtime_adhd")
def realtime_adhd():
    return render_template("realtime_adhd.html")


@app.route('/realtime_autism')
def realtime_autism():
    return render_template('realtime_autism.html')

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/resources")
def resources():
    return render_template("resources.html")

@app.route("/faq")
def faq():
    return render_template("faq.html")

#-----------------------------------------------------
#CHATBOT
#-----------------------------------------------------
import google.generativeai as genai
from flask import request, jsonify

genai.configure(GEMINI_API)

model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    system_instruction="""
You are NeuroScreen Assistant.
You help users understand ADHD and Autism.
You NEVER diagnose.
You always suggest consulting professionals politely.
You explain in simple, calm language.
"""
)

@app.route("/chat", methods=["POST"])
def chat():
    user_msg = request.json.get("message")

    response = model.generate_content(user_msg)

    return jsonify({
        "reply": response.text
    })

# -----------------------------------------------------
# RUN APP
# -----------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)
