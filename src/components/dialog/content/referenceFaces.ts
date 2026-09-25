import type { Bounds } from '@/renderer/core/layout/types'

export async function detectReferenceFaces(
  image: HTMLImageElement
): Promise<Bounds[]> {
  const { FaceDetector, FilesetResolver } =
    await import('@mediapipe/tasks-vision')
  const base = `${import.meta.env.BASE_URL}face-detector`
  const files = await FilesetResolver.forVisionTasks(base)
  const detector = await FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}/blaze_face_short_range.tflite` },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5
  })
  try {
    return detector
      .detect(image)
      .detections.flatMap(({ boundingBox: box }) =>
        box
          ? [
              {
                x: box.originX,
                y: box.originY,
                width: box.width,
                height: box.height
              }
            ]
          : []
      )
      .sort((a, b) => a.x - b.x)
  } finally {
    detector.close()
  }
}

export function portraitBounds(
  face: Bounds,
  width: number,
  height: number,
  neighbors: Bounds[] = []
): Bounds {
  const center = face.x + face.width / 2
  const nearby = neighbors.filter(
    (other) =>
      other !== face &&
      Math.abs(other.y - face.y) < Math.max(other.height, face.height)
  )
  const leftLimit = Math.max(
    0,
    ...nearby
      .filter((other) => other.x + other.width / 2 < center)
      .map((other) => (other.x + other.width / 2 + center) / 2)
  )
  const rightLimit = Math.min(
    width,
    ...nearby
      .filter((other) => other.x + other.width / 2 > center)
      .map((other) => (other.x + other.width / 2 + center) / 2)
  )
  const x = Math.max(
    0,
    Math.floor(Math.min(face.x, Math.max(leftLimit, face.x - face.width * 0.5)))
  )
  const y = Math.max(0, Math.floor(face.y - face.height * 0.55))
  const right = Math.min(
    width,
    Math.ceil(
      Math.max(
        face.x + face.width,
        Math.min(rightLimit, face.x + face.width * 1.5)
      )
    )
  )
  const bottom = Math.min(height, Math.ceil(face.y + face.height * 2.1))
  return { x, y, width: right - x, height: bottom - y }
}
