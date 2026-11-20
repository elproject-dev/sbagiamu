import { supabase } from './supabase';

const BUCKET_NAME = 'expense-receipts';

// Batas ukuran foto ASLI yang boleh dipilih (foto kamera HP modern bisa 5-20MB).
// Foto akan otomatis dikompres sebelum diunggah, jadi ukuran di storage tetap kecil.
export const MAX_INPUT_FILE_SIZE = 30 * 1024 * 1024; // 30MB
export const MAX_INPUT_FILE_SIZE_LABEL = '30MB';

// Target ukuran setelah kompresi
const TARGET_COMPRESSED_SIZE = 500 * 1024; // 500KB
// Batas keras setelah kompresi (jika target tidak tercapai sama sekali)
const HARD_COMPRESSED_LIMIT = 1.5 * 1024 * 1024; // 1.5MB

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface UploadResponse {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  error?: string;
}

export interface DeleteResponse {
  success: boolean;
  error?: string;
}

export interface ValidationError {
  valid: boolean;
  error?: string;
}

export const validateReceiptFile = (file: File): ValidationError => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isValidMimeType = ALLOWED_MIME_TYPES.includes(file.type) || file.type.startsWith('image/');
  const isValidExt = ALLOWED_EXTENSIONS.includes(ext);

  if (!isValidMimeType && !isValidExt) {
    return {
      valid: false,
      error: `Tipe file tidak didukung. Hanya file gambar (JPG, PNG, WebP) yang diizinkan.`
    };
  }

  if (file.size > MAX_INPUT_FILE_SIZE) {
    return {
      valid: false,
      error: `Ukuran file terlalu besar. Maksimal ${MAX_INPUT_FILE_SIZE_LABEL}.`
    };
  }

  return { valid: true };
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gambar tidak dapat dibaca. Coba gunakan format JPG atau PNG.'));
    };
    img.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

/**
 * Kompres gambar secara otomatis (resize + turunkan kualitas bertahap)
 * sampai ukurannya <= TARGET_COMPRESSED_SIZE.
 * Menggunakan WebP, fallback ke JPEG jika browser tidak mendukung ekspor WebP.
 */
export const compressReceiptImage = async (file: File): Promise<File> => {
  const img = await loadImage(file);

  const dimensions = [1600, 1280, 1024, 800, 640];
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];

  let best: Blob | null = null;

  for (const maxDim of dimensions) {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    // Latar putih agar PNG transparan tidak menjadi hitam saat dikonversi
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualities) {
      let blob = await canvasToBlob(canvas, 'image/webp', q);
      // Beberapa browser (Safari lama) tidak bisa ekspor WebP -> fallback JPEG
      if (!blob || blob.type !== 'image/webp') {
        blob = await canvasToBlob(canvas, 'image/jpeg', q);
      }
      if (!blob) continue;

      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= TARGET_COMPRESSED_SIZE) {
        best = blob;
        break;
      }
    }

    if (best && best.size <= TARGET_COMPRESSED_SIZE) break;
  }

  if (!best) return file;

  const ext = best.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([best], file.name.replace(/\.[^/.]+$/, '') + '.' + ext, {
    type: best.type,
    lastModified: Date.now()
  });
};

export const uploadExpenseReceipt = async (
  file: File
): Promise<UploadResponse> => {
  try {
    const validation = validateReceiptFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Kompres otomatis sebelum diunggah
    const compressedFile = await compressReceiptImage(file);

    if (compressedFile.size > HARD_COMPRESSED_LIMIT) {
      return { success: false, error: 'Gambar tidak dapat dikompres cukup kecil. Coba foto ulang dengan resolusi lebih rendah.' };
    }

    const ext = compressedFile.type === 'image/jpeg' ? 'jpg' : 'webp';
    const timestamp = new Date().getTime();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `receipt_${timestamp}_${randomStr}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, compressedFile, {
        cacheControl: '31536000',
        upsert: false,
        contentType: compressedFile.type || 'image/webp'
      });

    if (error) {
      return { success: false, error: `Gagal upload: ${error.message}` };
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return {
      success: true,
      filePath: fileName,
      publicUrl: publicUrlData.publicUrl
    };
  } catch (error: any) {
    return { success: false, error: `Error: ${error?.message || 'Terjadi kesalahan'}` };
  }
};

export const deleteExpenseReceipt = async (filePath: string): Promise<DeleteResponse> => {
  try {
    if (!filePath) {
      return { success: true };
    }

    // Extract filename if a full URL was provided
    let fileName = filePath;
    if (filePath.includes('/')) {
        fileName = filePath.split('/').pop() || filePath;
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileName]);

    if (error) {
      return { success: false, error: `Gagal menghapus foto di storage: ${error.message}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: `Error: ${error?.message || 'Terjadi kesalahan'}` };
  }
};
