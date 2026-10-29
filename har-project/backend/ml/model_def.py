"""Conv1D + LSTM architecture for Human Activity Recognition.

The UCI HAR feature vector (561 engineered features per 2.56 s window) is
treated as a 1-D sequence of shape (561, 1):

  * Conv1D blocks learn local patterns across neighbouring features
    (e.g. the X/Y/Z triplets of the same statistic) and shrink the sequence.
  * The LSTM reads the compressed sequence and captures longer-range
    dependencies between feature groups (time-domain vs frequency-domain).
  * A small dense head outputs a softmax over the activity classes.
"""
from tensorflow import keras
from tensorflow.keras import layers


def build_conv1d_lstm(n_features: int, n_classes: int) -> keras.Model:
    inputs = keras.Input(shape=(n_features, 1), name="sensor_features")

    x = layers.Conv1D(64, kernel_size=5, padding="same", activation="relu")(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling1D(pool_size=2)(x)

    x = layers.Conv1D(128, kernel_size=5, padding="same", activation="relu")(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling1D(pool_size=2)(x)
    x = layers.Dropout(0.3)(x)

    x = layers.LSTM(64)(x)
    x = layers.Dropout(0.4)(x)

    x = layers.Dense(64, activation="relu")(x)
    outputs = layers.Dense(n_classes, activation="softmax", name="activity")(x)

    model = keras.Model(inputs, outputs, name="har_conv1d_lstm")
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model
