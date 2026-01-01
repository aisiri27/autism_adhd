import os
import numpy as np
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint
from sklearn.utils.class_weight import compute_class_weight

# -----------------------
# Paths
# -----------------------
train_dir = "dataset/emotion/train"
test_dir = "dataset/emotion/test"
model_save_path = "model/emotion_model.h5"

# -----------------------
# Parameters
# -----------------------
IMG_HEIGHT, IMG_WIDTH = 100, 100
BATCH_SIZE = 32
EPOCHS = 30

# -----------------------
# Data Generators
# -----------------------
train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=15,
    width_shift_range=0.1,
    height_shift_range=0.1,
    zoom_range=0.1,
    horizontal_flip=True
)

test_datagen = ImageDataGenerator(rescale=1./255)

train_generator = train_datagen.flow_from_directory(
    train_dir,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    color_mode='rgb',
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    shuffle=True
)

test_generator = test_datagen.flow_from_directory(
    test_dir,
    target_size=(IMG_HEIGHT, IMG_WIDTH),
    color_mode='rgb',
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    shuffle=False
)

# -----------------------
# Compute class weights
# -----------------------
y_train = train_generator.classes
class_weights = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(y_train),
    y=y_train
)
class_weights = dict(enumerate(class_weights))

print("Class Weights:", class_weights)
print("Class Mapping:", train_generator.class_indices)

# -----------------------
# CNN Model
# -----------------------
model = Sequential([
    Conv2D(32, (3,3), activation='relu', input_shape=(IMG_HEIGHT, IMG_WIDTH, 3)),
    BatchNormalization(),
    Conv2D(32, (3,3), activation='relu'),
    MaxPooling2D(2,2),

    Conv2D(64, (3,3), activation='relu'),
    BatchNormalization(),
    Conv2D(64, (3,3), activation='relu'),
    MaxPooling2D(2,2),

    Conv2D(128, (3,3), activation='relu'),
    BatchNormalization(),
    MaxPooling2D(2,2),

    Dropout(0.4),
    Flatten(),
    Dense(256, activation='relu'),
    Dropout(0.5),
    Dense(train_generator.num_classes, activation='softmax')
])

# -----------------------
# Compile model
# -----------------------
model.compile(
    optimizer=Adam(learning_rate=0.0005),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

# -----------------------
# Callbacks
# -----------------------
checkpoint = ModelCheckpoint(
    model_save_path,
    monitor='val_accuracy',
    save_best_only=True,
    verbose=1
)

earlystop = EarlyStopping(
    monitor='val_accuracy',
    patience=5,
    restore_best_weights=True,
    verbose=1
)

# -----------------------
# Train the model (with SAFE MANUAL STOP)
# -----------------------
try:
    history = model.fit(
        train_generator,
        validation_data=test_generator,
        epochs=EPOCHS,
        class_weight=class_weights,
        callbacks=[checkpoint, earlystop]
    )

except KeyboardInterrupt:
    print("\n\nTraining stopped manually! Saving current model weights...")
    model.save(model_save_path)
    print(f"Model saved to {model_save_path} after manual interruption.")

# Final save after normal completion
model.save(model_save_path)
print(f"\nFinal Emotion model saved to {model_save_path}")
