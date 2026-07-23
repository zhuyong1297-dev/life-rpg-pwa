const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function compressRewardImage(file: File) {
  if (!acceptedTypes.has(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 图片')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理图片')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('图片压缩失败')),
      'image/webp',
      0.78,
    )
  })
  if (blob.size > 300 * 1024) throw new Error('图片压缩后仍超过 300KB，请选择更简单的图片')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}
