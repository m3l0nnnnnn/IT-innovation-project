/** Local-only demonstration avatar. Do not use for real account identity. */
export const PROFILE_PHOTO_KEY = 'estara.demo.profile-photo.v1';
const MAX_INPUT_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DATA_URL_LENGTH = 300_000;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function getSavedProfilePhoto(): string | null {
  try {
    const src = localStorage.getItem(PROFILE_PHOTO_KEY);
    return src && src.length < MAX_DATA_URL_LENGTH && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(src)
      ? src
      : null;
  } catch {
    return null;
  }
}

/** Reads, crops, and scales the user's image locally without uploading it. */
export async function makeProfilePhoto(file: File): Promise<string> {
  if (!SUPPORTED.has(file.type)) {
    throw new Error('Please select a JPG, PNG or WebP image.');
  }
  if (file.size <= 0 || file.size > MAX_INPUT_SIZE) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = objectUrl;
    await img.decode();
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) throw new Error('The image could not be read.');
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    const crop = Math.min(width, height);
    context.drawImage(img, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, size, size);
    const encoded = canvas.toDataURL('image/jpeg', 0.82);
    if (!encoded.startsWith('data:image/jpeg;base64,') || encoded.length >= MAX_DATA_URL_LENGTH) {
      throw new Error('The photo is too large to save locally. Try another image.');
    }
    return encoded;
  } catch (error) {
    if (error instanceof Error && /Please select|smaller than|Image processing|too large|could not be read/.test(error.message)) {
      throw error;
    }
    throw new Error('The image could not be opened. Please try a different photo.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
