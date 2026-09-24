MediaPipe Tasks Vision 0.10.32 runtime files, copied from the pinned npm package
@mediapipe/tasks-vision (Apache-2.0; see LICENSE).

BlazeFace short-range float16 model, version 1:
https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector

Served from this app's origin. Detection runs locally; no photos are sent to Google.

Optional subject isolation uses Magic Touch float32 version 1 (5.9 MB), compatible
with the pinned Tasks Vision runtime:
https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite
The newer v2 task is not used. It exceeds the current Pages per-file limit.
The mask is inferred at up to 1024px; retained subject pixels come from the native
source. Background becomes RGB(128,128,128). No restoration or face synthesis.
Model SHA-256: e24338a717c1b7ad8d159666677ef400babb7f33b8ad60c4d96db4ecf694cd25.
